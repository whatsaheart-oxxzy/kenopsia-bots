# TAMEM — the chat bot that learned to talk here

A Markov chain. No API key, no model download, no monthly bill. Tamem reads what
people say in the channels it is switched on in, remembers which word tends to
follow which, and builds new sentences out of those odds. Everything it says is
made of this server's own vocabulary, and nothing it says was ever typed by
anyone — the run of words is new even when every word in it is familiar.

## Who can talk to him — and who he reads

**The owner approves people one at a time.** `/tamem allow @user`. Nobody else
can, not even an Administrator, and it is not for sale.

That single approval is the gate for **both directions**:

- Tamem answers approved members and nobody else.
- Tamem **learns only from approved members**. Everyone else in the channel is
  invisible to him — their messages are not read, not stored and can never come
  back out of his mouth.

This is the important property. A Markov bot repeats its training data back to
the room in rearranged form, so the set of people it learns from is the set of
people who have consented to that. Approval is that consent, given by a person
who knows them, rather than inherited from a role or bought with coins.

The **Tamem Access** role is a marker, not a gate — it exists so the server can
see who is approved, and it is synced best-effort when the owner approves or
revokes. If Discord refuses to add it, or an admin removes it by hand, access is
unaffected: the allowlist in `data/tamem.db` is the only thing that decides.
Equally, giving somebody that role by hand grants them nothing.

Revoking stops the reading and the answering immediately. It does **not** unlearn
what was already learned — `/tamem forget` handles a specific word and
`/tamem reset` starts over.

Channels are opt-in on top of all this, so both things have to be true: the
member is approved *and* the channel is switched on.

## What it refuses to learn

A Markov bot says its training data back to the room in rearranged form. That is
the appeal and the risk in the same sentence, so the filtering is blunt on
purpose.

Never read, whatever the settings say — the list is in code, not in a setting an
admin can switch off by accident:

    verify · report · support · appeals · mod-chat · mod-log
    introductions · marketplace · shop-requests

Those are where people report each other, appeal bans and post their age and
country. Also skipped: NSFW channels, other bots, anything starting with a
command prefix, and anything over 500 characters.

Stripped out of everything else before a word is stored: links, invites, user
and role mentions, channel mentions, custom emoji, unicode emoji, code blocks,
spoilers, and any run of four or more digits (ids, phone numbers, codes).

Replies go out with `allowedMentions: { parse: [] }`. Tamem rebuilds sentences
from what people typed, so without that a learned `@everyone` would eventually
go out for real.

Blocking a word is **retroactive**: `/tamem block` deletes it and every pair that
touches it from the model, so it cannot leak back out later. It also cannot be
re-learned while it is on the list.

## Memory, and the 2 GB server

Tamem is the sixth bot on a 2 GB box, so it is the leanest of the six by design:

- **The model lives in SQLite on disk**, not in memory. Every other bot here
  keeps its whole state in RAM as JSON, which is right for a few hundred members
  and wrong for a word model that grows with every sentence typed.
- **`node:sqlite`**, built into Node since 22 and unflagged since 23.4. The image
  is `node:24-alpine`, so this adds no dependency and no native build step.
- **No `GuildMembers` intent**, so the member list is never downloaded. Role
  checks use `message.member`, which arrives with the message.
- **No message cache.** discord.js keeps the last 200 messages per channel by
  default; Tamem reads each message once and is finished with it.
- Page cache capped at ~8 MB, log pruned at 30 days, and the model itself pruned
  only if the file passes `max_db_mb` (default 100).

If startup fails — a missing database, an old Node — `index.js` catches it and
logs. Tamem is the only bot wrapped that way, because taking C.C down with it
would stop the whole server's economy over a chat toy.

## Privacy

`messages_log` stores **who, where, when and how many words** — not the message
text. The spec this was built from asked for a `content` column; nothing in the
bot reads it, and a complete searchable archive of everything anyone ever said is
a bad thing to keep on a VPS. The counts give the same statistics without the
archive. One line in `lib/db.js` if you disagree.

