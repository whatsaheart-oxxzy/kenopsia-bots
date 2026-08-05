'use strict';

const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const config = require('../lib/config');
const events = require('../lib/events');
const store = require('../lib/store');

const canHost = (member) =>
  member.permissions.has(PermissionFlagsBits.ManageEvents) ||
  member.permissions.has(PermissionFlagsBits.ManageGuild) ||
  member.roles.cache.some((r) => ['Event Host', 'Moderator', 'Administrator'].includes(r.name));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Voice events')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Announce a voice event')
        .addStringOption((o) => o.setName('name').setDescription('What is it').setRequired(true).setMaxLength(80))
        .addStringOption((o) => o.setName('when').setDescription('When, in your own words').setRequired(true).setMaxLength(80)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('Events that are still open'))
    .addSubcommand((s) =>
      s.setName('join').setDescription('Sign up').addStringOption((o) => o.setName('id').setDescription('Event id').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('leave').setDescription('Sign off').addStringOption((o) => o.setName('id').setDescription('Event id').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('start').setDescription('Start it, host only').addStringOption((o) => o.setName('id').setDescription('Event id').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('end').setDescription('End it and pay everyone, host only').addStringOption((o) => o.setName('id').setDescription('Event id').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return create(interaction);
    if (sub === 'list') return list(interaction);

    const event = store.getEvent(interaction.options.getString('id'));
    if (!event || event.guild !== interaction.guildId) {
      return interaction.reply({ content: 'No event with that id.', ephemeral: true });
    }

    if (sub === 'join') {
      if (event.status === 'done') return interaction.reply({ content: 'That event is over.', ephemeral: true });
      const added = events.join(event, interaction.user.id);
      return interaction.reply(
        added
          ? `${interaction.user} is coming to **${event.name}**. ${config.EVENT.join} coins for signing up — the rest is for actually showing up in the Events channel.`
          : 'You are already on the list.',
      );
    }

    if (sub === 'leave') {
      events.leave(event, interaction.user.id);
      return interaction.reply({ content: `Taken off the list for **${event.name}**.`, ephemeral: true });
    }

    if (event.host !== interaction.user.id && !canHost(interaction.member)) {
      return interaction.reply({ content: 'Only the host can do that.', ephemeral: true });
    }

    if (sub === 'start') {
      events.start(event);
      return interaction.reply(
        `**${event.name}** starts now. Everyone into the Events voice channel — 30 minutes there is worth ${config.EVENT.minutes30} coins, an hour ${config.EVENT.minutes60}.`,
      );
    }

    const { results, hostBonus } = events.end(event);
    const paid = results.filter((r) => r.bonus > 0);
    return interaction.reply(
      [
        `**${event.name}** is over. ${event.attendees.length} signed up, ${paid.length} stayed long enough to earn the bonus.`,
        ...paid.map((r) => `<@${r.userId}> — ${r.minutes} minutes, ${r.bonus} coins`),
        `Host bonus: ${hostBonus} coins.`,
      ].join('\n'),
    );
  },
};

async function create(interaction) {
  if (!canHost(interaction.member)) {
    return interaction.reply({
      // The shop stopped selling roles. Anyone who already bought Event Host
      // kept it; everyone else buys a one-off event slot from KALLEN instead.
      content:
        'You need the **Event Host** role to create events here, and that role is no longer sold. You can buy a single official event instead: `/buy item:event-slot`, then `/inventory event`.',
      ephemeral: true,
    });
  }

  const event = events.create(
    interaction.guildId,
    interaction.user.id,
    interaction.options.getString('name'),
    interaction.options.getString('when'),
  );

  await interaction.reply(
    [
      `**${event.name}**`,
      `When: ${event.when}`,
      `Host: ${interaction.user}`,
      '',
      `Sign up with \`/event join id:${event.id}\`.`,
    ].join('\n'),
  );
}

async function list(interaction) {
  const open = events.open(interaction.guildId);
  if (!open.length) {
    return interaction.reply({ content: 'No events planned. `/event create` starts one.', ephemeral: true });
  }

  await interaction.reply({
    content: [
      '# Voice events',
      '',
      ...open.map(
        (e) => `\`${e.id}\` **${e.name}** — ${e.when} · host <@${e.host}> · ${e.attendees.length} signed up${e.status === 'live' ? ' · running now' : ''}`,
      ),
    ].join('\n'),
    allowedMentions: { users: [] },
  });
}
