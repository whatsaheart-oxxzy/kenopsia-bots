'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { confirm } = require('../lib/confirm');
const { buildServer, refreshServer, cleanupLegacy } = require('../lib/kenopsia/build');
const economy = require('../lib/kenopsia/economy');
const store = require('../lib/kenopsia/store');
const quests = require('../lib/kenopsia/quests');
const leaderboard = require('../lib/kenopsia/leaderboard');
const { CATEGORIES, ROLES } = require('../lib/kenopsia/blueprint');

const CHANNEL_COUNT = CATEGORIES.reduce((n, c) => n + c.channels.length, 0);

const line = (label, items) =>
  items.length ? `**${label} (${items.length}):** ${items.join(', ')}` : `**${label}:** none`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kenopsia')
    .setDescription('Build and run the Kenopsia server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName('setup').setDescription('Create every role, category, channel and AutoMod rule'),
    )
    .addSubcommand((sub) =>
      sub.setName('refresh').setDescription('Rewrite all opening posts with the current text'),
    )
    .addSubcommand((sub) =>
      sub.setName('cleanup').setDescription('Delete the old Project ECHO channels and roles'),
    )
    .addSubcommand((sub) =>
      sub.setName('sync').setDescription('Match level roles to the stored levels for everyone'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('grant')
        .setDescription('Give or take coins by hand')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('How many coins. Negative takes them away.')
            .setRequired(true)
            .setMinValue(-10_000)
            .setMaxValue(10_000),
        )
        .addStringOption((o) => o.setName('reason').setDescription('What for').setMaxLength(200)),
    )
    .addSubcommand((sub) =>
      sub.setName('post-quests').setDescription('Post today quests now instead of waiting for 00:00 UTC'),
    ),

  async execute(interaction) {
    const run = { setup, refresh, cleanup, sync, grant, 'post-quests': postQuests }[
      interaction.options.getSubcommand()
    ];
    return run(interaction);
  },
};

async function setup(interaction) {
  const approved = await confirm(interaction, {
    content: [
      '**Build Kenopsia?**',
      '',
      `${ROLES.length} roles, ${CATEGORIES.length} categories, ${CHANNEL_COUNT} channels, 4 AutoMod rules.`,
      'It also renames the server to Kenopsia.',
      'Every new channel gets its opening post right away.',
      'Anything that already exists with the same name is left alone.',
    ].join('\n'),
    confirmLabel: 'Build it',
    timeout: 60_000,
  });
  if (!approved) return;

  const log = await buildServer(interaction.guild, `/kenopsia setup by ${interaction.user.tag}`);

  await interaction.editReply({
    content: [
      '**Kenopsia is up.**',
      '',
      log.renamed ? '**Server renamed to Kenopsia.**' : '',
      line('Roles', log.rolesCreated),
      line('Categories', log.categoriesCreated),
      line('Channels', log.channelsCreated),
      line('Taken over', log.adopted),
      line('Opening posts', log.seeded),
      line('AutoMod', log.automodCreated),
      log.warnings.length ? `\n**Notes:**\n- ${log.warnings.join('\n- ')}` : '',
      '',
      'Next: drag the bot role above every Kenopsia role, then run `/kenopsia sync`.',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1900),
    components: [],
  });
}

async function refresh(interaction) {
  const approved = await confirm(interaction, {
    content: [
      '**Rewrite the server text?**',
      '',
      'This deletes my own earlier posts in those channels and writes the current version.',
      'Messages from members are never touched.',
    ].join('\n'),
    confirmLabel: 'Rewrite',
    timeout: 60_000,
  });
  if (!approved) return;

  const log = await refreshServer(interaction.guild);
  await interaction.editReply({
    content: [
      '**Done.**',
      '',
      line('Rewritten', log.seeded),
      log.warnings.length ? `\n**Notes:**\n- ${log.warnings.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1900),
    components: [],
  });
}

async function cleanup(interaction) {
  const approved = await confirm(interaction, {
    content: [
      '**Delete the old Project ECHO structure?**',
      '',
      'This permanently deletes the ECHO categories, their channels and their roles, including every message in them.',
      'Kenopsia channels and roles are never touched. This cannot be undone.',
    ].join('\n'),
    confirmLabel: 'Delete it',
    timeout: 60_000,
  });
  if (!approved) return;

  const log = await cleanupLegacy(interaction.guild, `/kenopsia cleanup by ${interaction.user.tag}`);
  await interaction.editReply({
    content: [
      '**Cleanup done.**',
      '',
      line('Removed', log.removed),
      log.warnings.length ? `\n**Could not remove:**\n- ${log.warnings.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1900),
    components: [],
  });
}

async function sync(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const records = store.guild(interaction.guildId).members;
  const members = await interaction.guild.members.fetch();
  let synced = 0;

  for (const [userId, record] of Object.entries(records)) {
    const member = members.get(userId);
    if (!member) continue;
    await economy.syncLevelRole(member, record.level, `/kenopsia sync by ${interaction.user.tag}`);
    synced += 1;
  }

  await interaction.editReply(`Level roles matched for ${synced} members.`);
}

async function grant(interaction) {
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') ?? 'Given by staff';

  if (user.bot) {
    return interaction.reply({ content: 'Bots do not collect coins.', ephemeral: true });
  }

  const record = economy.addCoins(interaction.guildId, user.id, amount);
  await interaction.reply(
    `${amount >= 0 ? '+' : ''}${amount} coins for ${user} — ${reason}. Balance: ${record.coins}.`,
  );
}

async function postQuests(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const daily = await quests.postDaily(interaction.guild);
  const weekly = await quests.postWeekly(interaction.guild);
  await leaderboard.update(interaction.guild);
  await interaction.editReply(
    `Daily quests: ${daily ? 'posted' : 'channel missing'}. Weekly quests: ${weekly ? 'posted' : 'channel missing'}. Leaderboard updated.`,
  );
}
