'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const catalog = require('../lib/catalog');
const pricing = require('../lib/pricing');
const requests = require('../lib/requests');
const store = require('../lib/store');
const wallet = require('../lib/wallet');
const inventory = require('../lib/inventory');
const notify = require('../lib/notify');
const config = require('../lib/config');
const suggest = require('../lib/suggest');
const { coins, when } = require('../lib/format');

/**
 * The owner's side of the shop.
 *
 * Hidden from members by default with setDefaultMemberPermissions, and checked
 * again at execute() against config.isOwner — a channel override could hand the
 * command to someone the permission bit was meant to keep out.
 */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('kallen')
    .setDescription('Owner: run the shop')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('queue')
        .setDescription('Requests waiting on you')
        .addStringOption((o) =>
          o
            .setName('status')
            .setDescription('Default: everything still open')
            .addChoices(
              { name: 'Open', value: 'open' },
              { name: 'Pending', value: 'pending' },
              { name: 'Quoted', value: 'quoted' },
              { name: 'Approved', value: 'approved' },
              { name: 'Completed', value: 'completed' },
              { name: 'Denied', value: 'denied' },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('approve')
        .setDescription('Accept a request')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('quote')
        .setDescription('Put a price on a request that has none')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true))
        .addIntegerOption((o) => o.setName('coins').setDescription('What it costs').setRequired(true).setMinValue(0)),
    )
    .addSubcommand((s) =>
      s
        .setName('deny')
        .setDescription('Turn a request down and refund it')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('complete')
        .setDescription('You have sent it — close the request')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('For your own records')),
    )
    .addSubcommand((s) =>
      s
        .setName('refund')
        .setDescription('Reverse a completed request')
        .addStringOption((o) => o.setName('id').setDescription('Request number').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Why')),
    )
    .addSubcommand((s) =>
      s
        .setName('coins')
        .setDescription('Add or remove coins')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addIntegerOption((o) => o.setName('amount').setDescription('Negative to take them away').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Told to the member')),
    )
    .addSubcommand((s) =>
      s
        .setName('give')
        .setDescription('Hand someone an item for free')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('price')
        .setDescription('Override an item price')
        .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
        .addIntegerOption((o) => o.setName('coins').setDescription('Leave empty to put the list price back').setMinValue(0)),
    )
    .addSubcommand((s) =>
      s
        .setName('stock')
        .setDescription('Take an item off the shelf or put it back')
        .addStringOption((o) => o.setName('item').setDescription('Which item').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('available').setDescription('On sale?').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('history')
        .setDescription("Everything a member has bought and asked for")
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),
    ),

  async autocomplete(interaction) {
    await interaction.respond(suggest.items(interaction.options.getFocused())).catch(() => {});
  },

  async execute(interaction) {
    if (!config.isOwner(interaction)) {
      return interaction.reply({ content: 'Only the server owners can use this.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getString('id')?.replace('#', '');

    if (sub === 'queue') return queue(interaction);
    if (sub === 'history') return history(interaction);
    if (sub === 'coins') return adjust(interaction);
    if (sub === 'give') return give(interaction);
    if (sub === 'price') return setPrice(interaction);
    if (sub === 'stock') return setStock(interaction);

    // --- the request lifecycle ---
    if (sub === 'quote') {
      const outcome = requests.quote(id, interaction.options.getInteger('coins'));
      await interaction.reply({ content: outcome.message, ephemeral: true });
      if (outcome.ok) {
        await notify.toMember(
          interaction.guild,
          outcome.request,
          `The owner quoted this at **${coins(outcome.request.price)}** coins. Accept it with \`/request pay id:${outcome.request.id}\` — nothing leaves your balance until you do.`,
        );
      }
      return undefined;
    }

    if (sub === 'approve') return approve(interaction, id);

    if (sub === 'deny') {
      const reason = interaction.options.getString('reason');
      const outcome = requests.deny(id, reason);
      await interaction.reply({ content: outcome.message, ephemeral: true });
      if (outcome.ok) {
        const back = outcome.request.refunded ? ` Your **${coins(outcome.request.refunded)}** coins are back.` : '';
        await notify.toMember(interaction.guild, outcome.request, `Turned down. Reason: ${reason}.${back}`);
      }
      return undefined;
    }

    if (sub === 'complete') {
      const outcome = requests.complete(id, interaction.options.getString('note'));
      await interaction.reply({ content: outcome.message, ephemeral: true });
      if (outcome.ok) {
        await notify.toMember(
          interaction.guild,
          outcome.request,
          `Done — this has been sent. **${coins(outcome.request.price ?? 0)}** coins spent. Thanks for the patience.`,
        );
      }
      return undefined;
    }

    if (sub === 'refund') {
      const reason = interaction.options.getString('reason') ?? 'No reason given.';
      const outcome = requests.refund(id, reason);
      await interaction.reply({ content: outcome.message, ephemeral: true });
      if (outcome.ok) {
        await notify.toMember(
          interaction.guild,
          outcome.request,
          `Refunded — **${coins(outcome.request.refunded)}** coins are back in your balance. Reason: ${reason}.`,
        );
      }
      return undefined;
    }

    return undefined;
  },
};

/**
 * Approving an announcement is the one case where approval IS the fulfilment,
 * so it posts, spends the slot and closes itself rather than leaving the owner
 * a second step that does nothing.
 */
async function approve(interaction, id) {
  const request = store.getRequest(id);

  if (request?.type === 'announcement' && request.status === 'pending') {
    const channel = interaction.guild.channels.cache.find(
      (c) => c.name === config.CHANNELS.announcements && c.isTextBased(),
    );
    if (!channel) {
      return interaction.reply({ content: `I cannot find #${config.CHANNELS.announcements}.`, ephemeral: true });
    }

    const member = await interaction.guild.members.fetch(request.user).catch(() => null);
    const sent = await channel
      .send({ content: `${request.summary}\n\n— ${member ?? 'a member'}` })
      .catch(() => null);
    if (!sent) return interaction.reply({ content: 'I could not post that. Nothing was spent.', ephemeral: true });

    inventory.consume(store.member(request.guild, request.user), 'announcement-slot');
    requests.approve(id);
    requests.complete(id, 'Posted automatically on approval.');
    await interaction.reply({ content: `Posted in ${channel} and #${id} closed.`, ephemeral: true });
    await notify.toMember(interaction.guild, request, `Your announcement is up in ${channel}.`);
    return undefined;
  }

  const outcome = requests.approve(id);
  await interaction.reply({ content: outcome.message, ephemeral: true });
  if (outcome.ok) {
    await notify.toMember(
      interaction.guild,
      outcome.request,
      'Approved. The owner is sending it by hand — you will get another message when it is done. Your coins stay held until then.',
    );
  }
  return undefined;
}

async function queue(interaction) {
  const filter = interaction.options.getString('status') ?? 'open';
  const open = ['pending', 'quoted', 'approved'];

  const rows = store
    .requests(interaction.guildId, (r) => (filter === 'open' ? open.includes(r.status) : r.status === filter))
    .slice(-20);

  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(`Shop queue — ${filter}`)
    .setDescription(
      rows.length
        ? rows.map((r) => `${requests.line(r)} · <@${r.user}> · ${when(r.createdAt)}`).join('\n')
        : 'Nothing here.',
    );

  if (filter === 'open' && rows.length) {
    const held = rows.reduce((sum, r) => sum + r.held, 0);
    embed.setFooter({ text: `${coins(held)} coins held across ${rows.length} request(s)` });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function history(interaction) {
  const user = interaction.options.getUser('user');
  const record = store.member(interaction.guildId, user.id);
  inventory.tidy(record);

  const owned = inventory.live(record);
  const theirs = store.requests(interaction.guildId, (r) => r.user === user.id).reverse().slice(0, 12);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${user.username} — shop history`)
    .addFields(
      { name: 'Balance', value: `${coins(wallet.balance(interaction.guildId, user.id))} coins`, inline: true },
      { name: 'Spent', value: `${coins(record.spent ?? 0)} coins`, inline: true },
      {
        name: 'Slots',
        value: `${record.emojiSlots ?? 0} emoji · ${record.stickerSlots ?? 0} sticker`,
        inline: true,
      },
    );

  embed.addFields({
    name: 'Owns',
    value: owned.length
      ? owned.map((e) => catalog.ITEMS[e.id]?.label ?? e.id).join(', ').slice(0, 1000)
      : 'Nothing.',
  });

  embed.addFields({
    name: 'Requests',
    value: theirs.length ? theirs.map(requests.line).join('\n').slice(0, 1000) : 'None.',
  });

  if (record.robux?.declared18) {
    embed.addFields({
      name: 'Robux declaration',
      value: `Declared 18+ · gamepass: ${record.robux.gamepass ?? 'none on file'}`,
    });
  }

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function adjust(interaction) {
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason');

  if (amount < 0 && wallet.balance(interaction.guildId, user.id) < -amount) {
    return interaction.reply({
      content: `${user.username} only has ${coins(wallet.balance(interaction.guildId, user.id))} coins. Their balance would not go below zero, so take less.`,
      ephemeral: true,
    });
  }

  wallet.earn(interaction.guildId, user.id, amount);
  const now = wallet.balance(interaction.guildId, user.id);

  await interaction.reply({
    content: `${amount >= 0 ? 'Gave' : 'Took'} **${coins(Math.abs(amount))}** coins ${amount >= 0 ? 'to' : 'from'} ${user}. They now have ${coins(now)}.`,
    ephemeral: true,
  });

  await user
    .send(
      `${amount >= 0 ? `You were given **${coins(amount)}** coins` : `**${coins(-amount)}** coins were taken from your balance`} on Kenopsia.${reason ? ` Reason: ${reason}.` : ''} You now have ${coins(now)}.`,
    )
    .catch(() => {});
  return undefined;
}

async function give(interaction) {
  const user = interaction.options.getUser('user');
  const id = interaction.options.getString('item');
  const item = catalog.ITEMS[id];
  if (!item) return interaction.reply({ content: 'No such item.', ephemeral: true });

  const record = store.member(interaction.guildId, user.id);
  inventory.grant(record, id);

  await interaction.reply({ content: `Gave **${item.label}** to ${user}, free.`, ephemeral: true });
  await user.send(`The owner gave you **${item.label}** in the Kenopsia shop. It is in your \`/inventory\`.`).catch(() => {});
  return undefined;
}

async function setPrice(interaction) {
  const id = interaction.options.getString('item');
  const value = interaction.options.getInteger('coins');
  if (!catalog.ITEMS[id]) return interaction.reply({ content: 'No such item.', ephemeral: true });

  const now = pricing.setPrice(id, value ?? null);
  return interaction.reply({
    content:
      value === null
        ? `**${catalog.ITEMS[id].label}** is back to its list price, ${coins(now)} coins.`
        : `**${catalog.ITEMS[id].label}** now costs ${coins(now)} coins.`,
    ephemeral: true,
  });
}

async function setStock(interaction) {
  const id = interaction.options.getString('item');
  const available = interaction.options.getBoolean('available');
  if (!catalog.ITEMS[id]) return interaction.reply({ content: 'No such item.', ephemeral: true });

  pricing.setStock(id, available);
  return interaction.reply({
    content: `**${catalog.ITEMS[id].label}** is ${available ? 'back on the shelf' : 'off the shelf'}.`,
    ephemeral: true,
  });
}
