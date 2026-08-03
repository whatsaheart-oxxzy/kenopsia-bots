'use strict';

const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const {
  ROLES,
  CATEGORIES,
  CHANNELS,
  COLOR_ROLES,
  STAFF_ROLES,
  AUTOMOD_RULES,
  levelsFrom,
} = require('./blueprint');
const { SEEDS } = require('./content');
const colors = require('./colors');

const CHANNEL_TYPES = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  forum: ChannelType.GuildForum,
  announcement: ChannelType.GuildAnnouncement,
};

/** Forum and announcement channels only exist on Community-enabled servers. */
function resolveType(spec, isCommunity) {
  if (!isCommunity && (spec.type === 'forum' || spec.type === 'announcement')) {
    return { type: ChannelType.GuildText, downgraded: true };
  }
  return { type: CHANNEL_TYPES[spec.type] ?? ChannelType.GuildText, downgraded: false };
}

async function ensureRoles(guild, reason, log) {
  const byName = new Map();

  for (const spec of ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === spec.name);
    if (existing) {
      byName.set(spec.name, existing);
      continue;
    }
    const role = await guild.roles.create({
      name: spec.name,
      color: spec.color,
      hoist: spec.hoist ?? false,
      mentionable: false,
      permissions: (spec.permissions ?? []).map((p) => PermissionFlagsBits[p]),
      reason,
    });
    byName.set(spec.name, role);
    log.rolesCreated.push(role.name);
  }

  // Newly created roles all land at the bottom; push them back into blueprint
  // order. Anything above the bot's own role is rejected — that's expected.
  try {
    const me = guild.members.me;
    const base = Math.max(1, me.roles.highest.position - ROLES.length - 1);
    await guild.roles.setPositions(
      ROLES.map((spec, i) => ({
        role: byName.get(spec.name).id,
        position: base + (ROLES.length - i),
      })).filter((p) => p.role),
    );
  } catch {
    log.warnings.push(
      'Could not set the role order. The bot role must sit above all ECHO roles.',
    );
  }

  return byName;
}

/** @everyone denied, staff + the listed level roles allowed to see the channel. */
function gatedOverwrites(guild, roles, minLevel) {
  const allowed = [...levelsFrom(minLevel), ...STAFF_ROLES];
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    ...allowed
      .map((name) => roles.get(name))
      .filter(Boolean)
      .map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
  ];
}

/** Everyone reads, only staff writes. */
function readOnlyOverwrites(guild, roles) {
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
    ...STAFF_ROLES.map((name) => roles.get(name))
      .filter(Boolean)
      .map((role) => ({ id: role.id, allow: [PermissionFlagsBits.SendMessages] })),
  ];
}

/**
 * Writes the channel's opening post. Forums can't take a plain message, so
 * they get a starter thread instead. Runs only for freshly created channels,
 * so re-running setup never duplicates anything.
 */
async function seedChannel(channel, log) {
  const seed = SEEDS[channel.name];

  try {
    if (channel.name === CHANNELS.identity) {
      const picker = await channel.send(colors.buildPicker());
      await picker.pin().catch(() => {});
      log.seeded.push(channel.name);
      return;
    }

    if (!seed) return;

    if (channel.type === ChannelType.GuildForum) {
      await channel.threads.create({
        name: seed.thread ?? channel.name,
        message: { content: seed.content },
      });
    } else {
      const message = await channel.send(seed.content);
      if (seed.pin) await message.pin().catch(() => {});
    }
    log.seeded.push(channel.name);
  } catch (err) {
    log.warnings.push(`Opening post for #${channel.name} failed: ${err.message}`);
  }
}

async function ensureChannels(guild, roles, reason, log) {
  const isCommunity = guild.features.includes('COMMUNITY');

  for (const categorySpec of CATEGORIES) {
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categorySpec.name,
    );

    if (!category) {
      category = await guild.channels.create({
        name: categorySpec.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: categorySpec.minLevel
          ? gatedOverwrites(guild, roles, categorySpec.minLevel)
          : undefined,
        reason,
      });
      log.categoriesCreated.push(category.name);
    }

    for (const spec of categorySpec.channels) {
      // Match by name across the whole guild, not just this category: Discord's
      // own Community setup creates a #rules channel elsewhere, and a second
      // one with the same name only confuses members.
      const clash = guild.channels.cache.find((c) => c.name === spec.name);
      if (clash) {
        if (clash.parentId !== category.id) {
          log.warnings.push(
            `#${spec.name} already exists outside ${categorySpec.name} — left it alone. Move or rename it if you want it in the category.`,
          );
        }
        continue;
      }

      const { type, downgraded } = resolveType(spec, isCommunity);
      if (downgraded) {
        log.warnings.push(
          `#${spec.name} was created as a text channel. A ${spec.type} channel needs Community mode (Server Settings > Enable Community).`,
        );
      }

      const isTextLike = type === ChannelType.GuildText || type === ChannelType.GuildForum;
      const channel = await guild.channels.create({
        name: spec.name,
        type,
        parent: category.id,
        topic: isTextLike ? spec.topic : undefined,
        permissionOverwrites: spec.readOnly ? readOnlyOverwrites(guild, roles) : undefined,
        reason,
      });
      log.channelsCreated.push(channel.name);
      await seedChannel(channel, log);
    }
  }
}

