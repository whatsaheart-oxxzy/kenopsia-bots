'use strict';

/**
 * The Kenopsia server: roles, categories, channels, AutoMod and the numbers
 * behind levels and coins. Everything /kenopsia setup builds is described here,
 * so the server can be changed without touching the build logic.
 */

// MEE6-style curve: xp needed to go from level n to n+1.
const xpForLevel = (n) => 5 * n * n + 50 * n + 100;

/** Total xp needed to reach a level from zero. */
function xpTotal(level) {
  let total = 0;
  for (let n = 0; n < level; n += 1) total += xpForLevel(n);
  return total;
}

// Level roles, low to high. Everything else is earned, not levelled.
const LEVEL_ROLES = [
  { level: 5, name: 'Active Member', color: 0x4ecdc4 },
  { level: 10, name: 'Regular', color: 0x3b8ef0 },
  { level: 20, name: 'Enthusiast', color: 0x9b59f0 },
  { level: 35, name: 'Veteran', color: 0xe0554f },
  { level: 50, name: 'Legend', color: 0xf5c518 },
];

const STAFF_ROLES = ['Administrator', 'Moderator'];

// Name colours members can pick once they reach Enthusiast.
const COLOR_ROLES = [
  { name: 'Crimson', color: 0xe0364f },
  { name: 'Amber', color: 0xf59f00 },
  { name: 'Jade', color: 0x27c98a },
  { name: 'Cyan', color: 0x22c4e0 },
  { name: 'Cobalt', color: 0x3b6ef0 },
  { name: 'Violet', color: 0x9b59f0 },
  { name: 'Rose', color: 0xf055a0 },
  { name: 'Copper', color: 0xc9743a },
  { name: 'Mint', color: 0x7ef0c0 },
  { name: 'Slate', color: 0x8b97a8 },
];

// Handed out by the weekly quests and taken back after seven days.
const TEMP_ROLES = ['Chatter', 'Voice Active', 'Game Master', 'Recruiter'];

/**
 * Order matters: this is top to bottom in the role list. Colour roles sit above
 * the level roles so a picked colour actually shows.
 */
const ROLES = [
  {
    name: 'Administrator',
    color: 0xff3b30,
    hoist: true,
    permissions: ['Administrator'],
  },
  {
    name: 'Moderator',
    color: 0x00c2a8,
    hoist: true,
    permissions: [
      'ManageMessages',
      'ModerateMembers',
      'MuteMembers',
      'DeafenMembers',
      'MoveMembers',
      'ViewAuditLog',
      'ManageThreads',
    ],
  },
  ...COLOR_ROLES.map((c) => ({ name: c.name, color: c.color })),
  { name: 'Founder', color: 0xd4a017, hoist: true },
  { name: 'Weekly Champion', color: 0xa855f7, hoist: true },
  { name: 'Booster', color: 0xf472b6, hoist: true },
  // Voice leaderboard titles, handed out for a week or a month at a time.
  { name: 'Voice Emperor', color: 0xffd166, hoist: true },
  { name: 'Voice King', color: 0xf4a261 },
  { name: 'Voice Duke', color: 0xe9c46a },
  { name: 'Voice Knight', color: 0xa8dadc },
  // Bought in the voice shop.
  { name: 'VIP', color: 0xffcc00, hoist: true },
  { name: 'Mentor', color: 0x06d6a0 },
  { name: 'Event Host', color: 0xef476f },
  { name: 'DJ', color: 0x9d4edd },
  { name: 'Streamer', color: 0x9146ff },
  { name: 'Gamer', color: 0x00b4d8 },
  // Earned by time spent in voice.
  { name: 'Voice Legend', color: 0xf72585, hoist: true },
  { name: 'Voice Elite', color: 0xb5179e },
  { name: 'Voice Veteran', color: 0x7209b7 },
  { name: 'Voice Enthusiast', color: 0x560bad },
  { name: 'Voice Regular', color: 0x480ca8 },
  { name: 'Voice Newbie', color: 0x8d99ae },
  { name: 'Mythical Pet Owner', color: 0xf0abfc, hoist: true },
  { name: 'Legendary Pet Owner', color: 0xfbbf24 },
  { name: 'Breeder', color: 0x84cc16 },
  { name: 'Pet Master', color: 0xf97316 },
  { name: 'Pet Owner', color: 0xa3a3a3 },
  { name: 'Roblox Verified', color: 0x00a2ff },
  // Bot managed: level 10 and a verified Roblox account. Discord overwrites
  // cannot express "both roles required", so one role stands for both.
  { name: 'Trader', color: 0x16a34a },
  { name: 'Voice Active', color: 0x38bdf8 },
  { name: 'Recruiter', color: 0x22c55e },
  { name: 'Chatter', color: 0xfbbf24 },
  { name: 'Game Master', color: 0xfb7185 },
  ...[...LEVEL_ROLES].reverse().map((r) => ({ name: r.name, color: r.color, hoist: true })),
  {
    name: 'Member',
    color: 0xb5bac1,
    permissions: [
      'ViewChannel',
      'SendMessages',
      'SendMessagesInThreads',
      'CreatePublicThreads',
      'EmbedLinks',
      'AttachFiles',
      'AddReactions',
      'ReadMessageHistory',
      'Connect',
      'Speak',
      'UseVAD',
      'UseApplicationCommands',
      'ChangeNickname',
    ],
  },
  { name: 'New Member', color: 0x6b7280 },
];

