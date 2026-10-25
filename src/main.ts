import "./styles.css";
import { ApiError, api, serverNow } from "./api.ts";
import { clearSession, lastName, loadSession, saveSession, type Session } from "./session.ts";
import {
  BASE_POINTS,
  MAX_PLAYERS,
  MAX_SPEED_BONUS,
  MIN_PLAYERS,
  NAME_MAX,
  QUESTION_MS,
  TOTAL_ROUNDS,
  type PublicPlayer,
  type PublicRoom,
} from "../shared/types.ts";

type Screen = "home" | "create" | "join" | "room";

const app = document.getElementById("app")!;
const toastEl = document.getElementById("toast")!;

let screen: Screen = "home";
let session: Session | null = loadSession();
let room: PublicRoom | null = null;
let busy = false;
let formError = "";
let notice = "";
let connectionLost = false;
let pendingChoice: number | null = null;
let rulesOpen = false;
let leaveArmed = false;
let lastSig = "";
let pollTimer: number | undefined;
let polling = false;
let pollGeneration = 0;

const initialCode = normalizeCode(new URLSearchParams(location.search).get("room") ?? "");

// ---------------------------------------------------------------- helpers

function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const AVATAR_COLORS = ["#8b5cf6", "#22d3ee", "#f472b6", "#facc15", "#4ade80", "#fb923c", "#60a5fa", "#e879f9"];

function avatar(p: PublicPlayer, size = "") {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length];
  const initial = [...p.name][0]?.toUpperCase() ?? "?";
  return `<span class="avatar ${size}" style="--av:${color}" aria-hidden="true">${esc(initial)}</span>`;
}

function me(): PublicPlayer | undefined {
  return room?.players.find((p) => p.id === session?.playerId);
}

function nameOf(id: string) {
  return room?.players.find((p) => p.id === id)?.name ?? "Someone";
}

function standings(r: PublicRoom): PublicPlayer[] {
  const win = new Set(r.winners);
  return r.players
    .filter((p) => !p.left)
    .slice()
    .sort(
      (a, b) =>
        Number(win.has(b.id)) - Number(win.has(a.id)) ||
        b.score - a.score ||
        b.correct - a.correct ||
        a.name.localeCompare(b.name),
    );
}

/** Competition ranking ("1, 2, 2, 4"); co-winners share 1st. */
function ranks(list: PublicPlayer[], winners: string[]): number[] {
  return list.map((p, i) => {
    if (winners.includes(p.id)) return 1;
    let r = i;
    while (r > 0 && list[r - 1].score === p.score && list[r - 1].correct === p.correct && !winners.includes(list[r - 1].id)) r--;
    return r + 1;
  });
}

function toast(message: string, kind: "error" | "info" = "info") {
  toastEl.textContent = message;
  toastEl.className = `toast show ${kind}`;
  clearTimeout((toast as unknown as { t?: number }).t);
  (toast as unknown as { t?: number }).t = window.setTimeout(() => (toastEl.className = "toast"), 3200);
}

function inviteUrl(code: string) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function setUrlRoom(code: string | null) {
  const url = code ? `${location.pathname}?room=${code}` : location.pathname;
  history.replaceState(null, "", url);
}

// ---------------------------------------------------------------- shared UI

const RULES_HTML = `
  <ol class="rules">
    <li><b>Join</b> — one player creates a room and shares the 4-letter code. Everyone else taps <i>Join Room</i> and enters it. 2–8 players.</li>
    <li><b>Answer fast</b> — each round shows the same question to everyone. Tap one of the 4 answers within <b>15 seconds</b>. You get one answer — no take-backs.</li>
    <li><b>Score</b> — a correct answer earns <b>${BASE_POINTS} points</b> plus a speed bonus of up to <b>${MAX_SPEED_BONUS}</b>. The faster you answer, the bigger the bonus. Wrong or no answer = 0.</li>
    <li><b>Reveal</b> — when everyone has answered (or time runs out) the correct answer and the leaderboard appear, then the next round starts automatically.</li>
    <li><b>Win</b> — after <b>${TOTAL_ROUNDS} rounds</b> the highest score wins. Ties go to most correct answers, then fastest total answer time. Still tied? You share the win.</li>
  </ol>`;

