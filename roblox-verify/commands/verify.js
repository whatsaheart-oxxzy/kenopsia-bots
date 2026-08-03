'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} = require('discord.js');
const roblox = require('../lib/roblox');
const store = require('../lib/store');

const VERIFIED_ROLE = 'Roblox Verified';
const CODE_TTL_MS = 15 * 60_000;
const MIN_ACCOUNT_AGE_DAYS = 7;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Link your Roblox account. Needed for the marketplace.')
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName('username')
        .setDescription('Your Roblox username, exactly as it is spelled')
        .setRequired(true)
        .setMaxLength(40),
    ),

  async execute(interaction) {
    const username = interaction.options.getString('username').trim();
    await interaction.deferReply({ ephemeral: true });

    const existing = store.getLink(interaction.guildId, interaction.user.id);
    if (existing) {
      return interaction.editReply(
        `You are already verified as **${existing.robloxName}**. Use \`/unverify\` first if you want to switch accounts.`,
      );
    }

    let user;
    try {
      user = await roblox.findUser(username);
    } catch {
      return interaction.editReply('Roblox is not answering right now. Try again in a minute.');
    }
    if (!user) {
      return interaction.editReply(
        `Roblox has no user called **${username}**. Check the spelling — it is the username, not the display name.`,
      );
    }

    const taken = store.findByRobloxId(interaction.guildId, user.id);
    if (taken && taken.userId !== interaction.user.id) {
      return interaction.editReply(
        'That Roblox account is already linked to another member here. If it is really yours, tell a moderator.',
      );
    }

    const code = roblox.makeCode();
    store.setPending(interaction.guildId, interaction.user.id, {
      robloxId: user.id,
      robloxName: user.name,
      code,
      expires: Date.now() + CODE_TTL_MS,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('verify:check').setLabel('I added the code').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('verify:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      content: [
        `**Linking ${user.name}**`,
        '',
        'Three steps, one minute:',
        `1. Open your profile: ${roblox.profileUrl(user.id)}`,
        '2. Click the pencil next to your name, and paste this code anywhere into your About text:',
        `\`\`\`${code}\`\`\``,
        '3. Save it, then come back and press the button below.',
        '',
        'You can delete the code from your profile again right after. The code works for 15 minutes and only for you.',
      ].join('\n'),
      components: [row],
    });
  },

  /** Handles both buttons from the message above. */
  async handleButton(interaction) {
    const action = interaction.customId.split(':')[1];

    if (action === 'cancel') {
      store.clearPending(interaction.guildId, interaction.user.id);
      return interaction.update({ content: 'Cancelled. Nothing was saved.', components: [] });
    }

    await interaction.deferUpdate();
    const pending = store.getPending(interaction.guildId, interaction.user.id);
    if (!pending) {
      return interaction.editReply({
        content: 'That code expired. Run `/verify` again to get a new one.',
        components: [],
      });
    }

    let profile;
    try {
      profile = await roblox.getUser(pending.robloxId);
    } catch {
      return interaction.editReply({
        content: 'Roblox is not answering right now. Press the button again in a minute.',
        components: [],
      });
    }

    if (!profile.description.includes(pending.code)) {
      return interaction.editReply({
        content: [
          'I could not find the code in your profile description yet.',
          '',
          'Two things people usually miss: Roblox needs a moment after saving, and the code has to be in the **About** text of the profile, not in a status or a group description.',
          '',
          `Code: \`${pending.code}\``,
          'Press the button again once it is saved.',
        ].join('\n'),
        components: interaction.message.components,
      });
    }

    const ageDays = roblox.accountAgeDays(profile.created);
    if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
      store.clearPending(interaction.guildId, interaction.user.id);
      return interaction.editReply({
        content: `That account is ${ageDays} days old. We only verify accounts older than ${MIN_ACCOUNT_AGE_DAYS} days, because throwaway accounts are how scams start. Come back in a few days.`,
        components: [],
      });
    }

    store.clearPending(interaction.guildId, interaction.user.id);
    store.setLink(interaction.guildId, interaction.user.id, {
      robloxId: profile.id,
      robloxName: profile.name,
      displayName: profile.displayName,
    });

    const role = interaction.guild.roles.cache.find((r) => r.name === VERIFIED_ROLE);
    let roleNote = '';
    if (!role) {
      roleNote = `\n\nThe **${VERIFIED_ROLE}** role does not exist on this server yet. Tell an admin to run \`/kenopsia setup\`.`;
    } else if (role.position >= interaction.guild.members.me.roles.highest.position) {
      roleNote = `\n\nI cannot hand out **${VERIFIED_ROLE}** because my role sits below it. Tell an admin.`;
    } else {
      await interaction.member.roles.add(role, `Verified as ${profile.name}`).catch(() => {});
    }

    await interaction.editReply({
      content: [
        `**Verified as ${profile.name}.**`,
        '',
        'You can remove the code from your profile now.',
        'The marketplace opens for you at level 10. Your Roblox name is shown in the marketplace and in looking-for-play, nowhere else.',
        roleNote,
      ]
        .join('\n')
        .trim(),
      components: [],
    });
  },
};
