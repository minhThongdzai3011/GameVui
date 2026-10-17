# Bóng Đá Việt Manager

A football management game for V.League 1 and V.League 2 with real 2026/27 squads. Open `index.html` directly (no server or build step needed) or from the GameVui home page.

## The game

- Pick any of the 28 clubs; the board sets a season objective from the club's strength.
- Home: next match, board confidence, inbox (results, injuries, suspensions, monthly finances), mini table.
- Squad: six formations, pitch view with slots and a 9-player bench, player profiles (25 attributes, stats, contract). At most 4 foreign-slot players on the pitch. Positions use English codes (GK, CB, LB, RB, DM, CM, AM, LM, RM, LW, RW, ST) with the Vietnamese name alongside; every player shows an overall rating (1–100, an estimate with ~ for other clubs' players you have not scouted). The player list filters by line (GK/DF/MF/FW), by who can play a given position (with proficiency), by status (starting, bench, out, ready, tired, unavailable, foreign, ≤ 23, unhappy) and sorts by position, overall, fitness, morale or age. Secondary positions play at 93–100% depending on proficiency ("tạm được", "khá", "thành thạo"); only positions a player is not listed for get the ⚠ warning. Auto-pick improves the greedy lineup by swapping slots, so a striker who can play wide goes wide instead of another striker out of position.
- Tactics: mentality, pressing, tempo, passing. Familiarity with each formation (0–100%): the formation in use is learned week by week, unused ones are slowly forgotten; a brand-new formation plays up to 6% weaker than a fully learned one.
- Training (tab "Lối chơi"): weekly focus (balanced, physical, technical, tactical, recovery) and intensity (light, normal, heavy). Players up to 27 who are below their potential improve every Monday, fastest when young, playing regularly and professional; the focus decides which attributes grow, and tactical focus learns formations twice as fast. Heavy training develops faster but slows fitness recovery and causes more training injuries; recovery focus does the opposite. Monthly training report, ▲ marks on attributes improved in the last 30 days. Decline with age still happens at the start of a new season. AI clubs train balanced at normal intensity.
- Transfers (tab "Thị trường"): summer window (pre-season to two weeks after round 1) and mid-season window (Tết break); free agents any time. Search by position, league, age and price; bid (the selling club accepts, counters or rejects with a hint of what they want); negotiate wage and length with the player (who can refuse, e.g. a V.League 1 star will not drop to V.League 2). AI clubs bid for your players (more when you transfer-list them), buy and sell among themselves and sign free agents. Wage bill capped by the board.
- Scouting: you only see other clubs' players as well as your scouts know them. Same-league players start as rough ranges (attributes like 11–15, estimated stars, potential and value), players in the other league and free agents show no attributes at all, and Vietnam / U23 internationals are better known. Playing against a team teaches you a little about the players it fielded. Send a scout to one player (5–8 days, 20 million) for exact attributes, personality and a report (grade A–D, role in your squad, strengths and weaknesses, likely fee and wage), or to a whole club (14–18 days, 80 million) for a good picture of the squad. Two or three scouts at once depending on club reputation; knowledge fades a little each new season. Market search sorts by these estimates. Only what you see changes: AI clubs and the match engine use the real numbers.
- Cups: Super Cup at the start of the season (V.League 1 champion vs cup winner, neutral venue) and the National Cup for all 28 clubs (single-leg knockout on Wednesdays between league rounds, penalties if level, top 4 of V.League 1 skip the first round, lower-tier club at home, neutral final). Cup stats are kept apart from league top scorers; prize money and a trophy room in the Club tab.
- Morale: each of your players expects playing time from his place in the squad (key player, starter or rotation, judged within his position group; young and veteran rotation players are patient). Every Monday the last six matches are checked (start = 1, substitute = 0.5, injuries and suspensions ignored); short of it he gets unhappy, complains after four weeks and asks to leave after ten. Talk to a player every 14 days from his profile (praise, criticise, promise more playing time, persuade him to stay): the effect depends on his recent ratings and professionalism. A promise lasts six weeks; keeping it pleases him, breaking it makes him ask to leave. Team meetings every 14 days on the Home tab (praise, demand more, ease the pressure) work according to recent results. Promising a starting place when signing or renewing lowers his wage demand by 10%. Turning down an offer from a bigger club upsets the player. Morale changes match strength by up to ±7%, development speed and contract talks; players asking to leave attract more bids and will not renew. In quick simulation your assistant makes fitness substitutions (tactics untouched).
- Loans (until 30 June, the player then returns): ask to borrow another club's player from their profile, choosing how much of the wage you pay (50 / 75 / 100%) and optionally a buy clause at a fixed fee that you can trigger at any time during the loan. Clubs will not loan out key players, or regular starters unless they are 21 or younger and you pay the full wage, and the player only comes if he would start or be on your bench. Mark your own players for loan and clubs that would start them or put them on the bench send offers, with the expected role. AI clubs loan young surplus players to each other, only where they will start. Loaned players cannot be bought, sold or released; wages are split between the two clubs. The Contracts tab lists players loaned out (with their appearances, goals, average rating and development) and loaned in.
- Asian club competitions (2026/27 format): AFC Champions League Elite ("C1": 16-club East and West league stages, 8 games against 8 different opponents, top 8 to two-legged regional last 16, then single-match quarter-finals, semi-finals and final at a neutral venue) and AFC Champions League Two ("C2": 8 groups of 4, top 2 through, two-legged regional knockouts, single-match East v West final). The first season uses the real participants, groups and East fixture list (Công an Hà Nội in C1 after winning the play-off, Thể Công – Viettel in C2 group E); later seasons send the V.League 1 champion to the C1 play-off (losers drop into C2) and the runner-up to C2. Foreign clubs have their real names, countries, stadiums and colours with generated squads (names by nationality, imports, strength by tier); games between two foreign clubs are quick-simulated. C1 on Tuesdays, C2 on Wednesdays, avoiding National Cup weeks. Prize money, a "Châu Á" fixtures tab with tables and brackets, foreign club pages (scoutable), continental stats, trophies.
- Contracts: end on 30 June; reminders in January, March and May; renew from the player profile or the Contracts list; expired contracts leave as free agents; releasing a player costs half the remaining wages.
- Matches: live text commentary with live stats, speed control, substitutions (5) and tactic changes during the match, injuries, cards, player ratings; or quick simulation.
- Season: 26 rounds per league, play-off (V.League 1 13th vs V.League 2 2nd), promotion and relegation (V.League 2 bottom drops to the Second Division and is replaced by a generated club), then a new season with ageing, development, retirements and youth intake. Missing the board's objective badly gets you sacked.
- Career history in the player profile: the real seasons before the game starts (appearances and goals from vpf.vn) followed by one row per season played in the game (clubs, including mid-season moves and loans, league, appearances, goals, assists, average rating, cup games), plus individual awards.
- Season awards for each league: player of the season, top scorer, young player (23 or under), goalkeeper, manager (biggest overachiever against squad strength; you can win it) and a 4-3-3 team of the season. Shown on the season-end screen, in the Club tab for past seasons and in each winner's profile.
- Saves: automatic in the browser (IndexedDB); "Xuất mã save" gives a compressed code (`GVFM1:…`, about 40 KB) to continue in another browser.

Code (plain scripts sharing `window.FM`, because ES modules and `fetch` do not work from `file://`):

| File | What it does |
|---|---|
| `data/game-data.js` | Generated data bundle (`node scripts/build-game-data.mjs`) |
| `js/core.js` | Seeded RNG, dates, money, formations, attribute and role weights |
| `js/engine.js` | Match engine and automatic team selection |
| `js/world.js` | New game, fixtures, daily simulation, results, tables, season end and new season |
| `js/transfers.js` | Transfer windows, valuation, bids, contract talks, AI transfers, contract expiry |
| `js/loans.js` | Loans: requests, offers for your players, AI loans, wage split, buy clause, returns at season end |
| `js/morale.js` | Morale: playing-time expectations, complaints and transfer requests, promises, player talks, team meetings |
| `js/history.js` | Career history and end-of-season awards |
| `js/afc.js` | AFC Champions League Elite / Two: entrants, schedule, generated foreign squads, quick sims, knockouts, prizes |
| `js/cups.js` | Super Cup and National Cup: draws, rounds, winners, prize money |
| `js/training.js` | Training plans, weekly development, training injuries, formation familiarity |
| `js/scout.js` | Scouting: how well you know each player, estimated stars / attribute ranges, scout assignments and reports |
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
- `data/afc.json` (from `node scripts/afc-source.mjs`): the 62 foreign clubs of the 2026/27 C1 and C2 (country, region, stadium, colours, strength tier 1–5), the real East C1 fixture list and the C2 groups, with sources in the script. Codes, colours, tiers and some stadiums are my estimates.
- `data/club-colors.json`: real home kit colours [main, secondary] of every club, researched by hand (mostly Wikipedia kit templates and footyheadlines), each with its source and a confidence level; `build-game-data.mjs` uses them for crests and shirts, and falls back to a colour generated from the club code.
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
