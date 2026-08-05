'use strict';

/**
 * Every opening post /kenopsia setup writes into a channel.
 *
 * House style: plain English a fifteen-year-old in any country can read.
 * Short sentences. No emoji. No corporate voice, no hype. Say the thing,
 * then say what to do next.
 */

// The shop guide reads its prices straight out of the catalogue, so a price
// change in one place cannot leave a stale number pinned in a channel.
const catalog = require('../../Shop Bot/lib/catalog');
const money = (n) => n.toLocaleString('en-US');
const cheapest = (key) =>
  money(Math.min(...Object.values(catalog.ITEMS).filter((i) => i.category === key).map((i) => i.price)));

const SEEDS = {
  welcome: {
    pin: true,
    content: [
      '# Welcome to Kenopsia',
      '',
      'This is a place to talk and play games with people from anywhere. That is the whole idea. No application, no interview, no twenty-step onboarding.',
      '',
      '**Start here**',
      'Read the rules. It takes one minute.',
      'Say hello in the introductions channel. There is a template there if you do not know what to write.',
      'Then just talk in general. That is where most things happen.',
      '',
      '**Games**',
      'Looking for people to play with? Post in looking-for-play.',
      'Trading in-game items? The marketplace opens at level 10.',
      'Got a good clip? game-clips.',
      '',
      '**Coins and levels**',
      'You earn coins by being around: talking, sitting in voice, helping people, finishing quests.',
      'You gain levels the same way, and levels unlock roles and channels.',
      'Type `/profile` any time to see where you are. The rewards channel explains the details.',
      '',
      '**One thing to know**',
      'For your first ten minutes you can only post in introductions. It keeps the spam bots out. After that everything opens up on its own. You do not have to do anything.',
      '',
      'Questions? Ask in q-and-a. Someone will answer.',
    ].join('\n'),
  },

  rules: {
    pin: true,
    content: [
      '# Rules',
      '',
      '**1. Be respectful.** No harassment, no bullying, no hate speech. Disagree all you want, but go after the argument, not the person.',
      '**2. No spam.** Do not repeat the same message, and do not flood a channel.',
      '**3. No NSFW.** Nothing sexual, nothing gory. Anywhere.',
      '**4. Nothing illegal.** No hacking, no cheats, no piracy, no scams.',
      '**5. English in the main channels.** Any language is fine in off-topic. We want everyone to be able to follow along.',
      '**6. No advertising.** Do not promote other servers or your own stuff without asking a mod first.',
      '**7. Marketplace: no real money.** In-game items for in-game items. Anyone trying to trade for real money or scam someone is banned, no warning.',
      '**8. Listen to the mods.** If a mod asks you to stop, stop. Do not argue about it in the channel — send a `/report` and a mod will open a private room where it can be sorted out properly.',
      '**9. Use the right channel.** It keeps things findable for everyone else.',
      '**10. Have fun.** You are not here to farm coins. That part is a bonus.',
      '',
      'You also need to follow the Discord Terms of Service and Community Guidelines, and you must be at least 13 years old.',
      '',
      'Breaking a rule gets you a warning. Three warnings is a 24 hour timeout. Five is a seven day ban. Serious things skip straight to the end.',
      '',
      'Someone breaking the rules? Type `/report` anywhere. Only the staff sees it.',
    ].join('\n'),
  },

  announcements: {
    content: [
      '# Kenopsia is open',
      '',
      'Server news, events and changes get posted here. Nothing else, so it stays worth reading.',
      '',
      'Two things run every week from now on:',
      'Roblox Night, Friday at 20:00 UTC, in the Events voice channel.',
      'Game Night, Saturday at 20:00 UTC, rotating games.',
      '',
      'The first 20 members keep the Founder role for good.',
    ].join('\n'),
  },

  suggestions: {
    content: [
      '# Suggestions',
      '',
      'Post your idea here. One message per idea, and say what problem it solves.',
      '',
      'Add a thumbs up and thumbs down reaction under your own post so people can vote.',
      'Staff reads this channel every week. The best ideas go up for a real vote once a month.',
      '',
      'Small ideas are welcome too. A channel that is missing, a rule that is annoying, a quest that is boring. Say it.',
    ].join('\n'),
  },

  introductions: {
    pin: true,
    content: [
      '# Introduce yourself',
      '',
      'Copy this, fill it in, post it. Skip anything you do not want to share.',
      '',
      '```',
      'Name or nickname:',
      'Age:',
      'Where you are from:',
      'Games you play:',
      'One interesting thing about you:',
      '```',
      '',
      'That is it. Someone will say hi.',
      '',
      'If you are shy: you do not have to post here at all. It just makes it easier for people to talk to you.',
    ].join('\n'),
  },

  'looking-for-play': {
    pin: true,
    content: [
      '# Looking for people to play with',
      '',
      'Use this template so people know what they are joining.',
      '',
      '```',
      'Game:',
      'When:',
      'Players needed:',
      'Skill level: casual / normal / serious',
      '```',
      '',
      'Post one message per session. When you have enough people, edit your message and write "full".',
      '',
      'Hosting a session gives you coins, and hosting three in a week gets you the Game Master role.',
    ].join('\n'),
  },

  marketplace: {
    pin: true,
    content: [
      '# Marketplace',
      '',
      'Trade in-game items here. Roblox items, game keys, skins, accounts you own.',
      '',
      '**Two things before you can post**',
      'Level 10, so people you trade with have some history to look at.',
      'A verified Roblox account. Type `/verify` and follow the steps. It takes a minute and proves the account is really yours.',
      '',
      'Your Roblox username is shown in this channel and in looking-for-play, and nowhere else. That is the point: the person you trade with can check your profile before they hand anything over.',
      '',
      '**The one hard rule: no real money.** Not PayPal, not gift cards, not crypto. In-game for in-game only. Anyone who breaks this is banned without a warning, and the filter here flags those words automatically.',
      '',
      '**How to post**',
      '```',
      'Have:',
      'Want:',
      'Platform / game:',
      '```',
      '',
      '**Do not get scammed**',
      'Ask the other person to go first if they have no history here.',
      'Screenshot the whole trade.',
      'If someone rushes you, that is the scam.',
      '',
      'Got scammed anyway? Type `/report` with their name and your screenshots. We ban and we tell everyone.',
    ].join('\n'),
  },

  'game-clips': {
    content: [
      '# Clips',
      '',
      'Post your best moments. Clips, screenshots, that one lucky shot.',
      '',
      'Reactions on your clip earn you coins, so react to other people too.',
    ].join('\n'),
  },

  media: {
    content: [
      '# Media',
      '',
      'Images, videos, art, screenshots, things you made or found.',
      '',
      'Nothing NSFW, nothing gory, nothing you do not have the right to post.',
    ].join('\n'),
  },

  rewards: {
    pin: true,
    content: [
      '# Coins, levels and what they get you',
      '',
      'Two things count here and they run in parallel. **Levels** come from talking and never go down. **Coins** are a weekly score you can also spend.',
      '',
      '**How to earn coins**',
      'Send a message: 2 coins, up to 400 a day',
      'Sit in a voice channel: 5 coins per 10 minutes',
      'Someone reacts to your message: 1 coin, up to 20 a day',
      'A mod reacts to your message because it helped someone: 10 coins',
      'Finish a daily quest: 10 to 25 coins',
      'Finish a weekly quest: 50 to 100 coins',
      'Someone joins through your invite: 30 coins',
      '',
      '**Levels unlock roles**',
      'Level 5: Active Member. External emojis.',
      'Level 10: Regular. The marketplace, your own voice rooms, threads.',
      'Level 20: Enthusiast. A name colour you pick yourself, and bot-playground.',
      'Level 35: Veteran. The Inner Circle voice channel and early access to events.',
      'Level 50: Legend. Shown at the top of the member list, and you can host official events.',
      '',
      '**The weekly leaderboard**',
      'Coins earned this week are ranked in the leaderboard channel and reset every Sunday at 23:59 UTC.',
      'First place: 200 coins and the Weekly Champion role for seven days.',
      'Second: 150. Third: 100. Fourth and fifth: 50 each.',
      '',
      'Type `/profile` to see your level and coins, and `/quests` to see what is still open today.',
      '',
      'One thing on purpose: you cannot buy levels, and grinding messages does not work. The caps are there so being here beats farming here.',
    ].join('\n'),
  },

  'daily-quests': {
    content: [
      '# Daily quests',
      '',
      'Five quests appear here every day at 00:00 UTC. They are small on purpose.',
      '',
      'You do not have to claim anything. The bot counts along and pays you the moment a quest is done.',
      'Finish all five and you get 25 extra coins.',
      '',
      'Type `/quests` to see what you still have open.',
    ].join('\n'),
  },

  'weekly-quests': {
    content: [
      '# Weekly quests',
      '',
      'Four bigger quests appear here every Monday at 00:00 UTC. Each one also gives you a role for seven days.',
      '',
      'Finish all four and you get 150 extra coins.',
      '',
      'Type `/quests` to see your progress.',
    ].join('\n'),
  },

  'level-ups': {
    content: [
      '# Level ups',
      '',
      'Every level someone reaches and every finished quest set lands here. Written by the bot, nobody can post.',
      '',
      'It has its own channel so nothing interrupts a conversation. Type `/profile` to see where you stand.',
    ].join('\n'),
  },

  leaderboard: {
    content: [
      '# Weekly leaderboard',
      '',
      'This channel updates itself every hour. It ranks coins earned this week only, so someone who joined yesterday can still win.',
      '',
      'Resets every Sunday at 23:59 UTC.',
    ].join('\n'),
  },

  'q-and-a': {
    content: [
      '# Questions',
      '',
      'Anything about the server, the bots, the game or how something works.',
      '',
      'Ask with `/ask question:` — from anywhere, you do not have to be in this channel. Your question becomes its own thread here, and everybody answers inside it.',
      '',
      'Scroll the list before you ask. If the question is already there, the answer is one click away instead of one wait away.',
      '',
      'Nothing can be typed straight into this channel; loose messages are removed automatically. That is what keeps the list readable — every line you see is a question somebody asked.',
      '',
      'Answering earns coins like any other message. If something needs the staff rather than the server, use `/report` instead.',
    ].join('\n'),
  },

  verify: {
    content: [
      '# Verify',
      '',
      'Link your Roblox account here. It takes about a minute and it is what opens the marketplace for you, together with level 10.',
      '',
      'Type `/verify username:` with your Roblox username — the username, not the display name. The bot gives you a short code, you paste it into your Roblox About text, press the button, and you are done. You can delete the code straight after.',
      '',
      'Everything the bot says to you here is private. Only you see it, which is why this channel looks empty.',
      '',
      'That also means there is nothing to type in here. Anything written is deleted automatically. Use `/unverify` to unlink, and `/verify` again to switch accounts.',
    ].join('\n'),
  },

  support: {
    content: [
      '# Support',
      '',
      'This channel is not for typing in. Anything written here is deleted automatically, including messages from staff.',
      '',
      'Use `/report` instead. It goes straight to the staff, it keeps your name out of the public channels, and it does not get lost between other messages.',
      '',
      'Only `reason:` is required. Add `user:` if it is about a person, and `link:` if you have a link to the message. Leave `user:` empty for anything else — a broken command, a missing role, or an appeal against your own warning.',
      '',
      'General questions belong in q-and-a, not here.',
    ].join('\n'),
  },

  report: {
    content: [
      '# Reports',
      '',
      'Every `/report` from a member lands here automatically, with a link to the message and who sent it.',
      '',
      'Handle it, then say in the thread what you did. It saves the next person from doing it twice.',
    ].join('\n'),
  },

  'mod-chat': {
    content: [
      '# Staff',
      '',
      'A short activity report gets posted here every day at 00:00 UTC: new members, active members, messages, voice minutes.',
      '',
      'Warnings, timeouts and bans go through `/mod warn`, `/mod timeout` and `/mod warnings` so everything ends up in mod-log.',
    ].join('\n'),
  },

  'mod-log': {
    content: [
      '# Log',
      '',
      'Every moderation action the bot handles is written here automatically. Do not post here by hand.',
    ].join('\n'),
  },

  appeals: {
    content: [
      '# Appeals',
      '',
      'Bans that get appealed land here for a second opinion.',
      '',
      'Rule of thumb: a first ban for something stupid can come back after a real apology. Scamming and hate speech do not.',
    ].join('\n'),
  },

  'voice-chat': {
    content: [
      '# Voice chat',
      '',
      'Text for people sitting in a voice channel. Links, coordination, "one sec".',
      '',
      'At level 10 you can open your own room: join **Create a room** and the bot builds one for you. It disappears again when the last person leaves.',
    ].join('\n'),
  },

  'pet-guide': {
    pin: true,
    content: [
      '# Pets',
      '',
      'Every member can raise one pet. It is not a toy that sits in a database: it gets hungry, it gets lonely, and if you ignore it long enough it leaves and does not come back.',
      '',
      '**Getting one**',
      '`/adopt type:<dragon, cat, dog, fox, phoenix or robot> name:<name>`',
      'Each type is a little different. A dragon learns faster from training and fighting. A cat is cheered up by chatting. A dog gets energy from voice calls. A fox turns reactions into coins. A phoenix comes back to life once a week instead of leaving. A robot never gets tired from doing nothing.',
      '',
      '**The three bars**',
      'Hunger drops one point every two hours. At zero your pet loses 20 happiness.',
      'Happiness drops one point every four hours. At zero your pet runs away for good.',
      'Energy drops while you are away and comes back while you are around.',
      '',
      '**Keeping it alive**',
      'Just being here does most of the work: every message you send makes your pet a little happier, and reactions on your messages help too.',
      '`/pet` once an hour, `/play` for happiness, `/feed` for 10 coins, `/rest` for 5, `/train` for xp.',
      'A Protection Charm from the shop stops your pet leaving for seven days, if you know you will be away.',
      '',
      '**Growing up**',
      'Six stages: Baby, Adolescent, Adult, Epic, Legendary, Mythical, at levels 1, 10, 25, 50, 75 and 100. Every stage has its own name and look per type — `/evolutions` shows the whole chart.',
      '',
      '**Fighting**',
      '`/battle @someone`, they answer with `/accept`. Three rounds. Level and happiness tilt the odds but do not decide it, so an underdog can win. Winner takes 20 xp, 15 happiness and 10 coins. Half an hour cooldown.',
      '',
      '**Coins are the same coins**',
      'Pets spend the wallet you fill by being active in the server. `/pet-shop` lists what there is. It is the only shop that stayed separate — everything else is in `/shop`.',
      '',
      'Pet commands work in every channel. Battles are logged in pet-battles and the big moments in pet-news, so nothing gets lost either way.',
    ].join('\n'),
  },

  'pet-news': {
    content: [
      '# Pet news',
      '',
      'Adoptions, evolutions, level milestones and the sad ones. Written by the bot, nobody can post here.',
      '',
      'It sits in its own channel so the chat stays a chat.',
    ].join('\n'),
  },

  'pet-battles': {
    content: [
      '# Battle log',
      '',
      'Every fight ends up here automatically. Start one with `/battle @someone` in any channel.',
    ].join('\n'),
  },

  'pet-showcase': {
    content: [
      '# Showcase',
      '',
      'Post your pet. Screenshots, drawings, the story of how it got its name.',
      '',
      '`/pets` lists everyone on the server, `/pet-leaderboard` ranks them by level or by wins.',
    ].join('\n'),
  },

  'voice-guide': {
    pin: true,
    content: [
      '# Voice time pays',
      '',
      'Sitting in a voice channel earns coins. The same coins as everything else — there is no second currency to keep track of.',
      '',
      '**The rate**',
      'One coin every two minutes, then multiplied:',
      'Gaming pays 1.5x, Events pays 2x, Study Zone 1.2x, Lounge and Music Lounge 1x, AFK nothing.',
      'Between 18:00 and 22:00 UTC everything pays 1.2x, and weekends 1.1x. They stack.',
      '',
      '**Staying pays more than dropping in**',
      'One unbroken session pays a bonus at 10, 20, 30, 45, 60, 90 and 120 minutes. Switching channels keeps the streak, leaving voice ends it.',
      'There is a cap of 200 coins a day from voice, so nobody has to sit in an empty channel all night to keep up.',
      '',
      '**Roles you grow into**',
      'Voice Newbie, then Regular at 100 voice coins, Enthusiast at 500, Veteran at 2000, Elite at 5000, Legend at 10000.',
      '',
      '**Leaderboards**',
      'Daily, weekly, monthly and all time. Every period pays out just before it resets, and the weekly and monthly winners wear Voice King, Duke, Knight or Emperor for a while.',
      '',
      '**Commands**',
      '`/voice` your time, coins and rank · `/voice-top` the leaderboards · `/multipliers` what is active right now',
      '`/event` plan something and get paid for hosting it',
      '',
      '**Spending it**',
      'There is no separate voice shop and no separate voice currency. Voice coins are just coins, and they go in `/shop` with everything else.',
      '',
      'One honest note: Discord avatar decorations, profile effects and nickname formatting are not sold anywhere here. No bot can hand those out, so nothing pretends otherwise. The cards in `/shop` are drawn by KALLEN on your `/profile`, which is a thing it genuinely controls.',
    ].join('\n'),
  },

  'shop-guide': {
    content: [
      '# The shop',
      '',
      'One shop, one balance. `/shop` to look, `/buy item:<id>` to buy, `/balance` to see what you have.',
      '',
      '**There is only one kind of coin**',
      'Time in voice and messages pay into the same balance. There is no voice currency and no conversion — a price is a price. The pet shop (`/pet-shop`) is the only shop that stayed separate, and it only sells pet things.',
      '',
      '**What is on the shelves**',
      `Profile cards, from ${cheapest('cards')} coins. Frames and colours for the card \`/profile\` draws you.`,
      `Profile upgrades, from ${cheapest('profile')} coins. A title, a badge, a bio, your own accent colour.`,
      `Bundles, from ${cheapest('bundles')} coins. Always cheaper than buying the pieces one at a time.`,
      `Server things, from ${cheapest('server')} coins. An emoji, a sticker, your own room, an event, an announcement.`,
      `Robux, from ${cheapest('robux')} coins. Nitro, from ${cheapest('nitro')} coins. In-game Roblox items, quoted per item.`,
      '',
      '**Two things this shop will not do**',
      'It does not sell roles. Roles are what you are in this server, not what you paid for.',
      'It does not sell anything it cannot actually hand you. Discord avatar decorations, profile effects and nickname formatting belong to Discord and no bot can give them out, so nobody here will take your coins for one. The cards are drawn by KALLEN on your own profile, which is a thing it really does control.',
      '',
      '**Robux, Nitro and in-game items**',
      'These cost the owner real money or real time, so a person handles them, not a bot. Use `/request robux`, `/request nitro` or `/request item`.',
      'Your coins are held the moment you ask, and given straight back if the request is turned down or nobody gets to it within seven days. You are never charged for something that did not arrive. Track it with `/request status`.',
      '',
      '**Robux has rules**',
      'You must be 18 or over, and you get paid one way only: you put a gamepass on your own Roblox account for the right price and the owner buys it. That needs Roblox Premium on your side.',
      'In-game items are handed over by trading in game. Nobody will ever ask for your Roblox password. If anyone does, they are not us — report it.',
      '',
      `As a rough guide, Robux is priced at about ${money(catalog.COINS_PER_ROBUX)} coins each, and the bigger packs are better value than the small ones.`,
      '',
      '**Your own voice room**',
      'A private voice room is 2,000 coins. You can rename it, move people in it, and choose how many people fit: `/inventory room limit:6` for six, `limit:0` for anyone. Run it again with a different number to change it.',
      'If it sits empty for two hours the channel comes down, so the voice list stays readable. You have not lost anything — the room is still yours, and `/inventory room` opens it again for free, the same size as before, as often as you like.',
      'Bought text rooms are never deleted automatically. That would throw away everything said in them.',
      '',
      'Everything you own is in `/inventory`. Cards are worn with `/inventory use`, and slots you bought are filled in with `/inventory set`.',
    ].join('\n'),
  },

  'bot-commands': {
    content: [
      '# Bot commands',
      '',
      'Every command works in every channel. This one is here if you want to try something out without interrupting a conversation.',
      '',
      '`/profile` your level, coins and rank',
      '`/quests` what is still open today and this week',
      '`/leaderboard` this week top ten',
      '`/color` pick your name colour, from level 20',
      '`/report` report someone to staff, privately',
      '`/verify` link your Roblox account, needed for the marketplace',
      '`/adopt` get a pet. Everything about them is in pet-guide.',
      '`/shop` the shop, `/buy` to buy, `/inventory` what you own, `/balance` your coins',
      '`/request` Robux, Nitro or an in-game item — a person handles those, see shop-guide',
      '`/tamem` talk to Tamem. He only reads and answers people the owner approved — ask if you want to be one.',
    ].join('\n'),
  },
};

module.exports = { SEEDS };
