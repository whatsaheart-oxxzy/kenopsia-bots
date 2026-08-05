'use strict';

const { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');
const store = require('./store');
const quests = require('./quests');
const leaderboard = require('./leaderboard');
const community = require('./community');
const economy = require('./economy');
const { CHANNELS } = require('./blueprint');

/**
 * One tick a minute drives everything time-based. A cron-style clock check
 * beats chained timers here: a restart at 03:00 cannot skip the 00:00 post,
 * because each job records the day or week it last ran for.
 */
const TICK_MS = 60_000;

const WEEKLY_EVENTS = [
  { name: 'Roblox Night', day: 5, hour: 20, description: 'Everyone plays Roblox together. Join the Events voice channel.' },
  { name: 'Game Night', day: 6, hour: 20, description: 'Rotating game every week. Suggestions welcome in suggestions.' },
];

/** Counts something for today's staff report. */
function bumpToday(guildId, field, amount = 1) {
  const state = store.guild(guildId).state;
  const day = store.dayKey();
  if (state.today?.day !== day) state.today = { day, messages: 0, joins: 0, voiceMin: 0 };
  state.today[field] = (state.today[field] ?? 0) + amount;
}

async function postInsights(guild) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.modChat && c.isTextBased());
  if (!channel) return;

  const state = store.guild(guild.id).state;
  const yesterday = state.today ?? { messages: 0, joins: 0, voiceMin: 0 };
  const members = Object.values(store.guild(guild.id).members);
  const active = members.filter((m) => m.day === store.dayKey() || m.weekly.messages > 0).length;

  await channel
    .send(
      [
        `**Daily report — ${yesterday.day ?? store.dayKey()}**`,
        `Members: ${guild.memberCount} (+${yesterday.joins} joined)`,
        `Messages: ${yesterday.messages}`,
        `Voice: ${yesterday.voiceMin} minutes`,
        `Members active this week: ${active}`,
      ].join('\n'),
    )
    .catch(() => {});
}

/** Creates next week's events if they are not on the calendar yet. */
async function ensureEvents(guild) {
  const voice = guild.channels.cache.find((c) => c.name === 'Events' && c.isVoiceBased());
  if (!voice) return;

  let existing;
  try {
    existing = await guild.scheduledEvents.fetch();
  } catch {
    return;
  }

  for (const spec of WEEKLY_EVENTS) {
    if (existing.some((e) => e.name === spec.name && e.scheduledStartTimestamp > Date.now())) continue;

    const start = new Date();
    start.setUTCHours(spec.hour, 0, 0, 0);
    const delta = (spec.day - start.getUTCDay() + 7) % 7;
    start.setUTCDate(start.getUTCDate() + (delta === 0 && start < new Date() ? 7 : delta));

    await guild.scheduledEvents
      .create({
        name: spec.name,
        description: spec.description,
        scheduledStartTime: start,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.Voice,
        channel: voice.id,
      })
      .catch(() => {});
  }
}

async function tick(client) {
  const now = new Date();
  const day = store.dayKey(now);
  const week = store.weekKey(now);
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const weekday = now.getUTCDay(); // 0 = Sunday

  for (const guild of client.guilds.cache.values()) {
    const state = store.guild(guild.id).state;

    try {
      await community.promoteDue(guild);
      await economy.expireTempRoles(guild);
      // Empty hub rooms, once their grace period is up.
      await community.sweepRooms(guild);
      community.settleVoice(guild);

      // Sunday 23:59 UTC: pay the week out before the counters roll over.
      if (weekday === 0 && hour === 23 && minute >= 59 && state.lastPayout !== week) {
        state.lastPayout = week;
        await leaderboard.payoutWeek(guild);
      }

      // 00:00 UTC: daily quests and yesterday's staff report.
      if (hour === 0 && state.lastDaily !== day) {
        state.lastDaily = day;
        await quests.postDaily(guild);
        await postInsights(guild);
        state.today = { day, messages: 0, joins: 0, voiceMin: 0 };
      }

      // Monday 00:00 UTC: weekly quests and next week's events.
      if (weekday === 1 && hour === 0 && state.lastWeekly !== week) {
        state.lastWeekly = week;
        await quests.postWeekly(guild);
        await ensureEvents(guild);
      }

      const hourKey = `${day}-${hour}`;
      if (state.lastLeaderboard !== hourKey) {
        state.lastLeaderboard = hourKey;
        await leaderboard.update(guild);
      }

      store.save();
    } catch (err) {
      console.error(`Schedule tick failed for ${guild.name}:`, err);
    }
  }
}

function start(client) {
  tick(client);
  const timer = setInterval(() => tick(client), TICK_MS);
  timer.unref?.();
}

module.exports = { start, tick, bumpToday, ensureEvents, postInsights };
