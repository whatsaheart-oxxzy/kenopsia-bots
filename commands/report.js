'use strict';

const { SlashCommandBuilder } = require('discord.js');
const moderation = require('../lib/kenopsia/moderation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Tell the staff something. Nobody else sees this.')
    .setDMPermission(false)
    // Optional on purpose. Not everything worth reporting is a person: a broken
    // command, a missing role, or an appeal against your own warning all arrive
    // through here, and there is nobody to name in any of them.
    .addStringOption((o) =>
      o.setName('reason').setDescription('What happened').setRequired(true).setMaxLength(500),
    )
    .addUserOption((o) => o.setName('user').setDescription('Who it is about, if it is about someone'))
    .addStringOption((o) =>
      o.setName('link').setDescription('Link to the message, if you have one').setMaxLength(200),
    ),

  async execute(interaction) {
    const accused = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const link = interaction.options.getString('link');

    if (accused && accused.id === interaction.user.id) {
      return interaction.reply({
        content: 'Leave the user field empty if the report is about your own case.',
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
