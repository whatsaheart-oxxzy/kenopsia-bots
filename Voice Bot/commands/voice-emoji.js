'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice-emoji')
    .setDescription('Use an emoji slot you bought')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('name').setDescription('Name for the emoji, letters and underscores').setRequired(true).setMaxLength(32),
    )
    .addAttachmentOption((o) =>
      o.setName('image').setDescription('PNG or GIF, under 256 KB').setRequired(true),
    ),

  async execute(interaction) {
    const record = store.member(interaction.guildId, interaction.user.id);
    if (!(record.emojiSlots > 0)) {
      return interaction.reply({
        content: 'You have no emoji slot. Buy one with `/voice-shop buy:emoji-slot`.',
        ephemeral: true,
      });
    }

    const name = interaction.options.getString('name').replace(/[^\w]/g, '_');
    const image = interaction.options.getAttachment('image');

    if (!/^image\/(png|gif|jpeg|webp)$/.test(image.contentType ?? '')) {
      return interaction.reply({ content: 'That is not an image Discord accepts.', ephemeral: true });
    }
    if (image.size > 256_000) {
      return interaction.reply({ content: `Discord caps emojis at 256 KB. That one is ${Math.round(image.size / 1024)} KB.`, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const emoji = await interaction.guild.emojis.create({
        attachment: image.url,
        name,
        reason: `Emoji slot used by ${interaction.user.tag}`,
      });
      record.emojiSlots -= 1;
      store.save();
      await interaction.editReply(`Added ${emoji}. Slots left: ${record.emojiSlots}.`);
    } catch (err) {
      // The slot is not consumed when Discord refuses, so nobody loses it.
      await interaction.editReply(`Discord refused it: ${err.message}. Your slot is untouched.`);
    }
  },
};
