'use strict';

const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const { ROLES, CATEGORIES, STAFF_ROLES, AUTOMOD_RULES, rolesFrom } = require('./blueprint');
const { SEEDS } = require('./content');

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcement: ChannelType.GuildAnnouncement,
};

const P = PermissionFlagsBits;

/** Announcement and forum channels only exist on Community-enabled servers. */
function resolveType(spec, isCommunity) {
  if (!isCommunity && (spec.type === 'forum' || spec.type === 'announcement')) {
    return { type: ChannelType.GuildText, downgraded: true };
  }
  return { type: CHANNEL_TYPES[spec.type] ?? ChannelType.GuildText, downgraded: false };
}

const roleId = (guild, name) => guild.roles.cache.find((r) => r.name === name)?.id;

async function ensureRoles(guild, reason, log) {
  for (const spec of ROLES) {
    if (guild.roles.cache.some((r) => r.name === spec.name)) continue;
    const role = await guild.roles.create({
      name: spec.name,
      color: spec.color,
      hoist: spec.hoist ?? false,
      mentionable: false,
      permissions: (spec.permissions ?? []).map((p) => P[p]),
      reason,
    });
    log.rolesCreated.push(role.name);
  }

  // Blueprint order, top to bottom, as far as the bot's own position allows.
  try {
    const me = guild.members.me;
    const base = Math.max(1, me.roles.highest.position - ROLES.length - 1);
    await guild.roles.setPositions(
      ROLES.map((spec, i) => ({ role: roleId(guild, spec.name), position: base + (ROLES.length - i) })).filter(
        (p) => p.role,
      ),
    );
  } catch {
    log.warnings.push('Could not order the roles. Drag the bot role above every Kenopsia role, then run setup again.');
  }

  // Nobody but staff should be able to ping the whole server.
  try {
    await guild.roles.everyone.setPermissions(
      guild.roles.everyone.permissions.remove(P.MentionEveryone),
      reason,
    );
  } catch {
    log.warnings.push('Could not take @everyone mention rights away from the everyone role.');
  }
}

/** Overwrites shared by a category and its channels. */
function overwritesFor(guild, spec) {
  const list = [];

  if (spec.minRole) {
    const allowed = [...rolesFrom(spec.minRole), ...STAFF_ROLES];
    list.push({ id: guild.roles.everyone.id, deny: [P.ViewChannel] });
    for (const name of new Set(allowed)) {
      const id = roleId(guild, name);
      if (id) list.push({ id, allow: [P.ViewChannel, P.Connect] });
    }
  }

  // A channel hidden by minRole is hidden from bots as well — a bot sits in
  // @everyone like anyone else. Marked channels hand the server's own bots their
  // view back, so a bot can work in the channel it exists for. Opt-in per
  // channel on purpose: this must never quietly reach a staff channel.
  //
  // tags.botId, not role.managed: the Nitro booster role is managed too, and
  // matching on that would let every booster into the marketplace.
  if (spec.minRole && spec.allowBots) {
    for (const role of guild.roles.cache.values()) {
      if (role.tags?.botId) {
        list.push({ id: role.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] });
      }
    }
  }

  if (spec.readOnly) {
    list.push({ id: guild.roles.everyone.id, deny: [P.SendMessages] });
    for (const name of STAFF_ROLES) {
      const id = roleId(guild, name);
      if (id) list.push({ id, allow: [P.SendMessages] });
    }
  }

  if (spec.noReactions) {
    list.push({ id: guild.roles.everyone.id, deny: [P.AddReactions] });
  }

  // First ten minutes: read everything, post only in introductions.
  const newMember = roleId(guild, 'New Member');
  if (newMember && spec.noNew) {
    list.push({
      id: newMember,
      deny: [P.SendMessages, P.EmbedLinks, P.AttachFiles, P.CreatePublicThreads, P.AddReactions],
    });
  }

  // Merge entries for the same role so Discord gets one overwrite per id.
  const merged = new Map();
  for (const entry of list) {
    const current = merged.get(entry.id) ?? { id: entry.id, allow: [], deny: [] };
    current.allow.push(...(entry.allow ?? []));
    current.deny.push(...(entry.deny ?? []));
    merged.set(entry.id, current);
  }
  return [...merged.values()];
}

async function seedChannel(channel, log) {
  const seed = SEEDS[channel.name];
  if (!seed) return;

  try {
    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({ name: seed.thread ?? channel.name, message: { content: seed.content } });
    } else {
      const message = await channel.send(seed.content);
      if (seed.pin) await message.pin().catch(() => {});
    }
    log.seeded.push(channel.name);
  } catch (err) {
    log.warnings.push(`Opening post for #${channel.name} failed: ${err.message}`);
  }
}

