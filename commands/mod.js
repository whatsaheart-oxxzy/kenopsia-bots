'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const moderation = require('../lib/kenopsia/moderation');
const store = require('../lib/kenopsia/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('warn')
        .setDescription('Warn a member. Three means a timeout, five means a ban.')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addStringOption((o) =>
          o.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('timeout')
        .setDescription('Time a member out')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName('minutes')
            .setDescription('How long, in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10_080),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Why').setMaxLength(400)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('warnings')
        .setDescription('Show a member warnings')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Clear all warnings of a member')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),
    ),

  async execute(interaction) {
    const run = { warn, timeout, warnings, clear }[interaction.options.getSubcommand()];
    return run(interaction);
  },
};

function guardTarget(interaction, user) {
  if (user.id === interaction.user.id) return 'Not on yourself.';
  if (user.bot) return 'Not on bots.';
  return null;
}

async function warn(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const blocked = guardTarget(interaction, user);
  if (blocked) return interaction.reply({ content: blocked, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const { count, action } = await moderation.warn(interaction.guild, user, interaction.user, reason);

  const tail =
    action === 'ban'
      ? ' They are banned now.'
      : action === 'timeout'
        ? ' They are timed out for 24 hours.'
        : '';
  await interaction.editReply(`Warned ${user.tag}. That is warning ${count}.${tail}`);
}

async function timeout(interaction) {
  const user = interaction.options.getUser('user');
  const minutes = interaction.options.getInteger('minutes');
  const reason = interaction.options.getString('reason') ?? 'No reason given';
  const blocked = guardTarget(interaction, user);
  if (blocked) return interaction.reply({ content: blocked, ephemeral: true });

  await interaction.deferReply({ ephemeral: true });
  const ok = await moderation.timeout(interaction.guild, user, minutes, interaction.user, reason);
  await interaction.editReply(
    ok
      ? `${user.tag} is timed out for ${minutes} minutes.`
      : `Could not time out ${user.tag}. They are probably above me in the role list.`,
  );
}

async function warnings(interaction) {
  const user = interaction.options.getUser('user');
  const record = store.member(interaction.guildId, user.id);

  if (!record.warnings.length) {
    return interaction.reply({ content: `${user.tag} has no warnings.`, ephemeral: true });
  }

  const lines = record.warnings.map(
    (w, i) => `\`${i + 1}\` ${new Date(w.at).toISOString().slice(0, 10)} — ${w.reason} (by <@${w.by}>)`,
  );
  await interaction.reply({
    content: [`**${user.tag}** has ${record.warnings.length} warnings`, '', ...lines].join('\n'),
    ephemeral: true,
  });
}

async function clear(interaction) {
  const user = interaction.options.getUser('user');
  const had = await moderation.clearWarnings(interaction.guild, user, interaction.user);
  await interaction.reply({ content: `Cleared ${had} warnings from ${user.tag}.`, ephemeral: true });
}
