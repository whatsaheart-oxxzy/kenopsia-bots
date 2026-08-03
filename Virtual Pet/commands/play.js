'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const guard = require('../lib/guard');
const notify = require('../lib/notify');

const COOLDOWN_MS = 30 * 60_000;
const HAPPINESS = 10;
const ENERGY_COST = 5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription(`Play with your pet. Happiness up ${HAPPINESS}, energy down ${ENERGY_COST}. Free.`)
    .setDMPermission(false),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction, { needAwake: true });
    if (!pet) return;

    const left = guard.cooldown(pet, 'lastPlayed', COOLDOWN_MS);
    if (left) {
      return interaction.reply({
        content: `**${pet.name}** needs a break. Try again in ${left} minutes.`,
        ephemeral: true,
      });
    }
    if (pet.energy < ENERGY_COST) {
      return interaction.reply({
        content: `**${pet.name}** is too tired to play. Use \`/rest\` first.`,
        ephemeral: true,
      });
    }

    pet.lastPlayed = Date.now();
    pet.happiness = pets.clamp(pet.happiness + HAPPINESS);
    pet.energy = pets.clamp(pet.energy - ENERGY_COST);
    const result = pets.addXp(pet, 3);
    store.save();

    await notify.levelUp(interaction.guild, pet, result);

    await interaction.reply(
      [
        `You played with **${pet.name}**.`,
        `Happiness ${pets.bar(pet.happiness)}`,
        `Energy    ${pets.bar(pet.energy)}`,
      ].join('\n'),
    );
  },
};
