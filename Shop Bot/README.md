# KALLEN — the shop

The one shop in Kenopsia. Its own Discord application, but it runs inside the
main process (`index.js`) because every price it charges comes out of the shared
coin wallet, and one file needs one writer.

## One currency

There is no second currency and there never was. Shirley's voice time has always
paid into the same `data/kenopsia.json` balance that messages pay into — see the
comment at the top of `Voice Bot/lib/store.js`. So there is one number on every
price tag and no conversion anywhere.

The old `/voice-shop` is gone; everything it sold that KALLEN still sells moved
here. The pet shop (`/pet-shop`) is the only shop that stayed separate, and it
only sells pet things.

## What it will not sell

Two rules the catalogue is built on, both worth keeping when you add items:

**No roles. No exceptions.** KALLEN hands out nothing that lives in the role
list, because roles are permissions and standing, and a role list you can buy
your way up stops meaning anything. Anyone who bought a role from the old voice
shop kept it.

Tamem access was briefly going to be the one exception. It is not: the owner
grants it by hand with `/tamem allow`, because who may teach a bot that repeats
what it is taught is a judgement about trust, not a purchase.

**Nothing that cannot be handed over.** Discord's avatar decorations, profile
effects, nickname bold/italic and custom statuses belong to Discord. No bot can
grant them, so selling them would be selling something that never arrives. The
"cards" in here are the honest version: KALLEN owns the embed `/profile` draws,
so it decorates that.

## Prices

Anchored to real money, because Robux and Nitro come out of the owner's pocket:

    1 Robux  ~    125 coins
    USD 1    ~ 10,000 coins

An active member earns roughly 225 coins a day (100 from messages at the daily
cap, ~30 an hour in voice), which puts the cheapest Robux pack at about five
months of real activity.

To retune the whole shop, change `SCALE` at the top of `lib/catalog.js` — every
price is multiplied through it. `SCALE = 0.5` halves the shop. Do not edit forty
numbers by hand.

For a single item, the owner does not need the code at all:
`/kallen price item:<id> coins:<n>` and `/kallen stock item:<id> available:<bool>`.

## The queue and the escrow

Robux, Nitro and in-game items are sent by hand, so a request can sit in the
queue for days. The coins leave the member's balance the moment a price is known
and are held on the request itself.

That is the whole point. Without it a member could open a 50,000 coin Robux
request and spend the same 50,000 on a card before the owner ever looked at the
queue. Every exit that is not `completed` gives the coins straight back.

    fixed price   open -> pending -> approved -> completed
    quoted price  open -> pending -> quoted -> (member pays) -> approved -> completed

Anything still `pending` or `quoted` after seven days closes itself and refunds.
An `approved` request never auto-expires — the owner said yes and may already
have sent it.

## Robux, and the 18+ gate

Robux is paid one way only: the member puts a gamepass on their own Roblox
account for the right price and the owner buys it. That needs Roblox Premium on
the member's side. **Nobody logs into anybody's account, ever**, and in-game
items are handed over by trading in game.

`/request robux` will not open without both a confirmed 18-or-over declaration
and a link that actually looks like a Roblox gamepass. Both are recorded on the
request and shown to the owner, who checks them before paying — the bot gates
the paperwork, the owner makes the call.

## Rooms go quiet, purchases do not

A private voice room is 2,000 coins — cheap enough that plenty of people will
own one, which is exactly why the channel is swept. Empty for two hours and it
comes down, so the voice list does not fill with names nobody has clicked in
weeks.

**Only the channel is deleted.** The item stays in the member's inventory and
`/inventory room` builds it again for nothing, as often as they like, at the
size they last set. They get a DM saying so. Nobody loses a purchase for going
quiet.

The owner picks the size: `/inventory room limit:6` fits six people, `limit:0`
is open to anyone. Run it again with a new number to resize a room that is
already up — no need to delete it first. The size is remembered, so a rebuilt
room comes back the way they left it.

Bought **text** rooms are never swept. Deleting a text channel destroys every
message in it and there is no undo, so idleness is not a good enough reason.
If one is deleted by hand, KALLEN notices and lets the member rebuild it.

The separate `Create a room` hub rooms (C.C's, not the shop's) now wait two
minutes after emptying instead of vanishing the instant the last person leaves —
a reconnect or a drag into another channel used to destroy the room mid-call.
Both sweeps run on the minute tick and are recorded in the store, so a restart
no longer leaves orphaned channels behind.

## Commands

### Members

| Command | What it does |
| --- | --- |
| `/shop [category]` | The shelves. Prices, durations and what needs approval. |
| `/buy item: [user:]` | Buys something, or gifts it. Delivered before it is charged. |
| `/inventory list` | What you own and what is on your card. |
| `/inventory use item:` / `bare` | Wear a card, or take it off. |
| `/inventory set field: [value:]` | Fill in a title, badge, bio, showcase or accent you bought. |
| `/inventory emoji` / `sticker` / `event` / `spotlight` | Spend a slot. |
| `/inventory room [limit:] [type:]` | Open your room, or change how many people fit. Free. |
| `/balance [user]` | Coins, and anything held in an open request. |
| `/request robux` | 18+ and a gamepass link required. |
| `/request nitro` / `item` / `custom` / `announcement` | The rest of the queue. |
| `/request status` | Your requests, and anything waiting on you. |
| `/request pay id:` | Accept a price the owner quoted. |

### Owner

`/kallen` is hidden behind Manage Server and checked again against
`SHOP_OWNER_IDS`. The guild owner always passes.

| Command | What it does |
| --- | --- |
| `/kallen queue [status:]` | What is waiting, and how many coins are held. |
| `/kallen quote id: coins:` | Put a price on a request that has none. |
| `/kallen approve id:` | Accept it. Announcements post and close themselves. |
| `/kallen deny id: reason:` | Turn it down and refund. |
| `/kallen complete id: [note:]` | You have sent it — close it. |
| `/kallen refund id: [reason:]` | Reverse a completed one. |
| `/kallen coins user: amount: [reason:]` | Add or take coins. Negative takes. |
| `/kallen give user: item:` | Hand someone an item free. |
| `/kallen price` / `stock` | Override a price, or take an item off the shelf. |
| `/kallen history user:` | Balance, what they own, every request, their Robux declaration. |

## Setup

1. Create a second application in the developer portal, add a bot, copy the
   token. Turn **Public Bot** off.
2. `cp "Shop Bot/.env.example" "Shop Bot/.env"` and fill in `SHOP_TOKEN`,
   `SHOP_CLIENT_ID` and `SHOP_OWNER_IDS`.
3. Invite it with `bot` and `applications.commands`, plus **Manage Channels**
   (private rooms), **Manage Expressions** (emoji and stickers), **Manage
   Events** and **Send Messages**.
4. `npm run deploy:shop`, then restart the main process.

KALLEN creates `#shop-requests` itself the first time a request comes in, hidden
from everyone but staff — it holds gamepass links and 18+ declarations, so it
should not exist on a server that never turned the shop on.

## Files

    lib/catalog.js     every item, every price, the SCALE knob
    lib/pricing.js     list price vs the owner's overrides
    lib/wallet.js      the bridge to the Kenopsia coin balance, and the escrow
    lib/requests.js    the approval queue and its state machine
    lib/inventory.js   what people own, stacking and expiry
    lib/cosmetics.js   what a member's card looks like
    lib/card.js        the /profile embed, shared with C.C
    lib/deliver.js     rooms, emoji, stickers, events — handed over before charging
    lib/notify.js      owner DMs, the queue channel, member updates
    data/shop.json     inventory, requests, overrides (gitignored)
