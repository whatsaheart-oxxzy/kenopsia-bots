'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLOR_ROLES } = require('./blueprint');

const PREFIX = 'echo-color';
const CLEAR = `${PREFIX}:none`;

/** The message posted in #identity: one button per colour, plus a reset. */
function buildPicker() {
  const buttons = COLOR_ROLES.map((c) =>
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:${c.name}`)
      .setLabel(c.name)
      .setStyle(ButtonStyle.Secondary),
  );

  // Discord allows 5 buttons per row.
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CLEAR)
        .setLabel('Remove color')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  return {
    content: [
      '# Your color',
      '',
      'One click, and your name wears it everywhere on this server. Click the same color again to remove it.',
      '',
      'You always wear only one. You can change it any time, and it costs nothing.',
    ].join('\n'),
    components: rows,
  };
}

function isColorButton(interaction) {
  return interaction.isButton() && interaction.customId.startsWith(`${PREFIX}:`);
}

/** Applies the clicked colour, or removes it when it was already worn. */
async function handle(interaction) {
  const wanted = interaction.customId.slice(PREFIX.length + 1);
  const member = interaction.member;
  const me = interaction.guild.members.me;

  const colorRoles = interaction.guild.roles.cache.filter((r) =>
    COLOR_ROLES.some((c) => c.name === r.name),
  );
  const worn = colorRoles.filter((r) => member.roles.cache.has(r.id));
  const target = wanted === 'none' ? null : colorRoles.find((r) => r.name === wanted);

  if (wanted !== 'none' && !target) {
    return interaction.reply({
      content: `The role **${wanted}** does not exist on this server. An admin needs to run \`/echo setup\`.`,
      ephemeral: true,
    });
  }
  if (target && target.position >= me.roles.highest.position) {
    return interaction.reply({
      content: 'I sit below this role and cannot give it out. The bot role must be above the color roles.',
      ephemeral: true,
    });
  }

  const alreadyWorn = target && worn.has(target.id);
  const stale = worn.filter((r) => r.id !== target?.id && r.position < me.roles.highest.position);

  if (stale.size) await member.roles.remove(stale, 'ECHO color pick');

  if (wanted === 'none' || alreadyWorn) {
    if (alreadyWorn) await member.roles.remove(target, 'ECHO color pick');
    return interaction.reply({ content: 'Color removed.', ephemeral: true });
  }

  await member.roles.add(target, 'ECHO color pick');
  return interaction.reply({ content: `Your name now wears **${target.name}**.`, ephemeral: true });
}

module.exports = { buildPicker, isColorButton, handle };
