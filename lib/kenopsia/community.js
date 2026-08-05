'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const economy = require('./economy');
const { CHANNELS, COINS } = require('./blueprint');

// New members can only post in introductions for this long.
const NEW_MEMBER_MS = 10 * 60_000;

const voiceSince = new Map(); // `${guildId}:${userId}` -> timestamp
const inviteUses = new Map(); // guildId -> Map(code -> uses)

/**
 * How long an empty hub room is kept before it is deleted.
 *
 * It used to go the instant the last person left, which meant a reconnect, a
 * drag into another channel or a two second Discord hiccup destroyed the room
 * and everyone had to regroup. Two minutes is long enough to come back to and
 * short enough that the category does not fill up with ghosts.
 */
const ROOM_GRACE_MS = 2 * 60_000;

/**
 * Hub rooms, by channel id, against the time they went empty (0 = in use).
 *
 * This lives in the store rather than in a Set in memory: a restart used to
 * forget every room it had made, and those channels then stayed on the server
 * forever because nothing knew they were temporary.
 */
const tempRooms = (guildId) => (store.guild(guildId).state.tempRooms ??= {});

const WELCOME = (member, channels) =>
  [
    `Welcome, ${member}.`,
    '',
    `Read ${channels.rules} once, then say hello in ${channels.introductions}. After ten minutes the rest of the server opens up on its own.`,
    'Type `/profile` to see your level and coins, and `/quests` to see what is going on today.',
  ].join('\n');

function findChannel(guild, name) {
  return guild.channels.cache.find((c) => c.name === name);
}

/** Caches how often each invite has been used, so we can tell who invited whom. */
async function cacheInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteUses.set(guild.id, new Map(invites.map((i) => [i.code, i.uses ?? 0])));
  } catch {
    // Missing Manage Server: invite credit simply stays off.
  }
}

/** Compares invite counters to find the one that just went up. */
async function creditInviter(member) {
  const before = inviteUses.get(member.guild.id);
  if (!before) return null;

  let invites;
  try {
    invites = await member.guild.invites.fetch();
  } catch {
    return null;
  }

  const used = invites.find((i) => (i.uses ?? 0) > (before.get(i.code) ?? 0));
  inviteUses.set(member.guild.id, new Map(invites.map((i) => [i.code, i.uses ?? 0])));
  if (!used?.inviter || used.inviter.id === member.id) return null;

  const record = store.roll(store.member(member.guild.id, used.inviter.id));
  record.invites += 1;
  record.weekly.invites += 1;
  economy.addCoins(member.guild.id, used.inviter.id, COINS.invite.amount);
  store.save();
  return used.inviter;
}

/**
 * New member flow: restricted role on join, full member ten minutes later.
 * The timer is re-armed on startup for anyone still waiting, so a restart
 * cannot leave someone stuck.
 */
async function onJoin(member) {
  // Bots get invited, not welcomed. They also must not be muted for ten minutes.
  if (member.user.bot) return;

  const newRole = member.guild.roles.cache.find((r) => r.name === 'New Member');
  if (economy.canManage(member.guild, newRole)) {
    await member.roles.add(newRole, 'Joined').catch(() => {});
  }

  const record = store.member(member.guild.id, member.id);
  record.promoteAt = Date.now() + NEW_MEMBER_MS;
  store.save();

  const welcome = findChannel(member.guild, CHANNELS.welcome);
  if (welcome?.isTextBased()) {
    await welcome
      .send(
        WELCOME(member, {
          rules: findChannel(member.guild, CHANNELS.rules) ?? '#rules',
          introductions: findChannel(member.guild, CHANNELS.introductions) ?? '#introductions',
        }),
      )
      .catch(() => {});
  }

  const inviter = await creditInviter(member);
  if (inviter) {
    const log = findChannel(member.guild, CHANNELS.modLog);
    if (log?.isTextBased()) {
      await log.send(`${member.user.tag} joined through an invite from ${inviter.tag}. Credited ${COINS.invite.amount} coins.`).catch(() => {});
    }
  }
}

/**
 * Swaps New Member for Member once the ten minutes are up.
 *
 * The role is the source of truth, not the stored timestamp: anyone wearing
 * New Member without a pending timer gets one derived from when they actually
 * joined. Otherwise a lost data file would leave people muted forever.
 */
async function promoteDue(guild) {
  const members = store.guild(guild.id).members;
  const now = Date.now();

  const newRoleRef = guild.roles.cache.find((r) => r.name === 'New Member');
  if (newRoleRef) {
    for (const member of newRoleRef.members.values()) {
      if (member.user.bot) continue;
      const record = store.member(guild.id, member.id);
      if (record.promoteAt) continue;
      record.promoteAt = (member.joinedTimestamp ?? now) + NEW_MEMBER_MS;
    }
  }

  for (const [userId, record] of Object.entries(members)) {
    if (!record.promoteAt || record.promoteAt > now) continue;
    delete record.promoteAt;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    const newRole = guild.roles.cache.find((r) => r.name === 'New Member');
    const memberRole = guild.roles.cache.find((r) => r.name === 'Member');
    if (economy.canManage(guild, newRole)) await member.roles.remove(newRole, 'Ten minutes passed').catch(() => {});
    if (economy.canManage(guild, memberRole)) await member.roles.add(memberRole, 'Ten minutes passed').catch(() => {});
  }
  store.save();
}

