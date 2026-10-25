# Party Clash: After Hours Trivia

A real-time multiplayer trivia game show for **2–8 players** on their own phones or computers. One player creates a room and shares a 4-letter code. Everyone answers the same question against the same clock, and the fastest correct answers win.

Built with TypeScript + Vite on the front end, a single **Netlify Function** on the back end, and **Netlify Blobs** for room state. It needs no database, API keys, environment variables or paid services.

---

## Rules

1. **Join.** The host taps **Create Room** and gets a 4-letter code (no look-alike letters such as I/O). Other players tap **Join Room** and enter the code and a nickname, or open the host's invite link. Rooms hold 2–8 players.
2. **Start.** Only the host can start, and only once at least 2 players are in.
3. **Answer fast.** Each of the **8 rounds** shows everyone the same multiple-choice question. You have **15 seconds** to tap one of 4 answers. You get one answer per question and can't change it once it's locked in.
4. **Score.** A correct answer earns **500 points plus a speed bonus of up to 500**, scaled by the time left. A wrong answer or no answer earns 0. The server calculates every score.
5. **Reveal.** When everyone has answered, or the timer runs out, all players see the correct answer, who picked what, and the leaderboard. The next round starts automatically.
6. **Win.** After round 8 the highest score wins. Ties are broken by **most correct answers**, then by **lowest total answer time on correct answers**. If players are still tied, they **share the win**.
7. **Rematch.** On the final screen the host taps **Play Again**. Everyone returns to the same lobby with scores reset and fresh questions. New players can join at that point.

The rules are also available in the game through the **How to play** / **?** button on every screen.

---

## Run locally

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm run dev
```

Open the printed URL, for example `http://localhost:5173`. To play from your phone on the same Wi-Fi, use the **Network** URL that Vite prints.

> **Testing several players on one computer:** each browser profile stores one player identity, so use different browsers, a private window, or different hostnames (`localhost`, `127.0.0.1`, or your LAN IP) for each player.

In `npm run dev`, Vite serves `/.netlify/functions/game` from the **same handler code** as the production function. It uses an in-memory store with the same compare-and-swap rules, so you don't need a Netlify account.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server, front end plus game API |
| `npm run build` | Type-check (`tsc`) and production build into `dist/` |
| `npm test` | Multiplayer API test suite: full games, scoring, ties, concurrency, security |
| `npm run test:blobs` | The same suite through the real `@netlify/blobs` client and Netlify's local Blobs emulator |
| `npm run test:e2e` | Browser end-to-end game with 3 independent players (desktop and phones). Needs a running server and Google Chrome |
| `node tests/e2e/stress.mjs <url>` | 8-client concurrency stress test against a running server |

---

## Project structure

```
├── index.html                 # App shell
├── public/favicon.svg
├── src/                       # Front end (vanilla TypeScript, no framework)
│   ├── main.ts                # Screens, rendering, polling, input handling
│   ├── api.ts                 # Calls /.netlify/functions/game and syncs the clock
│   ├── session.ts             # Player identity in localStorage (refresh recovery)
│   └── styles.css             # Late-night game-show theme, mobile-first
├── shared/types.ts            # Public API types and game constants (no secrets)
├── server/                    # Back-end helpers (kept outside netlify/functions)
│   ├── logic.ts               # Pure game rules: join, start, answer, scoring, rounds, winners
│   ├── handler.ts             # HTTP layer and optimistic-concurrency retry loop
│   ├── store.ts               # Netlify Blobs store, plus in-memory store for dev and tests
│   └── questions.ts           # Question bank (server-only; never sent to the browser)
├── netlify/functions/game.ts  # The Netlify Function (endpoint: /.netlify/functions/game)
├── dev/local-blobs.ts         # Starts Netlify's Blobs emulator for test:blobs
├── tests/                     # API test suite and browser/stress E2E scripts
├── netlify.toml
├── vite.config.ts
└── tsconfig.json
```

---

## Multiplayer architecture

- **One endpoint.** The browser `POST`s JSON to `/.netlify/functions/game` with an `action`: `create`, `join`, `state`, `start`, `answer`, `rematch` or `leave`.
- **Authoritative server state.** Each room is a single JSON document in the Netlify Blobs store `party-clash-rooms`, under the key `room-<CODE>`. The function loads it, applies the rules in `server/logic.ts`, and saves it.
- **No lost updates.** Reads use `consistency: "strong"`. Writes are **conditional**: `onlyIfNew` when a room is created, and `onlyIfMatch: <etag>` for every update. If two players act at the same moment, one write wins. The other gets a precondition failure, then re-reads and re-applies its action (with retries and jittered backoff). This was tested with 8 players answering in the same instant.
- **Server-owned timing.** Questions carry `startsAt` and `endsAt` timestamps set by the server. A question closes when every connected player has answered or the deadline passes. Reveals end on a fixed schedule. These transitions happen lazily on the next request from any player, so the game never depends on the host's device or a background timer. Clients estimate their offset from the server clock so countdowns match on every device.
- **Sync by polling.** Each client polls `state` about once a second, faster during questions. Polls are read-only unless the game needs to move forward. Heartbeats are written at most every 5 seconds per player.
- **Cheat resistance.** Clients only send *which option* they picked. Scores, timing and correctness are computed on the server, and extra fields such as `score` are ignored. The correct answer is never in any response until the round closes, and the question bank is not in the browser bundle. Other players' picks are hidden until the reveal. Every action requires the player's secret token. Duplicate answers, late answers, answers sent too early, bad options, actions by non-hosts, joins when the room is full or mid-game, and duplicate nicknames (case-insensitive) are all rejected on the server.
- **Refresh and disconnect handling.** The room code, player id and token are kept in `localStorage`, so a refresh rejoins as the same player with the same score and locked-in answer. If the host disappears for 20 seconds, host controls pass to the next connected player. Lobby players who vanish for 60 seconds are removed.

---

## Deploying to Netlify

No configuration beyond `netlify.toml` is needed:

- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions` (bundled with esbuild)
- **Environment variables:** none
- **Database:** none. Netlify Blobs is available to every Netlify site automatically.

**Recommended: deploy from GitHub.** In Netlify choose **Add new site → Import an existing project → GitHub**, then pick this repository. The settings are read from `netlify.toml`. Click **Deploy**.

**Alternative: Netlify CLI.** Run `npx netlify-cli deploy --build --prod` from the project folder.

> Netlify Drop (drag-and-drop) publishes static files only and does **not** build or run Netlify Functions. Use the GitHub import or the CLI so the multiplayer back end is deployed.

---

## Testing notes

- `npm test` plays complete 8-round games against the real handler and checks: sync, scoring maths, duplicate, late and early answers, tie-breakers, shared wins, rematch, refresh recovery, host hand-off, forged tokens, correct-answer secrecy, the 8-player cap and concurrent writes.
- Netlify's *local* Blobs emulator doesn't return ETags on reads, so conditional writes can't be fully exercised locally. That's why the dev server and the default test suite use an in-memory store with strict compare-and-swap. Production Netlify Blobs returns ETags and enforces `onlyIfMatch`.
