'use strict';

const config = require('./config');
const store = require('./store');
const kenopsia = require('../../lib/kenopsia/store');
const economy = require('../../lib/kenopsia/economy');

/**
 * Voice tracking. A ticker credits everyone who is currently connected once a
 * minute, rather than working it out when they leave. That way a channel
 * switch, a peak-hour boundary or a bot restart cannot swallow or duplicate
 * time — at worst one minute is lost.
 */

const TICK_MS = 60_000;
const XP_PER_10_MIN = 1;
const XP_DAILY_CAP = 20;

// `${guildId}:${userId}` -> live session
const sessions = new Map();

const sessionKey = (guildId, userId) => `${guildId}:${userId}`;

function start(guildId, userId, channelName) {
  const key = sessionKey(guildId, userId);
  const existing = sessions.get(key);
  // Switching channels keeps the streak: it is still one unbroken session.
  sessions.set(key, {
    guildId,
    userId,
    channelName,
    startedAt: existing?.startedAt ?? Date.now(),
    minutes: existing?.minutes ?? 0,
    streak: existing?.streak ?? 0,
    fraction: existing?.fraction ?? 0,
    coins: existing?.coins ?? 0,
    paidStreaks: existing?.paidStreaks ?? [],
  });
}

function stop(guildId, userId) {
  const key = sessionKey(guildId, userId);
  const session = sessions.get(key);
  sessions.delete(key);

  if (session) {
    const record = store.roll(store.member(guildId, userId));
    record.sessions += 1;
    record.bestStreak = Math.max(record.bestStreak, session.streak);
    store.save();
  }
  return session;
}

const activeSession = (guildId, userId) => sessions.get(sessionKey(guildId, userId)) ?? null;

/** Gives coins, but never past the daily voice cap. Returns what was paid. */
function payCoins(guildId, userId, amount) {
  if (amount <= 0) return 0;

  const record = store.roll(store.member(guildId, userId));
  const room = config.DAILY_CAP - record.daily;
  const paid = Math.min(amount, Math.max(0, room));
  if (paid <= 0) return 0;

  record.daily += paid;
  record.weekly += paid;
  record.monthly += paid;
  record.lifetime += paid;
  economy.addCoins(guildId, userId, paid);
  store.save();
  return paid;
}

/** One minute of credit for one member. Returns what happened, for notices. */
function creditMinute(session) {
  const { guildId, userId } = session;
  const multiplier = config.multiplierFor(session.channelName);

  const record = store.roll(store.member(guildId, userId));
  record.seconds += 60;

  // AFK pays nothing and does not build a streak — that is the whole point.
  if (multiplier === 0) {
    store.save();
    return { paid: 0, streakBonus: 0, milestone: null };
  }

  session.minutes += 1;
  session.streak += 1;

  session.fraction += (60 / config.SECONDS_PER_COIN) * multiplier;
  const whole = Math.floor(session.fraction);
  session.fraction -= whole;

  let paid = payCoins(guildId, userId, whole);

  // Streak bonuses pay once per session per mark.
  let streakBonus = 0;
  for (const step of config.STREAKS) {
    if (session.streak >= step.minutes && !session.paidStreaks.includes(step.minutes)) {
      session.paidStreaks.push(step.minutes);
      streakBonus += payCoins(guildId, userId, step.coins);
    }
  }
  paid += streakBonus;
  session.coins += paid;

  // Kenopsia side: the weekly voice quest and a little level xp.
  const member = kenopsia.roll(kenopsia.member(guildId, userId));
  member.daily.voiceMin += 1;
  member.weekly.voiceMin += 1;

  if (record.day !== record.xpDay) {
    record.xpDay = record.day;
    record.xpToday = 0;
  }
  if (session.minutes % 10 === 0 && record.xpToday < XP_DAILY_CAP) {
    record.xpToday += XP_PER_10_MIN;
    member.xp += XP_PER_10_MIN;
  }
  kenopsia.save();
  store.save();

  const milestone = [30, 60, 120].includes(session.streak) ? session.streak : null;
  return { paid, streakBonus, milestone };
}

/** Gives the member the voice role they have earned and removes the old one. */
async function syncVoiceRole(member) {
  const record = store.member(member.guild.id, member.id);
  let target = null;
  for (const role of config.VOICE_ROLES) if (record.lifetime >= role.at) target = role;

  const me = member.guild.members.me;
  const manageable = (role) => role && me && role.position < me.roles.highest.position;

  const stale = member.roles.cache.filter(
    (r) => config.VOICE_ROLES.some((v) => v.name === r.name) && r.name !== target?.name,
  );
  if (stale.size) await member.roles.remove(stale.filter(manageable), 'Voice progress').catch(() => {});

  const wanted = target ? member.guild.roles.cache.find((r) => r.name === target.name) : null;
  if (manageable(wanted) && !member.roles.cache.has(wanted.id)) {
    await member.roles.add(wanted, 'Voice progress').catch(() => {});
  }
  return target;
}

/**
 * Runs every minute over everyone currently connected.
 * Milestone notices go out as DMs, and only at 30, 60 and 120 minutes —
 * a message for every join and leave is noise nobody thanks you for.
 */
async function tick(client) {
  for (const session of [...sessions.values()]) {
    const guild = client.guilds.cache.get(session.guildId);
    if (!guild) continue;

    const result = creditMinute(session);

    if (result.milestone) {
      const user = await client.users.fetch(session.userId).catch(() => null);
      const text =
        result.milestone === 30
          ? `Half an hour in voice. ${session.coins} coins so far this session.`
          : result.milestone === 60
            ? `A full hour in voice. ${session.coins} coins this session, and the streak keeps paying.`
            : `Two hours in voice. ${session.coins} coins this session. Drink some water.`;
      await user?.send(text).catch(() => {});
    }

    const member = await guild.members.fetch(session.userId).catch(() => null);
    if (member) await syncVoiceRole(member);
  }
}

module.exports = {
  start,
  stop,
  activeSession,
  tick,
  creditMinute,
  syncVoiceRole,
  payCoins,
  sessions,
  TICK_MS,
};
