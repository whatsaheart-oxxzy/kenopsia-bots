'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const catalog = require('../lib/catalog');
const pricing = require('../lib/pricing');
const wallet = require('../lib/wallet');
const cosmetics = require('../lib/cosmetics');
const { coins } = require('../lib/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('The Kenopsia shop')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('category')
        .setDescription('Look at one shelf')
        .addChoices(
          ...Object.entries(catalog.CATEGORIES).map(([value, c]) => ({ name: c.label, value })),
        ),
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category');
    const balance = wallet.balance(interaction.guildId, interaction.user.id);
    const style = cosmetics.look(interaction.guildId, interaction.user.id);

    const embed = new EmbedBuilder().setColor(style.color);

    if (!category) {
      embed
        .setTitle('Kenopsia shop')
        .setDescription(
          [
            `You have **${coins(balance)}** coins.`,
            '',
            'One balance for everything. Time in voice and messages both pay into it,',
            'and every shelf below spends out of it. Pets are the only separate shop.',
          ].join('\n'),
        );

      for (const [key, meta] of Object.entries(catalog.CATEGORIES)) {
        const shelf = pricing.shelf(key);
        // In-game items have no fixed shelf — every one of them is quoted.
        const heading = key === 'ingame'
          ? `${meta.label} — quoted per item`
          : shelf.length
            ? `${meta.label} — from ${coins(shelf[0].price)} coins`
            : null;
        if (!heading) continue;
        embed.addFields({ name: heading, value: `${meta.blurb}\n\`/shop category:${key}\`` });
      }

      embed.setFooter({ text: 'Buy with /buy · ask for Robux, Nitro or an in-game item with /request' });
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const meta = catalog.CATEGORIES[category];
    const shelf = pricing.shelf(category);

    // In-game Roblox items are not a price list — the owner quotes each one off
    // its Robux value, using the same anchor the Robux packs are built on.
    if (category === 'ingame') {
      embed.setTitle(meta.label).setDescription(
        [
          meta.blurb,
          '',
          'Everything is handed over **in game, by trading**. Nobody ever asks for your',
          'Roblox password and nobody logs into your account — if anyone does, report it.',
          '',
          `The owner quotes off the item's Robux value at about **${coins(catalog.COINS_PER_ROBUX)} coins per Robux**:`,
        ].join('\n'),
      );

      for (const value of [100, 500, 1_000, 5_000]) {
        embed.addFields({
          name: `${coins(value)} Robux`,
          value: `about **${coins(catalog.quoteFor(value))}** coins`,
          inline: true,
        });
      }

      embed
        .addFields({
          name: 'Above 5,000 Robux',
          value: 'The owner sets the price by hand.',
          inline: true,
        })
        .setFooter({ text: `You have ${coins(balance)} coins` });

      return interaction.reply({
        content: 'Ask for a quote with `/request item name:<what> value:<robux>`. Nothing is charged until you accept the price.',
        embeds: [embed],
        ephemeral: true,
      });
    }

    if (!shelf.length) {
      return interaction.reply({
        content: `Nothing is on the **${meta.label}** shelf right now.`,
        ephemeral: true,
      });
    }

    embed.setTitle(meta.label).setDescription(meta.blurb);

    for (const { id, item, price } of shelf) {
      const bits = [`**${coins(price)}** coins`, catalog.lifetime(item)];
      if (item.kind === 'bundle') {
        const saving = catalog.worth(id) - price;
        if (saving > 0) bits.push(`saves ${coins(saving)}`);
      }
      if (item.approval) bits.push('needs approval');
      if (item.giftable === false) bits.push('cannot be gifted');

      embed.addFields({ name: `${item.label} · \`${id}\``, value: `${item.text}\n${bits.join(' · ')}` });
    }

    const how = category === 'robux' || category === 'nitro' || category === 'ingame'
      ? `Ask for one with \`/request ${category === 'ingame' ? 'item' : category}\`. Nothing is charged until the owner agrees.`
      : 'Buy with `/buy item:<id>`.';

    embed.setFooter({ text: `You have ${coins(balance)} coins` });
    return interaction.reply({ content: how, embeds: [embed], ephemeral: true });
  },
};
