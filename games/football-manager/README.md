# Bóng Đá Việt Manager

A football management game for V.League 1 and V.League 2 with real 2026/27 squads. Open `index.html` directly (no server or build step needed) or from the GameVui home page.

## The game

- Pick any of the 28 clubs; the board sets a season objective from the club's strength.
- Home: next match, board confidence, inbox (results, injuries, suspensions, monthly finances), mini table.
- Squad: six formations, pitch view with slots and a 9-player bench, player profiles (25 attributes, stats, contract). At most 4 foreign-slot players on the pitch.
- Tactics: mentality, pressing, tempo, passing.
- Transfers (tab "Thị trường"): summer window (pre-season to two weeks after round 1) and mid-season window (Tết break); free agents any time. Search by position, league, age and price; bid (the selling club accepts, counters or rejects with a hint of what they want); negotiate wage and length with the player (who can refuse, e.g. a V.League 1 star will not drop to V.League 2). AI clubs bid for your players (more when you transfer-list them), buy and sell among themselves and sign free agents. Wage bill capped by the board.
- Contracts: end on 30 June; reminders in January, March and May; renew from the player profile or the Contracts list; expired contracts leave as free agents; releasing a player costs half the remaining wages.
- Matches: live text commentary with live stats, speed control, substitutions (5) and tactic changes during the match, injuries, cards, player ratings; or quick simulation.
- Season: 26 rounds per league, play-off (V.League 1 13th vs V.League 2 2nd), promotion and relegation (V.League 2 bottom drops to the Second Division and is replaced by a generated club), then a new season with ageing, development, retirements and youth intake. Missing the board's objective badly gets you sacked.
- Saves: automatic in the browser (IndexedDB); "Xuất mã save" gives a compressed code (`GVFM1:…`, about 40 KB) to continue in another browser.

Code (plain scripts sharing `window.FM`, because ES modules and `fetch` do not work from `file://`):

| File | What it does |
|---|---|
| `data/game-data.js` | Generated data bundle (`node scripts/build-game-data.mjs`) |
| `js/core.js` | Seeded RNG, dates, money, formations, attribute and role weights |
| `js/engine.js` | Match engine and automatic team selection |
| `js/world.js` | New game, fixtures, daily simulation, results, tables, season end and new season |
| `js/transfers.js` | Transfer windows, valuation, bids, contract talks, AI transfers, contract expiry |
| `js/save.js` | IndexedDB saves and save codes |
| `js/ui.js` | All screens |

Checks: `node scripts/sim-test.mjs` (engine balance: goals per match, home/draw/away, cards, strength vs points) and `node scripts/season-test.mjs` (plays full seasons without the UI).

After re-importing data or rebuilding ratings, run `node scripts/build-game-data.mjs` so the game picks them up.

## Data

## Scope

Vietnamese football only: **V.League 1** and **V.League 2** (Hạng Nhất), with promotion and relegation between them. No other countries or competitions.

- Clubs, player identity, squad membership, positions, physical data and season statistics
- Fixtures and standings can be added later without changing the schema

## Import from VPF (no API key)

The official league organiser's site, vpf.vn, has a page per club for each season (squad: shirt number, position, height, weight, date of birth, goals and cards) and a page per player (first and last name, nationality, statistics for any past season, and a season selector that lists only the seasons the player took part in).

```powershell
node scripts/import-vpf.mjs              # 2026/27 squads + 2025/26 and 2024/25 statistics
node scripts/import-vpf.mjs --history=1  # only one past season
node scripts/import-vpf.mjs --refresh    # ignore the cache and download everything again
```

- For each player the importer opens the current-season page, reads the season selector, then downloads only the past V.League 1/2 seasons that player played in.
- A 1 s pause between downloads; a full run from an empty cache takes around 30 minutes.
- Each parsed page is cached in `data/vpf-cache/` (ignored by Git), so a run that stops can be restarted and continues where it left off.
- VPF does not record minutes played (always 0), so the rating model uses appearances and starts.
- VPF season ids are listed in the script (`COMPETITIONS`, `HISTORY`); a new season needs its id from the season selector on any player page.
- `data/overrides.json` is applied last: hand-checked positions, birth dates and nationalities that VPF leaves blank (with source links), duplicate registrations to merge, and staff listed as players.

## Import from API-Football (other leagues, needs a key)

1. Create an API-Football key at https://dashboard.api-football.com/.
2. In PowerShell, run the importer from this folder:

   ```powershell
   $env:API_FOOTBALL_KEY = "your-key"
   node scripts/import-api-football.mjs --season=2026 --leagues=vietnam-v-league-1,england-premier-league
   ```

3. A dated snapshot is written to `data/snapshots/YYYY-MM-DD/`.

The importer's default request volume is deliberately modest. Import one or two leagues while validating data, then import the full v1 list. API keys must never be placed in browser JavaScript or committed to Git.

## Files produced

- `meta.json`: source, import time, season and selected competitions
- `leagues.json`: competition identity and coverage
- `clubs.json`: current clubs in each competition
- `players.json`: deduplicated player identity records
- `squads.json`: current club-player relationships and positions
- `stats.json` (VPF): one row per player, season and club: appearances, starts, goals, cards
- `staff.json` (VPF): assistant coaches and officials listed in club squads

- `standings.json` (VPF): final tables of the two previous seasons and the current table, both leagues

## Rating model

```powershell
node scripts/build-ratings.mjs   # writes ratings.json into the newest snapshot
```

`ratings.json` is generated by our own model, not copied from another game:

- **Club strength** from points per game over the last two seasons and the current one, with V.League 1 on a higher base than V.League 2.
- **Player level** from how much each player was used each season ((starts + 0.35 × sub appearances) / rounds), in which league, goals per game, the club's strength, foreign signings, and Vietnam / U23 call-ups (`data/national-team.json`). Raw scores are ranked within each league and mapped to a target spread, so CA (1–100) is about 47–75 for most V.League 1 players and 39–63 in V.League 2.
- **Detailed position** (GK, CB, LB, RB, DM, CM, AM, LM, RM, LW, RW, ST) from hand-checked data, shirt number, height and goals; every club is checked to have enough players for each role.
- **25 attributes (1–20)** from CA and the position's profile, adjusted for height, weight, age and goals; potential (PA), preferred foot, wage (million VND per month), value (billion VND), contract end, club reputation and budgets.
- Randomness is seeded by player id, so re-running gives the same numbers.
- `data/ratings-overrides.json` (optional) is applied last for hand tuning: `{"players": {"<id>": {"ca": 70, "attributes": {"finishing": 16}}}}`.
