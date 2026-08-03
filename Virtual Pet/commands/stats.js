'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');
const petCommand = require('./pet');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show the pet of another member')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Whose pet').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const pet = store.getPet(interaction.guildId, target.id);

    if (!pet) {
      return interaction.reply({ content: `${target.username} has no pet.`, ephemeral: true });
    }

    // Read-only view: apply decay so the numbers are honest, then show them.
    pets.touch(pet);
    store.save();

    await interaction.reply({
      content: [`Pet of ${target.username}`, '', petCommand.card(pet)].join('\n'),
      allowedMentions: { users: [] },
    });
  },
};
