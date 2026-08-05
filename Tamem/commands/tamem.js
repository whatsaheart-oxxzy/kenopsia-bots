'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const markov = require('../lib/markov');
const settings = require('../lib/settings');
const rewards = require('../lib/rewards');
const db = require('../lib/db');

/**
 * Everything Tamem can be asked to do, under one command.
 *
 * One `/tamem` with subcommands rather than seventeen top-level names. There
 * are six bots on this server now and names like /reset, /block, /source and
 * /stats would either collide outright (/stats is Suzaku's) or bury the useful
 * commands in a list nobody can read.
 */

const COLOR = 0x9b8cf0;

const DENY = {
  empty: "I don't know any words yet. Teach me something with `/tamem teach`.",
  'unknown-word': "I don't know that word. Try something else.",
  'unknown-user': "I don't know that person yet. They need to talk in a channel I can hear first.",
};

const ephemeral = (content) => ({ content, ephemeral: true });

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tamem')
    .setDescription('Talk to Tamem, and look after what he knows')
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName('say')
        .setDescription('Have Tamem say something')
        .addStringOption((o) => o.setName('word').setDescription('Start the sentence with this word'))
        .addUserOption((o) => o.setName('user').setDescription('Talk in this person’s style')),
    )
    .addSubcommand((s) =>
      s
        .setName('tell')
        .setDescription('Say something to Tamem and see what he answers')
        .addStringOption((o) => o.setName('message').setDescription('What to say').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('teach')
        .setDescription(`Teach Tamem a phrase. Costs ${rewards.TEACH_COST} coins`)
        .addStringOption((o) => o.setName('message').setDescription('The phrase').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('learn')
        .setDescription('Read back through this channel and learn from it')
        .addIntegerOption((o) =>
          o.setName('count').setDescription('How many messages. Default 50').setMinValue(1).setMaxValue(200),
        ),
    )
    .addSubcommand((s) => s.setName('stats').setDescription('How much Tamem knows'))
    .addSubcommand((s) => s.setName('words').setDescription('How many words Tamem knows'))
    .addSubcommand((s) =>
      s
        .setName('popular')
        .setDescription('The word pairs Tamem has seen most')
        .addIntegerOption((o) => o.setName('count').setDescription('How many. Default 10').setMinValue(1).setMaxValue(25)),
    )
    .addSubcommand((s) =>
      s
        .setName('source')
        .setDescription('Show which word pairs a sentence could have come from')
        .addStringOption((o) => o.setName('message').setDescription('Something Tamem said').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('status').setDescription('Is Tamem listening in this channel?'))
    .addSubcommand((s) => s.setName('on').setDescription('Let Tamem listen and talk in this channel'))
    .addSubcommand((s) => s.setName('off').setDescription('Stop Tamem in this channel'))
    .addSubcommand((s) =>
      s
        .setName('chance')
        .setDescription('How often Tamem chimes in here, as a percentage')
        .addIntegerOption((o) => o.setName('percent').setDescription('1 to 100').setRequired(true).setMinValue(0).setMaxValue(100)),
    )
    .addSubcommand((s) =>
      s
        .setName('block')
        .setDescription('Stop Tamem ever using a word again')
        .addStringOption((o) => o.setName('word').setDescription('The word').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('For the record')),
    )
    .addSubcommand((s) =>
      s
        .setName('unblock')
        .setDescription('Allow a blocked word again')
        .addStringOption((o) => o.setName('word').setDescription('The word').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('blocklist').setDescription('Every word Tamem may not use'))
    .addSubcommand((s) =>
      s
        .setName('forget')
        .setDescription('Make Tamem forget one word and everything attached to it')
        .addStringOption((o) => o.setName('word').setDescription('The word').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('reset')
        .setDescription('Wipe everything Tamem has ever learned')
        .addStringOption((o) => o.setName('confirm').setDescription('Type: yes I am sure').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('allow')
        .setDescription('Owner: let someone talk to Tamem, and let Tamem learn from them')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
        .addStringOption((o) => o.setName('note').setDescription('Why, for your own records')),
    )
    .addSubcommand((s) =>
      s
        .setName('revoke')
        .setDescription('Owner: take that back')
        .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('allowed').setDescription('Who Tamem is allowed to talk to')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const isOwner = interaction.guild.ownerId === interaction.user.id;

    // Approving someone decides whose words go into the model, so it is the
    // owner's alone — not every admin with Manage Roles. Widen this line if you
    // ever want to delegate it.
    const ownerOnly = ['allow', 'revoke'];
    if (ownerOnly.includes(sub) && !isOwner) {
      return interaction.reply(ephemeral('Only the server owner decides who Tamem listens to.'));
    }

    const staffOnly = ['on', 'off', 'chance', 'block', 'unblock', 'forget', 'reset', 'learn'];
    if (staffOnly.includes(sub) && !settings.isStaff(interaction.member) && !isOwner) {
      return interaction.reply(ephemeral('Only staff can do that.'));
    }

    const needsAccess = ['say', 'tell', 'teach'];
    if (needsAccess.includes(sub) && !settings.canUse(interaction.member)) {
      return interaction.reply(
        ephemeral(
          'Tamem only talks to people the owner has approved. Ask them if you would like to be added — it is not something you can buy.',
        ),
      );
    }

    return handlers[sub](interaction);
  },
};

/**
 * Keeps the visible role in step with the allowlist. Best effort on purpose:
 * the allowlist is what decides access, so a missing role or a bot sitting too
 * low in the list must never be the reason somebody cannot talk to Tamem.
 */
async function syncRole(guild, userId, shouldHave) {
  const role = guild.roles.cache.find((r) => r.name === settings.ACCESS_ROLE);
  if (!role || role.position >= guild.members.me.roles.highest.position) return false;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  if (shouldHave && !member.roles.cache.has(role.id)) {
    return Boolean(await member.roles.add(role, 'Tamem: approved').catch(() => null));
  }
  if (!shouldHave && member.roles.cache.has(role.id)) {
    return Boolean(await member.roles.remove(role, 'Tamem: approval revoked').catch(() => null));
  }
  return false;
}

const handlers = {
  async say(interaction) {
    const word = interaction.options.getString('word');
    const user = interaction.options.getUser('user');

    const out = markov.generate({ start: word, styleUserId: user?.id ?? null });
    if (!out.ok) return interaction.reply(ephemeral(DENY[out.reason] ?? DENY.empty));

    return interaction.reply({
      content: user ? `${out.text}\n-# in the style of ${user.username}` : out.text,
      allowedMentions: { parse: [] },
    });
  },

  async tell(interaction) {
    const said = interaction.options.getString('message');
    const out = markov.replyTo(said);
    if (!out.ok) return interaction.reply(ephemeral(DENY[out.reason] ?? DENY.empty));

    return interaction.reply({
      content: `> ${said.slice(0, 300)}\n${out.text}`,
      allowedMentions: { parse: [] },
    });
  },

  async teach(interaction) {
    const phrase = interaction.options.getString('message').trim();
    if (!phrase) return interaction.reply(ephemeral("I can't learn an empty message."));

    if (!rewards.chargeTeaching(interaction.guildId, interaction.user.id)) {
      return interaction.reply(
        ephemeral(
          `Teaching me costs ${rewards.TEACH_COST} coins and you have ${rewards.balanceOf(interaction.guildId, interaction.user.id)}.`,
        ),
      );
    }

    const pairs = markov.learn(phrase, interaction.user.id);
    if (!pairs) {
      // Nothing survived the filter, so give the coins back rather than charge
      // for a lesson that did not happen.
      require('../../lib/kenopsia/economy').addCoins(interaction.guildId, interaction.user.id, rewards.TEACH_COST);
      return interaction.reply(ephemeral('There was nothing in there I could learn. Your coins are untouched.'));
    }

    const note = await rewards.onTaught(interaction.member);
    return interaction.reply({
      content: [`Learned it — ${pairs} new connection(s). That cost ${rewards.TEACH_COST} coins.`, note]
        .filter(Boolean)
        .join('\n'),
      ephemeral: true,
    });
  },

  async learn(interaction) {
    const count = interaction.options.getInteger('count') ?? 50;
    await interaction.deferReply({ ephemeral: true });

    const messages = await interaction.channel.messages.fetch({ limit: count }).catch(() => null);
    if (!messages) return interaction.editReply('I could not read this channel.');

    const config = settings.all();
    let read = 0;
    let pairs = 0;
    let skipped = 0;

    for (const message of messages.values()) {
      if (require('../lib/clean').rejects(message, config)) continue;
      // Same gate as the live handler: only approved people are ever read.
      // Reading back through history is exactly where it would be easiest to
      // sweep up everyone else by accident.
      if (!settings.isApproved(message.author.id)) {
        skipped += 1;
        continue;
      }
      const learned = markov.learn(message.content, message.author.id);
      if (learned) {
        pairs += learned;
        read += 1;
      }
    }

    const { words } = markov.stats();
    return interaction.editReply(
      [
        `Read ${read} message(s) and learned ${pairs} connection(s). I know ${words} words now.`,
        skipped ? `Skipped ${skipped} from people who are not approved.` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },

  async stats(interaction) {
    const s = markov.stats();
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('What Tamem knows')
      .addFields(
        { name: 'Words', value: s.words.toLocaleString('en-US'), inline: true },
        { name: 'Connections', value: s.pairs.toLocaleString('en-US'), inline: true },
        { name: 'Messages read', value: s.messages.toLocaleString('en-US'), inline: true },
        { name: 'Blocked words', value: String(s.blocked), inline: true },
        { name: 'Memory on disk', value: `${(s.bytes / 1e6).toFixed(1)} MB`, inline: true },
        { name: 'Channels', value: String(settings.enabledChannels().length), inline: true },
      )
      .setFooter({ text: 'Everything here was learned from this server. Nothing leaves it.' });

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async words(interaction) {
    const { words } = markov.stats();
    return interaction.reply(ephemeral(`I know **${words.toLocaleString('en-US')}** words.`));
  },

  async popular(interaction) {
    const rows = markov.popular(interaction.options.getInteger('count') ?? 10);
    if (!rows.length) return interaction.reply(ephemeral(DENY.empty));

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle('Words that go together most')
          .setDescription(rows.map((r, i) => `${i + 1}. \`${r.prev_word} ${r.next_word}\` — ${r.count}×`).join('\n')),
      ],
      ephemeral: true,
    });
  },

  async source(interaction) {
    const rows = markov.trace(interaction.options.getString('message'));
    if (!rows.length) return interaction.reply(ephemeral('There are no word pairs in that.'));

    const known = rows.filter((r) => r.count > 0);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle('Where that came from')
          .setDescription(rows.map((r) => `\`${r.pair}\` — ${r.count ? `seen ${r.count}×` : 'never seen'}`).join('\n').slice(0, 3800))
          .setFooter({ text: `${known.length} of ${rows.length} pairs are mine.` }),
      ],
      ephemeral: true,
    });
  },

  async status(interaction) {
    const channel = settings.channel(interaction.channelId);
    const yours = settings.canUse(interaction.member);
    return interaction.reply(
      ephemeral(
        [
          channel.enabled
            ? `I am switched on in this channel and chime in about **${channel.chance}%** of the time.`
            : 'I am not active in this channel. Staff can switch me on with `/tamem on`.',
          yours
            ? 'You are approved, so I read what you say here and I will answer you.'
            : 'You are not approved, so I do not read your messages and I will not answer you. The owner adds people by hand — it is not something you can buy.',
          `${settings.approved().length} people are approved.`,
        ].join('\n'),
      ),
    );
  },

  async on(interaction) {
    const state = settings.setChannel(interaction.channelId, { enabled: true });
    const count = settings.approved().length;
    return interaction.reply(
      [
        `I am switched on here and will say something about ${state.chance}% of the time.`,
        count
          ? `I only read and answer the ${count} approved people — everyone else in this channel is invisible to me.`
          : 'Nobody is approved yet, so I will not read or answer anyone. The owner adds people with `/tamem allow`.',
      ].join('\n'),
    );
  },

  async off(interaction) {
    settings.setChannel(interaction.channelId, { enabled: false });
    return interaction.reply('I have stopped listening in this channel.');
  },

  async chance(interaction) {
    const percent = interaction.options.getInteger('percent');
    const state = settings.setChannel(interaction.channelId, { chance: percent });
    return interaction.reply(`I will chime in about **${state.chance}%** of the time here.`);
  },

  async block(interaction) {
    const word = interaction.options.getString('word');
    const added = markov.block(word, interaction.options.getString('reason'));
    return interaction.reply(
      ephemeral(added ? `Blocked \`${word}\`, and taken it back out of everything I had learned.` : 'That word is already blocked.'),
    );
  },

  async unblock(interaction) {
    const word = interaction.options.getString('word');
    const removed = markov.unblock(word);
    return interaction.reply(
      ephemeral(removed ? `Unblocked \`${word}\`. I will only use it once I hear it again.` : 'That word is not blocked.'),
    );
  },

  async blocklist(interaction) {
    const rows = markov.blocklist();
    return interaction.reply(
      ephemeral(
        rows.length
          ? `Blocked words:\n${rows.map((r) => `\`${r.word}\`${r.reason ? ` — ${r.reason}` : ''}`).join('\n')}`.slice(0, 1900)
          : 'Nothing is blocked.',
      ),
    );
  },

  async forget(interaction) {
    const word = interaction.options.getString('word');
    const knew = markov.forget(word);
    return interaction.reply(ephemeral(knew ? `Forgotten: \`${word}\`.` : `I did not know \`${word}\` anyway.`));
  },

  async allow(interaction) {
    const user = interaction.options.getUser('user');
    if (user.bot) return interaction.reply(ephemeral('Tamem learning from another bot would only teach him to sound like one.'));

    const added = settings.approve(user.id, interaction.user.id, interaction.options.getString('note'));
    if (!added) return interaction.reply(ephemeral(`${user.username} is already approved.`));

    const roled = await syncRole(interaction.guild, user.id, true);
    await interaction.reply(
      ephemeral(
        [
          `${user} can talk to Tamem now, and Tamem will learn from what they say in the channels he listens to.`,
          roled ? `Given the **${settings.ACCESS_ROLE}** role too, so everyone can see.` : `I could not give them the **${settings.ACCESS_ROLE}** role, but that role is only for show — their access works either way.`,
        ].join('\n'),
      ),
    );

    await user
      .send(
        'The owner has approved you to talk to **Tamem** on Kenopsia. He will answer you in the channels he is switched on in, and he will learn from what you say there. `/tamem status` shows where.',
      )
      .catch(() => {});
    return undefined;
  },

  async revoke(interaction) {
    const user = interaction.options.getUser('user');
    const removed = settings.revoke(user.id);
    if (!removed) return interaction.reply(ephemeral(`${user.username} was not on the list.`));

    await syncRole(interaction.guild, user.id, false);
    return interaction.reply(
      ephemeral(
        `${user} can no longer talk to Tamem and he will stop learning from them.\nWhat he already learned from them is still in the model — use \`/tamem forget\` for a specific word, or \`/tamem reset\` to start over.`,
      ),
    );
  },

  async allowed(interaction) {
    const rows = settings.approved();
    if (!rows.length) {
      return interaction.reply(
        ephemeral('Nobody is approved yet, so Tamem is not reading or answering anyone. Add someone with `/tamem allow`.'),
      );
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR)
          .setTitle('Tamem may talk to')
          .setDescription(
            rows
              .map((r) => `<@${r.user_id}>${r.note ? ` — ${r.note}` : ''}`)
              .join('\n')
              .slice(0, 3800),
          )
          .setFooter({ text: `${rows.length} approved · only these people are read or answered` }),
      ],
      ephemeral: true,
    });
  },

  async reset(interaction) {
    if (interaction.options.getString('confirm') !== 'yes I am sure') {
      return interaction.reply(ephemeral('That wipes everything Tamem has learned and cannot be undone. Type exactly `yes I am sure` to go through with it.'));
    }
    const before = markov.stats();
    markov.reset();
    return interaction.reply(`Tamem's memory has been reset. ${before.words.toLocaleString('en-US')} words are gone.`);
  },
};