/**
 * Channel spec fields:
 *   type      text | voice | forum | announcement
 *   readOnly  only staff may post
 *   minRole   hidden from everyone below this role
 *   noNew     New Members cannot post here (their first ten minutes)
 *   userLimit voice only
 *   hub       joining it creates a temporary voice channel
 */
const CATEGORIES = [
  {
    name: 'INFORMATION',
    channels: [
      { name: 'welcome', type: 'text', readOnly: true, topic: 'Start here. What this server is and how to get going.' },
      { name: 'rules', type: 'text', readOnly: true, topic: 'Ten rules. Read them once.' },
      { name: 'announcements', type: 'announcement', readOnly: true, noReactions: true, topic: 'Server news, events and updates.' },
      { name: 'suggestions', type: 'text', topic: 'Your ideas for the server. We read all of them.' },
    ],
  },
  {
    name: 'CHAT',
    channels: [
      { name: 'general', type: 'text', noNew: true, topic: 'Main chat. Talk about anything.' },
      { name: 'off-topic', type: 'text', noNew: true, topic: 'Everything that does not fit in general. Any language welcome.' },
      { name: 'media', type: 'text', noNew: true, topic: 'Images, videos, art, screenshots. Nothing NSFW.' },
      { name: 'introductions', type: 'text', topic: 'Say hello. There is a template pinned here.' },
    ],
  },
  {
    name: 'VOICE',
    channels: [
      { name: 'voice-chat', type: 'text', noNew: true, topic: 'Text for people sitting in voice.' },
      { name: 'voice-guide', type: 'text', readOnly: true, topic: 'What voice time is worth and how to spend it.' },
      { name: 'Lounge', type: 'voice' },
      { name: 'Gaming', type: 'voice' },
      { name: 'Events', type: 'voice' },
      { name: 'Study Zone', type: 'voice' },
      { name: 'Music Lounge', type: 'voice' },
      { name: 'Create a room', type: 'voice', hub: true, minRole: 'Regular' },
      { name: 'Inner Circle', type: 'voice', minRole: 'Veteran' },
      { name: 'Booster Lounge', type: 'voice', minRole: 'Booster' },
      { name: 'AFK', type: 'voice', afk: true },
    ],
  },
  {
    name: 'GAMING',
    channels: [
      { name: 'looking-for-play', type: 'text', noNew: true, topic: 'Find people to play with. Template is pinned.' },
      { name: 'game-discussion', type: 'text', noNew: true, topic: 'Games, updates, tips, opinions.' },
      { name: 'game-clips', type: 'text', noNew: true, topic: 'Your best moments. Clips and screenshots.' },
      {
        name: 'marketplace',
        type: 'text',
        minRole: 'Trader',
        // minRole hides the channel from @everyone, and a bot is part of
        // @everyone like anyone else. Without this LELOUCH cannot see the
        // channel it exists to post in, and nobody ever finds out why.
        allowBots: true,
        topic: 'Trade in-game items. Level 10 and a verified Roblox account. No real money, ever.',
      },
    ],
  },
  {
    name: 'BOTS',
    channels: [
      { name: 'bot-commands', type: 'text', noNew: true, topic: 'A place to try commands out. They work everywhere.' },
      { name: 'bot-playground', type: 'text', minRole: 'Enthusiast', topic: 'New bots get tested here first.' },
    ],
  },
  {
    name: 'QUESTS AND REWARDS',
    channels: [
      { name: 'daily-quests', type: 'text', readOnly: true, topic: 'Five new quests every day at 00:00 UTC.' },
      { name: 'weekly-quests', type: 'text', readOnly: true, topic: 'Four new quests every Monday at 00:00 UTC.' },
      { name: 'level-ups', type: 'text', readOnly: true, topic: 'Level ups and finished quests. Bot only.' },
      { name: 'leaderboard', type: 'text', readOnly: true, topic: 'This week top members. Updates every hour.' },
      { name: 'rewards', type: 'text', readOnly: true, topic: 'How coins work and what you get for them.' },
      { name: 'shop-guide', type: 'text', readOnly: true, topic: 'What the shop sells, what it costs and how Robux requests work.' },
    ],
  },
  {
    name: 'PETS',
    channels: [
      { name: 'pet-guide', type: 'text', readOnly: true, topic: 'How pets work. Read this before you adopt.' },
      { name: 'pet-news', type: 'text', readOnly: true, topic: 'Adoptions, evolutions and goodbyes. Bot only.' },
      { name: 'pet-battles', type: 'text', readOnly: true, topic: 'Every battle, logged automatically.' },
      { name: 'pet-showcase', type: 'text', noNew: true, topic: 'Show off your pet.' },
    ],
  },
  {
    name: 'SUPPORT',
    channels: [
      { name: 'q-and-a', type: 'text', topic: 'Ask anything about the server, the bots or the game.' },
      { name: 'verify', type: 'text', topic: 'Use /verify — anything typed here is deleted automatically.' },
      { name: 'support', type: 'text', topic: 'Use /report — anything typed here is deleted automatically.' },
      { name: 'report', type: 'text', minRole: 'Moderator', topic: 'Reports from members land here.' },
    ],
  },
  {
    name: 'STAFF',
    minRole: 'Moderator',
    channels: [
      { name: 'mod-chat', type: 'text', topic: 'Staff only.' },
      { name: 'mod-log', type: 'text', topic: 'Every moderation action, logged automatically.' },
      { name: 'appeals', type: 'text', topic: 'Ban appeals land here.' },
    ],
  },
];

