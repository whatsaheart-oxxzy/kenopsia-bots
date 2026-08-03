'use strict';

const store = require('./store');
const economy = require('./economy');
const { CHANNELS } = require('./blueprint');

/**
 * Quests are counters, not buttons. The bot tracks progress while people are
 * simply using the server and pays the moment a target is reached, so nobody
 * has to remember to claim anything.
 */

const DAILY = [
  { id: 'chat', title: 'Chat Master', text: 'Send 10 messages in general', field: ['daily', 'general'], target: 10, coins: 15 },
  { id: 'voice', title: 'Voice Explorer', text: 'Spend 20 minutes in any voice channel', field: ['daily', 'voiceMin'], target: 20, coins: 20 },
  { id: 'react', title: 'Community Helper', text: 'React to 5 messages', field: ['daily', 'reactions'], target: 5, coins: 10 },
  { id: 'media', title: 'Content Creator', text: 'Post an image or video in media', field: ['daily', 'media'], target: 1, coins: 10 },
  { id: 'games', title: 'Gamer', text: 'Send 5 messages in game-discussion', field: ['daily', 'gameDisc'], target: 5, coins: 15 },
];

const DAILY_BONUS = 25;

const WEEKLY = [
  { id: 'chatter', title: 'Chatter', text: 'Send 100 messages across the server', field: ['weekly', 'messages'], target: 100, coins: 50, role: 'Chatter' },
  { id: 'voice', title: 'Voice Veteran', text: 'Spend 2 hours in voice channels', field: ['weekly', 'voiceMin'], target: 120, coins: 75, role: 'Voice Active' },
  { id: 'host', title: 'Game Host', text: 'Post 3 sessions in looking-for-play', field: ['weekly', 'lfg'], target: 3, coins: 100, role: 'Game Master' },
  { id: 'invite', title: 'Recruiter', text: 'Bring 3 new members to the server', field: ['weekly', 'invites'], target: 3, coins: 100, role: 'Recruiter' },
];

const WEEKLY_BONUS = 150;

const progressOf = (record, quest) => record[quest.field[0]][quest.field[1]] ?? 0;

/**
 * Pays out everything the member just finished.
 * Returns { paid: [...], bonus: 'daily'|'weekly'|null, coins }.
 */
async function checkAndAward(guild, userId) {
  const record = store.roll(store.member(guild.id, userId));
  const paid = [];
  let coins = 0;
  let bonus = null;

  for (const [list, doneKey, bonusCoins, bonusName] of [
    [DAILY, 'doneDaily', DAILY_BONUS, 'daily'],
    [WEEKLY, 'doneWeekly', WEEKLY_BONUS, 'weekly'],
  ]) {
    for (const quest of list) {
      if (record[doneKey].includes(quest.id)) continue;
      if (progressOf(record, quest) < quest.target) continue;

      record[doneKey].push(quest.id);
      economy.addCoins(guild.id, userId, quest.coins);
      coins += quest.coins;
      paid.push(quest);

      if (quest.role) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) await economy.grantTempRole(member, quest.role, 7, `Weekly quest: ${quest.title}`);
      }
    }

    // The bonus is the reason people finish the boring fifth one.
    if (record[doneKey].length === list.length && !record[doneKey].includes(`${bonusName}-bonus`)) {
      record[doneKey].push(`${bonusName}-bonus`);
      economy.addCoins(guild.id, userId, bonusCoins);
      coins += bonusCoins;
      bonus = bonusName;
    }
  }

  store.save();
  return { paid, bonus, coins };
}

/** The text /quests shows. */
function render(record) {
  const bar = (done, target) => {
    const filled = Math.min(12, Math.round((done / target) * 12));
    return `\`${'='.repeat(filled)}${'.'.repeat(12 - filled)}\` ${Math.min(done, target)}/${target}`;
  };

  const section = (title, list, doneKey, bonusCoins) => {
    const lines = list.map((quest) => {
      const done = record[doneKey].includes(quest.id);
      const value = progressOf(record, quest);
      return done
        ? `**${quest.title}** — done, ${quest.coins} coins`
        : `**${quest.title}** — ${quest.text}\n${bar(value, quest.target)} · ${quest.coins} coins`;
    });
    const left = list.filter((q) => !record[doneKey].includes(q.id)).length;
    lines.push(left ? `${left} left for the ${bonusCoins} coin bonus.` : `Bonus collected: ${bonusCoins} coins.`);
    return [`## ${title}`, ...lines].join('\n');
  };

  return [
    section('Today', DAILY, 'doneDaily', DAILY_BONUS),
    '',
    section('This week', WEEKLY, 'doneWeekly', WEEKLY_BONUS),
  ].join('\n');
}

function announcement(list, title, bonus, intro) {
  const lines = list.map((quest, i) => `**${i + 1}. ${quest.title}**\n${quest.text}\nReward: ${quest.coins} coins${quest.role ? ` and the ${quest.role} role for 7 days` : ''}`);
  return [`# ${title}`, '', intro, '', ...lines, '', `Finish all ${list.length} for ${bonus} extra coins.`, '', 'You do not have to claim anything. Type `/quests` to see how far you are.'].join('\n');
}

async function postDaily(guild) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.dailyQuests && c.isTextBased());
  if (!channel) return false;
  const date = new Date().toISOString().slice(0, 10);
  await channel
    .send(announcement(DAILY, `Daily quests — ${date}`, DAILY_BONUS, 'Five small things. Most people finish them without trying.'))
    .catch(() => {});
  return true;
}

async function postWeekly(guild) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.weeklyQuests && c.isTextBased());
  if (!channel) return false;
  await channel
    .send(announcement(WEEKLY, `Weekly quests — week of ${store.weekKey()}`, WEEKLY_BONUS, 'Four bigger ones. Each gives you a role for seven days.'))
    .catch(() => {});
  return true;
}

module.exports = { DAILY, WEEKLY, DAILY_BONUS, WEEKLY_BONUS, checkAndAward, render, postDaily, postWeekly };
