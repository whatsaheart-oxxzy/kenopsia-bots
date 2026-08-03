'use strict';

const { SlashCommandBuilder } = require('discord.js');
const pets = require('../lib/pets');
const store = require('../lib/store');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('evolutions')
    .setDescription('What every pet type turns into')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('type')
        .setDescription('One type only. Default: yours, or all of them.')
        .addChoices(...Object.entries(pets.TYPES).map(([value, t]) => ({ name: t.label, value }))),
    ),

  async execute(interaction) {
    const mine = store.getPet(interaction.guildId, interaction.user.id);
    const chosen = interaction.options.getString('type') ?? mine?.type;

    const render = (key) => {
      const spec = pets.TYPES[key];
      const rows = spec.forms.map((form, i) => {
        const from = pets.STAGES[i];
        const to = pets.STAGES[i + 1] ? pets.STAGES[i + 1] - 1 : 100;
        const range = from === to ? `${from}` : `${from} to ${to}`;
        const here = mine?.type === key && pets.stageOf(mine.level) === i ? '  <- you are here' : '';
        return `\`${range.padStart(8)}\` ${form}${here}`;
      });
      return [`## ${spec.label}`, spec.ability, ...rows].join('\n');
    };

    const body = chosen ? render(chosen) : Object.keys(pets.TYPES).map(render).join('\n\n');

    await interaction.reply({
      content: ['# Evolutions', '', body, '', 'Every stage adds 50 bonus xp when you reach it.'].join('\n').slice(0, 1980),
      ephemeral: !chosen,
    });
  },
};