function rulesModal() {
  if (!rulesOpen) return "";
  return `
  <div class="modal-backdrop" data-action="close-rules">
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="rules-title" data-stop>
      <h2 id="rules-title">How to play</h2>
      ${RULES_HTML}
      <button class="btn primary block" data-action="close-rules">Got it</button>
    </div>
  </div>`;
}

function brand(small = false) {
  return `<div class="brand ${small ? "small" : ""}"><span class="brand-top">Party Clash</span><span class="brand-sub">After Hours Trivia</span></div>`;
}

function connectionBanner() {
  return connectionLost ? `<div class="banner warn" role="status"><span class="spinner sm"></span> Reconnecting…</div>` : "";
}

function gameHeader(r: PublicRoom) {
  const mine = me();
  const segs = Array.from({ length: r.totalRounds }, (_, i) => {
    const n = i + 1;
    const cls = n < r.round || (n === r.round && r.phase === "reveal") ? "done" : n === r.round ? "current" : "";
    return `<span class="seg ${cls}"></span>`;
  }).join("");
  return `
  <header class="game-header">
    <div class="gh-row">
      <div class="round-label">Round <b>${r.round}</b><span>/${r.totalRounds}</span></div>
      <div class="gh-right">
        <span class="chip code-chip" title="Room code">${esc(r.code)}</span>
        <button class="icon-btn" data-action="open-rules" aria-label="How to play">?</button>
      </div>
    </div>
    <div class="progress" aria-label="Round ${r.round} of ${r.totalRounds}">${segs}</div>
    ${mine ? `<div class="my-score">${avatar(mine, "xs")}<span>${esc(mine.name)}</span><b>${mine.score.toLocaleString()} pts</b></div>` : ""}
  </header>`;
}

// ---------------------------------------------------------------- screens

function homeView() {
  return `
  <main class="screen home">
    <div class="glows" aria-hidden="true"><div class="glow g1"></div><div class="glow g2"></div></div>
    ${brand()}
    <p class="tagline">The late-night quiz show you play from your phone. Same questions, same clock — fastest right answer wins.</p>
    <div class="feature-row">
      <span class="chip">👥 ${MIN_PLAYERS}–${MAX_PLAYERS} players</span>
      <span class="chip">🎯 ${TOTAL_ROUNDS} rounds</span>
      <span class="chip">⏱ ${QUESTION_MS / 1000}s per question</span>
    </div>
    ${notice ? `<div class="banner info" role="status">${esc(notice)}</div>` : ""}
    <div class="stack">
      <button class="btn primary xl" data-action="go-create">Create Room</button>
      <button class="btn secondary xl" data-action="go-join">Join Room</button>
      <button class="btn ghost" data-action="open-rules">How to play</button>
    </div>
  </main>`;
}

function createView() {
  return `
  <main class="screen form-screen">
    <button class="back" data-action="go-home" aria-label="Back">← Back</button>
    ${brand(true)}
    <form class="card form" data-form="create" novalidate>
      <h1>Host a game</h1>
      <p class="hint">You'll get a room code to share. You control when the game starts.</p>
      <label for="name">Your nickname</label>
      <input id="name" name="name" maxlength="${NAME_MAX}" autocomplete="nickname" enterkeyhint="go" placeholder="e.g. QuizWizard" value="${esc(lastName())}" required />
      ${formError ? `<p class="form-error" role="alert">${esc(formError)}</p>` : ""}
      <button class="btn primary block xl" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner sm"></span> Creating…' : "Create Room"}</button>
    </form>
  </main>`;
}

