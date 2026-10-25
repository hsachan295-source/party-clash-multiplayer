// Pure game rules. Every function here operates on a RoomState and the
// current server time; nothing touches storage or the network. The handler
// loads a room, applies one of these, and writes it back atomically.

import {
  BASE_POINTS,
  FIRST_LEAD_IN_MS,
  LEAD_IN_MS,
  MAX_PLAYERS,
  MAX_SPEED_BONUS,
  MIN_PLAYERS,
  NAME_MAX,
  QUESTION_MS,
  REVEAL_MS,
  TOTAL_ROUNDS,
  type PublicRoom,
  type RoundResult,
} from "../shared/types.ts";
import { QUESTIONS } from "./questions.ts";

/** Players not seen for this long are shown as disconnected. */
export const CONNECTED_MS = 15_000;
/** A host who has been gone this long hands host controls to someone else. */
export const HOST_TIMEOUT_MS = 20_000;
/** Lobby players who vanish for this long are removed from the lobby. */
export const LOBBY_PRUNE_MS = 60_000;
/** Only persist a "last seen" heartbeat this often, to limit write traffic. */
export const HEARTBEAT_WRITE_MS = 5_000;
/** Answers arriving this soon after the deadline still count (network latency). */
export const LATE_GRACE_MS = 300;
/** Rooms untouched for this long may be recycled for a new room code. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O

export interface PlayerState {
  id: string;
  token: string;
  name: string;
  joinedAt: number;
  lastSeen: number;
  score: number;
  correct: number;
  correctTimeMs: number;
  left: boolean;
}

export interface QuestionState {
  round: number;
  bankIndex: number;
  options: string[];
  correctIndex: number;
  startsAt: number;
  endsAt: number;
}

export interface RevealState {
  round: number;
  correctIndex: number;
  results: RoundResult[];
  closedAt: number;
  endsAt: number;
}

export interface RoomState {
  code: string;
  createdAt: number;
  updatedAt: number;
  phase: "lobby" | "question" | "reveal" | "final";
  hostId: string;
  players: PlayerState[];
  deck: number[];
  usedQuestions: number[];
  round: number;
  question: QuestionState | null;
  answers: Record<string, { choice: number; at: number }>;
  reveal: RevealState | null;
  winners: string[];
  gameNumber: number;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export type Rng = () => number;

export function randomCode(rng: Rng = Math.random): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw new GameError("BAD_NAME", "Please enter a nickname.");
  const name = raw
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) throw new GameError("BAD_NAME", "Please enter a nickname.");
  if ([...name].length > NAME_MAX) {
    throw new GameError("BAD_NAME", `Nicknames can be at most ${NAME_MAX} characters.`);
  }
  return name;
}

function newPlayer(name: string, now: number): PlayerState {
  return {
    id: crypto.randomUUID().slice(0, 12),
    token: crypto.randomUUID(),
    name,
    joinedAt: now,
    lastSeen: now,
    score: 0,
    correct: 0,
    correctTimeMs: 0,
    left: false,
  };
}

export function createRoom(code: string, rawName: string, now: number) {
  const player = newPlayer(cleanName(rawName), now);
  const room: RoomState = {
    code,
    createdAt: now,
    updatedAt: now,
    phase: "lobby",
    hostId: player.id,
    players: [player],
    deck: [],
    usedQuestions: [],
    round: 0,
    question: null,
    answers: {},
    reveal: null,
    winners: [],
    gameNumber: 1,
  };
  return { room, player };
}

const activePlayers = (room: RoomState) => room.players.filter((p) => !p.left);
const isConnected = (p: PlayerState, now: number) => !p.left && now - p.lastSeen < CONNECTED_MS;

export function getPlayer(room: RoomState, playerId: unknown, token: unknown): PlayerState {
  const player = room.players.find((p) => p.id === playerId);
  if (!player || typeof token !== "string" || player.token !== token || player.left) {
    throw new GameError("NOT_IN_ROOM", "You're no longer in this room.", 403);
  }
  return player;
}

export function joinRoom(room: RoomState, rawName: string, now: number): PlayerState {
  const name = cleanName(rawName);
  if (room.phase !== "lobby") {
    throw new GameError("IN_PROGRESS", "That game is already in progress. Wait for a rematch or create a new room.", 409);
  }
  const active = activePlayers(room);
  if (active.length >= MAX_PLAYERS) {
    throw new GameError("ROOM_FULL", `Room is full (max ${MAX_PLAYERS} players).`, 409);
  }
  if (active.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new GameError("NAME_TAKEN", `"${name}" is already taken in this room. Pick another nickname.`, 409);
  }
  const player = newPlayer(name, now);
  room.players.push(player);
  return player;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(room: RoomState, rng: Rng): number[] {
  let pool = QUESTIONS.map((_, i) => i).filter((i) => !room.usedQuestions.includes(i));
  if (pool.length < TOTAL_ROUNDS) {
    room.usedQuestions = [];
    pool = QUESTIONS.map((_, i) => i);
  }
  const deck = shuffle(pool, rng).slice(0, TOTAL_ROUNDS);
  room.usedQuestions.push(...deck);
  return deck;
}

function openQuestion(room: RoomState, round: number, startsAt: number, rng: Rng) {
  const bankIndex = room.deck[round - 1];
  const bank = QUESTIONS[bankIndex];
  const order = shuffle([0, 1, 2, 3], rng);
  room.phase = "question";
  room.round = round;
  room.answers = {};
  room.reveal = null;
  room.question = {
    round,
    bankIndex,
    options: order.map((i) => bank.o[i]),
    correctIndex: order.indexOf(bank.a),
    startsAt,
    endsAt: startsAt + QUESTION_MS,
  };
}

export function startGame(room: RoomState, player: PlayerState, now: number, rng: Rng = Math.random) {
  if (room.hostId !== player.id) throw new GameError("NOT_HOST", "Only the host can start the game.", 403);
  if (room.phase !== "lobby") throw new GameError("BAD_PHASE", "The game has already started.", 409);
  if (activePlayers(room).length < MIN_PLAYERS) {
    throw new GameError("NOT_ENOUGH", `You need at least ${MIN_PLAYERS} players to start.`, 409);
  }
  for (const p of room.players) {
    p.score = 0;
    p.correct = 0;
    p.correctTimeMs = 0;
  }
  room.winners = [];
  room.deck = buildDeck(room, rng);
  openQuestion(room, 1, now + FIRST_LEAD_IN_MS, rng);
}

export function pointsFor(timeMs: number): number {
  const remaining = Math.max(0, QUESTION_MS - timeMs) / QUESTION_MS;
  return BASE_POINTS + Math.round(MAX_SPEED_BONUS * remaining);
}

export function submitAnswer(room: RoomState, player: PlayerState, round: unknown, choice: unknown, now: number) {
  const q = room.question;
  if (room.phase === "reveal" || room.phase === "final") {
    throw new GameError("ROUND_CLOSED", "Too late — that round is closed.", 409);
  }
  if (room.phase !== "question" || !q) throw new GameError("BAD_PHASE", "There is no question to answer right now.", 409);
  if (typeof round === "number" && round < q.round) {
    throw new GameError("ROUND_CLOSED", "Too late — that round is closed.", 409);
  }
  if (round !== q.round) throw new GameError("BAD_ROUND", "That answer was for a different round.", 409);
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    throw new GameError("BAD_CHOICE", "That's not a valid answer.");
  }
  if (room.answers[player.id]) throw new GameError("ALREADY_ANSWERED", "You've already locked in an answer.", 409);
  if (now < q.startsAt) throw new GameError("TOO_EARLY", "The question hasn't started yet.", 409);
  if (now > q.endsAt + LATE_GRACE_MS) throw new GameError("ROUND_CLOSED", "Too late — time ran out.", 409);
  room.answers[player.id] = { choice, at: Math.min(now, q.endsAt) };
}

function closeQuestion(room: RoomState, closedAt: number) {
  const q = room.question!;
  const results: RoundResult[] = [];
  for (const p of room.players) {
    if (p.left) continue;
    const ans = room.answers[p.id];
    if (!ans) {
      results.push({ playerId: p.id, choice: null, correct: false, points: 0, timeMs: null });
      continue;
    }
    const timeMs = Math.max(0, ans.at - q.startsAt);
    const correct = ans.choice === q.correctIndex;
    const points = correct ? pointsFor(timeMs) : 0;
    if (correct) {
      p.score += points;
      p.correct += 1;
      p.correctTimeMs += timeMs;
    }
    results.push({ playerId: p.id, choice: ans.choice, correct, points, timeMs });
  }
  room.phase = "reveal";
  room.reveal = { round: q.round, correctIndex: q.correctIndex, results, closedAt, endsAt: closedAt + REVEAL_MS };
}

/** Rank players: score, then correct answers, then fastest total correct time. */
export function ranking(room: RoomState): PlayerState[] {
  return activePlayers(room).sort(
    (a, b) => b.score - a.score || b.correct - a.correct || a.correctTimeMs - b.correctTimeMs,
  );
}

