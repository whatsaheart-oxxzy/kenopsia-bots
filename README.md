# Kenopsia

A discord.js v14 bot that builds and runs the Kenopsia server: levels, coins,
quests, a weekly leaderboard, onboarding, temporary voice rooms and moderation.
No third-party bot, no paywall — everything runs in this process.

## Commands

### Members

| Command | What it does |
| --- | --- |
| `/profile [user]` | Level, xp bar, coins, weekly rank, voice time, invites. |
| `/quests` | Daily and weekly progress with bars. Pays out anything already finished. |
| `/leaderboard [alltime]` | This week's top ten, or all-time totals. |
| `/color` | Pick a name colour. Unlocks at level 20. Ephemeral, so it never clutters a channel. |
| `/report user: reason: [link:]` | Reports someone to staff. Only staff sees it, and it opens a thread there. |

### Staff

| Command | What it does |
| --- | --- |
| `/mod warn user: reason:` | Warns a member. Three warnings is a 24 hour timeout, five is a ban. The member gets a DM. |
| `/mod timeout user: minutes: [reason:]` | Times a member out. |
| `/mod warnings user:` | Lists a member's warnings. |
| `/mod clear user:` | Clears them. |
| `/kenopsia setup` | Renames the server and creates every role, category, channel and AutoMod rule, each with its opening post. |
| `/kenopsia refresh` | Rewrites the opening posts after the text in `content.js` changed. |
| `/kenopsia cleanup` | Deletes the old Project ECHO structure. |
| `/kenopsia sync` | Re-applies level roles from stored levels. |
| `/kenopsia grant user: amount: [reason:]` | Hands out coins by hand — events, hosting, anything the bot cannot see. |
| `/kenopsia post-quests` | Posts today's quests now instead of waiting for 00:00 UTC. |

`/channel`, `/role` and `/setup` are older generic helpers and still work.

## How the server works

Everything is described in `lib/kenopsia/blueprint.js` — roles, channels,
permissions, coin values. Change it there, then run `/kenopsia setup` again.

**Levels** come from talking, one xp gain per minute at most, on a MEE6-style
curve. Roles at 5 (Active Member), 10 (Regular), 20 (Enthusiast), 35 (Veteran),
50 (Legend). Level 10 opens the marketplace and personal voice rooms, level 20
name colours and bot-playground, level 35 the Inner Circle voice channel.

**Coins** are the weekly score: 2 per message (max 100/day), 5 per 10 minutes in
voice, 1 per reaction received (max 20/day), 10 when a moderator reacts to your
message, 30 when someone joins through your invite, plus quest rewards.

**Quests** are counters, not buttons. Five daily quests reset at 00:00 UTC, four
weekly ones on Monday, and the bot pays the moment a target is reached — nobody
has to claim anything. Weekly quests also hand out a role for seven days.

**The leaderboard** edits one pinned message every hour instead of posting a new
one. Sunday 23:59 UTC it pays the top five, gives first place the Weekly
Champion role for a week, announces the result and starts everyone at zero.

**Onboarding**: a new member gets the New Member role, can only post in
introductions, and is promoted to Member automatically ten minutes later. The
timer is re-checked every minute, so a bot restart cannot leave anyone stuck.

**Voice**: joining "Create a room" builds a private voice channel for that
member and deletes it when the last person leaves. Time in the AFK channel does
not earn coins.

**Moderation**: four AutoMod rules (spam, language, mention raids, real-money
keywords in the marketplace), plus warn/timeout/report, all logged to `mod-log`.
A daily activity report lands in `mod-chat` at 00:00 UTC. Roblox Night and Game
Night are created as real Discord events every Monday.

All member-facing text lives in `lib/kenopsia/content.js`, written in simple
global English and deliberately without emoji.

State is stored in `data/kenopsia.json` (gitignored, written atomically).

## Setup

1. Create an application at https://discord.com/developers/applications, add a
   bot, copy the token.
2. `cp .env.example .env` and fill in `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
3. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**
   and **Message Content Intent**.
4. Invite the bot with the `bot` and `applications.commands` scopes and
   **Manage Channels**, **Manage Roles**, **Manage Server**, **Moderate Members**,
   **Ban Members**, **Move Members**, **Manage Messages**.
5. `npm run deploy`, then `npm start`.
6. In the server: drag the bot role above every Kenopsia role, run
   `/kenopsia setup`, then `/kenopsia sync`.

Re-run `npm run deploy` whenever a command's name, description or options change.

## Running it 24/7

`npm start` keeps the bots online only while this PC is. To host them on a
server so they stay green permanently, see **[DEPLOY.md](DEPLOY.md)** — two
Docker containers on a small Ubuntu VM. C.C, SUZAKU and the Voice Bot share
one container because they share one coin wallet; LELOUCH gets its own.

## Notes

- The bot's role must sit above every role it assigns. Setup warns when it does
  not.
- Announcement and forum channels need Community mode. Without it setup creates
  plain text channels and says so.
- Run only one instance. Two processes both count messages and both answer
  interactions, which shows up as duplicated payouts and dead buttons.
- `.env` and `data/` are gitignored. If the token leaks, reset it in the portal.