function joinView() {
  return `
  <main class="screen form-screen">
    <button class="back" data-action="go-home" aria-label="Back">← Back</button>
    ${brand(true)}
    <form class="card form" data-form="join" novalidate>
      <h1>Join a game</h1>
      <p class="hint">Ask the host for the 4-letter room code.</p>
      <label for="code">Room code</label>
      <input id="code" name="code" class="code-input" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(initialCode)}" required />
      <label for="name">Your nickname</label>
      <input id="name" name="name" maxlength="${NAME_MAX}" autocomplete="nickname" enterkeyhint="go" placeholder="e.g. NightOwl" value="${esc(lastName())}" required />
      ${formError ? `<p class="form-error" role="alert">${esc(formError)}</p>` : ""}
      <button class="btn primary block xl" type="submit" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner sm"></span> Joining…' : "Join Room"}</button>
    </form>
  </main>`;
}

function lobbyView(r: PublicRoom) {
  const players = r.players.filter((p) => !p.left);
  const amHost = r.hostId === session?.playerId;
  const host = players.find((p) => p.isHost);
  const canStart = players.length >= MIN_PLAYERS;
  const empty = Math.max(0, Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, players.length + 1)) - players.length);
  return `
  <main class="screen lobby">
    ${connectionBanner()}
    <div class="lobby-top">
      ${brand(true)}
      <button class="icon-btn" data-action="open-rules" aria-label="How to play">?</button>
    </div>
    <section class="card code-card">
      <div class="label">Room code${r.gameNumber > 1 ? ` · Game ${r.gameNumber}` : ""}</div>
      <div class="code-tiles" aria-label="Room code ${esc(r.code.split("").join(" "))}">${[...r.code].map((c) => `<span>${esc(c)}</span>`).join("")}</div>
      <p class="hint">Friends join at this site with this code.</p>
      <button class="btn secondary" data-action="copy-link">🔗 Copy invite link</button>
    </section>
    <section class="card players-card">
      <div class="section-head"><h2>Players</h2><span class="count">${players.length}/${MAX_PLAYERS}</span></div>
      <ul class="player-list">
        ${players
          .map(
            (p) => `
          <li class="player ${p.connected ? "" : "offline"} pop-in">
            ${avatar(p)}
            <span class="pname">${esc(p.name)}</span>
            ${p.id === session?.playerId ? '<span class="tag you">You</span>' : ""}
            ${p.isHost ? '<span class="tag host">👑 Host</span>' : ""}
            ${p.connected ? "" : '<span class="tag off">offline</span>'}
          </li>`,
          )
          .join("")}
        ${Array.from({ length: empty }, () => `<li class="player slot"><span class="avatar empty"></span><span class="pname">Waiting for player…</span></li>`).join("")}
      </ul>
    </section>
    <section class="lobby-actions">
      ${
        amHost
          ? `<button class="btn primary block xl" data-action="start" ${canStart && !busy ? "" : "disabled"}>${busy ? '<span class="spinner sm"></span> Starting…' : "Start Game"}</button>
             <p class="hint center">${canStart ? `Everyone in? Start when ready — ${TOTAL_ROUNDS} rounds, about 3 minutes.` : `Need at least ${MIN_PLAYERS} players to start. Share the code!`}</p>`
          : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span><span>Waiting for <b>${esc(host?.name ?? "the host")}</b> to start the game…</span></div>`
      }
      <div class="mini-rules card">
        <div><b>⏱ 15s</b> per question</div><div><b>⚡ Faster</b> = more points</div><div><b>🏆 ${TOTAL_ROUNDS}</b> rounds</div>
      </div>
      <button class="btn ghost" data-action="leave">${leaveArmed ? "Tap again to leave" : "Leave room"}</button>
    </section>
  </main>`;
}

function questionView(r: PublicRoom) {
  const q = r.question!;
  const now = serverNow();
  const players = r.players.filter((p) => !p.left);
  const answered = players.filter((p) => p.answered).length;
  if (now < q.startsAt) {
    return `
    <main class="screen game">
      ${connectionBanner()}
      ${gameHeader(r)}
      <section class="get-ready">
        <div class="label">Round ${q.round} of ${r.totalRounds}</div>
        <div class="category big">${esc(q.category)}</div>
        <div class="ready-count" data-countdown="${q.startsAt}" data-fmt="ceil">${Math.ceil((q.startsAt - now) / 1000)}</div>
        <div class="hint">Get ready…</div>
      </section>
    </main>`;
  }
  const choice = r.yourChoice ?? pendingChoice;
  const locked = choice !== null;
  const timeUp = now >= q.endsAt;
  const letters = ["A", "B", "C", "D"];
  let status: string;
  if (locked) status = `<b>Locked in!</b> Waiting for others… ${answered}/${players.length} answered`;
  else if (timeUp) status = `<b>Time's up!</b> Revealing the answer…`;
  else status = `Tap your answer · ${answered}/${players.length} answered`;
  return `
  <main class="screen game">
    ${connectionBanner()}
    ${gameHeader(r)}
    <section class="timer ${timeUp ? "up" : ""}">
      <div class="timer-bar"><div class="timer-fill" data-bar-start="${q.startsAt}" data-bar-end="${q.endsAt}"></div></div>
      <div class="timer-num" data-countdown="${q.endsAt}" data-fmt="ceil">${Math.max(0, Math.ceil((q.endsAt - now) / 1000))}</div>
    </section>
    <section class="question-card card">
      <div class="category">${esc(q.category)}</div>
      <h1 class="question-text">${esc(q.text)}</h1>
    </section>
    <section class="answers ${locked ? "locked" : ""}">
      ${q.options
        .map(
          (opt, i) => `
        <button class="answer a${i} ${choice === i ? "chosen" : ""}" data-action="answer" data-choice="${i}" ${locked || timeUp ? "disabled" : ""}>
          <span class="letter">${letters[i]}</span><span class="opt">${esc(opt)}</span>
          ${choice === i ? `<span class="lock">${r.yourChoice === i ? "✓ Locked" : '<span class="spinner sm"></span>'}</span>` : ""}
        </button>`,
        )
        .join("")}
    </section>
    <section class="status-line">${status}</section>
    <div class="answered-row">
      ${players.map((p) => `<span class="ans-pill ${p.answered ? "yes" : ""}" title="${esc(p.name)}">${avatar(p, "xs")}${p.answered ? "✓" : ""}</span>`).join("")}
    </div>
  </main>`;
}

