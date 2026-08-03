'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const store = require('../lib/store');

const VERIFIED_ROLE = 'Roblox Verified';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('Unlink a Roblox account')
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName('user').setDescription('Someone else. Staff only. Default: you'),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const self = target.id === interaction.user.id;

    if (!self && !interaction.memberPermissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({
        content: 'You can only unlink your own account.',
        ephemeral: true,
      });
    }

    const link = store.getLink(interaction.guildId, target.id);
    if (!link) {
      return interaction.reply({
        content: self ? 'You are not verified.' : `${target.username} is not verified.`,
        ephemeral: true,
      });
    }

    store.removeLink(interaction.guildId, target.id);

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const role = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE);
    if (member && role) await member.roles.remove(role, 'Unverified').catch(() => {});

    await interaction.reply({
      content: self
        ? `Unlinked **${link.robloxName}**. Marketplace access is gone until you verify again.`
        : `Unlinked **${link.robloxName}** from ${target.username}.`,
      ephemeral: true,
    });
  },
};
