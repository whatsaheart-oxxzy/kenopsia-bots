'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Voice statistics live here. Coins themselves stay in the Kenopsia store —
// one wallet, one owner, no conversion.
const FILE = path.join(__dirname, '..', 'data', 'voice.json');

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { members: {}, events: {}, state: {} };
  }
  return cache;
}

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

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const key = (guildId, userId) => `${guildId}:${userId}`;

function member(guildId, userId) {
  const data = load();
  data.members[key(guildId, userId)] ??= {
    guild: guildId,
    user: userId,
    seconds: 0,
    lifetime: 0, // coins earned from voice, ever
    daily: 0,
    weekly: 0,
    monthly: 0,
    day: '',
    week: '',
    month: '',
    bestStreak: 0,
    sessions: 0,
  };
  return data.members[key(guildId, userId)];
}

/** Rolls the period counters over when the calendar moved on. */
function roll(record) {
  if (record.day !== dayKey()) {
    record.day = dayKey();
    record.daily = 0;
  }
  if (record.week !== weekKey()) {
    record.week = weekKey();
    record.weekly = 0;
  }
  if (record.month !== monthKey()) {
    record.month = monthKey();
    record.monthly = 0;
  }
  return record;
}

function ranked(guildId, field, limit = 10) {
  return Object.values(load().members)
    .filter((m) => m.guild === guildId && (m[field] ?? 0) > 0)
    .sort((a, b) => b[field] - a[field])
    .slice(0, limit);
}

function rankOf(guildId, userId, field) {
  const all = Object.values(load().members)
    .filter((m) => m.guild === guildId)
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
  const index = all.findIndex((m) => m.user === userId);
  return index === -1 ? 0 : index + 1;
}

// --- events ---

function events(guildId) {
  const data = load();
  return Object.values(data.events).filter((e) => e.guild === guildId);
}

function getEvent(id) {
  return load().events[id] ?? null;
}

function putEvent(event) {
  load().events[event.id] = event;
  save();
  return event;
}

function state(guildId) {
  const data = load();
  data.state[guildId] ??= {};
  return data.state[guildId];
}

module.exports = {
  member,
  roll,
  ranked,
  rankOf,
  events,
  getEvent,
  putEvent,
  state,
  save,
  flush,
  dayKey,
  weekKey,
  monthKey,
};
