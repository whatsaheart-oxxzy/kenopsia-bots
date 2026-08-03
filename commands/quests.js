'use strict';

const { SlashCommandBuilder } = require('discord.js');
const store = require('../lib/kenopsia/store');
const quests = require('../lib/kenopsia/quests');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('What you still have open today and this week')
    .setDMPermission(false),

  async execute(interaction) {
    // Pay out anything that finished while the bot was not looking.
    await quests.checkAndAward(interaction.guild, interaction.user.id);
    const record = store.roll(store.member(interaction.guildId, interaction.user.id));

    await interaction.reply({ content: quests.render(record), ephemeral: true });
  },
};
