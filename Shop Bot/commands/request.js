'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const catalog = require('../lib/catalog');
const pricing = require('../lib/pricing');
const requests = require('../lib/requests');
const notify = require('../lib/notify');
const store = require('../lib/store');
const wallet = require('../lib/wallet');
const cosmetics = require('../lib/cosmetics');
const { coins, clean } = require('../lib/format');

/**
 * Everything the owner has to hand over personally.
 *
 * Robux and Nitro cost the owner real money, and an in-game item has to be
 * traded across in game, so none of it can be automatic. What KALLEN does is
 * hold the coins, keep the paperwork straight and make sure nobody is charged
 * for something that never turned up.
 */

const ROBUX_PACKS = Object.entries(catalog.ITEMS)
  .filter(([, i]) => i.category === 'robux')
  .map(([value, i]) => ({ name: `${i.label} — ${coins(i.price)} coins`, value }));

const NITRO_PLANS = Object.entries(catalog.ITEMS)
  .filter(([, i]) => i.category === 'nitro')
  .map(([value, i]) => ({ name: `${i.label} — ${coins(i.price)} coins`, value }));

/** A Robux payout only works if the member can actually be paid. */
const GAMEPASS = /^https?:\/\/(www\.)?roblox\.com\/(game-pass|catalog|library)\/\d+/i;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('request')
    .setDescription('Ask the owner for something that is handed over by hand')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('robux')
        .setDescription('Ask for Robux. 18+ only, paid through your gamepass')
        .addBooleanOption((o) =>
          o.setName('over_18').setDescription('Confirm you are 18 or over').setRequired(true),
        )
        .addStringOption((o) =>
          o.setName('gamepass').setDescription('Link to a gamepass on your account the owner can buy').setRequired(true),
        )
        .addStringOption((o) => o.setName('pack').setDescription('A set pack').addChoices(...ROBUX_PACKS))
        .addIntegerOption((o) =>
          o.setName('amount').setDescription('Or a custom amount of Robux').setMinValue(50).setMaxValue(10_000),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('nitro')
        .setDescription('Ask for Discord Nitro')
        .addStringOption((o) => o.setName('plan').setDescription('Which one').setRequired(true).addChoices(...NITRO_PLANS)),
    )
    .addSubcommand((s) =>
      s
        .setName('item')
        .setDescription('Ask for a Roblox item, traded to you in game')
        .addStringOption((o) => o.setName('name').setDescription('What the item is').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('value').setDescription('Roughly what it is worth in Robux').setRequired(true).setMinValue(1),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('custom')
        .setDescription('Ask the owner to make something for the server')
        .addStringOption((o) => o.setName('description').setDescription('What you want').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('announcement')
        .setDescription('Spend an announcement slot — the owner reads it first')
        .addStringOption((o) => o.setName('message').setDescription('What to post').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('status').setDescription('Your open and closed requests'))
    .addSubcommand((s) =>
      s
        .setName('pay')
        .setDescription('Accept a price the owner quoted you')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'status') return status(interaction);
    if (sub === 'pay') return pay(interaction);
    if (sub === 'robux') return robux(interaction);
    if (sub === 'nitro') return nitro(interaction);
    if (sub === 'item') return ingame(interaction);
    if (sub === 'custom') return custom(interaction);
    if (sub === 'announcement') return announcement(interaction);
    return undefined;
  },
};

/** Opens the request and tells everyone who needs to know. */
async function submit(interaction, opts) {
  const outcome = requests.open(interaction.guildId, interaction.user.id, opts);
  if (!outcome.ok) return interaction.reply({ content: outcome.message, ephemeral: true });

  await interaction.reply({
    content: `${outcome.message}\nTrack it with \`/request status\`. It closes itself after seven days if nobody gets to it.`,
    ephemeral: true,
  });
  await notify.toOwners(interaction.guild, outcome.request, interaction.user);
  return undefined;
}

async function robux(interaction) {
  const over18 = interaction.options.getBoolean('over_18');
  const gamepass = interaction.options.getString('gamepass').trim();
  const packId = interaction.options.getString('pack');
  const amount = interaction.options.getInteger('amount');

  if (!over18) {
    return interaction.reply({
      content: 'Robux only goes to members who are 18 or over. Nothing has been opened.',
      ephemeral: true,
    });
  }
  if (!GAMEPASS.test(gamepass)) {
    return interaction.reply({
      content: [
        'That does not look like a Roblox gamepass link.',
        '',
        'Robux is paid one way only: you put a gamepass on your own account for the right',
        'price and the owner buys it. That needs Roblox Premium on your side. Nobody will',
        'ever ask for your password, and you should never give it to anyone who does.',
      ].join('\n'),
      ephemeral: true,
    });
  }
  if (!packId && !amount) {
    return interaction.reply({ content: 'Pick a `pack` or give an `amount`.', ephemeral: true });
  }
  if (packId && amount) {
    return interaction.reply({ content: 'One or the other, not both.', ephemeral: true });
  }

  // Remembered so the owner does not have to ask twice, and so a later request
  // shows whether the story has changed.
  const record = store.member(interaction.guildId, interaction.user.id);
  record.robux = { ...record.robux, declared18: true, gamepass, declaredAt: Date.now() };
  store.save();

  if (packId) {
    const item = catalog.ITEMS[packId];
    if (!pricing.isAvailable(packId)) {
      return interaction.reply({ content: `**${item.label}** is not on sale right now.`, ephemeral: true });
    }
    return submit(interaction, {
      type: 'robux',
      itemId: packId,
      price: pricing.priceOf(packId),
      summary: `${item.label} — ${coins(item.robux)} Robux`,
      gamepass,
      declared18: true,
    });
  }

  return submit(interaction, {
    type: 'robux',
    price: null,
    summary: `Custom: ${coins(amount)} Robux (guide price ${coins(catalog.quoteFor(amount))} coins)`,
    gamepass,
    declared18: true,
  });
}

async function nitro(interaction) {
  const id = interaction.options.getString('plan');
  const item = catalog.ITEMS[id];
  if (!pricing.isAvailable(id)) {
    return interaction.reply({ content: `**${item.label}** is not on sale right now.`, ephemeral: true });
  }
  return submit(interaction, {
    type: 'nitro',
    itemId: id,
    price: pricing.priceOf(id),
    summary: item.label,
  });
}

async function ingame(interaction) {
  const name = clean(interaction.options.getString('name'), 80);
  const value = interaction.options.getInteger('value');
  if (!name) return interaction.reply({ content: 'Give the item a name.', ephemeral: true });

  return submit(interaction, {
    type: 'item',
    price: null,
    summary: `${name} — worth about ${coins(value)} Robux (guide price ${coins(catalog.quoteFor(value))} coins). Traded in game.`,
  });
}

async function custom(interaction) {
  const description = clean(interaction.options.getString('description'), 500);
  if (!description) return interaction.reply({ content: 'Say what you want.', ephemeral: true });
  return submit(interaction, { type: 'custom', price: null, summary: description });
}

async function announcement(interaction) {
  const record = store.member(interaction.guildId, interaction.user.id);
  const inventory = require('../lib/inventory');

  if (!inventory.has(record, 'announcement-slot')) {
    return interaction.reply({
      content: `You need an announcement slot — ${coins(pricing.priceOf('announcement-slot'))} coins from \`/buy item:announcement-slot\`. The slot is what costs; sending the message is free.`,
      ephemeral: true,
    });
  }

  const message = clean(interaction.options.getString('message'), 900);
  if (!message) return interaction.reply({ content: 'The message came out empty.', ephemeral: true });

  return submit(interaction, {
    type: 'announcement',
    itemId: 'announcement-slot',
    price: 0,
    summary: message,
  });
}

async function pay(interaction) {
  const outcome = requests.pay(interaction.options.getString('id').replace('#', ''), interaction.user.id);
  await interaction.reply({ content: outcome.message, ephemeral: true });
  if (outcome.ok) await notify.toOwners(interaction.guild, outcome.request, interaction.user);
}

async function status(interaction) {
  const mine = store
    .requests(interaction.guildId, (r) => r.user === interaction.user.id)
    .reverse()
    .slice(0, 15);

  const style = cosmetics.look(interaction.guildId, interaction.user.id);
  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setTitle('Your requests')
    .setDescription(mine.length ? mine.map(requests.line).join('\n') : 'You have not asked for anything yet.');

  const held = mine.filter((r) => r.held > 0).reduce((sum, r) => sum + r.held, 0);
  if (held) {
    embed.addFields({
      name: 'Coins held',
      value: `**${coins(held)}** — out of your balance but not spent. Refunded if a request is denied or expires.`,
    });
  }

  const quoted = mine.filter((r) => r.status === 'quoted');
  if (quoted.length) {
    embed.addFields({
      name: 'Waiting on you',
      value: quoted.map((r) => `\`#${r.id}\` — ${coins(r.price)} coins. Accept with \`/request pay id:${r.id}\`.`).join('\n'),
    });
  }

  embed.setFooter({ text: `You have ${coins(wallet.balance(interaction.guildId, interaction.user.id))} coins` });
  return interaction.reply({ embeds: [embed], ephemeral: true });
}
