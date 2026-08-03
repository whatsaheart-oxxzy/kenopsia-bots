'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/store');
const guard = require('../lib/guard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rename')
    .setDescription('Rename your pet')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('name').setDescription('The new name').setRequired(true).setMaxLength(24),
    ),

  async execute(interaction) {
    const pet = await guard.requirePet(interaction);
    if (!pet) return;

    const name = interaction.options.getString('name').trim();
    if (!name) return interaction.reply({ content: 'That is not a name.', ephemeral: true });

    const old = pet.name;
    pet.name = name;
    store.save();

    await interaction.reply(`**${old}** goes by **${name}** now.`);
  },
};
