'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { confirm } = require('../lib/confirm');

/** Accepts "#00ffcc", "00ffcc" or "0x00ffcc". Returns null when unparseable. */
function parseColor(input) {
  if (!input) return null;
  const hex = input.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return Number.parseInt(hex, 16);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Create or delete roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a role')
        .addStringOption((o) =>
          o.setName('name').setDescription('Role name').setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. #00ffcc'))
        .addBooleanOption((o) =>
          o.setName('hoist').setDescription('Show separately in the member list'),
        )
        .addBooleanOption((o) =>
          o.setName('mentionable').setDescription('Allow anyone to @mention it'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a role (asks for confirmation)')
        .addRoleOption((o) => o.setName('role').setDescription('Role to delete').setRequired(true)),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'create') return create(interaction);
    return remove(interaction);
  },
};

async function create(interaction) {
  const rawColor = interaction.options.getString('color');
  const color = parseColor(rawColor);
  if (rawColor && color === null) {
    return interaction.reply({
      content: `\`${rawColor}\` is not a valid hex color. Try something like \`#00ffcc\`.`,
      ephemeral: true,
    });
  }

  const role = await interaction.guild.roles.create({
    name: interaction.options.getString('name'),
    color: color ?? undefined,
    hoist: interaction.options.getBoolean('hoist') ?? false,
    mentionable: interaction.options.getBoolean('mentionable') ?? false,
    reason: `Requested by ${interaction.user.tag}`,
  });

  await interaction.reply({ content: `Created ${role}.`, ephemeral: true });
}

async function remove(interaction) {
  const role = interaction.options.getRole('role');

  if (role.managed) {
    return interaction.reply({
      content: `**${role.name}** is managed by an integration and cannot be deleted manually.`,
      ephemeral: true,
    });
  }
  if (role.id === interaction.guild.id) {
    return interaction.reply({ content: 'The @everyone role cannot be deleted.', ephemeral: true });
  }

  const approved = await confirm(interaction, {
    content: `Delete role **${role.name}**? Everyone loses it immediately.`,
  });
  if (!approved) return;

  const name = role.name;
  await role.delete(`Requested by ${interaction.user.tag}`);
  await interaction.editReply({ content: `Deleted role **${name}**.`, components: [] });
}
