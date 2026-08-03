'use strict';

const { SlashCommandBuilder } = require('discord.js');
const roblox = require('../lib/roblox');
const store = require('../lib/store');

// The Roblox name is trading information, so it stays in the trading channels.
const ALLOWED_CHANNELS = ['marketplace', 'looking-for-play'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Show the verified Roblox account of a member')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),

  async execute(interaction) {
    if (!ALLOWED_CHANNELS.includes(interaction.channel?.name)) {
      return interaction.reply({
        content: `This only works in ${ALLOWED_CHANNELS.map((c) => `#${c}`).join(' and ')}. Roblox names are not public anywhere else on this server.`,
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser('user');
    const link = store.getLink(interaction.guildId, user.id);

    if (!link) {
      return interaction.reply({
        content: `${user.username} has not verified a Roblox account. Do not trade with them until they do.`,
        ephemeral: true,
      });
    }

    await interaction.reply({
      content: [
        `**${user.username}** is verified as **${link.robloxName}**`,
        roblox.profileUrl(link.robloxId),
        `Linked ${new Date(link.at).toISOString().slice(0, 10)}.`,
      ].join('\n'),
      allowedMentions: { users: [] },
    });
  },
};