## Commands

One `/tamem` with subcommands rather than seventeen top-level names: there are
six bots here now, and `/stats` is already Suzaku's.

### Anyone

| Command | What it does |
| --- | --- |
| `/tamem stats` | Words, connections, messages read, size on disk |
| `/tamem words` | How many words he knows |
| `/tamem popular [count]` | The word pairs he has seen most |
| `/tamem source message:` | Which pairs a sentence could have come from |
| `/tamem status` | Is he listening here, and will he answer you |
| `/tamem blocklist` | Every word he may not use |

### Approved members

| Command | What it does |
| --- | --- |
| `/tamem say [word] [user]` | Say something, optionally starting with a word or in someone's style |
| `/tamem tell message:` | Say something to him and see what comes back |
| `/tamem teach message:` | Teach him a phrase. 10 coins, refunded if nothing survives the filter |

### Owner only

| Command | What it does |
| --- | --- |
| `/tamem allow user: [note:]` | Approve someone. They get a DM explaining what it means |
| `/tamem revoke user:` | Take it back. Stops reading and answering at once |
| `/tamem allowed` | Everyone currently approved |

### Staff

| Command | What it does |
| --- | --- |
| `/tamem on` / `off` | Start or stop him in this channel. Channels are opt-in |
| `/tamem chance percent:` | How often he chimes in here |
| `/tamem learn [count]` | Read back through this channel, up to 200 messages |
| `/tamem block word: [reason:]` | Ban a word, retroactively |
| `/tamem unblock word:` | Allow it again |
| `/tamem forget word:` | Forget one word and everything attached to it |
| `/tamem reset confirm:` | Wipe everything. Needs `yes I am sure` typed exactly |

## Talking without commands

In an enabled channel Tamem answers an approved member about 15% of the time,
and always when mentioned by name. Rate limits are hard-coded backstops rather than
settings: **3 replies per minute per channel, 10 across the server**, plus a 5
second cooldown that a direct mention skips. A chat bot that can be made to
flood a channel is a chat bot that gets removed from the server.

## What it pays

| Thing | Coins |
| --- | --- |
| First interaction of the day | +5 |
| Each reply after that | +1, capped at 20 a day |
| Teaching a phrase | −10 |

Roles earned, not bought: **Tamem Whisperer** at 50 conversations,
**Tamem's Teacher** at 20 phrases taught. Both permanent.

## Setup

1. New application in the developer portal, add a bot, copy the token. Turn
   **Public Bot** off.
2. Under **Bot → Privileged Gateway Intents**, switch on **Message Content
   Intent**. Without it every message arrives empty and Tamem never learns a
   word. It does *not* need Server Members.
3. `cp Tamem/.env.example Tamem/.env`, fill in `TAMEM_TOKEN` and
   `TAMEM_CLIENT_ID`.
4. Invite with `bot` and `applications.commands`, plus **Send Messages** and
   **Read Message History**.
5. `npm run deploy:tamem`, restart the process.
6. Run `/kenopsia setup` so the three Tamem roles exist, then `/tamem on` in the
   channels he should hear — `general` and `off-topic` are the obvious two.
7. Approve the first people with `/tamem allow`. **Until you do, Tamem reads
   nobody and says nothing** — that is the correct starting state, not a fault.

He will say nothing worth reading until he has heard a few hundred messages, and
he only hears approved people, so start with a handful who talk a lot.
`/tamem learn count:200` in a busy channel gives him a running start — it applies
the same filter and tells you how many messages it skipped.

## Files

    lib/db.js        schema and prepared statements, node:sqlite
    lib/clean.js     scrubbing, tokenising, the never-learn channel list
    lib/markov.js    learning, generation, weighted selection, pruning
    lib/settings.js  config, per-channel switches, the access-role gate
    lib/rewards.js   coins and the two earned roles
    data/tamem.db    the model (gitignored)
