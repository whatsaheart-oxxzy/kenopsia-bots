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
    )
    .addSubcommand((sub) =>
      sub
        .setName('purge')
        .setDescription('Delete recent messages in this channel')
        .addIntegerOption((o) =>
          o
            .setName('count')
            .setDescription('How many messages to look at, newest first')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(1000),
        )
        .addUserOption((o) => o.setName('user').setDescription('Only this person’s messages'))
        .addBooleanOption((o) =>
          o.setName('include_pinned').setDescription('Delete pinned messages too. Default: no'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('wipe')
        .setDescription('Delete the ENTIRE history of this channel, however old. Cannot be undone')
        .addStringOption((o) =>
          o
            .setName('confirm')
            .setDescription('Type the channel name exactly, to prove you mean it')
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const run = { warn, timeout, warnings, clear, purge, wipe }[interaction.options.getSubcommand()];
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

async function purge(interaction) {
  const count = interaction.options.getInteger('count');
  const user = interaction.options.getUser('user');
  const includePinned = interaction.options.getBoolean('include_pinned') ?? false;

  await interaction.deferReply({ ephemeral: true });

  const { deleted, tooOld, pinned } = await moderation.purge(interaction.channel, {
    limit: count,
    userId: user?.id ?? null,
    includePinned,
  });

  const notes = [
    `Deleted **${deleted}** message(s)${user ? ` from ${user.tag}` : ''}.`,
    tooOld
      ? `**${tooOld}** were older than 14 days. Discord does not allow those to be deleted in bulk — use \`/mod wipe\` to clear the whole channel instead.`
      : null,
    pinned ? `**${pinned}** pinned message(s) were left alone. Pass \`include_pinned:true\` to remove those too.` : null,
  ].filter(Boolean);

  await interaction.editReply(notes.join('\n'));

  if (deleted) {
    await moderation.log(
      interaction.guild,
      `**Purge** ${deleted} message(s) in #${interaction.channel.name} by ${interaction.user.tag}${user ? ` (only ${user.tag})` : ''}.`,
    );
  }
}

async function wipe(interaction) {
  const channel = interaction.channel;

  // Irreversible and structural, so it is Administrator only rather than the
  // ModerateMembers the rest of /mod runs on.
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: 'Only an Administrator can wipe a channel. `/mod purge` deletes recent messages and needs less.',
      ephemeral: true,
    });
  }

  if (interaction.options.getString('confirm') !== channel.name) {
    return interaction.reply({
      content: [
        `This deletes **every message** in #${channel.name}, however old, and it cannot be undone.`,
        '',
        `To go ahead, run it again with \`confirm:${channel.name}\`.`,
      ].join('\n'),
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });
  const outcome = await moderation.wipe(channel, interaction.user);

  if (!outcome.ok) return interaction.editReply(outcome.message);

  // The channel this command was run in no longer exists, so editReply usually
  // fails. The new channel is where the person is actually looking anyway.
  await interaction
    .editReply(`Done — ${outcome.channel} is the same channel with an empty history.`)
    .catch(() => {});

  await outcome.channel
    .send(
      `${interaction.user} cleared this channel's history. Same name, same permissions, nothing in it.`,
    )
    .catch(() => {});

  return undefined;
}