function revealView(r: PublicRoom) {
  const rv = r.reveal!;
  const letters = ["A", "B", "C", "D"];
  const mineRes = rv.results.find((x) => x.playerId === session?.playerId);
  const byChoice = (i: number) => rv.results.filter((x) => x.choice === i);
  const list = standings(r);
  const rk = ranks(list, []);
  let banner: string;
  if (!mineRes) banner = `<div class="result-banner neutral">Round ${rv.round} results</div>`;
  else if (mineRes.correct) banner = `<div class="result-banner good pop-in">✓ Correct! <b>+${mineRes.points}</b><span>answered in ${((mineRes.timeMs ?? 0) / 1000).toFixed(1)}s</span></div>`;
  else if (mineRes.choice === null) banner = `<div class="result-banner bad pop-in">⏱ No answer · +0</div>`;
  else banner = `<div class="result-banner bad pop-in">✗ Wrong answer · +0</div>`;
  return `
  <main class="screen game">
    ${connectionBanner()}
    ${gameHeader(r)}
    ${banner}
    <section class="card reveal-card">
      <div class="category">${esc(rv.category)}</div>
      <h2 class="question-text sm">${esc(rv.text)}</h2>
      <ul class="reveal-options">
        ${rv.options
          .map((opt, i) => {
            const pickers = byChoice(i);
            const cls = i === rv.correctIndex ? "correct" : mineRes?.choice === i ? "wrong" : "";
            return `<li class="${cls}">
              <span class="letter">${letters[i]}</span><span class="opt">${esc(opt)}</span>
              <span class="pickers">${pickers.map((x) => { const p = r.players.find((pp) => pp.id === x.playerId); return p ? avatar(p, "xs") : ""; }).join("")}</span>
            </li>`;
          })
          .join("")}
      </ul>
    </section>
    <section class="card leaderboard">
      <div class="section-head"><h2>Leaderboard</h2></div>
      <ol class="board">
        ${list
          .map((p, i) => {
            const res = rv.results.find((x) => x.playerId === p.id);
            return `<li class="${p.id === session?.playerId ? "me" : ""}">
              <span class="rank">${rk[i]}</span>${avatar(p, "sm")}<span class="pname">${esc(p.name)}</span>
              ${res && res.points > 0 ? `<span class="delta">+${res.points}</span>` : `<span class="delta zero">+0</span>`}
              <span class="score">${p.score.toLocaleString()}</span>
            </li>`;
          })
          .join("")}
      </ol>
    </section>
    <div class="next-line">${rv.isLastRound ? "Final results" : "Next question"} in <b data-countdown="${rv.endsAt}" data-fmt="ceil">${Math.max(0, Math.ceil((rv.endsAt - serverNow()) / 1000))}</b>s</div>
  </main>`;
}

