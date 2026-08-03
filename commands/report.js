'use strict';

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../lib/kenopsia/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report someone to the staff. Nobody else sees this.')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('What happened').setRequired(true).setMaxLength(500),
    )
    .addStringOption((o) =>
      o.setName('link').setDescription('Link to the message, if you have one').setMaxLength(200),
    ),

  async execute(interaction) {
    const accused = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const link = interaction.options.getString('link');

    if (accused.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot report yourself.', ephemeral: true });
    }
    if (accused.bot) {
      return interaction.reply({
        content: 'For bot problems use the support channel instead.',
        ephemeral: true,
      });
    }

    const sent = await moderation.report(interaction.guild, interaction.user, accused, reason, link);

    await interaction.reply({
      content: sent
        ? 'Sent to the staff. They see who reported it, nobody else does. Thanks.'
        : 'I could not reach the staff channel. Message a moderator directly.',
      ephemeral: true,
    });
  },
};
