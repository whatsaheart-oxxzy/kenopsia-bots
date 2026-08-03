'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * This bot keeps its own file. The Kenopsia bot never writes here, and this bot
 * never writes there — the Roblox Verified role is the only thing they share.
 * Two processes writing one JSON file is how data goes missing.
 */
const FILE = path.join(__dirname, '..', 'data', 'verified.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { links: {}, pending: {} };
  }
  return cache;
}

function save() {
  const data = load();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

const key = (guildId, userId) => `${guildId}:${userId}`;

function getLink(guildId, userId) {
  return load().links[key(guildId, userId)] ?? null;
}

/** Who else already claimed this Roblox account, if anyone. */
function findByRobloxId(guildId, robloxId) {
  const data = load();
  for (const [k, link] of Object.entries(data.links)) {
    if (k.startsWith(`${guildId}:`) && link.robloxId === robloxId) {
      return { userId: k.split(':')[1], ...link };
    }
  }
  return null;
}

function setLink(guildId, userId, link) {
  load().links[key(guildId, userId)] = { ...link, at: Date.now() };
  save();
}

function removeLink(guildId, userId) {
  const data = load();
  const existed = Boolean(data.links[key(guildId, userId)]);
  delete data.links[key(guildId, userId)];
  save();
  return existed;
}

function setPending(guildId, userId, pending) {
  load().pending[key(guildId, userId)] = pending;
  save();
}

function getPending(guildId, userId) {
  const pending = load().pending[key(guildId, userId)];
  if (!pending) return null;
  if (pending.expires < Date.now()) {
    clearPending(guildId, userId);
    return null;
  }
  return pending;
}

function clearPending(guildId, userId) {
  delete load().pending[key(guildId, userId)];
  save();
}

module.exports = { getLink, setLink, removeLink, findByRobloxId, setPending, getPending, clearPending };
