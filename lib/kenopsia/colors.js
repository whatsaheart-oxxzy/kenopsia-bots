'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLOR_ROLES } = require('./blueprint');
const economy = require('./economy');
const store = require('./store');

const PREFIX = 'keno-color';
const CLEAR = `${PREFIX}:none`;
const UNLOCK_LEVEL = 20;

/** One button per colour, plus a reset. Five per row is the Discord limit. */
function buildPicker() {
  const buttons = COLOR_ROLES.map((c) =>
    new ButtonBuilder().setCustomId(`${PREFIX}:${c.name}`).setLabel(c.name).setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(CLEAR).setLabel('Remove color').setStyle(ButtonStyle.Danger),
    ),
  );

  return {
    content: [
      '# Pick your name color',
      '',
      `Unlocks at level ${UNLOCK_LEVEL}. Click a color to wear it, click the same one again to take it off.`,
      'You wear one at a time, and you can change it as often as you like.',
    ].join('\n'),
    components: rows,
  };
}

const isColorButton = (interaction) =>
  interaction.isButton() && interaction.customId.startsWith(`${PREFIX}:`);

async function handle(interaction) {
  const record = store.member(interaction.guildId, interaction.user.id);
  if (record.level < UNLOCK_LEVEL) {
    return interaction.reply({
      content: `Name colors unlock at level ${UNLOCK_LEVEL}. You are level ${record.level}. Keep talking.`,
      ephemeral: true,
    });
  }

  const wanted = interaction.customId.slice(PREFIX.length + 1);
  const member = interaction.member;
  const colorRoles = interaction.guild.roles.cache.filter((r) =>
    COLOR_ROLES.some((c) => c.name === r.name),
  );
  const worn = colorRoles.filter((r) => member.roles.cache.has(r.id));
  const target = wanted === 'none' ? null : colorRoles.find((r) => r.name === wanted);

  if (wanted !== 'none' && !target) {
    return interaction.reply({
      content: `The role **${wanted}** does not exist here. An admin needs to run \`/kenopsia setup\`.`,
      ephemeral: true,
    });
  }
  if (target && !economy.canManage(interaction.guild, target)) {
    return interaction.reply({
      content: 'I sit below that role and cannot hand it out. The bot role has to be above the color roles.',
      ephemeral: true,
    });
  }

  const alreadyWorn = target && worn.has(target.id);
  const stale = worn.filter((r) => r.id !== target?.id && economy.canManage(interaction.guild, r));
  if (stale.size) await member.roles.remove(stale, 'Color pick');

  if (wanted === 'none' || alreadyWorn) {
    if (alreadyWorn) await member.roles.remove(target, 'Color pick');
    return interaction.reply({ content: 'Color removed.', ephemeral: true });
  }

  await member.roles.add(target, 'Color pick');
  return interaction.reply({ content: `Your name is **${target.name}** now.`, ephemeral: true });
}

module.exports = { buildPicker, isColorButton, handle, UNLOCK_LEVEL };