async function ensureAutoMod(guild, reason, log) {
  let existing;
  try {
    existing = await guild.autoModerationRules.fetch();
  } catch {
    log.warnings.push('Could not read the AutoMod rules. Is "Manage Server" missing?');
    return;
  }

  for (const rule of AUTOMOD_RULES) {
    if (existing.some((r) => r.name === rule.name)) continue;

    const actions = [{ type: AutoModerationActionType.BlockMessage }];
    // Timeouts are only valid on keyword-style triggers, not on the spam filter.
    if (rule.timeoutSeconds) {
      actions.push({
        type: AutoModerationActionType.Timeout,
        metadata: { durationSeconds: rule.timeoutSeconds },
      });
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
    }[rule.key];

    try {
      await guild.autoModerationRules.create({
        name: rule.name,
        eventType: AutoModerationRuleEventType.MessageSend,
        enabled: true,
        actions,
        exemptRoles: STAFF_ROLES.map((name) => guild.roles.cache.find((r) => r.name === name)?.id).filter(
          Boolean,
        ),
        reason,
        ...shape,
      });
      log.automodCreated.push(rule.name);
    } catch (err) {
      log.warnings.push(`AutoMod "${rule.name}" failed: ${err.message}`);
    }
  }
}

/**
 * Builds the whole Project ECHO structure. Safe to re-run: anything that
 * already exists by name is left untouched.
 */
async function buildServer(guild, reason) {
  const log = {
    rolesCreated: [],
    categoriesCreated: [],
    channelsCreated: [],
    automodCreated: [],
    seeded: [],
    warnings: [],
  };

  const roles = await ensureRoles(guild, reason, log);
  await ensureChannels(guild, roles, reason, log);
  await ensureAutoMod(guild, reason, log);

  return log;
}

/**
 * Renames colour roles that still carry an old name. Matched by colour value,
 * so members keep the role they already wear — no role is deleted or reassigned.
 */
async function renameColorRoles(guild, reason, log) {
  const wanted = new Set(COLOR_ROLES.map((c) => c.name));

  for (const spec of COLOR_ROLES) {
    if (guild.roles.cache.some((r) => r.name === spec.name)) continue;

    const stale = guild.roles.cache.find((r) => r.color === spec.color && !wanted.has(r.name));
    if (!stale) continue;

    try {
      const old = stale.name;
      await stale.setName(spec.name, reason);
      log.renamed.push(`${old} -> ${spec.name}`);
    } catch (err) {
      log.warnings.push(`Could not rename role ${stale.name}: ${err.message}`);
    }
  }
}

/**
 * Replaces the bot's own opening posts with the current text. Used after the
 * content changed — for example when the server switched language.
 */
async function reseedChannels(guild, log) {
  const targets = [...Object.keys(SEEDS), CHANNELS.identity];

  for (const name of new Set(targets)) {
    const channel = guild.channels.cache.find((c) => c.name === name);
    if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) continue;

    try {
      const recent = await channel.messages.fetch({ limit: 50 });
      const mine = recent.filter((m) => m.author.id === guild.client.user.id);
      // bulkDelete only works on messages younger than 14 days; older ones are
      // removed one by one so a long-running server still ends up clean.
      const fresh = mine.filter((m) => Date.now() - m.createdTimestamp < 13 * 86_400_000);
      const old = mine.filter((m) => !fresh.has(m.id));
      if (fresh.size) await channel.bulkDelete(fresh, true).catch(() => {});
      for (const message of old.values()) await message.delete().catch(() => {});

      await seedChannel(channel, log);
    } catch (err) {
      log.warnings.push(`Could not refresh #${name}: ${err.message}`);
    }
  }
}

/**
 * Brings an already-built server up to date with the current blueprint:
 * renames colour roles and rewrites every opening post. Forum starter threads
 * are left alone — deleting a thread would delete member replies with it.
 */
async function refreshServer(guild, reason) {
  const log = { renamed: [], seeded: [], warnings: [] };
  await renameColorRoles(guild, reason, log);
  await reseedChannels(guild, log);
  return log;
}

module.exports = { buildServer, refreshServer };
