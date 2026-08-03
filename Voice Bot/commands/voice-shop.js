'use strict';

const { SlashCommandBuilder } = require('discord.js');
const shop = require('../lib/shop');
const store = require('../lib/store');
const kenopsia = require('../../lib/kenopsia/store');
const economy = require('../../lib/kenopsia/economy');

const VOICE_ROOM_CATEGORY = 'VOICE';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice-shop')
    .setDescription('Spend your coins on voice rewards')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('buy')
        .setDescription('Buy this item right away')
        .addChoices(
          ...Object.entries(shop.ITEMS)
            .slice(0, 25)
            .map(([value, item]) => ({ name: `${item.label} (${item.price})`, value })),
        ),
    ),

  async execute(interaction) {
    const id = interaction.options.getString('buy');
    const balance = kenopsia.roll(kenopsia.member(interaction.guildId, interaction.user.id)).coins;

    if (!id) {
      return interaction.reply({
        content: [
          '# Voice shop',
          '',
          ...shop.list(),
          '',
          `You have **${balance}** coins. Buy with \`/voice-shop buy:<item>\`.`,
          '',
          'Discord frames, avatar decorations and Nitro are not in here on purpose: no bot can hand those out, so nobody is going to sell you one.',
        ].join('\n'),
        ephemeral: true,
      });
    }

    const item = shop.ITEMS[id];
    if (balance < item.price) {
      return interaction.reply({
        content: `**${item.label}** costs ${item.price} coins and you have ${balance}.`,
        ephemeral: true,
      });
    }

    const outcome = await deliver(interaction, item);
    if (!outcome.ok) {
      return interaction.reply({ content: outcome.message, ephemeral: true });
    }

    economy.addCoins(interaction.guildId, interaction.user.id, -item.price);
    const record = store.member(interaction.guildId, interaction.user.id);
    record.purchases ??= [];
    record.purchases.push({ id, at: Date.now() });
    store.save();

    await interaction.reply({ content: `${outcome.message}\n${item.price} coins spent.`, ephemeral: true });
  },
};

/** Hands the item over. Nothing is charged unless this succeeds. */
async function deliver(interaction, item) {
  const guild = interaction.guild;
  const me = guild.members.me;

  if (item.kind === 'role') {
    const role = guild.roles.cache.find((r) => r.name === item.role);
    if (!role) return { ok: false, message: `The **${item.role}** role does not exist. Ask an admin to run \`/kenopsia setup\`.` };
    if (role.position >= me.roles.highest.position) {
      return { ok: false, message: 'I sit below that role and cannot hand it out. Tell an admin.' };
    }
    if (interaction.member.roles.cache.has(role.id)) {
      return { ok: false, message: `You already have **${item.role}**.` };
    }

    await interaction.member.roles.add(role, 'Voice shop');
    if (item.days) {
      const record = store.member(guild.id, interaction.user.id);
      record.titles ??= {};
      record.titles[item.role] = Date.now() + item.days * 86_400_000;
    }
    return { ok: true, message: `**${item.role}** is yours${item.days ? ` for ${item.days} days` : ' permanently'}.` };
  }

  if (item.kind === 'emoji') {
    const record = store.member(guild.id, interaction.user.id);
    record.emojiSlots = (record.emojiSlots ?? 0) + 1;
    return { ok: true, message: 'Emoji slot added. Use `/voice-emoji name: image:` to upload one.' };
  }

  if (item.kind === 'room') {
    const parent = guild.channels.cache.find((c) => c.name === VOICE_ROOM_CATEGORY && c.type === 4);
    const room = await guild.channels
      .create({
        name: `${interaction.member.displayName} lounge`,
        type: 2,
        parent: parent?.id ?? null,
        reason: 'Voice shop: private room',
      })
      .catch(() => null);

    if (!room) return { ok: false, message: 'I could not create the channel. Tell an admin.' };
    await room.permissionOverwrites
      .edit(interaction.user.id, { ManageChannels: true, MoveMembers: true })
      .catch(() => {});
    return { ok: true, message: `${room} is yours. You can rename it and move people in it.` };
  }

  return { ok: false, message: 'That item cannot be delivered.' };
}
