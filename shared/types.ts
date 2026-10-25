// Types shared between the browser client and the Netlify Function.
// Nothing in here may contain secrets (answers, tokens) — it describes the
// *public* view of a room that every player is allowed to see.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const TOTAL_ROUNDS = 8;
export const QUESTION_MS = 15_000;
export const REVEAL_MS = 6_000;
export const FIRST_LEAD_IN_MS = 3_500;
export const LEAD_IN_MS = 2_500;
export const BASE_POINTS = 500;
export const MAX_SPEED_BONUS = 500;
export const NAME_MAX = 16;

export type Phase = "lobby" | "question" | "reveal" | "final";

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  correct: number;
  isHost: boolean;
  connected: boolean;
  left: boolean;
  /** During a question: whether they have answered (not what they chose). */
  answered: boolean;
}

export interface PublicQuestion {
  round: number;
  category: string;
  text: string;
  options: string[];
  startsAt: number;
  endsAt: number;
}

export interface RoundResult {
  playerId: string;
  choice: number | null;
  correct: boolean;
  points: number;
  timeMs: number | null;
}

export interface PublicReveal {
  round: number;
  category: string;
  text: string;
  options: string[];
  correctIndex: number;
  results: RoundResult[];
  endsAt: number;
  isLastRound: boolean;
}

export interface PublicRoom {
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  hostId: string;
  players: PublicPlayer[];
  question: PublicQuestion | null;
  reveal: PublicReveal | null;
  /** Your own choice for the current question (only ever your own). */
  yourChoice: number | null;
  winners: string[];
  serverNow: number;
  gameNumber: number;
}

export type ApiAction =
  | { action: "create"; name: string }
  | { action: "join"; code: string; name: string }
  | { action: "state"; code: string; playerId: string; token: string }
  | { action: "start"; code: string; playerId: string; token: string }
  | { action: "answer"; code: string; playerId: string; token: string; round: number; choice: number }
  | { action: "rematch"; code: string; playerId: string; token: string }
  | { action: "leave"; code: string; playerId: string; token: string };

export type ApiResponse =
  | { ok: true; room: PublicRoom; playerId: string; token?: string }
  | { ok: false; error: string; code?: string };
