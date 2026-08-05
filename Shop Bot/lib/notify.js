'use strict';

const { ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('./config');
const { coins, when } = require('./format');

/**
 * Telling people things.
 *
 * Every request lands in two places: a DM to each owner, so it is not missed,
 * and a post in #shop-requests, so there is a record even if a DM bounces.
 * Members are told about every state change their request goes through.
 */

/**
 * The queue channel. Created on demand rather than in the blueprint because it
 * holds gamepass links and 18+ declarations — it should not exist at all on a
 * server that never turned the shop on.
 */
async function queueChannel(guild) {
  const existing = guild.channels.cache.find(
    (c) => c.name === config.CHANNELS.requests && c.isTextBased(),
  );
  if (existing) return existing;

  const staff = guild.roles.cache.filter((r) => ['Administrator', 'Moderator'].includes(r.name));

  return guild.channels
    .create({
      name: config.CHANNELS.requests,
      type: ChannelType.GuildText,
      topic: 'Shop requests waiting on the owner. Members cannot see this.',
      reason: 'Shop: request queue',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        // The bot sits in @everyone like anyone else, so being denied above
        // would hide the channel from KALLEN too. See lib/kenopsia/blueprint.js
        // for the same trap costing LELOUCH weeks in #marketplace.
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...staff.map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel] })),
      ],
    })
    .catch(() => null);
}

/** The card the owner acts on. */
function requestEmbed(request, user) {
  const embed = new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(`Request #${request.id} — ${request.typeLabel}`)
    .setDescription(request.summary)
    .addFields(
      { name: 'Member', value: `${user ? `${user}` : request.user} (\`${request.user}\`)`, inline: true },
      { name: 'Status', value: request.status, inline: true },
      {
        name: 'Price',
        value: request.price === null ? 'you must quote it' : `${coins(request.price)} coins`,
        inline: true,
      },
    )
    .setFooter({ text: `Opened` })
    .setTimestamp(request.createdAt);

  if (request.held) {
    embed.addFields({ name: 'Coins held', value: `${coins(request.held)} — refunded automatically if you deny it` });
  }
  if (request.gamepass) {
    embed.addFields({ name: 'Gamepass link', value: request.gamepass });
  }
  if (request.declared18) {
    embed.addFields({ name: '18+', value: 'Member declared they are 18 or over. Check before you pay.' });
  }
  return embed;
}

const NEXT_STEP = {
  pending: (r) =>
    r.price === null
      ? `Quote it with \`/kallen quote id:${r.id} coins:<n>\`, or \`/kallen deny id:${r.id}\`.`
      : `\`/kallen approve id:${r.id}\` or \`/kallen deny id:${r.id} reason:<why>\`.`,
  quoted: (r) => `Waiting on the member to pay with \`/request pay id:${r.id}\`.`,
  approved: (r) => `Send it, then close it with \`/kallen complete id:${r.id}\`.`,
};

/** DMs every owner and posts to the queue. Never throws — a bounced DM is not fatal. */
async function toOwners(guild, request, user) {
  const embed = requestEmbed(request, user);
  const step = NEXT_STEP[request.status]?.(request);

  const channel = await queueChannel(guild);
  if (channel) await channel.send({ content: step ?? undefined, embeds: [embed] }).catch(() => {});

  const ids = new Set([...config.owners(), guild.ownerId].filter(Boolean));
  for (const id of ids) {
    const owner = await guild.client.users.fetch(id).catch(() => null);
    if (owner) await owner.send({ content: step ?? undefined, embeds: [embed] }).catch(() => {});
  }
}

/** Tells the member where their request got to. */
async function toMember(guild, request, text) {
  const user = await guild.client.users.fetch(request.user).catch(() => null);
  if (!user) return;
  await user
    .send(`**Request #${request.id}** — ${request.typeLabel}\n${text}`)
    .catch(() => {});
}

/** Big purchases get said out loud, small ones do not. */
async function announcePurchase(guild, member, item, paid) {
  if (paid < 50_000) return;
  const channel = guild.channels.cache.find((c) => c.name === config.CHANNELS.rewards && c.isTextBased());
  if (!channel) return;
  await channel
    .send(`${member} just bought **${item.label}** for **${coins(paid)}** coins.`)
    .catch(() => {});
}

module.exports = { queueChannel, requestEmbed, toOwners, toMember, announcePurchase, when };
