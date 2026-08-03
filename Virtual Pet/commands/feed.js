'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const guard = require('../lib/guard');
const wallet = require('../lib/wallet');

const COST = 10;
const RESTORE = 30;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feed')
    .setDescription(`Feed your pet. Costs ${COST} coins, restores ${RESTORE} hunger.`)
    .setDMPermission(false),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    if (pet.hunger >= 100) {
      return interaction.reply({ content: `**${pet.name}** is completely full.`, ephemeral: true });
    }
    if (!wallet.spend(interaction.guildId, interaction.user.id, COST)) {
      return interaction.reply({
        content: `You need ${COST} coins and have ${wallet.balance(interaction.guildId, interaction.user.id)}. Talk in the server or finish a quest.`,
        ephemeral: true,
      });
    }

    pet.hunger = pets.clamp(pet.hunger + RESTORE);
    pet.lastFed = Date.now();
    store.save();

    await interaction.reply(
      `**${pet.name}** ate. Hunger ${pets.bar(pet.hunger)}\nThat cost ${COST} coins. You have ${wallet.balance(interaction.guildId, interaction.user.id)} left.`,
    );
  },
};
