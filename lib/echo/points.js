'use strict';

const store = require('./store');
const { LEVELS, levelFor } = require('./blueprint');

// Point values per action, and the daily caps that keep them from being farmed.
const RULES = {
  message: { points: 1, dailyCap: 50 },
  helpful: { points: 10, givenPerDay: 5 },
  quiz: { points: 5 },
  daily: { points: 10 },
  event: { points: 25 },
  invite: { points: 50 },
};

/**
 * Adds points to a member and syncs their level role.
 * Returns { points, level, leveledUp } — leveledUp is the new level or null.
 */
async function award(guild, user, amount, reason) {
  if (!amount) return null;

  const record = store.rollDay(store.member(guild.id, user.id));
  const before = record.level;
  record.points = Math.max(0, record.points + amount);
  record.level = levelFor(record.points).name;
  store.save();

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) await syncRoles(member, record.level, reason);

  return {
    points: record.points,
    level: record.level,
    leveledUp: record.level !== before ? record.level : null,
  };
}

/** Gives the member exactly one level role — the one they've earned. */
async function syncRoles(member, levelName, reason = 'ECHO level sync') {
  const wanted = member.guild.roles.cache.find((r) => r.name === levelName);
  const stale = member.roles.cache.filter(
    (r) => LEVELS.some((l) => l.name === r.name) && r.name !== levelName,
  );

  const me = member.guild.members.me;
  // Roles above the bot's own top role can't be touched — skip instead of throwing.
  const manageable = (role) => role && me && role.position < me.roles.highest.position;

  if (stale.size) {
    await member.roles.remove(stale.filter(manageable), reason).catch(() => {});
  }
  if (manageable(wanted) && !member.roles.cache.has(wanted.id)) {
    await member.roles.add(wanted, reason).catch(() => {});
  }
}

/** +1 per message, capped at 50/day. Returns the award result or null. */
async function onMessage(message) {
  const record = store.rollDay(store.member(message.guild.id, message.author.id));
  if (record.messagesToday >= RULES.message.dailyCap) return null;
  record.messagesToday += 1;
  return award(message.guild, message.author, RULES.message.points, 'Message');
}

/**
 * A reaction on someone else's message counts as "this helped me".
 * The giver is capped so a single member can't inflate one person's score.
 */
async function onHelpful(reaction, giver) {
  const message = reaction.message;
  const author = message.author;
  if (!author || author.bot || author.id === giver.id) return null;

  const giverRecord = store.rollDay(store.member(message.guild.id, giver.id));
  if (giverRecord.helpfulGivenToday >= RULES.helpful.givenPerDay) return null;
  giverRecord.helpfulGivenToday += 1;

  return award(message.guild, author, RULES.helpful.points, `Helpful reaction from ${giver.tag}`);
}

/** Claims the daily quest reward once per calendar day. */
async function claimDaily(guild, user) {
  const record = store.rollDay(store.member(guild.id, user.id));
  const day = store.today();
  if (record.lastDaily === day) return { alreadyClaimed: true, streak: record.streak };

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  record.streak = record.lastDaily === yesterday ? record.streak + 1 : 1;
  record.lastDaily = day;

  // Streaks add a small bonus so showing up daily beats showing up once.
  const bonus = Math.min(record.streak - 1, 10);
  const result = await award(guild, user, RULES.daily.points + bonus, 'Daily Quest');
  return { ...result, streak: record.streak, earned: RULES.daily.points + bonus };
}

/** Points still needed for the next level, or null at Legend. */
function nextLevel(points) {
  return LEVELS.find((l) => l.points > points) ?? null;
}

module.exports = { RULES, award, syncRoles, onMessage, onHelpful, claimDaily, nextLevel };
