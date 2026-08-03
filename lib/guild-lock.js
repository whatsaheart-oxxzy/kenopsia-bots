'use strict';

const { Events } = require('discord.js');

/**
 * Ties a bot to one server.
 *
 * Three layers, because each one covers a different failure:
 *   1. It leaves any server that is not the allowed one, on start and the
 *      moment it is added somewhere new.
 *   2. It refuses commands from anywhere else, in case leaving is delayed or
 *      fails on a permission error.
 *   3. Every handler can ask isAllowed() before touching data.
 *
 * This is a backstop, not a lock on the front door. The real prevention is
 * turning off "Public Bot" in the Discord developer portal, which stops anyone
 * but you from inviting it at all.
 */

const REFUSAL = 'This bot only works on the Kenopsia server.';

function lockToGuild(client, guildId, label = 'bot') {
  if (!guildId) {
    console.warn(`[${label}] GUILD_ID is not set — the server lock is OFF.`);
    return { isAllowed: () => true };
  }

  const isAllowed = (id) => id === guildId;

  const leaveIfForeign = async (guild) => {
    if (isAllowed(guild.id)) return;
    console.warn(`[${label}] Left "${guild.name}" (${guild.id}) — not the allowed server.`);
    await guild.leave().catch((err) => console.error(`[${label}] Could not leave ${guild.id}:`, err.message));
  };

  client.once(Events.ClientReady, async () => {
    for (const guild of client.guilds.cache.values()) await leaveIfForeign(guild);
  });

  client.on(Events.GuildCreate, leaveIfForeign);

  // Runs before the command dispatchers registered later, so a foreign command
  // is answered once and never reaches any handler.
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guildId || isAllowed(interaction.guildId)) return;
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: REFUSAL, ephemeral: true }).catch(() => {});
    }
  });

  return { isAllowed };
}

module.exports = { lockToGuild, REFUSAL };
