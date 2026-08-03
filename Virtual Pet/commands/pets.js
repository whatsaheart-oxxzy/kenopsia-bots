'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pets')
    .setDescription('Every pet on the server')
    .setDMPermission(false),

  async execute(interaction) {
    const all = store.allPets(interaction.guildId);
    if (!all.length) {
      return interaction.reply({
        content: 'Nobody has adopted a pet yet. `/adopt` makes you the first.',
        ephemeral: true,
      });
    }

    const lines = all
      .sort((a, b) => b.level - a.level)
      .slice(0, 25)
      .map((pet) => {
        const owner = interaction.guild.members.cache.get(pet.owner);
        return `**${pet.name}** — ${pets.formName(pet)}, level ${pet.level} · ${owner?.displayName ?? 'someone'}`;
      });

    await interaction.reply({
      content: [`# ${all.length} pets on this server`, '', ...lines].join('\n'),
      allowedMentions: { users: [] },
    });
  },
};
