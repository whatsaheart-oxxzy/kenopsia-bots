'use strict';

const store = require('./store');
const economy = require('./economy');
const { CHANNELS } = require('./blueprint');

// Position -> coins. First place also gets the Weekly Champion role.
const PRIZES = [200, 150, 100, 50, 50];

function render(guild, top) {
  if (!top.length) {
    return ['# Weekly leaderboard', '', 'Nobody has earned a coin this week yet. That is an opening.'].join('\n');
  }

  const lines = top.map((entry, i) => {
    const member = guild.members.cache.get(entry.id);
    const name = member?.displayName ?? 'Unknown member';
    const prize = PRIZES[i] ? ` · ${PRIZES[i]} coins at the end of the week` : '';
    return `\`${String(i + 1).padStart(2)}\` **${name}** — ${entry.value} coins${prize}`;
  });

  const resets = new Date();
  resets.setUTCDate(resets.getUTCDate() + ((7 - resets.getUTCDay()) % 7));
  return [
    '# Weekly leaderboard',
    '',
    ...lines,
    '',
    `Coins earned this week only. Resets Sunday 23:59 UTC. Updated ${new Date().toISOString().slice(11, 16)} UTC.`,
  ].join('\n');
}

/**
 * Keeps one message up to date instead of posting a new one every hour, so the
 * channel stays readable and the message keeps its place.
 */
async function update(guild) {
  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.leaderboard && c.isTextBased());
  if (!channel) return false;

  const top = store.ranked(guild.id, 'weeklyCoins', 10);
  const text = render(guild, top);
  const state = store.guild(guild.id).state;

  if (state.leaderboardMessageId) {
    const existing = await channel.messages.fetch(state.leaderboardMessageId).catch(() => null);
    if (existing) {
      await existing.edit(text).catch(() => {});
      return true;
    }
  }

  const message = await channel.send(text).catch(() => null);
  if (message) {
    state.leaderboardMessageId = message.id;
    await message.pin().catch(() => {});
    store.save();
  }
  return Boolean(message);
}

/**
 * Pays the top five, hands the champion their role, and announces the result.
 * The weekly counters themselves reset on their own via the week key.
 */
async function payoutWeek(guild) {
  const top = store.ranked(guild.id, 'weeklyCoins', PRIZES.length);
  if (!top.length) return null;

  const lines = [];
  for (const [index, entry] of top.entries()) {
    economy.addCoins(guild.id, entry.id, PRIZES[index]);
    const member = await guild.members.fetch(entry.id).catch(() => null);
    const name = member?.displayName ?? 'Unknown member';
    lines.push(`\`${index + 1}\` **${name}** — ${entry.value} coins this week, ${PRIZES[index]} coins paid out`);

    if (index === 0 && member) {
      await economy.grantTempRole(member, 'Weekly Champion', 7, 'Won the week');
    }
  }

  const channel = guild.channels.cache.find((c) => c.name === CHANNELS.announcements && c.isTextBased());
  const text = [
    '# The week is over',
    '',
    ...lines,
    '',
    'Everyone starts at zero again now. Someone who joins tomorrow can still win next Sunday.',
  ].join('\n');

  if (channel) await channel.send(text).catch(() => {});
  store.guild(guild.id).state.leaderboardMessageId = null;
  store.save();
  return text;
}

module.exports = { update, payoutWeek, render, PRIZES };
