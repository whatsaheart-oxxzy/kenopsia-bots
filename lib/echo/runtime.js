'use strict';

const { Events } = require('discord.js');
const colors = require('./colors');
const points = require('./points');
const quests = require('./quests');
const oracle = require('./oracle');
const store = require('./store');
const { CHANNELS, LEVELS } = require('./blueprint');

const WELCOME = (member, guild) => {
  const mention = (name) => {
    const channel = guild.channels.cache.find((c) => c.name === name);
    return channel ? `${channel}` : `#${name}`;
  };

  return [
    `**A new ECHO wakes up.** Welcome, ${member}.`,
    '',
    'It is empty for now. What it becomes is up to you, with every message, every answer and every project you show here.',
    '',
    '**Three steps and you are in**',
    `Read the rules in ${mention(CHANNELS.rules)}.`,
    `Answer the five questions in ${mention(CHANNELS.genesis)}.`,
    `Pick your color in ${mention(CHANNELS.identity)}.`,
    '',
    `After that, ${mention(CHANNELS.hearth)} is waiting. Type \`/echo profile\` to see how far you are.`,
    `Anything unclear? Ask in ${mention(CHANNELS.questions)}.`,
  ].join('\n');
};

/** Announces a level-up in the channel where it happened. */
async function announceLevel(channel, user, level) {
  await channel.send(`**${user} is now ${level}.** The ECHO grows louder.`).catch(() => {});
}

function registerEcho(client) {
  client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || message.author.bot) return;

    try {
      const result = await points.onMessage(message);
      if (result?.leveledUp) await announceLevel(message.channel, message.author, result.leveledUp);
    } catch (err) {
      console.error('Point award failed:', err);
    }

    // The Oracle only speaks in its own channel. @-mentions elsewhere belong to
    // the SETA persona, so they stay untouched.
    if (message.channel.name !== CHANNELS.oracle) return;

    try {
      await message.channel.sendTyping().catch(() => {});
      const reply = await oracle.ask(message);
      if (reply) await message.reply({ content: reply, allowedMentions: { repliedUser: false } });
    } catch (err) {
      console.error('Oracle failed:', err);
    }
  });

  // Colour picker buttons in #identity. Chat commands are handled in index.js.
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!colors.isColorButton(interaction)) return;
    try {
      await colors.handle(interaction);
    } catch (err) {
      console.error('Colour pick failed:', err);
      await interaction
        .reply({ content: 'That did not work. Please tell a Warden.', ephemeral: true })
        .catch(() => {});
    }
  });

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (!reaction.message.guild) return;

      const result = await points.onHelpful(reaction, user);
      if (result?.leveledUp) {
        await announceLevel(reaction.message.channel, reaction.message.author, result.leveledUp);
      }
    } catch (err) {
      console.error('Helpful award failed:', err);
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const record = store.member(member.guild.id, member.id);
      await points.syncRoles(member, record.level, 'ECHO onboarding');

      const welcome = member.guild.channels.cache.find(
        (c) => c.name === CHANNELS.welcome && c.isTextBased(),
      );
      if (welcome) await welcome.send(WELCOME(member, member.guild)).catch(() => {});
    } catch (err) {
      console.error('Onboarding failed:', err);
    }
  });

  client.once(Events.ClientReady, () => {
    quests.schedule(client);
    console.log(
      `ECHO runtime active — ${LEVELS.length} levels, Oracle ${oracle.enabled() ? 'online' : 'offline (no ANTHROPIC_API_KEY)'}.`,
    );
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      store.flush();
      process.exit(0);
    });
  }
}

module.exports = { registerEcho };
