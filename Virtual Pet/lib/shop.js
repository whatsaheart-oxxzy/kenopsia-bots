'use strict';

const pets = require('./pets');

/**
 * Shop items. `apply` runs on the pet and returns the line the member sees.
 * Prices are in Kenopsia coins — the same wallet the rest of the server uses.
 */
const ITEMS = {
  'food-pack': {
    label: 'Food Pack',
    price: 10,
    text: 'Restores 30 hunger.',
    apply: (pet) => {
      pet.hunger = pets.clamp(pet.hunger + 30);
      return 'ate a full meal.';
    },
  },
  'toy-ball': {
    label: 'Toy Ball',
    price: 15,
    text: 'Restores 20 happiness.',
    apply: (pet) => {
      pet.happiness = pets.clamp(pet.happiness + 20);
      return 'played with the ball and cheered up.';
    },
  },
  'energy-drink': {
    label: 'Energy Drink',
    price: 10,
    text: 'Restores 30 energy.',
    apply: (pet) => {
      pet.energy = pets.clamp(pet.energy + 30);
      pet.sleepUntil = 0;
      return 'is wide awake again.';
    },
  },
  'super-food': {
    label: 'Super Food',
    price: 25,
    text: 'Restores 50 hunger and 10 happiness.',
    apply: (pet) => {
      pet.hunger = pets.clamp(pet.hunger + 50);
      pet.happiness = pets.clamp(pet.happiness + 10);
      return 'devoured the good stuff.';
    },
  },
  'shiny-stone': {
    label: 'Shiny Stone',
    price: 50,
    text: 'Instantly gain 5 levels.',
    apply: (pet) => {
      let xp = 0;
      for (let l = pet.level; l < pet.level + 5; l += 1) xp += pets.xpForLevel(l);
      pets.addXp(pet, xp);
      return 'glowed and grew up fast.';
    },
  },
  'rare-candy': {
    label: 'Rare Candy',
    price: 75,
    text: 'Gives 25 xp right away.',
    apply: (pet) => {
      pets.addXp(pet, 25);
      return 'enjoyed the candy.';
    },
  },
  'protection-charm': {
    label: 'Protection Charm',
    price: 100,
    text: 'For 7 days your pet cannot run away.',
    apply: (pet) => {
      pet.protectUntil = Date.now() + 7 * 24 * 3_600_000;
      return 'is protected for the next 7 days.';
    },
  },
  'legendary-skin': {
    label: 'Legendary Skin',
    price: 200,
    text: 'A title in front of your pet name. Looks only.',
    apply: (pet) => {
      pet.skin = 'Legendary';
      return 'wears a legendary look now.';
    },
  },
};

const list = () =>
  Object.entries(ITEMS).map(([id, item]) => `\`${id}\` **${item.label}** — ${item.price} coins. ${item.text}`);

module.exports = { ITEMS, list };