// Channel names the bot writes to or reads from at runtime.
const CHANNELS = {
  welcome: 'welcome',
  rules: 'rules',
  announcements: 'announcements',
  introductions: 'introductions',
  general: 'general',
  media: 'media',
  gameDiscussion: 'game-discussion',
  lookingForPlay: 'looking-for-play',
  marketplace: 'marketplace',
  levelUps: 'level-ups',
  dailyQuests: 'daily-quests',
  weeklyQuests: 'weekly-quests',
  leaderboard: 'leaderboard',
  rewards: 'rewards',
  shopGuide: 'shop-guide',
  qAndA: 'q-and-a',
  support: 'support',
  verify: 'verify',
  report: 'report',
  modChat: 'mod-chat',
  modLog: 'mod-log',
  voiceCategory: 'VOICE',
};

const AUTOMOD_RULES = [
  { key: 'spam', name: 'Kenopsia — Spam' },
  { key: 'keywordPreset', name: 'Kenopsia — Language', timeoutSeconds: 600 },
  { key: 'mentionSpam', name: 'Kenopsia — Mention raid', mentionLimit: 6, timeoutSeconds: 600 },
  {
    key: 'keyword',
    name: 'Kenopsia — Marketplace scams',
    channels: ['marketplace'],
    // Real-money trading is the one thing that reliably ruins a trading channel.
    keywords: ['paypal', 'cashapp', 'real money', 'irl trade', 'venmo', 'crypto payment', 'gift card'],
  },
];

// What an action is worth, and how much of it counts per day.
const COINS = {
  message: { amount: 2, dailyCap: 100 },
  voicePer10Min: { amount: 5 },
  reactionReceived: { amount: 1, dailyCap: 20 },
  modHelpful: { amount: 10, dailyCap: 30 },
  invite: { amount: 30 },
};

const LEVEL_UP_MESSAGE = (user, level, role) =>
  role
    ? `${user} reached level ${level} and unlocked **${role}**.`
    : `${user} reached level ${level}.`;

/** The level role a member should hold at this level, or null below level 5. */
function roleForLevel(level) {
  let current = null;
  for (const role of LEVEL_ROLES) {
    if (level >= role.level) current = role;
  }
  return current;
}

/** Role names from `name` upwards, used to unlock gated channels. */
function rolesFrom(name) {
  const index = LEVEL_ROLES.findIndex((r) => r.name === name);
  if (index !== -1) return LEVEL_ROLES.slice(index).map((r) => r.name);
  return [name];
}

module.exports = {
  LEVEL_ROLES,
  STAFF_ROLES,
  COLOR_ROLES,
  TEMP_ROLES,
  ROLES,
  CATEGORIES,
  CHANNELS,
  AUTOMOD_RULES,
  COINS,
  LEVEL_UP_MESSAGE,
  xpForLevel,
  xpTotal,
  roleForLevel,
  rolesFrom,
};
