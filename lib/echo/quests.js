'use strict';

const store = require('./store');
const { CHANNELS } = require('./blueprint');

// Simple global English: short, concrete, answerable by anyone.
const MORNING_ECHOES = [
  'What is your one goal today?',
  'What are you working on that nobody here has seen yet?',
  'What decision have you been putting off for a week?',
  'What did you learn recently that you wish you knew a year ago?',
  'Who in this server do you still owe a thank you?',
  'What would you build if failing cost you nothing?',
  'Which habit helped you most this week?',
];

const DAILY_QUESTS = [
  { title: 'Signal Fire', text: 'Ask someone in the Hearth a question that cannot be answered with yes or no.' },
  { title: 'Workbench', text: 'Share something unfinished in the Forge. A sketch, one line of code, half an idea.' },
  { title: 'Echo Answer', text: 'Answer an open question from someone else so that it actually helps them.' },
  { title: 'Archivist', text: 'Write down one thing you learned this week in the questions channel.' },
  { title: 'Trade Run', text: 'Offer something you can do in the Marketplace. Fifteen minutes of your time counts.' },
  { title: 'Council Voice', text: 'Vote on an open proposal in the Council, or write a new one.' },
  { title: 'Mapmaker', text: 'Write in your Chronicles thread what changed for you this week.' },
];

function pick(list, dayKey) {
  // Same rotation for everyone on a given day, and it wraps forever.
  const seed = Number(dayKey.replaceAll('-', ''));
  return list[seed % list.length];
}

async function post(guild) {
  const day = store.today();
  const state = store.guild(guild.id).state;
  if (state.lastQuestDay === day) return false;

  const find = (name) => guild.channels.cache.find((c) => c.name === name && c.isTextBased?.());
  const hearth = find(CHANNELS.hearth);
  const arena = find(CHANNELS.arena);
  if (!hearth && !arena) return false;

  const quest = pick(DAILY_QUESTS, day);

  if (hearth) {
    await hearth.send(`**Morning Echo** — ${pick(MORNING_ECHOES, day)}`).catch(() => {});
  }
  if (arena) {
    await arena
      .send(
        [
          `**Daily Quest: ${quest.title}**`,
          quest.text,
          '',
          'Done? Type `/echo daily` to collect your points. The streak counts.',
        ].join('\n'),
      )
      .catch(() => {});
  }

  state.lastQuestDay = day;
  store.save();
  return true;
}

/** ms until the next occurrence of `hour` local time. */
function msUntil(hour) {
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next - Date.now();
}

/**
 * Posts the morning echo + daily quest once per day at ECHO_QUEST_HOUR.
 * Fires immediately on boot too, so a restart after the hour still delivers
 * (the lastQuestDay guard keeps it to one post per day).
 */
function schedule(client, hour = Number(process.env.ECHO_QUEST_HOUR ?? 9)) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      await post(guild).catch((err) => console.error('Daily quest failed:', err));
    }
  };

  run();
  const tick = () => {
    setTimeout(async () => {
      await run();
      tick();
    }, msUntil(hour)).unref?.();
  };
  tick();
}

module.exports = { schedule, post, DAILY_QUESTS, MORNING_ECHOES };
