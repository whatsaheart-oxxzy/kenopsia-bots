'use strict';

const db = require('./db');
const economy = require('../../lib/kenopsia/economy');
const kenopsia = require('../../lib/kenopsia/store');

/**
 * What talking to Tamem is worth.
 *
 * Same wallet as everything else — Tamem runs in C.C's process precisely so it
 * can pay out of `data/kenopsia.json` without a second writer. Payouts are
 * small and capped: a bot that pays per reply is a bot that gets talked at by
 * someone farming it, and the whole point is that the conversation is real.
 */

const REPLY_COINS = 1; // per reply Tamem gives you
const DAILY_BONUS = 5; // first interaction of the day
const TEACH_COST = 10; // /tamem teach
const DAILY_REPLY_CAP = 20; // coins a day from replies alone

const WHISPERER = { role: 'Tamem Whisperer', at: 50 }; // interactions
const TEACHER = { role: "Tamem's Teacher", at: 20 }; // phrases taught

const today = () => new Date().toISOString().slice(0, 10);

function person(userId) {
  db.run('INSERT OR IGNORE INTO people (user_id) VALUES (?)', userId);
  return db.get('SELECT user_id, replies, taught, last_bonus FROM people WHERE user_id = ?', userId);
}

/** Adds a permanent role if it exists and Tamem's bot sits above it. */
async function award(member, roleName, reason) {
  const role = member.guild.roles.cache.find((r) => r.name === roleName);
  if (!economy.canManage(member.guild, role)) return false;
  if (member.roles.cache.has(role.id)) return false;
  await member.roles.add(role, reason).catch(() => {});
  return true;
}

/**
 * Pays for one reply. Returns what to tell the member, or null when there is
 * nothing worth saying — which is most of the time, because a bot that
 * announces every coin gets tiring fast.
 */
async function onReply(member) {
  if (!member || member.user.bot) return null;
  const record = person(member.id);
  const notes = [];

  db.run('UPDATE people SET replies = replies + 1 WHERE user_id = ?', member.id);

  // The daily-reply cap rides on the existing coin record so it resets with
  // everything else at 00:00 UTC.
  const wallet = kenopsia.roll(kenopsia.member(member.guild.id, member.id));
  wallet.coinsFromTamem = (wallet.coinsFromTamem ?? 0) + 0;

  if (record.last_bonus !== today()) {
    db.run('UPDATE people SET last_bonus = ? WHERE user_id = ?', today(), member.id);
    economy.addCoins(member.guild.id, member.id, DAILY_BONUS);
    notes.push(`+${DAILY_BONUS} coins for talking to me today`);
  } else if ((wallet.coinsFromTamem ?? 0) < DAILY_REPLY_CAP) {
    wallet.coinsFromTamem += REPLY_COINS;
    economy.addCoins(member.guild.id, member.id, REPLY_COINS);
  }

  kenopsia.save();

  if (record.replies + 1 >= WHISPERER.at) {
    if (await award(member, WHISPERER.role, `${WHISPERER.at} conversations with Tamem`)) {
      notes.push(`you are a **${WHISPERER.role}** now`);
    }
  }

  return notes.length ? notes.join(' — ') : null;
}

/** Charges for /tamem teach. Returns false when they cannot afford it. */
function chargeTeaching(guildId, userId) {
  const wallet = kenopsia.roll(kenopsia.member(guildId, userId));
  if (wallet.coins < TEACH_COST) return false;
  economy.addCoins(guildId, userId, -TEACH_COST);
  return true;
}

async function onTaught(member) {
  person(member.id);
  db.run('UPDATE people SET taught = taught + 1 WHERE user_id = ?', member.id);
  const record = person(member.id);

  if (record.taught >= TEACHER.at) {
    if (await award(member, TEACHER.role, `${TEACHER.at} phrases taught to Tamem`)) {
      return `You are **${TEACHER.role}** now.`;
    }
  }
  return null;
}

const balanceOf = (guildId, userId) => kenopsia.roll(kenopsia.member(guildId, userId)).coins;

const top = (limit = 10) =>
  db.all('SELECT user_id, replies, taught FROM people ORDER BY replies DESC LIMIT ?', limit);

module.exports = {
  REPLY_COINS,
  DAILY_BONUS,
  TEACH_COST,
  DAILY_REPLY_CAP,
  WHISPERER,
  TEACHER,
  person,
  onReply,
  chargeTeaching,
  onTaught,
  balanceOf,
  top,
};
