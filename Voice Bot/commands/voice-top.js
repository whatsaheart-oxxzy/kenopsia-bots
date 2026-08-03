'use strict';

const { SlashCommandBuilder } = require('discord.js');
const leaderboard = require('../lib/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice-top')
    .setDescription('Voice leaderboards')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('period')
        .setDescription('Which one. Default: this week.')
        .addChoices(
          { name: 'Today', value: 'daily' },
          { name: 'This week', value: 'weekly' },
          { name: 'This month', value: 'monthly' },
          { name: 'All time', value: 'alltime' },
        ),
    ),

  async execute(interaction) {
    const period = interaction.options.getString('period') ?? 'weekly';
    await interaction.reply({
      content: leaderboard.render(interaction.guild, period),
      allowedMentions: { users: [] },
    });
  },
};
