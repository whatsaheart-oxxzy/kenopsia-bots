'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', '..', 'data', 'echo.json');

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

/** Writes are debounced — message points fire far too often for sync writes. */
function save() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
    fs.renameSync(tmp, FILE);
  }, 2_000);
  writeTimer.unref?.();
}

/** Flush pending writes immediately — call before the process exits. */
function flush() {
  if (!writeTimer) return;
  clearTimeout(writeTimer);
  writeTimer = null;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

function guild(guildId) {
  const data = load();
  data.guilds[guildId] ??= { members: {}, state: {} };
  return data.guilds[guildId];
}

function member(guildId, userId) {
  const g = guild(guildId);
  g.members[userId] ??= {
    points: 0,
    level: 'Initiate',
    messagesToday: 0,
    helpfulGivenToday: 0,
    day: '',
    lastDaily: '',
    streak: 0,
  };
  return g.members[userId];
}

/** Local calendar day key, e.g. "2026-08-02". Daily caps reset on this. */
function today() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Zeroes the per-day counters when the record is from an earlier day. */
function rollDay(record) {
  const day = today();
  if (record.day !== day) {
    record.day = day;
    record.messagesToday = 0;
    record.helpfulGivenToday = 0;
  }
  return record;
}

function leaderboard(guildId, limit = 10) {
  return Object.entries(guild(guildId).members)
    .map(([id, m]) => ({ id, points: m.points, level: m.level }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

module.exports = { guild, member, leaderboard, save, flush, today, rollDay };
