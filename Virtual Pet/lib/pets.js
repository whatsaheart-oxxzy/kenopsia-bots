'use strict';

/**
 * Pet types, evolutions and the stat maths. Everything about how a pet grows
 * and decays lives here, so balance changes never touch command code.
 */

const TYPES = {
  dragon: {
    label: 'Dragon',
    base: { hunger: 90, happiness: 80, energy: 60 },
    ability: 'Training and battles give 20 percent more xp.',
    forms: ['Hatchling', 'Wyrmling', 'Drake', 'Elder Dragon', 'Ancient Dragon', 'Celestial Dragon'],
  },
  cat: {
    label: 'Cat',
    base: { hunger: 80, happiness: 80, energy: 80 },
    ability: 'Messages give 10 percent more happiness.',
    forms: ['Kitten', 'House Cat', 'Wild Cat', 'Sabertooth', 'Shadow Panther', 'Celestial Cat'],
  },
  dog: {
    label: 'Dog',
    base: { hunger: 70, happiness: 80, energy: 95 },
    ability: 'Voice time gives 10 percent more energy.',
    forms: ['Puppy', 'Hound', 'Wolf', 'Dire Wolf', 'Guardian Wolf', 'Celestial Hound'],
  },
  fox: {
    label: 'Fox',
    base: { hunger: 70, happiness: 95, energy: 80 },
    ability: 'Reactions on your messages pay double coins.',
    forms: ['Kit', 'Fox', 'Nine-Tail', 'Kitsune', 'Celestial Fox', 'Cosmic Fox'],
  },
  phoenix: {
    label: 'Phoenix',
    base: { hunger: 80, happiness: 80, energy: 80 },
    ability: 'Comes back to life once a week instead of running away.',
    forms: ['Ember', 'Flame', 'Inferno', 'Eternal Fire', 'Celestial Phoenix', 'Divine Phoenix'],
  },
  robot: {
    label: 'Robot',
    base: { hunger: 95, happiness: 75, energy: 95 },
    ability: 'Never loses energy from being idle.',
    forms: ['Drone', 'Android', 'Battle Bot', 'Mech', 'Cyber Lord', 'Cosmic Bot'],
  },
};

// Stage floor levels. Index matches the forms array of every type.
const STAGES = [1, 10, 25, 50, 75, 100];
const STAGE_NAMES = ['Baby', 'Adolescent', 'Adult', 'Epic', 'Legendary', 'Mythical'];

const MAX_LEVEL = 100;
const HOUR = 3_600_000;

// How long one point of each stat survives.
const DECAY_MS = { hunger: 2 * HOUR, happiness: 4 * HOUR, energy: HOUR };
const ENERGY_REGEN_MS = HOUR; // while the owner is active
const IDLE_MS = HOUR; // no activity for this long counts as idle

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

const xpForLevel = (level) => level * 50;

function stageOf(level) {
  let index = 0;
  for (const [i, floor] of STAGES.entries()) if (level >= floor) index = i;
  return index;
}

function formName(pet) {
  return TYPES[pet.type].forms[stageOf(pet.level)];
}

const stageName = (level) => STAGE_NAMES[stageOf(level)];

/**
 * Applies everything that happened since the pet was last touched: hunger and
 * happiness decay, energy decay or regen, the sad penalty and running away.
 * Lazy decay beats a scheduler that rewrites every row — a restart cannot skip
 * hours, because the clock is the source of truth.
 *
 * Returns a list of events for the caller to announce.
 */
function touch(pet, now = Date.now()) {
  const events = [];
  const elapsed = now - (pet.lastTouch ?? now);
  if (elapsed <= 0) {
    pet.lastTouch = now;
    return events;
  }

  const before = { hunger: pet.hunger, happiness: pet.happiness, energy: pet.energy };
  const type = TYPES[pet.type];

  pet.hunger = clamp(pet.hunger - Math.floor(elapsed / DECAY_MS.hunger));
  pet.happiness = clamp(pet.happiness - Math.floor(elapsed / DECAY_MS.happiness));

  const idle = now - (pet.lastActive ?? 0) > IDLE_MS;
  if (idle && pet.type !== 'robot') {
    pet.energy = clamp(pet.energy - Math.floor(elapsed / DECAY_MS.energy));
  } else {
    pet.energy = clamp(pet.energy + Math.floor(elapsed / ENERGY_REGEN_MS) * 10);
  }

  // An empty stomach costs mood, once per crossing rather than every tick.
  if (pet.hunger === 0 && before.hunger > 0) {
    pet.happiness = clamp(pet.happiness - 20);
    events.push({ type: 'starving' });
  }

  if (pet.energy === 0 && before.energy > 0) {
    pet.sleepUntil = now + 2 * HOUR;
    events.push({ type: 'asleep' });
  }

  if (pet.happiness === 0 && !pet.gone) {
    const protectedUntil = pet.protectUntil ?? 0;
    const canRevive = pet.type === 'phoenix' && now - (pet.lastRevive ?? 0) > 7 * 24 * HOUR;

    if (protectedUntil > now) {
      pet.happiness = 5;
      events.push({ type: 'protected' });
    } else if (canRevive) {
      pet.lastRevive = now;
      pet.happiness = 50;
      pet.hunger = Math.max(pet.hunger, 50);
      events.push({ type: 'revived' });
    } else {
      pet.gone = true;
      events.push({ type: 'ranaway' });
    }
  }

  // Warnings fire once per crossing, so nobody gets spammed hourly.
  for (const [stat, key] of [['hunger', 'warnHunger'], ['happiness', 'warnHappiness'], ['energy', 'warnEnergy']]) {
    if (pet[stat] < 20 && before[stat] >= 20) events.push({ type: 'low', stat });
    if (pet[stat] >= 20) pet[key] = false;
  }

  pet.lastTouch = now;
  return events;
}

/** Type bonuses that apply to xp, by where the xp came from. */
function xpMultiplier(pet, source) {
  if (pet.type === 'dragon' && (source === 'train' || source === 'battle')) return 1.2;
  return 1;
}

/** Adds xp and levels the pet up. Returns { levels, evolved, level }. */
function addXp(pet, amount, source = 'other') {
  if (pet.gone || amount <= 0) return { levels: 0, evolved: false, level: pet.level };

  const stageBefore = stageOf(pet.level);
  let levels = 0;
  pet.xp += Math.round(amount * xpMultiplier(pet, source));

  while (pet.level < MAX_LEVEL && pet.xp >= xpForLevel(pet.level)) {
    pet.xp -= xpForLevel(pet.level);
    pet.level += 1;
    levels += 1;
  }
  if (pet.level >= MAX_LEVEL) pet.xp = Math.min(pet.xp, xpForLevel(MAX_LEVEL));

  const evolved = stageOf(pet.level) > stageBefore;
  if (evolved) pet.xp += 50; // the evolution bonus from the design

  return { levels, evolved, level: pet.level };
}

function isAsleep(pet, now = Date.now()) {
  return (pet.sleepUntil ?? 0) > now;
}

/** A short text bar. Works in any Discord client, no emoji needed. */
function bar(value) {
  const filled = Math.round((value / 100) * 10);
  return `\`${'#'.repeat(filled)}${'-'.repeat(10 - filled)}\` ${value}`;
}

module.exports = {
  TYPES,
  STAGES,
  STAGE_NAMES,
  MAX_LEVEL,
  clamp,
  xpForLevel,
  stageOf,
  stageName,
  formName,
  touch,
  addXp,
  isAsleep,
  bar,
};
