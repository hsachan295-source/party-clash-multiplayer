// HTTP layer for the game API. One POST endpoint, one JSON body with an
// `action`. All rules live in ./logic; this file loads the room, applies the
// action, and saves it with an optimistic-concurrency retry loop.

import type { ApiResponse } from "../shared/types.ts";
import {
  GameError,
  ROOM_TTL_MS,
  advance,
  cleanName,
  createRoom,
  getPlayer,
  joinRoom,
  leaveRoom,
  normalizeCode,
  randomCode,
  startGame,
  startRematch,
  submitAnswer,
  toPublic,
  touch,
  type RoomState,
} from "./logic.ts";
import type { RoomStore } from "./store.ts";

const MAX_BODY = 2_000;
const MAX_ATTEMPTS = 12;

type Clock = () => number;

const json = (body: ApiResponse, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read-modify-write a room. `fn` mutates the room and returns whether it
 * changed; on an ETag conflict the whole read-modify-write is retried.
 */
async function mutate<T>(
  store: RoomStore,
  rawCode: unknown,
  clock: Clock,
  fn: (room: RoomState, now: number) => { changed: boolean; result: T },
): Promise<{ room: RoomState; result: T; now: number }> {
  const code = normalizeCode(rawCode);
  if (code.length !== 4) throw new GameError("BAD_CODE", "Room codes are 4 letters.", 404);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const stored = await store.get(code);
    if (!stored) throw new GameError("NO_ROOM", `Room ${code} doesn't exist. Check the code and try again.`, 404);
    const { room, etag } = stored;
    const now = clock();
    const { changed, result } = fn(room, now);
    if (!changed) return { room, result, now };
    room.updatedAt = now;
    if (await store.replace(code, room, etag)) return { room, result, now };
    await sleep(15 + Math.random() * 40 * (attempt + 1));
  }
  throw new GameError("BUSY", "The room is busy — please try again.", 503);
}

async function create(store: RoomStore, rawName: unknown, clock: Clock): Promise<Response> {
  const name = cleanName(rawName);
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode();
    const now = clock();
    const { room, player } = createRoom(code, name, now);
    if (await store.create(code, room)) {
      return json({ ok: true, room: toPublic(room, player.id, now), playerId: player.id, token: player.token });
    }
    // Code is taken — recycle it only if that room has been abandoned.
    const existing = await store.get(code);
    if (existing && now - existing.room.updatedAt > ROOM_TTL_MS && (await store.replace(code, room, existing.etag))) {
      return json({ ok: true, room: toPublic(room, player.id, now), playerId: player.id, token: player.token });
    }
  }
  throw new GameError("BUSY", "Couldn't find a free room code — please try again.", 503);
}

export async function handleGame(req: Request, store: RoomStore, clock: Clock = Date.now): Promise<Response> {
  try {
    if (req.method !== "POST") throw new GameError("METHOD", "Use POST.", 405);
    const text = await req.text();
    if (text.length > MAX_BODY) throw new GameError("TOO_LARGE", "Request too large.", 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch {
      throw new GameError("BAD_JSON", "Invalid request.");
    }
    if (!body || typeof body !== "object") throw new GameError("BAD_JSON", "Invalid request.");
    const { action, code, playerId, token } = body;

    switch (action) {
      case "create":
        return await create(store, body.name, clock);

      case "join": {
        const { room, result: player, now } = await mutate(store, code, clock, (room, now) => {
          advance(room, now);
          return { changed: true, result: joinRoom(room, body.name as string, now) };
        });
        return json({ ok: true, room: toPublic(room, player.id, now), playerId: player.id, token: player.token });
      }

      case "state":
      case "start":
      case "answer":
      case "rematch":
      case "leave": {
        const { room, now } = await mutate(store, code, clock, (room, now) => {
          const player = getPlayer(room, playerId, token);
          let changed = touch(player, now);
          if (advance(room, now)) changed = true;
          if (action === "start") startGame(room, player, now);
          else if (action === "answer") submitAnswer(room, player, body.round, body.choice, now);
          else if (action === "rematch") startRematch(room, player, now);
          else if (action === "leave") leaveRoom(room, player, now);
          if (action !== "state") {
            advance(room, now);
            changed = true;
          }
          return { changed, result: null };
        });
        return json({ ok: true, room: toPublic(room, playerId as string, now), playerId: playerId as string });
      }

      default:
        throw new GameError("BAD_ACTION", "Unknown action.");
    }
  } catch (err) {
    if (err instanceof GameError) return json({ ok: false, error: err.message, code: err.code }, err.status);
    console.error(err);
    return json({ ok: false, error: "Something went wrong on the server. Please try again.", code: "SERVER" }, 500);
  }
}
