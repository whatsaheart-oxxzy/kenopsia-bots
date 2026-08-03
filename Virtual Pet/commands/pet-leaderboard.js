'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pet-leaderboard')
    .setDescription('The strongest pets on the server')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('by')
        .setDescription('Rank by what. Default: level.')
        .addChoices({ name: 'Level', value: 'level' }, { name: 'Battle wins', value: 'wins' }),
    ),

  async execute(interaction) {
    const by = interaction.options.getString('by') ?? 'level';
    const all = store.allPets(interaction.guildId);

    if (!all.length) {
      return interaction.reply({ content: 'No pets yet.', ephemeral: true });
    }

    const lines = all
      .sort((a, b) => (b[by] ?? 0) - (a[by] ?? 0))
      .slice(0, 10)
      .map((pet, i) => {
        const owner = interaction.guild.members.cache.get(pet.owner);
        const value = by === 'level' ? `level ${pet.level}` : `${pet.wins ?? 0} wins`;
        return `\`${String(i + 1).padStart(2)}\` **${pet.name}** — ${value} · ${pets.formName(pet)} · ${owner?.displayName ?? 'someone'}`;
      });

    await interaction.reply({
      content: [`# Top pets by ${by === 'level' ? 'level' : 'battle wins'}`, '', ...lines].join('\n'),
      allowedMentions: { users: [] },
    });
  },
};
