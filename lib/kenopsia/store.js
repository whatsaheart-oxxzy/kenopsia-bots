'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'kenopsia.json');

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { guilds: {} };
  }
  return cache;
}

/** Writes are debounced — message counters fire far too often for sync writes. */
function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 3_000);
  writeTimer.unref?.();
}

function flush() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  if (!cache) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

/** UTC day key. Everything in this server resets on UTC, as announced. */
function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** ISO-ish week key, Monday based, so the weekly reset lines up with the quests. */
function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayOfWeek);
  return d.toISOString().slice(0, 10);
}

function guild(guildId) {
  const data = load();
  data.guilds[guildId] ??= { members: {}, state: {}, invites: {} };
  return data.guilds[guildId];
}

const emptyDaily = () => ({ general: 0, voiceMin: 0, reactions: 0, media: 0, gameDisc: 0 });
const emptyWeekly = () => ({ messages: 0, voiceMin: 0, lfg: 0, invites: 0 });

function member(guildId, userId) {
  const g = guild(guildId);
  g.members[userId] ??= {
    xp: 0,
    level: 0,
    coins: 0,
    weeklyCoins: 0,
    day: '',
    week: '',
    coinsFromMessages: 0,
    coinsFromReactions: 0,
    coinsFromModHelp: 0,
    voiceSeconds: 0,
    daily: emptyDaily(),
    weekly: emptyWeekly(),
    doneDaily: [],
    doneWeekly: [],
    warnings: [],
    tempRoles: {},
    invites: 0,
  };
  return g.members[userId];
}

/**
 * Resets the per-day and per-week counters when the record is stale.
 * Called before every read that matters, so a bot restart cannot skip a reset.
 */
function roll(record) {
  const day = dayKey();
  if (record.day !== day) {
    record.day = day;
    record.coinsFromMessages = 0;
    record.coinsFromReactions = 0;
    record.coinsFromModHelp = 0;
    record.daily = emptyDaily();
    record.doneDaily = [];
  }

  const week = weekKey();
  if (record.week !== week) {
    record.week = week;
    record.weeklyCoins = 0;
    record.weekly = emptyWeekly();
    record.doneWeekly = [];
  }
  return record;
}

function ranked(guildId, field, limit = 10) {
  return Object.entries(guild(guildId).members)
    .map(([id, m]) => ({ id, value: m[field] ?? 0, level: m.level, coins: m.coins }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function rankOf(guildId, userId, field) {
  const all = Object.entries(guild(guildId).members)
    .map(([id, m]) => ({ id, value: m[field] ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const index = all.findIndex((e) => e.id === userId);
  return index === -1 ? 0 : index + 1;
}

module.exports = { guild, member, roll, ranked, rankOf, save, flush, dayKey, weekKey };