/**
 * Takes over a channel that already existed under one of our names — Discord's
 * own Community setup creates #rules and #general before we ever run. Moves it
 * into the right category, applies the permissions and writes the opening post
 * if the channel has none from us yet. Member messages are never touched.
 */
async function adoptChannel(channel, category, spec, guild, reason, log) {
  try {
    if (channel.parentId !== category.id) {
      await channel.setParent(category.id, { lockPermissions: false, reason });
      log.adopted.push(`#${channel.name} moved into ${category.name}`);
    }

    for (const overwrite of overwritesFor(guild, spec)) {
      await channel.permissionOverwrites.edit(
        overwrite.id,
        {
          ...Object.fromEntries((overwrite.allow ?? []).map((p) => [String(p), true])),
          ...Object.fromEntries((overwrite.deny ?? []).map((p) => [String(p), false])),
        },
        { reason },
      );
    }

    if (spec.topic && channel.type === ChannelType.GuildText && !channel.topic) {
      await channel.setTopic(spec.topic, reason).catch(() => {});
    }

    // Only seed when we have not written here before, so re-runs stay quiet.
    if (SEEDS[channel.name] && channel.isTextBased()) {
      const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      const mine = recent?.some((m) => m.author.id === guild.client.user.id);
      if (!mine) await seedChannel(channel, log);
    }
  } catch (err) {
    log.warnings.push(`Could not take over #${channel.name}: ${err.message}`);
  }
}

async function ensureChannels(guild, reason, log) {
  const isCommunity = guild.features.includes('COMMUNITY');

  for (const categorySpec of CATEGORIES) {
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categorySpec.name,
    );

    if (!category) {
      category = await guild.channels.create({
        name: categorySpec.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: overwritesFor(guild, categorySpec),
        reason,
      });
      log.categoriesCreated.push(category.name);
    }

    for (const spec of categorySpec.channels) {
      const clash = guild.channels.cache.find(
        (c) => c.name === spec.name && c.type !== ChannelType.GuildCategory,
      );
      if (clash) {
        await adoptChannel(clash, category, spec, guild, reason, log);
        continue;
      }

      const { type, downgraded } = resolveType(spec, isCommunity);
      if (downgraded) {
        log.warnings.push(
          `#${spec.name} was created as a plain text channel. ${spec.type} channels need Community mode.`,
        );
      }

      const overwrites = overwritesFor(guild, spec);
      // Introductions is the one place a brand new member may post.
      if (spec.name === 'introductions') {
        const newMember = roleId(guild, 'New Member');
        if (newMember) overwrites.push({ id: newMember, allow: [P.SendMessages] });
      }

      const isTextLike = type === ChannelType.GuildText || type === ChannelType.GuildForum;
      const channel = await guild.channels.create({
        name: spec.name,
        type,
        parent: category.id,
        topic: isTextLike ? spec.topic : undefined,
        userLimit: spec.userLimit,
        permissionOverwrites: overwrites.length ? overwrites : undefined,
        reason,
      });
      log.channelsCreated.push(channel.name);

      if (spec.afk) {
        await guild.setAFKChannel(channel, reason).catch(() => {});
        await guild.setAFKTimeout(300, reason).catch(() => {});
      }

      await seedChannel(channel, log);
    }
  }
}

async function ensureAutoMod(guild, reason, log) {
  let existing;
  try {
    existing = await guild.autoModerationRules.fetch();
  } catch {
    log.warnings.push('Could not read AutoMod rules. Is "Manage Server" missing?');
    return;
  }

  const exemptRoles = STAFF_ROLES.map((name) => roleId(guild, name)).filter(Boolean);

  for (const rule of AUTOMOD_RULES) {
    if (existing.some((r) => r.name === rule.name)) continue;

    const actions = [{ type: AutoModerationActionType.BlockMessage }];
    // Timeout is only valid on keyword-style triggers, not on the spam filter.
    if (rule.timeoutSeconds) {
      actions.push({ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: rule.timeoutSeconds } });
    }

    const shape = {
      spam: { triggerType: AutoModerationRuleTriggerType.Spam },
      keywordPreset: {
        triggerType: AutoModerationRuleTriggerType.KeywordPreset,
        triggerMetadata: {
          presets: [
            AutoModerationRuleKeywordPresetType.Profanity,
            AutoModerationRuleKeywordPresetType.SexualContent,
            AutoModerationRuleKeywordPresetType.Slurs,
          ],
        },
      },
      mentionSpam: {
        triggerType: AutoModerationRuleTriggerType.MentionSpam,
        triggerMetadata: { mentionTotalLimit: rule.mentionLimit },
      },
      keyword: {
        triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: rule.keywords },
      },
    }[rule.key];

    try {
      await guild.autoModerationRules.create({
        name: rule.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        enabled: true,
        actions,
        exemptRoles,
        reason,
        ...shape,
      });
      log.automodCreated.push(rule.name);
    } catch (err) {
      log.warnings.push(`AutoMod "${rule.name}" failed: ${err.message}`);
    }
  }
}

