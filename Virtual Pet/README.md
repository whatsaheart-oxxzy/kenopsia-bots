# Suzaku — the pet bot

A Tamagotchi-style pet for every member of Kenopsia. Its own Discord
application, its own name and avatar — but it runs **inside the C.C process**,
because it spends Kenopsia coins and a coin file needs exactly one writer.

Start it by putting `PET_TOKEN` into `Virtual Pet/.env`. C.C picks it up on the
next start. Without a token C.C simply logs that the pet bot was skipped.

## Commands

| Command | What it does |
| --- | --- |
| `/adopt type: name:` | Adopt one pet. Six types, each with its own strength. |
| `/pet` | The stat card, plus 5 happiness and 5 xp once an hour. |
| `/feed` | 10 coins, 30 hunger. |
| `/play` | Free. 10 happiness, 5 energy, every 30 minutes. |
| `/rest` | 5 coins, 20 energy. Wakes a sleeping pet. |
| `/train` | Free. 10 xp for 10 energy, once an hour. |
| `/rename name:` | New name. |
| `/battle user:` then `/accept` | Three rounds, level and happiness tilt the odds. |
| `/pet-shop`, `/pet-buy item:`, `/pet-inventory [use:]`, `/pet-gift user: item:` | Eight items, bought with Kenopsia coins. The pet shop is the only shop separate from KALLEN's `/shop`. |
| `/stats user:`, `/pets`, `/pet-leaderboard [by:]`, `/evolutions [type:]` | Looking around. |

Commands that change something have to be run in `#bot-commands`. The read-only
ones work anywhere.

## How a pet lives

Hunger falls one point every two hours, happiness one every four, energy one an
hour while the owner is away and climbs back while they are around. At zero
hunger the pet loses 20 happiness; at zero energy it sleeps for two hours; at
zero happiness it **runs away and everything is gone** — unless it is a phoenix
(one revival a week) or wearing a Protection Charm.

Decay is worked out from the clock the moment anyone looks at a pet, not by a
scheduler rewriting rows. A restart or a night with the bot offline therefore
cannot skip time or double-count it. A sweep every ten minutes exists only to
send the warnings.

Chatting is what actually keeps a pet alive: every message gives happiness
(capped daily) and every fifth gives xp, reactions on your messages give a bit
more, and half an hour in voice gives happiness and xp.

Six stages at levels 1, 10, 25, 50, 75 and 100, with their own names per type —
Hatchling to Celestial Dragon, Kitten to Celestial Cat, and so on. Reaching a
stage adds 50 bonus xp and gets announced in `#general`.

## Roles it hands out

Pet Owner (has a pet), Pet Master (10 battle wins), Breeder (level 50),
Legendary Pet Owner (level 75), Mythical Pet Owner (level 100). They are
re-checked whenever a pet changes, and taken away again if a pet runs away.
`/kenopsia setup` creates them along with `#pet-guide`, `#pet-battles` and
`#pet-showcase`.

## Notes on the design

- **Node, not Python.** The spec asked for discord.py and SQLite. Coin
  integration is the point of this bot, and the wallet is a Node module — a
  second runtime would have needed a bridge for no gain.
- **JSON, not SQLite.** `data/pets.json`, written atomically, same as the rest
  of the project. At a few hundred members this is not the bottleneck; if the
  server ever outgrows it, the store module is the only file that changes.
- **DM warnings fail silently.** Most people have DMs from server members
  turned off. The warnings are a courtesy, not the mechanic — the stat bars in
  `/pet` are the real signal.
