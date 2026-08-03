'use strict';

const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const THEMES = {
  cyberpunk: {
    label: 'Neon District',
    category: 'NEON DISTRICT',
    channels: [
      { name: 'neon-alley', topic: 'General chatter under the neon.' },
      { name: 'data-leaks', topic: 'Drops, links and stolen packets.' },
      { name: 'netrunner-ops', topic: 'Coordination for runs in progress.' },
      { name: 'chrome-market', topic: 'Trade, buy, sell, haggle.' },
      { name: 'synth-lounge', type: 'voice' },
    ],
    roles: [
      { name: 'Netrunner', color: 0x00ffe1, hoist: true },
      { name: 'Fixer', color: 0xff2e88, hoist: true },
      { name: 'Ghost', color: 0x7d5fff },
    ],
  },
  library: {
    label: 'The Archive',
    category: 'THE ARCHIVE',
    channels: [
      { name: 'reading-room', topic: 'Quiet talk between the shelves.' },
      { name: 'restricted-section', topic: 'Things best not read aloud.' },
      { name: 'scriptorium', topic: 'Works in progress and drafts.' },
      { name: 'the-catalogue', topic: 'Index of everything worth finding.' },
      { name: 'candlelit-corner', type: 'voice' },
    ],
    roles: [
      { name: 'Archivist', color: 0xd4af37, hoist: true },
      { name: 'Apprentice', color: 0x8b6f47, hoist: true },
      { name: 'Wanderer', color: 0x5c7a8a },
    ],
  },
  gamer: {
    label: 'Gamer Paradise',
    category: 'GAMER PARADISE',
    channels: [
      { name: 'general-chat', topic: 'Everything and nothing.' },
      { name: 'lfg', topic: 'Looking for group — post your lobby.' },
      { name: 'clips-and-fails', topic: 'Your best plays and worst deaths.' },
      { name: 'patch-notes', topic: 'What broke this week.' },
      { name: 'squad-voice', type: 'voice' },
    ],
    roles: [
      { name: 'Grinder', color: 0xff6b35, hoist: true },
      { name: 'Casual', color: 0x4ecdc4, hoist: true },
      { name: 'Spectator', color: 0x95a5a6 },
    ],
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Build a themed category, channels and roles in one go')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('theme')
        .setDescription('Which theme to build')
        .setRequired(true)
        .addChoices(
          ...Object.entries(THEMES).map(([value, t]) => ({ name: t.label, value })),
        ),
    ),

  async execute(interaction) {
    const theme = THEMES[interaction.options.getString('theme')];
    const reason = `/setup by ${interaction.user.tag}`;

    // Creating ~9 resources takes longer than the 3s interaction window.
    await interaction.deferReply({ ephemeral: true });

    const category = await interaction.guild.channels.create({
      name: theme.category,
      type: ChannelType.GuildCategory,
      reason,
    });

    const created = [];
    for (const spec of theme.channels) {
      const isVoice = spec.type === 'voice';
      const channel = await interaction.guild.channels.create({
        name: spec.name,
        type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
        parent: category.id,
        topic: isVoice ? undefined : spec.topic,
        reason,
      });
      created.push(channel);
    }

    const roles = [];
    for (const spec of theme.roles) {
      roles.push(
        await interaction.guild.roles.create({
          name: spec.name,
          color: spec.color,
          hoist: spec.hoist ?? false,
          mentionable: false,
          reason,
        }),
      );
    }

    await interaction.editReply(
      [
        `**${theme.label}** is up.`,
        '',
        `Category: **${category.name}**`,
        `Channels: ${created.join(' ')}`,
        `Roles: ${roles.join(' ')}`,
      ].join('\n'),
    );
  },
};