function finalView(r: PublicRoom) {
  const list = standings(r);
  const rk = ranks(list, r.winners);
  const winners = r.winners.map(nameOf);
  const amHost = r.hostId === session?.playerId;
  const iWon = !!session && r.winners.includes(session.playerId);
  const host = r.players.find((p) => p.isHost);
  const headline =
    winners.length === 0
      ? "Game over"
      : winners.length === 1
        ? `${esc(winners[0])} wins!`
        : `It's a tie! ${winners.map(esc).join(" & ")} share the win`;
  const podium = list.slice(0, 3);
  const order = podium.length === 3 ? [1, 0, 2] : podium.length === 2 ? [1, 0] : [0];
  const confetti = Array.from({ length: 28 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.35}s;--c:${AVATAR_COLORS[i % AVATAR_COLORS.length]}"></i>`).join("");
  return `
  <main class="screen final">
    ${connectionBanner()}
    <div class="confetti" aria-hidden="true">${confetti}</div>
    ${brand(true)}
    <section class="winner-hero pop-in">
      <div class="trophy">🏆</div>
      <div class="label">${winners.length > 1 ? "Co-champions" : "Champion"}</div>
      <h1 class="winner-name">${headline}</h1>
      ${iWon ? '<div class="you-won">That\'s you! 🎉</div>' : ""}
    </section>
    <section class="podium">
      ${order
        .map((idx) => {
          const p = podium[idx];
          if (!p) return "";
          return `<div class="pod pod-${rk[idx]} ${r.winners.includes(p.id) ? "win" : ""}">
            ${avatar(p, "lg")}
            <div class="pod-name">${esc(p.name)}</div>
            <div class="pod-score">${p.score.toLocaleString()}</div>
            <div class="pod-block"><span>${rk[idx]}</span></div>
          </div>`;
        })
        .join("")}
    </section>
    <section class="card leaderboard">
      <div class="section-head"><h2>Final standings</h2></div>
      <ol class="board">
        ${list
          .map(
            (p, i) => `<li class="${p.id === session?.playerId ? "me" : ""} ${r.winners.includes(p.id) ? "winner" : ""}">
              <span class="rank">${rk[i]}</span>${avatar(p, "sm")}<span class="pname">${esc(p.name)}</span>
              <span class="correct">${p.correct}/${r.totalRounds} ✓</span>
              <span class="score">${p.score.toLocaleString()}</span>
            </li>`,
          )
          .join("")}
      </ol>
    </section>
    <section class="final-actions">
      ${
        amHost
          ? `<button class="btn primary block xl" data-action="rematch" ${busy ? "disabled" : ""}>${busy ? '<span class="spinner sm"></span> Resetting…' : "Play Again"}</button>
             <p class="hint center">Everyone returns to the lobby with fresh questions and scores reset.</p>`
          : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span><span>Waiting for <b>${esc(host?.name ?? "the host")}</b> to start a rematch…</span></div>`
      }
      <button class="btn ghost" data-action="leave">${leaveArmed ? "Tap again to leave" : "Leave room"}</button>
    </section>
  </main>`;
}

function loadingView(message: string) {
  return `<main class="screen center-screen">${brand(true)}<div class="spinner lg"></div><p class="hint">${esc(message)}</p></main>`;
}

// ---------------------------------------------------------------- render

function roomSig(r: PublicRoom) {
  const now = serverNow();
  const q = r.question;
  return JSON.stringify([
    r.phase, r.round, r.hostId, r.gameNumber, r.winners, r.yourChoice, pendingChoice,
    r.players.map((p) => [p.id, p.name, p.score, p.connected, p.answered, p.left]),
    q ? [now < q.startsAt, now >= q.endsAt] : null,
    r.reveal?.round, connectionLost, rulesOpen, busy, leaveArmed,
  ]);
}

function render() {
  if (screen === "room") {
    if (!room) {
      app.innerHTML = loadingView("Reconnecting to your room…");
      lastSig = "";
      return;
    }
    const sig = roomSig(room);
    if (sig !== lastSig) {
      lastSig = sig;
      const view = room.phase === "lobby" ? lobbyView(room) : room.phase === "question" ? questionView(room) : room.phase === "reveal" ? revealView(room) : finalView(room);
      app.innerHTML = view + rulesModal();
      app.dataset.phase = room.phase;
    }
    tick();
    return;
  }
  lastSig = "";
  const view = screen === "home" ? homeView() : screen === "create" ? createView() : joinView();
  app.innerHTML = view + rulesModal();
  app.dataset.phase = screen;
}

/** Updates countdowns and timer bars in place without re-rendering. */
function tick() {
  const now = serverNow();
  app.querySelectorAll<HTMLElement>("[data-countdown]").forEach((el) => {
    const left = Math.max(0, Math.ceil((Number(el.dataset.countdown) - now) / 1000));
    if (el.textContent !== String(left)) el.textContent = String(left);
    el.classList.toggle("urgent", left <= 5);
  });
  app.querySelectorAll<HTMLElement>("[data-bar-end]").forEach((el) => {
    const start = Number(el.dataset.barStart);
    const end = Number(el.dataset.barEnd);
    const frac = Math.min(1, Math.max(0, (end - now) / (end - start)));
    el.style.transform = `scaleX(${frac})`;
    el.classList.toggle("urgent", frac < 0.34);
  });
}

function rerender() {
  lastSig = "";
  render();
}

// ---------------------------------------------------------------- networking

function stopPolling() {
  pollGeneration++;
  clearTimeout(pollTimer);
  polling = false;
}

function startPolling() {
  stopPolling();
  polling = true;
  void poll(pollGeneration);
}

async function poll(gen: number) {
  if (!session || gen !== pollGeneration) return;
  try {
    const res = await api({ action: "state", code: session.code, playerId: session.playerId, token: session.token });
    if (gen !== pollGeneration) return;
    room = res.room;
    connectionLost = false;
  } catch (err) {
    if (gen !== pollGeneration) return;
    if (err instanceof ApiError && !err.network && ["NOT_IN_ROOM", "NO_ROOM", "BAD_CODE"].includes(err.code)) {
      exitRoom(err.message);
      return;
    }
    connectionLost = true;
  }
  render();
  const delay = document.hidden ? 4000 : room?.phase === "question" ? 800 : 1000;
  pollTimer = window.setTimeout(() => void poll(gen), delay);
}

function enterRoom(res: { room: PublicRoom; playerId: string; token?: string }, name: string) {
  session = { code: res.room.code, playerId: res.playerId, token: res.token ?? session?.token ?? "", name };
  saveSession(session);
  room = res.room;
  screen = "room";
  formError = "";
  notice = "";
  setUrlRoom(room.code);
  rerender();
  startPolling();
}

function exitRoom(message = "") {
  stopPolling();
  clearSession();
  session = null;
  room = null;
  pendingChoice = null;
  leaveArmed = false;
  notice = message;
  screen = "home";
  setUrlRoom(null);
  rerender();
}

async function runAction(action: "start" | "rematch" | "leave") {
  if (!session || busy) return;
  busy = action !== "leave";
  rerender();
  try {
    const res = await api({ action, code: session.code, playerId: session.playerId, token: session.token });
    if (action === "leave") {
      exitRoom("You left the room.");
      return;
    }
    room = res.room;
  } catch (err) {
    if (action === "leave") exitRoom();
    else toast(err instanceof Error ? err.message : "Something went wrong.", "error");
  } finally {
    busy = false;
    rerender();
  }
}

async function answer(choice: number) {
  if (!session || !room || room.phase !== "question" || !room.question) return;
  if (room.yourChoice !== null || pendingChoice !== null) return;
  const q = room.question;
  const now = serverNow();
  if (now < q.startsAt || now >= q.endsAt) return;
  pendingChoice = choice;
  render();
  try {
    const res = await api({ action: "answer", code: session.code, playerId: session.playerId, token: session.token, round: q.round, choice });
    room = res.room;
  } catch (err) {
    toast(err instanceof Error ? err.message : "Couldn't send your answer.", "error");
  } finally {
    pendingChoice = null;
    render();
  }
}

// ---------------------------------------------------------------- events

app.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>("[data-action]");
  if (!el) return;
  if (el.classList.contains("modal-backdrop") && target.closest("[data-stop]")) return;
  const action = el.dataset.action;
  if (action !== "leave") leaveArmed = false;
  switch (action) {
    case "go-create":
    case "go-join":
      screen = action === "go-create" ? "create" : "join";
      formError = "";
      rerender();
      (app.querySelector<HTMLInputElement>(screen === "join" && !initialCode ? "#code" : "#name"))?.focus();
      break;
    case "go-home":
      screen = "home";
      formError = "";
      rerender();
      break;
    case "open-rules":
      rulesOpen = true;
      rerender();
      break;
    case "close-rules":
      rulesOpen = false;
      rerender();
      break;
    case "start":
    case "rematch":
      void runAction(action);
      break;
    case "leave":
      if (!leaveArmed) {
        leaveArmed = true;
        rerender();
        setTimeout(() => {
          if (leaveArmed) {
            leaveArmed = false;
            rerender();
          }
        }, 3000);
      } else {
        leaveArmed = false;
        void runAction("leave");
      }
      break;
    case "copy-link":
      if (room) void copyInvite(room.code);
      break;
    case "answer":
      void answer(Number(el.dataset.choice));
      break;
  }
});

async function copyInvite(code: string) {
  const url = inviteUrl(code);
  try {
    await navigator.clipboard.writeText(url);
    toast("Invite link copied — send it to your friends!");
  } catch {
    toast(`Share this link: ${url}`);
  }
}

app.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id === "code") {
    const pos = input.selectionStart;
    input.value = normalizeCode(input.value);
    if (pos !== null) input.setSelectionRange(pos, pos);
  }
});

app.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (busy) return;
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const code = normalizeCode(String(data.get("code") ?? ""));
  if (form.dataset.form === "join" && code.length !== 4) {
    formError = "Enter the 4-letter room code.";
    rerender();
    return;
  }
  if (!name) {
    formError = "Please enter a nickname.";
    rerender();
    return;
  }
  busy = true;
  formError = "";
  rerender();
  try {
    const res = form.dataset.form === "create" ? await api({ action: "create", name }) : await api({ action: "join", code, name });
    busy = false;
    enterRoom(res, name);
  } catch (err) {
    busy = false;
    formError = err instanceof Error ? err.message : "Something went wrong.";
    rerender();
    // Keep what the player typed.
    const nameInput = app.querySelector<HTMLInputElement>("#name");
    const codeInput = app.querySelector<HTMLInputElement>("#code");
    if (nameInput) nameInput.value = name;
    if (codeInput) codeInput.value = code;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rulesOpen) {
    rulesOpen = false;
    rerender();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && screen === "room" && polling) startPolling();
});

setInterval(() => {
  if (screen === "room") render();
}, 100);

// ---------------------------------------------------------------- boot

if (session && (!initialCode || initialCode === session.code)) {
  // Refresh recovery: resume the saved seat.
  screen = "room";
  render();
  startPolling();
} else {
  if (session && initialCode && initialCode !== session.code) {
    // Opened an invite to a different room: drop the old seat.
    clearSession();
    session = null;
  }
  screen = initialCode ? "join" : "home";
  render();
}
