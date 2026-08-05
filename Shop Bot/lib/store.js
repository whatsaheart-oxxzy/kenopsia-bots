'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * KALLEN's own state: what people own, what they have asked for, and the
 * owner's price overrides.
 *
 * Coins are NOT in here. They live in data/kenopsia.json like everyone else's,
 * reached through lib/wallet.js. One wallet, one writer — see the note in
 * "Virtual Pet/lib/wallet.js" for why that matters.
 */
const FILE = path.join(__dirname, '..', 'data', 'shop.json');

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { members: {}, requests: {}, overrides: {}, state: {} };
  }
  cache.members ??= {};
  cache.requests ??= {};
  cache.overrides ??= {};
  cache.state ??= {};
  return cache;
}

/** Debounced, same as every other store in this repo. */
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

const key = (guildId, userId) => `${guildId}:${userId}`;

function member(guildId, userId) {
  const data = load();
  data.members[key(guildId, userId)] ??= {
    guild: guildId,
    user: userId,
    // Everything bought, oldest first. Expired entries are kept so /history
    // stays honest; `expires` is what decides whether an item still works.
    inventory: [],
    // The values behind the profile card. Buying the slot is what unlocks the
    // field; setting the text is a separate step the member does afterwards.
    cosmetics: { card: null, title: null, badge: null, accent: null, bio: null, showcase: null },
    emojiSlots: 0,
    stickerSlots: 0,
    spent: 0,
    lastRequestAt: 0,
    // Set once by the member, checked by the owner before any Robux is sent.
    robux: { declared18: false, gamepass: null, verifiedBy: null, verifiedAt: 0 },
  };
  const record = data.members[key(guildId, userId)];
  record.cosmetics ??= {};
  record.robux ??= { declared18: false, gamepass: null, verifiedBy: null, verifiedAt: 0 };
  return record;
}

const members = (guildId) => Object.values(load().members).filter((m) => m.guild === guildId);

// --- requests ---------------------------------------------------------------

function state(guildId) {
  const data = load();
  data.state[guildId] ??= { nextRequest: 1001 };
  data.state[guildId].nextRequest ??= 1001;
  return data.state[guildId];
}

/** Short, human readable ids — members have to type these into /request pay. */
function nextRequestId(guildId) {
  const s = state(guildId);
  const id = s.nextRequest;
  s.nextRequest += 1;
  save();
  return String(id);
}

const getRequest = (id) => load().requests[String(id)] ?? null;

function putRequest(request) {
  load().requests[String(request.id)] = request;
  save();
  return request;
}

const requests = (guildId, filter) =>
  Object.values(load().requests)
    .filter((r) => r.guild === guildId && (!filter || filter(r)))
    .sort((a, b) => a.createdAt - b.createdAt);

// --- owner overrides --------------------------------------------------------

/** Per-item price and availability the owner set with /kallen price|stock. */
function override(itemId) {
  const data = load();
  data.overrides[itemId] ??= {};
  return data.overrides[itemId];
}

const overrides = () => load().overrides;

module.exports = {
  member,
  members,
  state,
  nextRequestId,
  getRequest,
  putRequest,
  requests,
  override,
  overrides,
  save,
  flush,
};