/** Builds the server. Safe to re-run: anything already there by name is kept. */
async function buildServer(guild, reason) {
  const log = {
    rolesCreated: [],
    categoriesCreated: [],
    channelsCreated: [],
    adopted: [],
    seeded: [],
    automodCreated: [],
    warnings: [],
  };

  if (guild.name !== 'Kenopsia') {
    await guild
      .setName('Kenopsia', reason)
      .then(() => log.renamed = true)
      .catch((err) => log.warnings.push(`Could not rename the server: ${err.message}`));
  }

  await ensureRoles(guild, reason, log);
  await ensureChannels(guild, reason, log);
  await ensureAutoMod(guild, reason, log);
  return log;
}

/** Rewrites the bot's own opening posts after the text changed. */
async function refreshServer(guild) {
  const log = { seeded: [], warnings: [] };

  for (const name of Object.keys(SEEDS)) {
    const channel = guild.channels.cache.find((c) => c.name === name);
    if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) continue;

    try {
      const recent = await channel.messages.fetch({ limit: 50 });
      const mine = recent.filter((m) => m.author.id === guild.client.user.id);
      const fresh = mine.filter((m) => Date.now() - m.createdTimestamp < 13 * 86_400_000);
      if (fresh.size) await channel.bulkDelete(fresh, true).catch(() => {});
      for (const message of mine.filter((m) => !fresh.has(m.id)).values()) {
        await message.delete().catch(() => {});
      }
      await seedChannel(channel, log);
    } catch (err) {
      log.warnings.push(`Could not refresh #${name}: ${err.message}`);
    }
  }
  return log;
}

// Everything the old Project ECHO build created, for the cleanup command.
const LEGACY = {
  categories: ['THE ECHO CHAMBER', 'THE LIVING WORLD', 'THE COLLECTIVE', 'THE VOID'],
  channels: [
    'the-awakening', 'identity', 'genesis', 'echo-chronicles', 'questions', 'the-marketplace',
    'the-arena', 'the-forge', 'the-oracle', 'the-hearth', 'the-council', 'the-archives',
    'echo-events', 'the-lounge', 'void-gate', 'void-challenges', 'void-voice',
  ],
  roles: [
    'Echo Architect', 'Echo Warden', 'Echo Champion', 'Initiate', 'Adept', 'Master', 'Elder', 'Legend',
    'Karmesin', 'Bernstein', 'Zyan', 'Kobalt', 'Kupfer', 'Asche', 'Magenta', 'Amethyst', 'Jade', 'Mint',
  ],
  automod: ['ECHO Gatekeeper — Spam', 'ECHO Gatekeeper — Language', 'ECHO Gatekeeper — Mention Raid'],
};

/**
 * Removes the old Project ECHO structure. Only touches names that build
 * created, and never a name Kenopsia uses too, so nothing new is lost.
 */
async function cleanupLegacy(guild, reason) {
  const log = { removed: [], warnings: [] };
  const keep = new Set([
    ...ROLES.map((r) => r.name),
    ...CATEGORIES.flatMap((c) => [c.name, ...c.channels.map((ch) => ch.name)]),
  ]);

  for (const name of [...LEGACY.channels, ...LEGACY.categories]) {
    if (keep.has(name)) continue;
    for (const channel of guild.channels.cache.filter((c) => c.name === name).values()) {
      await channel
        .delete(reason)
        .then(() => log.removed.push(`#${name}`))
        .catch((err) => log.warnings.push(`#${name}: ${err.message}`));
    }
  }

  for (const name of LEGACY.roles) {
    if (keep.has(name)) continue;
    const role = guild.roles.cache.find((r) => r.name === name);
    if (!role) continue;
    await role
      .delete(reason)
      .then(() => log.removed.push(`@${name}`))
      .catch((err) => log.warnings.push(`@${name}: ${err.message}`));
  }

  const rules = await guild.autoModerationRules.fetch().catch(() => null);
  if (rules) {
    for (const rule of rules.filter((r) => LEGACY.automod.includes(r.name)).values()) {
      await rule
        .delete(reason)
        .then(() => log.removed.push(`AutoMod ${rule.name}`))
        .catch(() => {});
    }
  }

  return log;
}

module.exports = { buildServer, refreshServer, cleanupLegacy, LEGACY };
