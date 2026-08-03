'use strict';

const { SlashCommandBuilder } = require('discord.js');
const config = require('../lib/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('multipliers')
    .setDescription('What voice time is worth right now')
    .setDMPermission(false),

  async execute(interaction) {
    const { channels, extras } = config.activeMultipliers();
    const streaks = config.STREAKS.map((s) => `${s.minutes} min: +${s.coins} coins`);

    await interaction.reply({
      content: [
        '# Voice rates',
        '',
        `Base: 1 coin every ${config.SECONDS_PER_COIN / 60} minutes. Daily cap: ${config.DAILY_CAP} coins.`,
        '',
        '**Per channel**',
        ...channels,
        '',
        extras.length ? `**Active right now**\n${extras.join('\n')}` : '**Active right now**\nNothing extra. Peak hours are 18:00 to 22:00 UTC, weekends pay 1.1x.',
        '',
        '**Streak bonus in one unbroken session**',
        ...streaks,
        '',
        'Leaving voice ends the streak. Switching channels does not.',
      ].join('\n'),
      ephemeral: true,
    });
  },
};
