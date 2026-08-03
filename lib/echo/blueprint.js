'use strict';

/**
 * The Project ECHO server blueprint: roles, categories, channels and AutoMod
 * rules. Everything the /echo setup command builds is described here, so the
 * structure can be reviewed and tweaked without touching the build logic.
 */

// Ordered from lowest to highest. `points` is the threshold to reach the level.
const LEVELS = [
  { name: 'Initiate', points: 0, color: 0x9aa0a6 },
  { name: 'Adept', points: 250, color: 0x4ecdc4 },
  { name: 'Master', points: 1000, color: 0x5865f2 },
  { name: 'Elder', points: 3000, color: 0xb14aed },
  { name: 'Legend', points: 8000, color: 0xffb020 },
];

const STAFF_ROLES = ['Echo Architect', 'Echo Warden'];

/**
 * Self-service name colours. They sit above the level roles so a chosen colour
 * actually wins — Discord shows the colour of the highest coloured role.
 * Never hoisted: they change the name colour, not the member list grouping.
 */
const COLOR_ROLES = [
  { name: 'Crimson', color: 0xe0364f },
  { name: 'Amber', color: 0xf59f00 },
  { name: 'Jade', color: 0x27c98a },
  { name: 'Cyan', color: 0x22c4e0 },
  { name: 'Cobalt', color: 0x3b6ef0 },
  { name: 'Amethyst', color: 0x9b59f0 },
  { name: 'Magenta', color: 0xf055c0 },
  { name: 'Copper', color: 0xc9743a },
  { name: 'Mint', color: 0x7ef0c0 },
  { name: 'Ash', color: 0x9aa4b0 },
];

const ROLES = [
  // Staff first — they end up highest in the list after the position pass.
  {
    name: 'Echo Architect',
    color: 0xff2e88,
    hoist: true,
    permissions: ['ManageChannels', 'ManageRoles', 'ManageMessages', 'ModerateMembers'],
  },
  {
    name: 'Echo Warden',
    color: 0x00ffe1,
    hoist: true,
    permissions: ['ManageMessages', 'ModerateMembers', 'KickMembers'],
  },
  // Above the level roles, so a picked colour overrides the level colour.
  ...COLOR_ROLES.map((c) => ({ name: c.name, color: c.color })),
  { name: 'Echo Champion', color: 0xffd700, hoist: true },
  { name: 'Founder', color: 0xe67e22, hoist: true },
  { name: 'Recruiter', color: 0x2ecc71 },
  // Level roles, highest first so the hierarchy reads top-down.
  ...[...LEVELS].reverse().map((l) => ({ name: l.name, color: l.color, hoist: true })),
];

/**
 * type: text | voice | forum | announcement — forum and announcement fall back
 * to text when the guild has no Community features enabled.
 * readOnly: only staff may post.
 * minLevel: hides the channel from everyone below that level role.
 */
const CATEGORIES = [
  {
    name: 'THE ECHO CHAMBER',
    channels: [
      {
        name: 'rules',
        type: 'text',
        readOnly: true,
        topic: 'The law of the chamber. Read it once, follow it always.',
      },
      {
        name: 'announcements',
        type: 'announcement',
        readOnly: true,
        topic: 'News that matters to the whole server.',
      },
      {
        name: 'the-awakening',
        type: 'text',
        readOnly: true,
        topic: 'Start here. What this server is and how you grow.',
      },
      {
        name: 'identity',
        type: 'text',
        readOnly: true,
        topic: 'Pick the color your name wears.',
      },
      {
        name: 'genesis',
        type: 'text',
        topic: 'Where your ECHO is born. Answer the five questions.',
      },
      {
        name: 'echo-chronicles',
        type: 'forum',
        topic: 'Your own log. One thread per member.',
      },
    ],
  },
  {
    name: 'THE LIVING WORLD',
    channels: [
      {
        name: 'questions',
        type: 'forum',
        topic: 'Ask anything. One thread per question, so nothing gets lost.',
      },
      { name: 'the-marketplace', type: 'text', topic: 'Trade skills, time and help. No money.' },
      { name: 'the-arena', type: 'text', topic: 'Daily tasks, quizzes and the leaderboard.' },
      { name: 'the-forge', type: 'forum', topic: 'Show your work. Projects, code, art, writing.' },
      {
        name: 'the-oracle',
        type: 'text',
        topic: 'Ask the Oracle. It answers every message here.',
      },
    ],
  },
  {
    name: 'THE COLLECTIVE',
    channels: [
      { name: 'the-hearth', type: 'text', topic: 'Open talk. The morning question lands here.' },
      { name: 'the-council', type: 'text', topic: 'Propose changes. Vote on them. You decide.' },
      { name: 'the-archives', type: 'text', readOnly: true, topic: 'Guides and answers worth keeping.' },
      { name: 'echo-events', type: 'announcement', readOnly: true, topic: 'Events, AMAs and live rounds.' },
      { name: 'the-lounge', type: 'voice' },
    ],
  },
  {
    name: 'THE VOID',
    minLevel: 'Elder',
    channels: [
      { name: 'void-gate', type: 'text', topic: 'What is said here stays here.' },
      { name: 'void-challenges', type: 'text', topic: 'One hard task every week. Real rewards.' },
      { name: 'void-voice', type: 'voice' },
    ],
  },
];

// Channel names the bot writes to at runtime.
const CHANNELS = {
  rules: 'rules',
  announcements: 'announcements',
  welcome: 'the-awakening',
  identity: 'identity',
  genesis: 'genesis',
  questions: 'questions',
  hearth: 'the-hearth',
  arena: 'the-arena',
  oracle: 'the-oracle',
  events: 'echo-events',
};

const AUTOMOD_RULES = [
  { key: 'spam', name: 'ECHO Gatekeeper — Spam' },
  { key: 'keywordPreset', name: 'ECHO Gatekeeper — Language', timeoutSeconds: 300 },
  { key: 'mentionSpam', name: 'ECHO Gatekeeper — Mention Raid', mentionLimit: 6, timeoutSeconds: 600 },
];

/** Level object for a given point total. */
function levelFor(points) {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.points) current = level;
  }
  return current;
}

/** Levels at or above `name` — used to grant access to gated channels. */
function levelsFrom(name) {
  const index = LEVELS.findIndex((l) => l.name === name);
  return index === -1 ? [] : LEVELS.slice(index).map((l) => l.name);
}

module.exports = {
  LEVELS,
  STAFF_ROLES,
  COLOR_ROLES,
  ROLES,
  CATEGORIES,
  CHANNELS,
  AUTOMOD_RULES,
  levelFor,
  levelsFrom,
};
