'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/kenopsia/store');
const leaderboard = require('../lib/kenopsia/leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top members this week')
    .setDMPermission(false)
    .addBooleanOption((o) =>
      o.setName('alltime').setDescription('Show total coins instead of this week'),
    ),

  async execute(interaction) {
    const allTime = interaction.options.getBoolean('alltime') ?? false;

    if (!allTime) {
      const top = store.ranked(interaction.guildId, 'weeklyCoins', 10);
      return interaction.reply({
        content: leaderboard.render(interaction.guild, top),
        allowedMentions: { users: [] },
      });
    }

    const top = store.ranked(interaction.guildId, 'coins', 10);
    if (!top.length) {
      return interaction.reply({ content: 'Nobody has earned a coin yet.', ephemeral: true });
    }

    const lines = top.map((entry, i) => {
      const member = interaction.guild.members.cache.get(entry.id);
      return `\`${String(i + 1).padStart(2)}\` **${member?.displayName ?? 'Unknown member'}** — ${entry.value} coins · level ${entry.level}`;
    });

    await interaction.reply({
      content: ['# All time', '', ...lines].join('\n'),
      allowedMentions: { users: [] },
    });
  },
};
