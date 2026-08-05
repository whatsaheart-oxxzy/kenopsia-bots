'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const catalog = require('../lib/catalog');
const store = require('../lib/store');
const inventory = require('../lib/inventory');
const cosmetics = require('../lib/cosmetics');
const deliver = require('../lib/deliver');
const suggest = require('../lib/suggest');
const { coins, remaining, clean, hex } = require('../lib/format');

/** Which purchase unlocks which field on the card. */
const SLOT_ITEM = {
  title: 'profile-title',
  badge: 'profile-badge',
  bio: 'profile-bio',
  showcase: 'profile-showcase',
  accent: 'profile-accent',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('What you own, and how to use it')
    .setDMPermission(false)
    .addSubcommand((s) => s.setName('list').setDescription('Everything you own'))
    .addSubcommand((s) =>
      s
        .setName('use')
        .setDescription('Wear one of your cards')
        .addStringOption((o) => o.setName('item').setDescription('Which card').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('bare').setDescription('Take your card off and go plain'))
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Fill in a slot you bought')
        .addStringOption((o) =>
          o
            .setName('field')
            .setDescription('Which slot')
            .setRequired(true)
            .addChoices(
              { name: 'Title', value: 'title' },
              { name: 'Badge', value: 'badge' },
              { name: 'Bio', value: 'bio' },
              { name: 'Showcase image', value: 'showcase' },
              { name: 'Accent colour', value: 'accent' },
            ),
        )
        .addStringOption((o) => o.setName('value').setDescription('Leave empty to clear it')),
    )
    .addSubcommand((s) =>
      s
        .setName('emoji')
        .setDescription('Spend an emoji slot')
        .addStringOption((o) => o.setName('name').setDescription('Emoji name').setRequired(true))
        .addAttachmentOption((o) => o.setName('image').setDescription('Under 256 KB').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('sticker')
        .setDescription('Spend a sticker slot')
        .addStringOption((o) => o.setName('name').setDescription('Sticker name').setRequired(true))
        .addStringOption((o) => o.setName('tag').setDescription('The emoji it relates to').setRequired(true))
        .addAttachmentOption((o) => o.setName('file').setDescription('PNG or APNG, 320x320').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('event')
        .setDescription('Spend an event slot')
        .addStringOption((o) => o.setName('name').setDescription('Event name').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('in_hours').setDescription('How many hours from now').setRequired(true).setMinValue(1).setMaxValue(720),
        )
        .addStringOption((o) => o.setName('description').setDescription('What it is')),
    )
    .addSubcommand((s) => s.setName('spotlight').setDescription('Spend a spotlight and post your card in #rewards'))
    .addSubcommand((s) =>
      s
        .setName('room')
        .setDescription('Open your private room, or change how many people fit in it')
        .addIntegerOption((o) =>
          o
            .setName('limit')
            .setDescription('How many can join a voice room. 0 is no limit')
            .setMinValue(0)
            .setMaxValue(99),
        )
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Which room. Default: voice')
            .addChoices({ name: 'Voice', value: 'voice' }, { name: 'Text', value: 'text' }),
        ),
    ),

  async autocomplete(interaction) {
    const record = store.member(interaction.guildId, interaction.user.id);
    const owned = (id) => catalog.ITEMS[id]?.kind === 'card' && inventory.has(record, id);
    await interaction.respond(suggest.items(interaction.options.getFocused(), { ownedBy: owned })).catch(() => {});
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const record = store.member(interaction.guildId, interaction.user.id);
    inventory.tidy(record);

    if (sub === 'list') return list(interaction, record);
    if (sub === 'use') return use(interaction, record);
    if (sub === 'bare') return bare(interaction, record);
    if (sub === 'set') return set(interaction, record);
    if (sub === 'emoji') return emoji(interaction);
    if (sub === 'sticker') return sticker(interaction);
    if (sub === 'event') return event(interaction);
    if (sub === 'spotlight') return spotlight(interaction, record);
    if (sub === 'room') return room(interaction);
    return undefined;
  },
};

async function list(interaction, record) {
  const style = cosmetics.look(interaction.guildId, interaction.user.id);
  const owned = inventory.live(record);

  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setTitle(`${interaction.member.displayName} — inventory`);

  if (!owned.length && !record.emojiSlots && !record.stickerSlots) {
    embed.setDescription('Nothing yet. Have a look at `/shop`.');
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  const lines = owned.map((entry) => {
    const item = catalog.ITEMS[entry.id];
    if (!item) return null;
    const worn = record.cosmetics.card === entry.id ? ' · **worn**' : '';
    const uses = entry.uses !== undefined ? `${entry.uses} use(s) left` : remaining(entry.expires);
    return `\`${entry.id}\` **${item.label}** — ${uses}${worn}`;
  });

  embed.setDescription(lines.filter(Boolean).join('\n') || 'Nothing with a duration.');

  const slots = [
    record.emojiSlots ? `Emoji slots: **${record.emojiSlots}**` : null,
    record.stickerSlots ? `Sticker slots: **${record.stickerSlots}**` : null,
    record.spent ? `Spent all time: **${coins(record.spent)}** coins` : null,
  ].filter(Boolean);
  if (slots.length) embed.addFields({ name: 'Slots', value: slots.join('\n') });

  const cos = record.cosmetics;
  const set_ = [
    cos.card ? `Card: ${catalog.ITEMS[cos.card]?.label}` : null,
    cos.title ? `Title: ${cos.title}` : null,
    cos.badge ? `Badge: ${cos.badge}` : null,
    cos.accent ? `Accent: ${cos.accent}` : null,
    cos.bio ? 'Bio: set' : null,
    cos.showcase ? 'Showcase: set' : null,
  ].filter(Boolean);
  if (set_.length) embed.addFields({ name: 'On your card', value: set_.join('\n') });

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function use(interaction, record) {
  const id = interaction.options.getString('item');
  const item = catalog.ITEMS[id];

  if (!item || item.kind !== 'card') {
    return interaction.reply({ content: 'That is not a card. `/inventory list` shows what you can wear.', ephemeral: true });
  }
  if (!inventory.has(record, id)) {
    return interaction.reply({ content: `You do not own **${item.label}**, or it has run out.`, ephemeral: true });
  }
  if (record.cosmetics.card === id) {
    return interaction.reply({ content: `You are already wearing **${item.label}**.`, ephemeral: true });
  }

  record.cosmetics.card = id;
  store.save();
  return interaction.reply({ content: `Wearing **${item.label}**. Have a look with \`/profile\`.`, ephemeral: true });
}

async function bare(interaction, record) {
  if (!record.cosmetics.card) {
    return interaction.reply({ content: 'You are not wearing a card.', ephemeral: true });
  }
  record.cosmetics.card = null;
  store.save();
  return interaction.reply({ content: 'Card off. You still own it — put it back on with `/inventory use`.', ephemeral: true });
}

async function set(interaction, record) {
  const field = interaction.options.getString('field');
  const raw = interaction.options.getString('value');
  const itemId = SLOT_ITEM[field];
  const item = catalog.ITEMS[itemId];

  if (!inventory.has(record, itemId)) {
    return interaction.reply({
      content: `You do not own **${item.label}**. Buy it with \`/buy item:${itemId}\`.`,
      ephemeral: true,
    });
  }

  if (!raw) {
    record.cosmetics[field] = null;
    store.save();
    return interaction.reply({ content: `Your ${field} is cleared. The slot is still yours.`, ephemeral: true });
  }

  if (field === 'accent') {
    if (hex(raw) === null) {
      return interaction.reply({ content: 'That is not a colour. Use `#rrggbb`, for example `#9b59f0`.', ephemeral: true });
    }
    record.cosmetics.accent = raw.trim();
  } else if (field === 'showcase') {
    if (!/^https:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(raw.trim())) {
      return interaction.reply({ content: 'That needs to be a direct https link to a png, jpg, gif or webp.', ephemeral: true });
    }
    record.cosmetics.showcase = raw.trim();
  } else {
    const text = clean(raw, item.limit ?? 40);
    if (!text) return interaction.reply({ content: 'That came out empty once the formatting was stripped.', ephemeral: true });
    record.cosmetics[field] = text;
  }

  store.save();
  return interaction.reply({ content: `Your ${field} is set. Have a look with \`/profile\`.`, ephemeral: true });
}

async function emoji(interaction) {
  const image = interaction.options.getAttachment('image');
  await interaction.deferReply({ ephemeral: true });
  const outcome = await deliver.uploadEmoji(
    interaction.guild,
    interaction.member,
    interaction.options.getString('name'),
    image.url,
  );
  return interaction.editReply({ content: outcome.message });
}

async function sticker(interaction) {
  const file = interaction.options.getAttachment('file');
  await interaction.deferReply({ ephemeral: true });
  const outcome = await deliver.uploadSticker(
    interaction.guild,
    interaction.member,
    interaction.options.getString('name'),
    interaction.options.getString('tag'),
    file.url,
  );
  return interaction.editReply({ content: outcome.message });
}

async function event(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const startsAt = Date.now() + interaction.options.getInteger('in_hours') * 3_600_000;
  const outcome = await deliver.createEvent(
    interaction.guild,
    interaction.member,
    interaction.options.getString('name'),
    interaction.options.getString('description') ?? 'A member run event.',
    startsAt,
  );
  return interaction.editReply({ content: outcome.message });
}

/** Free — the room was already paid for; only the channel was taken down. */
async function room(interaction) {
  const type = interaction.options.getString('type') ?? 'voice';
  const limit = interaction.options.getInteger('limit');
  await interaction.deferReply({ ephemeral: true });
  const outcome = await deliver.resummon(interaction.guild, interaction.member, type, limit);
  return interaction.editReply({ content: outcome.message });
}

async function spotlight(interaction, record) {
  await interaction.deferReply({ ephemeral: true });
  const { profileEmbed } = require('../lib/card');
  const embed = profileEmbed(interaction.guild, interaction.member, record);
  const outcome = await deliver.postSpotlight(interaction.guild, interaction.member, embed);
  return interaction.editReply({ content: outcome.message });
}
