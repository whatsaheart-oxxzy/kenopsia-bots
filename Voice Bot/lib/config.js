'use strict';

/**
 * Every number the voice system uses. Rates are in Kenopsia coins — there is
 * no second currency, so nothing has to be converted and nothing has to be
 * explained twice.
 *
 * Balance note: chatting is capped at 100 coins a day. Voice is deliberately
 * the better earner but not five times better, so the pet shop and the weekly
 * leaderboard stay meaningful. Base rate is 30 coins an hour, same as before,
 * and the multipliers stack on top.
 */

const SECONDS_PER_COIN = 120; // 1 coin per 2 minutes at 1.0x

const DAILY_CAP = 200; // coins per member per day from voice alone

// Per channel. Anything not listed pays the base rate.
const CHANNEL_MULTIPLIERS = {
  Lounge: 1,
  Gaming: 1.5,
  Events: 2,
  'Study Zone': 1.2,
  'Music Lounge': 1,
  AFK: 0,
};

const PEAK_HOURS = { from: 18, to: 22, multiplier: 1.2 }; // UTC
const WEEKEND_MULTIPLIER = 1.1;

/**
 * Paid once each when a single unbroken session passes the mark. Halved from
 * the original design because these are coins, not a separate point pool.
 */
const STREAKS = [
  { minutes: 10, coins: 1 },
  { minutes: 20, coins: 3 },
  { minutes: 30, coins: 5 },
  { minutes: 45, coins: 8 },
  { minutes: 60, coins: 13 },
  { minutes: 90, coins: 20 },
  { minutes: 120, coins: 30 },
];

// Lifetime voice coins -> role. Highest match wins.
const VOICE_ROLES = [
  { name: 'Voice Newbie', at: 0 },
  { name: 'Voice Regular', at: 100 },
  { name: 'Voice Enthusiast', at: 500 },
  { name: 'Voice Veteran', at: 2_000 },
  { name: 'Voice Elite', at: 5_000 },
  { name: 'Voice Legend', at: 10_000 },
];

// Leaderboard payouts. Roles last 7 days for the week, 30 for the month.
const PAYOUTS = {
  daily: [50, 30, 15],
  weekly: [200, 150, 100, 50, 25],
  monthly: [500, 400, 300, 200, 200, 100, 100, 100, 100, 100],
};

const WEEKLY_ROLES = ['Voice King', 'Voice Duke', 'Voice Knight'];
const MONTHLY_ROLES = ['Voice Emperor', 'Voice King', 'Voice Duke'];

const EVENT = {
  join: 10,
  minutes30: 25,
  minutes60: 50,
  host: 50,
  crowdedHost: 100, // five or more people showed up
};

const CHANNELS = { guide: 'voice-guide', log: 'level-ups', events: 'echo-events' };

/** The full multiplier for a member sitting in this channel right now. */
function multiplierFor(channelName, now = new Date()) {
  const base = CHANNEL_MULTIPLIERS[channelName] ?? 1;
  if (base === 0) return 0;

  const hour = now.getUTCHours();
  const peak = hour >= PEAK_HOURS.from && hour < PEAK_HOURS.to ? PEAK_HOURS.multiplier : 1;
  const day = now.getUTCDay();
  const weekend = day === 0 || day === 6 ? WEEKEND_MULTIPLIER : 1;

  return base * peak * weekend;
}

/** Human readable list of what is active right now, for /multipliers. */
function activeMultipliers(now = new Date()) {
  const lines = Object.entries(CHANNEL_MULTIPLIERS).map(
    ([name, value]) => `${name}: ${value === 0 ? 'no coins' : `${value}x`}`,
  );

  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const extras = [];
  if (hour >= PEAK_HOURS.from && hour < PEAK_HOURS.to) extras.push(`Peak hours: ${PEAK_HOURS.multiplier}x`);
  if (day === 0 || day === 6) extras.push(`Weekend: ${WEEKEND_MULTIPLIER}x`);

  return { channels: lines, extras };
}

module.exports = {
  SECONDS_PER_COIN,
  DAILY_CAP,
  CHANNEL_MULTIPLIERS,
  PEAK_HOURS,
  WEEKEND_MULTIPLIER,
  STREAKS,
  VOICE_ROLES,
  PAYOUTS,
  WEEKLY_ROLES,
  MONTHLY_ROLES,
  EVENT,
  CHANNELS,
  multiplierFor,
  activeMultipliers,
};
