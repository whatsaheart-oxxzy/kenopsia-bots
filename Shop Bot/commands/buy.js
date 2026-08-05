'use strict';

const { SlashCommandBuilder } = require('discord.js');
const catalog = require('../lib/catalog');
const pricing = require('../lib/pricing');
const store = require('../lib/store');
const wallet = require('../lib/wallet');
const inventory = require('../lib/inventory');
const deliver = require('../lib/deliver');
const notify = require('../lib/notify');
const suggest = require('../lib/suggest');
const { coins } = require('../lib/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy something from the shop')
    .setDMPermission(false)
    .addStringOption((o) =>
      o.setName('item').setDescription('What to buy').setRequired(true).setAutocomplete(true),
    )
    .addUserOption((o) => o.setName('user').setDescription('Buy it for them instead of you')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(suggest.items(focused, { onlyBuyable: true })).catch(() => {});
  },

  async execute(interaction) {
    const id = interaction.options.getString('item');
    const item = catalog.ITEMS[id];

    if (!item) {
      return interaction.reply({ content: 'That item does not exist in the shop.', ephemeral: true });
    }
    if (!pricing.isAvailable(id)) {
      return interaction.reply({ content: `**${item.label}** is not on sale right now.`, ephemeral: true });
    }
    if (item.approval) {
      const how = item.category === 'robux' ? 'robux' : item.category === 'nitro' ? 'nitro' : 'custom';
      return interaction.reply({
        content: `**${item.label}** is fulfilled by hand, so it goes through the queue: \`/request ${how}\`. Nothing is charged until the owner agrees.`,
        ephemeral: true,
      });
    }

    // --- who is it for ---
    const recipient = interaction.options.getUser('user');
    const gifting = Boolean(recipient) && recipient.id !== interaction.user.id;

    if (gifting) {
      if (recipient.bot) return interaction.reply({ content: 'Bots do not need profile cards.', ephemeral: true });
      if (item.giftable === false) {
        return interaction.reply({ content: `**${item.label}** cannot be gifted.`, ephemeral: true });
      }
    }

    const target = gifting
      ? await interaction.guild.members.fetch(recipient.id).catch(() => null)
      : interaction.member;

    if (!target) return interaction.reply({ content: 'That member is not on the server.', ephemeral: true });

    // --- can they have it ---
    const record = store.member(interaction.guildId, target.id);
    if (item.days === null && item.kind !== 'bundle' && inventory.has(record, id)) {
      return interaction.reply({
        content: gifting
          ? `${target.displayName} already owns **${item.label}** and it is permanent.`
          : `You already own **${item.label}** and it is permanent. Check \`/inventory\`.`,
        ephemeral: true,
      });
    }

    const price = pricing.priceOf(id);
    const balance = wallet.balance(interaction.guildId, interaction.user.id);
    if (balance < price) {
      return interaction.reply({
        content: `**${item.label}** costs ${coins(price)} coins and you have ${coins(balance)}. You need ${coins(price - balance)} more.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    // --- hand it over first, charge second ---
    const outcome = await deliver.atPurchase(interaction.guild, target, id);
    if (!outcome.ok) return interaction.editReply({ content: outcome.message });

    if (!wallet.spend(interaction.guildId, interaction.user.id, price)) {
      return interaction.editReply({ content: 'Your balance changed while that was going through. Nothing was charged.' });
    }

    const entry = inventory.grant(record, id);
    record.spent = (record.spent ?? 0) + (gifting ? 0 : price);
    const buyerRecord = gifting ? store.member(interaction.guildId, interaction.user.id) : record;
    if (gifting) buyerRecord.spent = (buyerRecord.spent ?? 0) + price;
    store.save();

    // --- say so ---
    const lasts = entry?.expires
      ? `Runs out <t:${Math.floor(entry.expires / 1000)}:R>.`
      : item.days === 'once'
        ? 'One use, sitting in your inventory until you spend it.'
        : 'Permanent.';

    const lines = [
      gifting
        ? `**${item.label}** given to ${target}. ${coins(price)} coins spent.`
        : `**${item.label}** is yours. ${coins(price)} coins spent.`,
      outcome.message,
      gifting ? null : lasts,
      item.kind === 'bundle' ? `It unpacked into: ${item.grants.map((g) => catalog.ITEMS[g].label).join(', ')}.` : null,
      item.kind === 'text-slot' ? `Set it with \`/inventory set field:${item.slot}\`.` : null,
      item.kind === 'accent' ? 'Set it with `/inventory set field:accent value:#rrggbb`.' : null,
      item.kind === 'emoji' ? 'Upload with `/inventory emoji`.' : null,
      item.kind === 'sticker' ? 'Upload with `/inventory sticker`.' : null,
      item.kind === 'event' ? 'Schedule it with `/inventory event`.' : null,
      item.kind === 'card' ? 'Wear it with `/inventory use`.' : null,
    ].filter(Boolean);

    await interaction.editReply({ content: lines.join('\n') });

    if (gifting) {
      await target
        .send(`${interaction.user.username} bought you **${item.label}** in the Kenopsia shop. It is in your \`/inventory\`.`)
        .catch(() => {});
    }
    await notify.announcePurchase(interaction.guild, target, item, price);
  },
};
