'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const catalog = require('./catalog');
const config = require('./config');
const store = require('./store');
const inventory = require('./inventory');
const { clean } = require('./format');

/**
 * Handing items over.
 *
 * Everything in here runs BEFORE any coins move. If a channel cannot be created
 * or an emoji will not upload, the member keeps their coins and is told what
 * went wrong — the alternative is charging someone for a thing that never
 * arrived, which is exactly what this shop was built to avoid.
 */

const ok = (message) => ({ ok: true, message });
const fail = (message) => ({ ok: false, message });

const findCategory = (guild, name) =>
  guild.channels.cache.find((c) => c.name === name && c.type === ChannelType.GuildCategory) ?? null;

/**
 * Side effects that happen at the moment of purchase. Anything the member has
 * to fill in later (an emoji image, a bio, an event date) is not here — buying
 * it only unlocks the slot.
 */
async function atPurchase(guild, member, id) {
  const item = catalog.ITEMS[id];
  if (!item) return fail('That item does not exist.');

  if (item.kind === 'voice-room') return createRoom(guild, member, 'voice');
  if (item.kind === 'text-room') return createRoom(guild, member, 'text');

  return ok(null);
}

/**
 * A private room the member controls. Voice sits under VOICE, text under CHAT.
 *
 * `limit` is how many people may sit in a voice room at once; 0 is Discord's
 * own value for "no limit". It is remembered on the member, so a room rebuilt
 * after a sweep comes back the size they set it, not back at the default.
 */
async function createRoom(guild, member, type, limit = null) {
  const voice = type === 'voice';
  const parent = findCategory(guild, voice ? config.CHANNELS.voiceCategory : config.CHANNELS.chatCategory);
  const record0 = store.member(guild.id, member.id);
  const userLimit = clampLimit(limit ?? record0.roomLimit ?? 0);

  const channel = await guild.channels
    .create({
      name: voice ? `${member.displayName} lounge` : `${member.displayName}-room`,
      type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
      parent: parent?.id ?? null,
      userLimit: voice ? userLimit : undefined,
      reason: `Shop: private ${type} room for ${member.user.tag}`,
    })
    .catch(() => null);

  if (!channel) return fail('I could not create the channel — I am probably missing Manage Channels. Nothing was charged.');

  const allow = voice
    ? [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]
    : [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages];

  await channel.permissionOverwrites.edit(member.id, Object.fromEntries(allow.map((p) => [p, true]))).catch(() => {});

  const record = store.member(guild.id, member.id);
  record.rooms ??= {};
  record.roomIdle ??= {};
  record.rooms[type] = channel.id;
  record.roomIdle[type] = 0;
  if (voice) record.roomLimit = userLimit;
  store.save();

  const size = voice ? ` ${userLimit ? `Up to **${userLimit}** people can be in it` : 'Anyone can join it'} — change that with \`/inventory room limit:<n>\`.` : '';
  const note = voice
    ? ' If it goes quiet for a couple of hours I take the channel down to keep the list tidy. The room stays yours — `/inventory room` brings it straight back, free.'
    : '';

  return ok(
    `${channel} is yours. You can rename it${voice ? ' and move people in it' : ' and pin things in it'}.${size}${note}`,
  );
}

/** Discord allows 0 (no limit) to 99. */
const clampLimit = (n) => Math.min(99, Math.max(0, Math.trunc(Number(n) || 0)));

/**
 * Builds a bought room again after its channel was swept, or after someone
 * deleted it by hand. Free — they already paid for it once.
 */
async function resummon(guild, member, type, limit = null) {
  const record = store.member(guild.id, member.id);
  const itemId = type === 'voice' ? 'voice-room' : 'text-room';

  if (!inventory.has(record, itemId)) {
    return fail(`You do not own a private ${type} room. It is \`/buy item:${itemId}\`.`);
  }

  const existing = record.rooms?.[type] ? guild.channels.cache.get(record.rooms[type]) : null;

  // The room is already up. If they passed a size, this is a resize rather
  // than a rebuild — refusing outright would make changing the limit need a
  // delete first, which is a silly thing to ask of anyone.
  if (existing) {
    if (limit === null || type !== 'voice') return fail(`You already have one: ${existing}.`);

    const userLimit = clampLimit(limit);
    const changed = await existing.setUserLimit(userLimit, 'Shop: owner changed the room size').catch(() => null);
    if (changed === null) return fail('I could not change the size. Tell an admin.');

    record.roomLimit = userLimit;
    store.save();
    return ok(userLimit ? `${existing} now fits **${userLimit}** people.` : `${existing} is open to anyone now.`);
  }

  return createRoom(guild, member, type, limit);
}

/**
 * Takes down bought voice rooms that have been empty for a day.
 *
 * Only the channel goes. The item stays in the inventory and /inventory room
 * builds it again for nothing, so nobody loses 40,000 coins for going on
 * holiday. Text rooms are skipped on purpose — see config.ROOM_IDLE_MS.
 */
