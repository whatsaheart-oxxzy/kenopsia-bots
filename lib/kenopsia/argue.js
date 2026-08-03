'use strict';

/**
 * Temporary rooms for settling something that does not belong in a public
 * channel. A moderator opens one for the people involved, it lives in the
 * SUPPORT category, and it takes itself away again when it is done being used.
 *
 * Two clocks, because "delete it when nobody writes" means different things
 * before and after the first message:
 *
 *   - Nobody ever wrote: gone after 5 minutes. An opened room that everyone
 *     ignored is just clutter.
 *   - Somebody wrote: gone after 30 minutes of silence. Five would be cruel —
 *     people stop to think in the middle of an argument, and deleting the room
 *     takes the whole conversation with it.
 *
 * The bookkeeping lives in data/kenopsia.json rather than in a Set in memory,
 * so a restart does not leave rooms behind that nothing will ever clean up.
 * (The temporary voice rooms in community.js do use a Set, and do leak on a
 * restart — that is a known difference, not something to copy.)
 */

const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const { STAFF_ROLES } = require('./blueprint');
const store = require('./store');

const OPEN_GRACE_MS = 5 * 60_000; // opened, never used
const IDLE_MS = 30 * 60_000; // used, then went quiet
const SWEEP_MS = 60_000;
const CATEGORY = 'SUPPORT';

/** The persisted room table for one guild, created on first use. */
function rooms(guildId) {
  const state = store.guild(guildId).state;
  state.argueRooms ??= {};
  return state.argueRooms;
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'member';

/**
 * Opens a room only the invited members and the staff can see.
 *
 * Returns the channel, or null with a reason the caller can show. Discord
 * caps a guild at 500 channels and a category at 50; both come back as a
 * plain API error, so failure is reported rather than thrown.
 */
async function open(guild, members, reason) {
  const parent = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY,
  );

  const overwrites = [{ id: guild.roles.everyone.id, deny: [P.ViewChannel] }];
  const allow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

  for (const member of members) overwrites.push({ id: member.id, allow });
  for (const name of STAFF_ROLES) {
    const role = guild.roles.cache.find((r) => r.name === name);
    if (role) overwrites.push({ id: role.id, allow });
  }

  const channel = await guild.channels
    .create({
      name: `talk-${slug(members[0].displayName ?? members[0].user.username)}`,
      type: ChannelType.GuildText,
      parent: parent?.id ?? null,
      topic: 'Temporary room. It closes itself once it goes quiet.',
      permissionOverwrites: overwrites,
      reason: reason ? `Dispute room: ${reason}` : 'Dispute room',
    })
    .catch((err) => {
      console.error('Could not create a dispute room:', err.message);
      return null;
    });

  if (!channel) return null;

  const now = Date.now();
  rooms(guild.id)[channel.id] = {
    openedAt: now,
    lastAt: now,
    written: false,
    members: members.map((m) => m.id),
  };
  store.save();

  return channel;
}

/** True when this channel is a dispute room, in which case the clock is reset. */
function touch(message) {
  const table = rooms(message.guild.id);
  const room = table[message.channel.id];
  if (!room) return false;

  room.written = true;
  room.lastAt = Date.now();
  store.save();
  return true;
}

/** Without a message, so Suzaku can ask the same question from its own client. */
const isRoom = (guildId, channelId) => Boolean(rooms(guildId)[channelId]);

async function close(guild, channelId, why) {
  delete rooms(guild.id)[channelId];
  store.save();

  const channel = guild.channels.cache.get(channelId);
  if (channel) await channel.delete(why).catch(() => {});
}

/** Decides a single room's fate. Split out so the rules can be tested directly. */
function isExpired(room, now = Date.now()) {
  return room.written ? now - room.lastAt > IDLE_MS : now - room.openedAt > OPEN_GRACE_MS;
}

async function sweep(client) {
  for (const guild of client.guilds.cache.values()) {
    const table = rooms(guild.id);
    for (const [channelId, room] of Object.entries(table)) {
      // Deleted by hand, or left over from before a restart.
      if (!guild.channels.cache.has(channelId)) {
        delete table[channelId];
        store.save();
        continue;
      }
      if (isExpired(room)) {
        await close(guild, channelId, room.written ? 'Dispute room went quiet' : 'Dispute room unused');
      }
    }
  }
}

/**
 * Called once the client is ready. The first sweep clears anything that expired
 * while the bot was offline, which is the whole reason the table is on disk.
 */
function start(client) {
  sweep(client).catch((err) => console.error('Dispute room sweep failed:', err));
  const timer = setInterval(
    () => sweep(client).catch((err) => console.error('Dispute room sweep failed:', err)),
    SWEEP_MS,
  );
  timer.unref?.();
}

module.exports = { open, touch, isRoom, close, isExpired, start, OPEN_GRACE_MS, IDLE_MS };
