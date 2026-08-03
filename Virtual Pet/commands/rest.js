'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const guard = require('../lib/guard');
const wallet = require('../lib/wallet');

const COST = 5;
const RESTORE = 20;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rest')
    .setDescription(`Let your pet rest. Costs ${COST} coins, restores ${RESTORE} energy.`)
    .setDMPermission(false),

  async execute(interaction) {
    // Resting is what wakes a sleeping pet, so it must work while asleep.
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    if (pet.energy >= 100) {
      return interaction.reply({ content: `**${pet.name}** is fully rested.`, ephemeral: true });
    }
    if (!wallet.spend(interaction.guildId, interaction.user.id, COST)) {
      return interaction.reply({
        content: `You need ${COST} coins and have ${wallet.balance(interaction.guildId, interaction.user.id)}.`,
        ephemeral: true,
      });
    }

    pet.energy = pets.clamp(pet.energy + RESTORE);
    pet.lastRested = Date.now();
    if (pet.energy >= 20) pet.sleepUntil = 0;
    store.save();

    await interaction.reply(`**${pet.name}** rested. Energy ${pets.bar(pet.energy)}`);
  },
};