async function sweepRooms(guild) {
  const now = Date.now();
  let changed = false;

  for (const record of store.members(guild.id)) {
    if (!record.rooms) continue;
    record.roomIdle ??= {};

    // A text room that was deleted by hand should stop being remembered, so
    // the member can build a new one. It is never deleted by us.
    if (record.rooms.text && !guild.channels.cache.get(record.rooms.text)) {
      delete record.rooms.text;
      changed = true;
    }

    const channelId = record.rooms.voice;
    if (!channelId) continue;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) {
      delete record.rooms.voice;
      record.roomIdle.voice = 0;
      changed = true;
      continue;
    }

    if (channel.members.size > 0) {
      if (record.roomIdle.voice !== 0) {
        record.roomIdle.voice = 0;
        changed = true;
      }
      continue;
    }

    // Empty. Start the clock, or act on it if it has already run out. A room
    // that emptied while the bot was down gets its timestamp here instead.
    if (!record.roomIdle.voice) {
      record.roomIdle.voice = now;
      changed = true;
      continue;
    }

    if (now - record.roomIdle.voice < config.ROOM_IDLE_MS) continue;

    delete record.rooms.voice;
    record.roomIdle.voice = 0;
    changed = true;
    await channel.delete('Shop: bought voice room idle for a day').catch(() => {});

    const user = await guild.client.users.fetch(record.user).catch(() => null);
    await user
      ?.send(
        'Your private voice room was empty for a day, so I took the channel down to keep the voice list tidy. You have not lost anything — the room is still yours, and `/inventory room` builds it again straight away.',
      )
      .catch(() => {});
  }

  if (changed) store.save();
}

/** Uses one emoji slot. */
async function uploadEmoji(guild, member, name, url) {
  const record = store.member(guild.id, member.id);
  if ((record.emojiSlots ?? 0) < 1) return fail('You have no emoji slots. Buy one with `/buy item:emoji-slot`.');

  const safe = clean(name, 32).replace(/[^a-zA-Z0-9_]/g, '_');
  if (safe.length < 2) return fail('That name will not work. Use letters, numbers and underscores, at least two of them.');

  const emoji = await guild.emojis
    .create({ attachment: url, name: safe, reason: `Shop: emoji slot used by ${member.user.tag}` })
    .catch((err) => ({ error: err }));

  if (!emoji || emoji.error) {
    return fail(`Discord refused that image: ${emoji?.error?.message ?? 'unknown error'}. Your slot is untouched.`);
  }

  record.emojiSlots -= 1;
  store.save();
  return ok(`${emoji} is on the server. You have ${record.emojiSlots} emoji slot(s) left.`);
}

/** Uses one sticker slot. */
async function uploadSticker(guild, member, name, tag, url) {
  const record = store.member(guild.id, member.id);
  if ((record.stickerSlots ?? 0) < 1) return fail('You have no sticker slots. Buy one with `/buy item:sticker-slot`.');

  const sticker = await guild.stickers
    .create({
      file: url,
      name: clean(name, 30),
      tags: clean(tag, 30) || 'star',
      reason: `Shop: sticker slot used by ${member.user.tag}`,
    })
    .catch((err) => ({ error: err }));

  if (!sticker || sticker.error) {
    return fail(`Discord refused that file: ${sticker?.error?.message ?? 'unknown error'}. Your slot is untouched.`);
  }

  record.stickerSlots -= 1;
  store.save();
  return ok(`**${sticker.name}** is on the server. You have ${record.stickerSlots} sticker slot(s) left.`);
}

/** Spends an event-slot on a real Discord scheduled event. */
async function createEvent(guild, member, name, description, startsAt) {
  const record = store.member(guild.id, member.id);
  if (!inventory.has(record, 'event-slot')) return fail('You have no event to spend. Buy one with `/buy item:event-slot`.');
  if (startsAt <= Date.now() + 600_000) return fail('Pick a time at least ten minutes from now.');

  const lounge = guild.channels.cache.find((c) => c.isVoiceBased());
  const event = await guild.scheduledEvents
    .create({
      name: clean(name, 90),
      description: `${clean(description, 900)}\n\nHosted by ${member.displayName}.`,
      scheduledStartTime: new Date(startsAt),
      privacyLevel: 2, // guild only
      entityType: lounge ? 2 : 3, // voice, else external
      channel: lounge?.id,
      entityMetadata: lounge ? undefined : { location: 'Kenopsia' },
      reason: `Shop: event slot used by ${member.user.tag}`,
    })
    .catch((err) => ({ error: err }));

  if (!event || event.error) {
    return fail(`I could not schedule that: ${event?.error?.message ?? 'unknown error'}. Your event slot is untouched.`);
  }

  inventory.consume(record, 'event-slot');
  return ok(`**${event.name}** is on the server calendar. Your slot is spent.`);
}

/** Posts a bought spotlight into #rewards. */
async function postSpotlight(guild, member, embed) {
  const record = store.member(guild.id, member.id);
  if (!inventory.has(record, 'profile-spotlight')) return fail('You have no spotlight. Buy one with `/buy item:profile-spotlight`.');

  const channel = guild.channels.cache.find((c) => c.name === config.CHANNELS.rewards && c.isTextBased());
  if (!channel) return fail(`I cannot find #${config.CHANNELS.rewards}. Ask an admin to run \`/kenopsia setup\`.`);

  const sent = await channel
    .send({ content: `**Member spotlight** — ${member}`, embeds: [embed] })
    .catch(() => null);

  if (!sent) return fail('I could not post there. Your spotlight is untouched.');

  inventory.consume(record, 'profile-spotlight');
  return ok(`Posted in ${channel}.`);
}

module.exports = {
  atPurchase,
  createRoom,
  resummon,
  sweepRooms,
  uploadEmoji,
  uploadSticker,
  createEvent,
  postSpotlight,
  ok,
  fail,
};
