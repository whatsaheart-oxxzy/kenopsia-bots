'use strict';

const config = require('./config');
const store = require('./store');
const voice = require('./voice');

const PERIODS = {
  daily: { field: 'daily', label: 'today', roles: [], payouts: config.PAYOUTS.daily, days: 0 },
  weekly: { field: 'weekly', label: 'this week', roles: config.WEEKLY_ROLES, payouts: config.PAYOUTS.weekly, days: 7 },
  monthly: { field: 'monthly', label: 'this month', roles: config.MONTHLY_ROLES, payouts: config.PAYOUTS.monthly, days: 30 },
  alltime: { field: 'lifetime', label: 'all time', roles: [], payouts: [], days: 0 },
};

function render(guild, period) {
  const spec = PERIODS[period];
  const top = store.ranked(guild.id, spec.field, 10);

  if (!top.length) {
    return `# Voice leaderboard, ${spec.label}\n\nNobody has been in voice yet. That is an opening.`;
  }

  const lines = top.map((entry, i) => {
    const member = guild.members.cache.get(entry.user);
    const hours = Math.floor(entry.seconds / 3600);
    const prize = spec.payouts[i] ? ` · ${spec.payouts[i]} coins at reset` : '';
    return `\`${String(i + 1).padStart(2)}\` **${member?.displayName ?? 'Unknown member'}** — ${entry[spec.field]} coins · ${hours}h total${prize}`;
  });

  return [`# Voice leaderboard, ${spec.label}`, '', ...lines].join('\n');
}

/**
 * Pays the top of a period and hands out the temporary titles.
 * The period counters reset themselves through the calendar keys.
 */
async function payout(guild, period) {
  const spec = PERIODS[period];
  const top = store.ranked(guild.id, spec.field, spec.payouts.length);
  if (!top.length) return null;

  const lines = [];
  for (const [index, entry] of top.entries()) {
    const paid = voice.payCoins(guild.id, entry.user, spec.payouts[index]);
    const member = await guild.members.fetch(entry.user).catch(() => null);
    lines.push(`\`${index + 1}\` **${member?.displayName ?? 'Unknown member'}** — ${entry[spec.field]} coins, ${paid} paid out`);

    const roleName = spec.roles[index];
    if (roleName && member) {
      const role = guild.roles.cache.find((r) => r.name === roleName);
      const me = guild.members.me;
      if (role && role.position < me.roles.highest.position) {
        await member.roles.add(role, `Voice leaderboard ${period}`).catch(() => {});
        const record = store.member(guild.id, entry.user);
        record.titles ??= {};
        record.titles[roleName] = Date.now() + spec.days * 86_400_000;
        store.save();
      }
    }
  }

  return [`# Voice, ${spec.label} — final`, '', ...lines, '', 'Counters are back to zero. Anyone can take it next time.'].join('\n');
}

/** Removes leaderboard titles whose time is up. */
async function expireTitles(guild) {
  const now = Date.now();
  for (const record of Object.values(store.ranked(guild.id, 'lifetime', 1000))) {
    for (const [roleName, expires] of Object.entries(record.titles ?? {})) {
      if (expires > now) continue;
      delete record.titles[roleName];

      const member = await guild.members.fetch(record.user).catch(() => null);
      const role = guild.roles.cache.find((r) => r.name === roleName);
      if (member && role && role.position < guild.members.me.roles.highest.position) {
        await member.roles.remove(role, 'Voice title expired').catch(() => {});
      }
    }
  }
  store.save();
}

module.exports = { PERIODS, render, payout, expireTitles };
