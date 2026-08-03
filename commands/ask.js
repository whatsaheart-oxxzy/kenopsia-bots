'use strict';

const { SlashCommandBuilder, ChannelType, ThreadAutoArchiveDuration } = require('discord.js');
const { CHANNELS } = require('../lib/kenopsia/blueprint');

// Discord's hard limit on a thread name. The full question goes in the first
// post inside the thread, so nothing is lost when the title is cut.
const TITLE_MAX = 100;
const COOLDOWN_MS = 2 * 60_000;

const lastAsk = new Map(); // `${guildId}:${userId}` -> timestamp

/** One line, no line breaks, short enough to be a thread name. */
function toTitle(question) {
  const flat = question.replace(/\s+/g, ' ').trim();
  return flat.length <= TITLE_MAX ? flat : `${flat.slice(0, TITLE_MAX - 1)}…`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask a question. It becomes its own thread in q-and-a.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('question')
        .setDescription('What do you want to know?')
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(400),
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question');

    const key = `${interaction.guildId}:${interaction.user.id}`;
    const waited = Date.now() - (lastAsk.get(key) ?? 0);
    if (waited < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - waited) / 1000);
      return interaction.reply({
        content: `Give it ${left} more seconds. One question at a time keeps the channel readable.`,
        ephemeral: true,
      });
    }

    const channel = interaction.guild.channels.cache.find(
      (c) => c.name === CHANNELS.qAndA && c.type === ChannelType.GuildText,
    );
    if (!channel) {
      return interaction.reply({
        content: `There is no #${CHANNELS.qAndA} channel. Tell an admin to run \`/kenopsia setup\`.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const thread = await channel.threads
      .create({
        name: toTitle(question),
        type: ChannelType.PublicThread,
        autoArchiveDuration: ThreadAutoArchiveDuration.ThreeDays,
        reason: `Question from ${interaction.user.tag}`,
      })
      .catch((err) => {
        console.error('Could not open a question thread:', err.message);
        return null;
      });

    if (!thread) {
      return interaction.editReply(
        'I could not open a thread. Check that I may create public threads in that channel.',
      );
    }

    // The mention pulls the asker into the thread, so they are notified when
    // somebody answers. The full text goes here because the title may be cut.
    await thread
      .send({
        content: `**<@${interaction.user.id}> asks:**\n>>> ${question}`,
        allowedMentions: { users: [interaction.user.id] },
      })
      .catch(() => {});

    lastAsk.set(key, Date.now());
    return interaction.editReply(`Asked in ${thread}. Answers land in there.`);
  },
};
