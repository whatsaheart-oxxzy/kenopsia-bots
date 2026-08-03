'use strict';

const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { confirm } = require('../lib/confirm');

const TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  forum: ChannelType.GuildForum,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Create or delete channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a channel')
        .addStringOption((o) =>
          o.setName('name').setDescription('Channel name').setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Channel type (default: text)')
            .addChoices(
              { name: 'text', value: 'text' },
              { name: 'voice', value: 'voice' },
              { name: 'category', value: 'category' },
              { name: 'forum', value: 'forum' },
            ),
        )
        .addChannelOption((o) =>
          o
            .setName('category')
            .setDescription('Put it inside this category')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addStringOption((o) =>
          o.setName('topic').setDescription('Channel topic').setMaxLength(1024),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a channel (asks for confirmation)')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel to delete').setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'create') return create(interaction);
    return remove(interaction);
  },
};

async function create(interaction) {
  const name = interaction.options.getString('name');
  const type = TYPES[interaction.options.getString('type') ?? 'text'];
  const parent = interaction.options.getChannel('category');
  const topic = interaction.options.getString('topic');

  const channel = await interaction.guild.channels.create({
    name,
    type,
    parent: parent?.id ?? null,
    // Only text-ish channels accept a topic.
    topic: type === ChannelType.GuildText || type === ChannelType.GuildForum ? topic : undefined,
    reason: `Requested by ${interaction.user.tag}`,
  });

  await interaction.reply({ content: `Created ${channel}.`, ephemeral: true });
}

async function remove(interaction) {
  const channel = interaction.options.getChannel('channel');

  const approved = await confirm(interaction, {
    content: `Delete **#${channel.name}**? This cannot be undone.`,
  });
  if (!approved) return;

  const name = channel.name;
  const deletingSelf = channel.id === interaction.channelId;
  await channel.delete(`Requested by ${interaction.user.tag}`);

  if (!deletingSelf) {
    await interaction.editReply({ content: `Deleted **#${name}**.`, components: [] });
  }
}