function finishGame(room: RoomState) {
  const ranked = ranking(room);
  const top = ranked[0];
  room.phase = "final";
  room.question = null;
  room.answers = {};
  room.winners = top
    ? ranked
        .filter((p) => p.score === top.score && p.correct === top.correct && p.correctTimeMs === top.correctTimeMs)
        .map((p) => p.id)
    : [];
}

function ensureHost(room: RoomState, now: number): boolean {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host && !host.left && now - host.lastSeen < HOST_TIMEOUT_MS) return false;
  const candidates = activePlayers(room).filter((p) => p.id !== room.hostId);
  const next = candidates.find((p) => isConnected(p, now)) ?? (host && !host.left ? undefined : candidates[0]);
  if (!next) return false;
  room.hostId = next.id;
  return true;
}

/**
 * Moves the room forward in time: closes questions whose timer expired (or
 * that everyone answered), ends reveals, finishes the game, reassigns the
 * host and prunes vanished lobby players. Returns true if anything changed.
 */
export function advance(room: RoomState, now: number, rng: Rng = Math.random): boolean {
  let changed = false;
  for (let guard = 0; guard < 2 * TOTAL_ROUNDS + 2; guard++) {
    if (room.phase === "question" && room.question) {
      const q = room.question;
      const waitingOn = activePlayers(room).filter((p) => isConnected(p, now) && !room.answers[p.id]);
      const answerTimes = Object.values(room.answers).map((a) => a.at);
      if (now >= q.endsAt + LATE_GRACE_MS) {
        closeQuestion(room, q.endsAt);
      } else if (waitingOn.length === 0 && answerTimes.length > 0) {
        closeQuestion(room, Math.max(...answerTimes));
      } else break;
      changed = true;
    } else if (room.phase === "reveal" && room.reveal) {
      if (now < room.reveal.endsAt) break;
      if (room.round >= TOTAL_ROUNDS) finishGame(room);
      else openQuestion(room, room.round + 1, Math.max(now, room.reveal.endsAt) + LEAD_IN_MS, rng);
      changed = true;
    } else break;
  }
  if (room.phase === "lobby") {
    const before = room.players.length;
    room.players = room.players.filter((p) => !p.left && now - p.lastSeen < LOBBY_PRUNE_MS);
    if (room.players.length !== before) changed = true;
  }
  if (ensureHost(room, now)) changed = true;
  return changed;
}

