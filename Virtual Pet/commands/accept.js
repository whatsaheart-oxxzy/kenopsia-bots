'use strict';

const { SlashCommandBuilder } = require('discord.js');
const battle = require('../lib/battle');
const store = require('../lib/store');
const guard = require('../lib/guard');
const notify = require('../lib/notify');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('accept')
    .setDescription('Accept the battle you were challenged to')
    .setDMPermission(false),

  async execute(interaction) {
    const mine = await guard.requirePet(interaction, { needAwake: true });
    if (!mine) return;

    const challenge = battle.takeChallenge(interaction.guildId, interaction.user.id);
    if (!challenge) {
      return interaction.reply({
        content: 'Nobody is waiting to fight you. Challenges expire after five minutes.',
        ephemeral: true,
      });
    }

    const theirs = store.getPet(interaction.guildId, challenge.challenger);
    if (!theirs) {
      return interaction.reply({ content: 'Their pet is gone. No fight today.', ephemeral: true });
    }
    if (mine.energy < battle.ENERGY_COST) {
      return interaction.reply({
        content: `**${mine.name}** needs at least ${battle.ENERGY_COST} energy to fight.`,
        ephemeral: true,
      });
    }

    const result = battle.resolve(interaction.guildId, theirs, mine);
    const outcome = result.winner
      ? `**${result.winner.name}** wins. 20 xp, 15 happiness and 10 coins.`
      : 'A draw. Five xp each and a bruised ego.';

    const text = [
      `**${theirs.name}** (level ${theirs.level}) against **${mine.name}** (level ${mine.level})`,
      '',
      battle.renderRounds(result.rounds, theirs.name, mine.name),
      '',
      `${result.scoreA} to ${result.scoreB}. ${outcome}`,
    ].join('\n');

    await interaction.reply(text);
    await notify.battleLog(
      interaction.guild,
      `**${theirs.name}** (lvl ${theirs.level}) vs **${mine.name}** (lvl ${mine.level}) — ${
        result.winner ? `winner: ${result.winner.name}` : 'draw'
      } (${result.scoreA}-${result.scoreB})`,
    );

    // Both sides may have levelled or earned a role from this.
    for (const [pet, userId] of [
      [theirs, challenge.challenger],
      [mine, interaction.user.id],
    ]) {
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      if (member) await notify.syncRoles(member, pet);
      const growth = result.growth.get(pet);
      if (growth?.levels) await notify.levelUp(interaction.guild, pet, growth);
    }
  },
};