/** Boosters get their role automatically, and lose it when they stop. */
async function syncBooster(member) {
  const role = member.guild.roles.cache.find((r) => r.name === 'Booster');
  if (!economy.canManage(member.guild, role)) return;

  const boosting = Boolean(member.premiumSince);
  const has = member.roles.cache.has(role.id);
  if (boosting && !has) await member.roles.add(role, 'Started boosting').catch(() => {});
  if (!boosting && has) await member.roles.remove(role, 'Stopped boosting').catch(() => {});
}

/**
 * Voice: pays for time spent, and turns the hub channel into a personal room.
 * Rooms delete themselves when the last person leaves.
 */
async function onVoice(oldState, newState) {
  const guild = newState.guild ?? oldState.guild;
  const userId = newState.id;
  const key = `${guild.id}:${userId}`;

  // When the voice bot is running it owns voice payouts, multipliers and
  // streaks. Paying here as well would pay the same minute twice.
  if (!process.env.VOICE_TOKEN && oldState.channelId !== newState.channelId) {
    if (oldState.channelId && voiceSince.has(key)) {
      const seconds = Math.floor((Date.now() - voiceSince.get(key)) / 1000);
      voiceSince.delete(key);
      // AFK time is not time spent with people.
      if (oldState.channelId !== guild.afkChannelId && seconds > 30) {
        economy.addVoiceTime(guild.id, userId, seconds);
      }
    }
    if (newState.channelId && newState.channelId !== guild.afkChannelId) {
      voiceSince.set(key, Date.now());
    }
  }

  // Joining the hub creates a room and moves the member into it.
  if (newState.channel?.name === 'Create a room') {
    const member = newState.member;
    const room = await guild.channels
      .create({
        name: `${member.displayName} room`,
        type: ChannelType.GuildVoice,
        parent: newState.channel.parentId,
        permissionOverwrites: [
          { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
        ],
        reason: 'Temporary voice room',
      })
      .catch(() => null);

    if (room) {
      tempRooms(guild.id)[room.id] = 0;
      store.save();
      await member.voice.setChannel(room).catch(() => room.delete().catch(() => {}));
    }
  }

  const rooms = tempRooms(guild.id);

  // Someone came back to a room that was counting down. Cancel the clock.
  if (newState.channelId && rooms[newState.channelId]) {
    rooms[newState.channelId] = 0;
    store.save();
  }

  // Last one out starts the clock instead of pulling the plug. sweepRooms()
  // does the deleting once the grace period is up.
  const left = oldState.channel;
  if (left && left.id in rooms && left.members.size === 0) {
    rooms[left.id] = Date.now();
    store.save();
  }
}

/**
 * Deletes hub rooms that have been empty for the grace period.
 *
 * Runs on the minute tick, which is also what makes it restart-proof: a room
 * that emptied while the bot was offline has no timestamp when it comes back,
 * so it gets one here and goes a couple of minutes later.
 */
async function sweepRooms(guild) {
  const rooms = tempRooms(guild.id);
  const now = Date.now();
  let changed = false;

  for (const [channelId, emptySince] of Object.entries(rooms)) {
    const channel = guild.channels.cache.get(channelId);

    // Deleted by hand, or gone with the category. Stop tracking it.
    if (!channel) {
      delete rooms[channelId];
      changed = true;
      continue;
    }

    if (channel.members.size > 0) {
      if (emptySince !== 0) {
        rooms[channelId] = 0;
        changed = true;
      }
      continue;
    }

    if (!emptySince) {
      rooms[channelId] = now;
      changed = true;
      continue;
    }

    if (now - emptySince >= ROOM_GRACE_MS) {
      delete rooms[channelId];
      changed = true;
      await channel.delete('Temporary room empty').catch(() => {});
    }
  }

  if (changed) store.save();
}

/** Pays for anyone still sitting in voice, so long sessions count as they go. */
function settleVoice(guild) {
  if (process.env.VOICE_TOKEN) return;
  for (const [key, since] of voiceSince) {
    if (!key.startsWith(`${guild.id}:`)) continue;
    const seconds = Math.floor((Date.now() - since) / 1000);
    if (seconds < 600) continue;
    voiceSince.set(key, Date.now());
    economy.addVoiceTime(guild.id, key.split(':')[1], seconds);
  }
}

module.exports = {
  onJoin,
  promoteDue,
  syncBooster,
  onVoice,
  sweepRooms,
  settleVoice,
  cacheInvites,
  NEW_MEMBER_MS,
  ROOM_GRACE_MS,
};