/** Records a heartbeat. Only reports a change when it is worth persisting. */
export function touch(player: PlayerState, now: number): boolean {
  if (now - player.lastSeen < HEARTBEAT_WRITE_MS) return false;
  player.lastSeen = now;
  return true;
}

export function startRematch(room: RoomState, player: PlayerState, now: number) {
  if (room.hostId !== player.id) throw new GameError("NOT_HOST", "Only the host can start a rematch.", 403);
  if (room.phase !== "final") throw new GameError("BAD_PHASE", "The game isn't over yet.", 409);
  room.players = room.players.filter((p) => !p.left);
  for (const p of room.players) {
    p.score = 0;
    p.correct = 0;
    p.correctTimeMs = 0;
  }
  room.phase = "lobby";
  room.round = 0;
  room.deck = [];
  room.question = null;
  room.answers = {};
  room.reveal = null;
  room.winners = [];
  room.gameNumber += 1;
  room.updatedAt = now;
}

export function leaveRoom(room: RoomState, player: PlayerState, now: number) {
  if (room.phase === "lobby" || room.phase === "final") {
    room.players = room.players.filter((p) => p.id !== player.id);
  } else {
    player.left = true;
  }
  if (room.hostId === player.id) {
    const next = room.players.find((p) => !p.left && p.id !== player.id && isConnected(p, now))
      ?? room.players.find((p) => !p.left && p.id !== player.id);
    if (next) room.hostId = next.id;
  }
}

export function toPublic(room: RoomState, viewerId: string, now: number): PublicRoom {
  const q = room.question;
  const showQuestion = room.phase === "question" && q;
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: TOTAL_ROUNDS,
    hostId: room.hostId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      correct: p.correct,
      isHost: p.id === room.hostId,
      connected: isConnected(p, now) || p.id === viewerId,
      left: p.left,
      answered: !!room.answers[p.id],
    })),
    question: showQuestion
      ? {
          round: q.round,
          category: QUESTIONS[q.bankIndex].c,
          text: QUESTIONS[q.bankIndex].q,
          options: q.options,
          startsAt: q.startsAt,
          endsAt: q.endsAt,
        }
      : null,
    reveal:
      room.phase === "reveal" && room.reveal
        ? {
            round: room.reveal.round,
            category: QUESTIONS[q!.bankIndex].c,
            text: QUESTIONS[q!.bankIndex].q,
            options: q!.options,
            correctIndex: room.reveal.correctIndex,
            results: room.reveal.results,
            endsAt: room.reveal.endsAt,
            isLastRound: room.reveal.round >= TOTAL_ROUNDS,
          }
        : null,
    yourChoice: room.phase === "question" ? room.answers[viewerId]?.choice ?? null : null,
    winners: room.winners,
    serverNow: now,
    gameNumber: room.gameNumber,
  };
}
