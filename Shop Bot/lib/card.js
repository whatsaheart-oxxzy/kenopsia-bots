'use strict';

const { EmbedBuilder } = require('discord.js');
const kenopsia = require('../../lib/kenopsia/store');
const cosmetics = require('./cosmetics');
const store = require('./store');
const { coins } = require('./format');

/**
 * The profile card, drawn once and used everywhere.
 *
 * C.C's /profile calls this, and so does a bought spotlight, so a member's card
 * looks the same wherever it turns up. Coins lead: this server runs on coins,
 * and everything in the shop is priced in them.
 */
function profileEmbed(guild, member, record = null) {
  const shop = record ?? store.member(guild.id, member.id);
  const wallet = kenopsia.roll(kenopsia.member(guild.id, member.id));
  const style = cosmetics.look(guild.id, member.id);
  const rank = kenopsia.rankOf(guild.id, member.id, 'weeklyCoins');

  const hours = Math.floor(wallet.voiceSeconds / 3600);
  const minutes = Math.floor((wallet.voiceSeconds % 3600) / 60);

  const embed = new EmbedBuilder()
    .setColor(style.color)
    .setTitle(cosmetics.heading(member.displayName, style))
    .setThumbnail(member.displayAvatarURL({ size: 256 }));

  const head = [
    style.title ? `*${style.title}*` : null,
    style.title ? cosmetics.rule(style) : null,
    `**${coins(wallet.coins)}** coins${rank ? ` · rank **#${rank}** this week` : ''}`,
    `**${coins(wallet.weeklyCoins)}** earned this week`,
  ].filter(Boolean);

  embed.setDescription(head.join('\n'));

  embed.addFields(
    { name: 'Voice', value: `${hours}h ${minutes}m`, inline: true },
    { name: 'Spent in the shop', value: `${coins(shop.spent ?? 0)} coins`, inline: true },
  );

  if (wallet.invites) embed.addFields({ name: 'Invited', value: `${wallet.invites} members`, inline: true });
  if (style.bio) embed.addFields({ name: 'About', value: style.bio });
  if (style.showcase) embed.setImage(style.showcase);

  embed.setFooter({
    text: style.cardName ? `${style.cardName} · Kenopsia` : 'Kenopsia',
  });

  return embed;
}

module.exports = { profileEmbed };
