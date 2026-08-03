'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const argue = require('../lib/kenopsia/argue');

const STAFF = new Set(['Moderator', 'Administrator']);
const isStaff = (member) => member?.roles.cache.some((r) => STAFF.has(r.name)) ?? false;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('argue')
    .setDescription('Open a temporary room to settle something away from the public channels.')
    .setDMPermission(false)
    // Hides the command from members in the Discord client. The role check in
    // execute is the one that actually holds — this only tidies the menu.
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('open')
        .setDescription('Open a room for the people involved.')
        .addUserOption((o) => o.setName('member').setDescription('Who it is about').setRequired(true))
        .addUserOption((o) => o.setName('member2').setDescription('Anyone else involved'))
        .addUserOption((o) => o.setName('member3').setDescription('Anyone else involved'))
        .addStringOption((o) => o.setName('reason').setDescription('What it is about').setMaxLength(200)),
    )
    .addSubcommand((s) => s.setName('close').setDescription('Close this room now, without waiting.')),

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: 'Only staff can open these.', ephemeral: true });
    }

    if (interaction.options.getSubcommand() === 'close') {
      return closeHere(interaction);
    }

    const picked = ['member', 'member2', 'member3']
      .map((name) => interaction.options.getUser(name))
      .filter(Boolean);

    // Same person twice in two slots is an easy slip and would produce a
    // duplicate permission overwrite.
    const unique = [...new Map(picked.map((u) => [u.id, u])).values()];
    if (unique.some((u) => u.bot)) {
      return interaction.reply({ content: 'Bots cannot take part in a room.', ephemeral: true });
    }

    const members = [];
    for (const user of unique) {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) members.push(member);
    }
    if (!members.length) {
      return interaction.reply({ content: 'Nobody I could add is still in the server.', ephemeral: true });
    }

    const reason = interaction.options.getString('reason');
    await interaction.deferReply({ ephemeral: true });

    const channel = await argue.open(interaction.guild, members, reason);
    if (!channel) {
      return interaction.editReply('I could not create the room. Check that I may manage channels.');
    }

    await channel
      .send(
        [
          `${members.map((m) => `<@${m.id}>`).join(' ')} — this room is for you and the staff. Nobody else can see it.`,
          reason ? `About: ${reason}` : null,
          '',
          'It closes itself 5 minutes from now if nothing is written, and 30 minutes after the last message once it is in use. Say what you need to say while it is open.',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .catch(() => {});

    return interaction.editReply(`Opened ${channel}.`);
  },
};

async function closeHere(interaction) {
  if (!argue.isRoom(interaction.guildId, interaction.channelId)) {
    return interaction.reply({ content: 'This is not a dispute room.', ephemeral: true });
  }
  // Answered before the channel disappears, otherwise the reply has nowhere to go.
  await interaction.reply({ content: 'Closing.', ephemeral: true });
  await argue.close(interaction.guild, interaction.channelId, `Closed by ${interaction.user.tag}`);
}
