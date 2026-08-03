'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TYPES } = require('./pets');

// Pets live in their own file. Coins stay in the Kenopsia store — one owner
// per file is the rule that keeps both of them intact.
const FILE = path.join(__dirname, '..', 'data', 'pets.json');

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { pets: {}, inventory: {}, battles: [] };
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

const key = (guildId, userId) => `${guildId}:${userId}`;

function getPet(guildId, userId) {
  const pet = load().pets[key(guildId, userId)];
  return pet && !pet.gone ? pet : null;
}

/** Includes pets that ran away, so /adopt can explain what happened. */
function getRaw(guildId, userId) {
  return load().pets[key(guildId, userId)] ?? null;
}

function createPet(guildId, userId, type, name) {
  const base = TYPES[type].base;
  const pet = {
    owner: userId,
    guild: guildId,
    type,
    name,
    level: 1,
    xp: 0,
    hunger: base.hunger,
    happiness: base.happiness,
    energy: base.energy,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    lastTouch: Date.now(),
    lastActive: Date.now(),
    daily: { day: '', happiness: 0, xp: 0, messages: 0, reactions: 0 },
  };
  load().pets[key(guildId, userId)] = pet;
  save();
  return pet;
}

function removePet(guildId, userId) {
  delete load().pets[key(guildId, userId)];
  save();
}

function allPets(guildId) {
  return Object.values(load().pets).filter((p) => p.guild === guildId && !p.gone);
}

// --- inventory ---

function inventoryOf(guildId, userId) {
  return load().inventory[key(guildId, userId)] ?? {};
}

function addItem(guildId, userId, item, amount = 1) {
  const data = load();
  const k = key(guildId, userId);
  data.inventory[k] ??= {};
  data.inventory[k][item] = (data.inventory[k][item] ?? 0) + amount;
  if (data.inventory[k][item] <= 0) delete data.inventory[k][item];
  save();
  return data.inventory[k][item] ?? 0;
}

const hasItem = (guildId, userId, item) => (inventoryOf(guildId, userId)[item] ?? 0) > 0;

// --- battles ---

function logBattle(entry) {
  const data = load();
  data.battles.push({ ...entry, at: Date.now() });
  if (data.battles.length > 500) data.battles = data.battles.slice(-500);
  save();
}

/** Resets the per-day caps on happiness and xp from chatting. */
function rollDay(pet) {
  const day = new Date().toISOString().slice(0, 10);
  if (pet.daily?.day !== day) {
    pet.daily = { day, happiness: 0, xp: 0, messages: 0, reactions: 0 };
  }
  return pet;
}

module.exports = {
  getPet,
  getRaw,
  createPet,
  removePet,
  allPets,
  inventoryOf,
  addItem,
  hasItem,
  logBattle,
  rollDay,
  save,
  flush,
};
