'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const store = require('./lib/store');
const inventory = require('./lib/inventory');
const requests = require('./lib/requests');
const deliver = require('./lib/deliver');
const notify = require('./lib/notify');
const { coins } = require('./lib/format');
const { lockToGuild } = require('../lib/guild-lock');

/**
 * KALLEN, the shop.
 *
 * Its own Discord application and its own name, but the same process as C.C,
 * because it spends out of the shared coin wallet and one file needs one
 * writer. Same arrangement as Suzaku and Shirley — see the comment in index.js.
 */

const TICK_MS = 60_000;

function loadCommands() {
  const commands = new Collection();
  const dir = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(dir, file));
    if (command?.data && command?.execute) commands.set(command.data.name, command);
  }
  return commands;
}

/**
 * Once a minute: drop cosmetics whose time is up, take down voice rooms that
 * have gone quiet, and close requests nobody touched in a week. All three are
 * cheap, and all three have to survive a restart, which is why they are a
 * sweep rather than a timer per item.
 */
async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const record of store.members(guild.id)) inventory.tidy(record);
    await deliver.sweepRooms(guild);

    for (const request of requests.sweep(guild.id)) {
      const back = request.refunded ? ` Your **${coins(request.refunded)}** coins are back.` : '';
      await notify.toMember(
        guild,
        request,
        `Closed — nobody got to it within seven days.${back} Open a new one whenever you like.`,
      );
    }
  }
  store.save();
}

function startShopBot(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      // Without this, voice states are never cached, channel.members is always
      // empty, and sweepRooms would delete bought rooms with people sitting in
      // them. Not a privileged intent — nothing to switch on in the portal.
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  client.commands = loadCommands();
  const lock = lockToGuild(client, process.env.GUILD_ID, 'KALLEN');

  client.once(Events.ClientReady, async (c) => {
    console.log(`Shop bot online as ${c.user.tag} — ${client.commands.size} commands.`);
    const ticker = setInterval(() => tick(client).catch((err) => console.error('Shop tick failed:', err)), TICK_MS);
    ticker.unref?.();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!lock.isAllowed(interaction.guildId)) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // More than twenty five items means the shop cannot use static choices,
    // so most item options are autocompleted instead.
    if (interaction.isAutocomplete()) {
      if (command.autocomplete) {
        await command.autocomplete(interaction).catch((err) => console.error('Shop autocomplete failed:', err));
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Shop command /${interaction.commandName} failed:`, err);
      const payload = { content: 'Something went wrong and nothing was charged. Try again in a moment.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => store.flush());
  }

  // A rejected login is an unhandled rejection, and an unhandled rejection ends
  // the process — with it C.C, SUZAKU, SHIRLEY and TAMEM. One bad token must
  // never cost four bots.
  client.login(token).catch((err) => {
    console.error(`KALLEN could not log in: ${err.message}. Check SHOP_TOKEN. Everything else keeps running.`);
  });

  return client;
}

module.exports = { startShopBot, tick };
