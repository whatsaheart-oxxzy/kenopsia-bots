'use strict';

const store = require('./store');
const {
  COINS,
  LEVEL_ROLES,
  LEVEL_UP_MESSAGE,
  TEMP_ROLES,
  xpForLevel,
  roleForLevel,
} = require('./blueprint');

// One xp gain per member per minute, so a wall of "hi" is worth one message.
const XP_COOLDOWN_MS = 60_000;
const lastXp = new Map();

function canManage(guild, role) {
  const me = guild.members.me;
  return role && me && role.position < me.roles.highest.position;
}

/** Gives the member the level role they earned and takes the older one away. */
async function syncLevelRole(member, level, reason = 'Level sync') {
  const target = roleForLevel(level);
  const wanted = target ? member.guild.roles.cache.find((r) => r.name === target.name) : null;
  const stale = member.roles.cache.filter(
    (r) => LEVEL_ROLES.some((l) => l.name === r.name) && r.name !== target?.name,
  );

  if (stale.size) {
    await member.roles.remove(stale.filter((r) => canManage(member.guild, r)), reason).catch(() => {});
  }
  if (canManage(member.guild, wanted) && !member.roles.cache.has(wanted.id)) {
    await member.roles.add(wanted, reason).catch(() => {});
  }
  return target;
}

const TRADER_LEVEL = 10;

/**
 * The marketplace needs level 10 AND a verified Roblox account. Discord
 * overwrites are additive, so two roles would mean "either one" — this single
 * bot-managed role is what the channel is gated on.
 */
async function syncTrader(member) {
  const record = store.member(member.guild.id, member.id);
  // The verify bot owns the Roblox Verified role; the role is the shared state,
  // so neither bot has to write into the other one's data file.
  const record_verified = member.roles.cache.some((r) => r.name === 'Roblox Verified');
  if (record.robloxVerified !== record_verified) {
    record.robloxVerified = record_verified;
    store.save();
  }
  const earned = record.level >= TRADER_LEVEL && record_verified;
  const role = member.guild.roles.cache.find((r) => r.name === 'Trader');
  if (!canManage(member.guild, role)) return false;

  const has = member.roles.cache.has(role.id);
  if (earned && !has) await member.roles.add(role, 'Level 10 and Roblox verified').catch(() => {});
  if (!earned && has) await member.roles.remove(role, 'No longer qualifies').catch(() => {});
  return earned;
}

/**
 * Adds coins. `weekly` is what the leaderboard ranks; `coins` is the balance
 * that never resets.
 */
function addCoins(guildId, userId, amount) {
  const record = store.roll(store.member(guildId, userId));
  record.coins = Math.max(0, record.coins + amount);
  if (amount > 0) record.weeklyCoins += amount;
  store.save();
  return record;
}

/**
 * One message: xp (rate limited), coins (capped), and the counters the quests
 * read. Returns { leveledUp, role } when the member gained a level.
 */
async function onMessage(message) {
  const { guild, author, channel } = message;
  const record = store.roll(store.member(guild.id, author.id));

  // Coins and quest counters have their own caps, so they run every message.
  if (record.coinsFromMessages < COINS.message.dailyCap) {
    const amount = Math.min(COINS.message.amount, COINS.message.dailyCap - record.coinsFromMessages);
    record.coinsFromMessages += amount;
    addCoins(guild.id, author.id, amount);
  }

  record.weekly.messages += 1;
  if (channel.name === 'general') record.daily.general += 1;
  if (channel.name === 'game-discussion') record.daily.gameDisc += 1;
  if (channel.name === 'media' && message.attachments.size > 0) record.daily.media += 1;
  if (channel.name === 'looking-for-play') record.weekly.lfg += 1;

  const key = `${guild.id}:${author.id}`;
  const now = Date.now();
  if (now - (lastXp.get(key) ?? 0) < XP_COOLDOWN_MS) {
    store.save();
    return null;
  }
  lastXp.set(key, now);

  record.xp += 15 + Math.floor(Math.random() * 11); // 15-25 xp, same shape as MEE6
  let leveledUp = false;
  while (record.xp >= xpForLevel(record.level)) {
    record.xp -= xpForLevel(record.level);
    record.level += 1;
    leveledUp = true;
  }
  store.save();

  if (!leveledUp) return null;

  const member = await guild.members.fetch(author.id).catch(() => null);
  const role = member ? await syncLevelRole(member, record.level, 'Level up') : null;
  if (member) await syncTrader(member);
  return { level: record.level, role: role?.name ?? null, text: LEVEL_UP_MESSAGE(author, record.level, role?.name) };
}

/** Someone reacted to a message: the author earns, capped per day. */
function onReactionReceived(guildId, authorId, byModerator) {
  const record = store.roll(store.member(guildId, authorId));

  if (byModerator && record.coinsFromModHelp < COINS.modHelpful.dailyCap) {
    record.coinsFromModHelp += COINS.modHelpful.amount;
    addCoins(guildId, authorId, COINS.modHelpful.amount);
    return COINS.modHelpful.amount;
  }
  if (record.coinsFromReactions < COINS.reactionReceived.dailyCap) {
    record.coinsFromReactions += COINS.reactionReceived.amount;
    addCoins(guildId, authorId, COINS.reactionReceived.amount);
    return COINS.reactionReceived.amount;
  }
  return 0;
}

/** Counts a reaction the member gave, for the daily quest. */
function onReactionGiven(guildId, userId) {
  const record = store.roll(store.member(guildId, userId));
  record.daily.reactions += 1;
  store.save();
}

/** Voice time, paid in 10 minute blocks so short hops are not worth farming. */
function addVoiceTime(guildId, userId, seconds) {
  const record = store.roll(store.member(guildId, userId));
  const before = Math.floor(record.voiceSeconds / 600);
  record.voiceSeconds += seconds;
  const blocks = Math.floor(record.voiceSeconds / 600) - before;

  const minutes = Math.floor(seconds / 60);
  record.daily.voiceMin += minutes;
  record.weekly.voiceMin += minutes;

  if (blocks > 0) addCoins(guildId, userId, blocks * COINS.voicePer10Min.amount);
  store.save();
  return blocks * COINS.voicePer10Min.amount;
}

/** Gives a role for a number of days and remembers when to take it back. */
async function grantTempRole(member, roleName, days, reason) {
  const role = member.guild.roles.cache.find((r) => r.name === roleName);
  if (!canManage(member.guild, role)) return false;

  await member.roles.add(role, reason).catch(() => {});
  const record = store.member(member.guild.id, member.id);
  record.tempRoles[roleName] = Date.now() + days * 86_400_000;
  store.save();
  return true;
}

/** Removes every temporary role whose time is up. Runs on the minute tick. */
async function expireTempRoles(guild) {
  const members = store.guild(guild.id).members;
  const now = Date.now();

  for (const [userId, record] of Object.entries(members)) {
    const due = Object.entries(record.tempRoles ?? {}).filter(([, expires]) => expires <= now);
    if (!due.length) continue;

    const member = await guild.members.fetch(userId).catch(() => null);
    for (const [roleName] of due) {
      delete record.tempRoles[roleName];
      if (!member || !TEMP_ROLES.includes(roleName)) continue;
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (canManage(guild, role)) await member.roles.remove(role, 'Temporary role expired').catch(() => {});
    }
  }
  store.save();
}

module.exports = {
  addCoins,
  syncTrader,
  TRADER_LEVEL,
  onMessage,
  onReactionReceived,
  onReactionGiven,
  addVoiceTime,
  syncLevelRole,
  grantTempRole,
  expireTempRoles,
  canManage,
};
