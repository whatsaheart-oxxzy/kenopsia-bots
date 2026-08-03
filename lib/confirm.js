'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

/**
 * Ask the invoking user to confirm a destructive action.
 * Resolves to true only when they press the danger button in time.
 */
async function confirm(interaction, { content, confirmLabel = 'Delete', timeout = 30_000 }) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('confirm').setLabel(confirmLabel).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const message = await interaction.reply({
    content,
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  try {
    const press = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: timeout,
    });
    const approved = press.customId === 'confirm';
    await press.update({ content: approved ? 'Working…' : 'Cancelled.', components: [] });
    return approved;
  } catch {
    await interaction
      .editReply({ content: 'Timed out — nothing was deleted.', components: [] })
      .catch(() => {});
    return false;
  }
}

module.exports = { confirm };
