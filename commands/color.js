'use strict';

const { SlashCommandBuilder } = require('discord.js');
const colors = require('../lib/kenopsia/colors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('color')
    .setDescription(`Pick your name color. Unlocks at level ${colors.UNLOCK_LEVEL}.`)
    .setDMPermission(false),

  async execute(interaction) {
    // Ephemeral, so the picker never clutters a channel and stays reusable.
    await interaction.reply({ ...colors.buildPicker(), ephemeral: true });
  },
};
