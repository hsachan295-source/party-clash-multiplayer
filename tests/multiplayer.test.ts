// End-to-end multiplayer tests for the game API. Runs the real function
// handler against Netlify's local Blobs emulator (real ETag conditional
// writes), simulating several independent players. A controllable clock lets
// us play full 8-round games without waiting for real timers.
//
// Run: npm test

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { test, after, before } from "node:test";
import { startLocalBlobs } from "../dev/local-blobs.ts";
import { handleGame } from "../server/handler.ts";
import { blobsRoomStore, memoryRoomStore, type RoomStore } from "../server/store.ts";
import { pointsFor, CONNECTED_MS } from "../server/logic.ts";
import {
  FIRST_LEAD_IN_MS,
  LEAD_IN_MS,
  QUESTION_MS,
  TOTAL_ROUNDS,
  type ApiResponse,
  type PublicRoom,
} from "../shared/types.ts";

let dir: string;
let server: { stop(): Promise<void> };
let store: RoomStore;
let now = 1_700_000_000_000;
const clock = () => now;

// STORE=blobs runs every test through the real @netlify/blobs client against
// Netlify's local Blobs emulator. The emulator lacks ETags on reads, so the
// concurrency test only runs with the default strict compare-and-swap store.
const useBlobs = process.env.STORE === "blobs";

before(async () => {
  if (useBlobs) {
    dir = mkdtempSync(joinPath(tmpdir(), "party-clash-test-"));
    server = await startLocalBlobs(dir);
    store = blobsRoomStore();
  } else {
    store = memoryRoomStore();
  }
});
after(async () => {
  if (!useBlobs) return;
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
});

async function call(body: Record<string, unknown>): Promise<{ status: number; data: ApiResponse }> {
  const res = await handleGame(
    new Request("http://x/.netlify/functions/game", { method: "POST", body: JSON.stringify(body) }),
    store,
    clock,
  );
  return { status: res.status, data: (await res.json()) as ApiResponse };
}

interface Client {
  name: string;
  playerId: string;
  token: string;
  code: string;
}

async function create(name: string): Promise<[Client, PublicRoom]> {
  const { data } = await call({ action: "create", name });
  assert.ok(data.ok, JSON.stringify(data));
  return [{ name, playerId: data.playerId, token: data.token!, code: data.room.code }, data.room];
}

async function join(code: string, name: string): Promise<[Client, PublicRoom]> {
  const { data } = await call({ action: "join", code, name });
  assert.ok(data.ok, JSON.stringify(data));
  return [{ name, playerId: data.playerId, token: data.token!, code: data.room.code }, data.room];
}

async function act(c: Client, action: string, extra: Record<string, unknown> = {}) {
  return call({ action, code: c.code, playerId: c.playerId, token: c.token, ...extra });
}

async function state(c: Client): Promise<PublicRoom> {
  const { data } = await act(c, "state");
  assert.ok(data.ok, JSON.stringify(data));
  return data.room;
}

async function secretCorrect(code: string): Promise<number> {
  const stored = await store.get(code);
  return stored!.room.question!.correctIndex;
}

/**
 * Every player's view. Parallel like real browsers, except on the Blobs
 * emulator, which has no conditional writes and so can't arbitrate races.
 */
async function allStates(clients: Client[]): Promise<PublicRoom[]> {
  if (!useBlobs) return Promise.all(clients.map(state));
  const out: PublicRoom[] = [];
  for (const c of clients) out.push(await state(c));
  return out;
}

/** Keep everyone's heartbeat fresh, as their polling browsers would. */
async function heartbeat(clients: Client[]) {
  for (const c of clients) await state(c);
}

async function setupRoom(n: number): Promise<Client[]> {
  const [host] = await create("Host");
  const clients = [host];
  for (let i = 1; i < n; i++) clients.push((await join(host.code, `Player${i}`))[0]);
  return clients;
}

test("room creation generates a readable 4-letter code", async () => {
  const [, room] = await create("Alice");
  assert.match(room.code, /^[A-HJ-NP-Z]{4}$/);
  assert.equal(room.phase, "lobby");
  assert.equal(room.players.length, 1);
  assert.ok(room.players[0].isHost);
});

test("players join, lobby syncs, duplicate names and bad codes are rejected", async () => {
  const [host] = await create("Alice");
  const [bob] = await join(host.code, "Bob");
  const [, room3] = await join(host.code.toLowerCase(), "Cara"); // codes are case-insensitive
  assert.equal(room3.players.length, 3);
  const hostView = await state(host);
  assert.deepEqual(hostView.players.map((p) => p.name), ["Alice", "Bob", "Cara"]);
  const bobView = await state(bob);
  assert.deepEqual(bobView.players.map((p) => p.name), ["Alice", "Bob", "Cara"]);

  const dup = await call({ action: "join", code: host.code, name: "  bOB " });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.ok, false);
  assert.equal(!dup.data.ok && dup.data.code, "NAME_TAKEN");

  const bad = await call({ action: "join", code: "ZZZZ", name: "Dan" });
  assert.equal(bad.status, 404);
  assert.match(!bad.data.ok ? bad.data.error : "", /doesn't exist/);

  const short = await call({ action: "join", code: "AB", name: "Dan" });
  assert.equal(short.status, 404);

  const empty = await call({ action: "join", code: host.code, name: "   " });
  assert.equal(empty.status, 400);
});

test("max 8 players", async () => {
  const clients = await setupRoom(8);
  const ninth = await call({ action: "join", code: clients[0].code, name: "Ninth" });
  assert.equal(ninth.status, 409);
  assert.equal(!ninth.data.ok && ninth.data.code, "ROOM_FULL");
});

test("start rules: host only, minimum 2 players", async () => {
  const [host] = await create("Solo");
  const solo = await act(host, "start");
  assert.equal(!solo.data.ok && solo.data.code, "NOT_ENOUGH");
  const [guest] = await join(host.code, "Guest");
  const notHost = await act(guest, "start");
  assert.equal(notHost.status, 403);
  assert.equal(!notHost.data.ok && notHost.data.code, "NOT_HOST");
  const ok = await act(host, "start");
  assert.ok(ok.data.ok);
  assert.equal(ok.data.ok && ok.data.room.phase, "question");
  const late = await call({ action: "join", code: host.code, name: "Late" });
  assert.equal(!late.data.ok && late.data.code, "IN_PROGRESS");
});

test("forged tokens, invalid choices and client-sent scores are rejected", async () => {
  const [host, guest] = await setupRoom(2);
  const forged = await call({ action: "start", code: host.code, playerId: host.playerId, token: "nope" });
  assert.equal(forged.status, 403);
  await act(host, "start");
  now += FIRST_LEAD_IN_MS + 100;
  const r1 = await state(guest);
  const bad = await act(guest, "answer", { round: r1.round, choice: 9 });
  assert.equal(!bad.data.ok && bad.data.code, "BAD_CHOICE");
  const str = await act(guest, "answer", { round: r1.round, choice: "0" });
  assert.equal(!str.data.ok && str.data.code, "BAD_CHOICE");
  // Extra fields like score are ignored entirely.
  const correct = await secretCorrect(host.code);
  const wrong = (correct + 1) % 4;
  const res = await act(guest, "answer", { round: r1.round, choice: wrong, score: 999999, points: 999999 });
  assert.ok(res.data.ok);
  const forgedAnswer = await call({ action: "answer", code: host.code, playerId: host.playerId, token: guest.token, round: 1, choice: correct });
  assert.equal(forgedAnswer.status, 403);
  now += QUESTION_MS + 1000;
  const after = await state(host);
  assert.equal(after.players.find((p) => p.id === guest.playerId)!.score, 0);
});

test("the correct answer is never exposed before the round closes", async () => {
  const [host, guest] = await setupRoom(2);
  const started = await act(host, "start");
  assert.ok(started.data.ok);
  now += FIRST_LEAD_IN_MS + 50;
  const view = await state(guest);
  const raw = JSON.stringify(view);
  assert.equal(view.reveal, null);
  assert.ok(!raw.includes("correctIndex"), "no correctIndex in question view");
  assert.ok(!raw.includes("token"), "no tokens in public view");
  // Host answering does not reveal the host's choice to the guest.
  await act(host, "answer", { round: 1, choice: 0 });
  const guestView = await state(guest);
  assert.equal(guestView.yourChoice, null);
  assert.equal(guestView.players.find((p) => p.id === host.playerId)!.answered, true);
  assert.ok(!JSON.stringify(guestView).includes("choice\":0"));
});

test("full 8-round game: sync, scoring, duplicate/late blocking, winner, rematch", async () => {
  const [alice, bob, cara] = await setupRoom(3);
  const players = [alice, bob, cara];
  const expected = new Map(players.map((p) => [p.playerId, 0]));
  await act(alice, "start");
  now += FIRST_LEAD_IN_MS;

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const views = await allStates(players);
    // Everyone sees the same round and question.
    for (const v of views) {
      assert.equal(v.phase, "question");
      assert.equal(v.round, round);
      assert.equal(v.question!.text, views[0].question!.text);
      assert.deepEqual(v.question!.options, views[0].question!.options);
      assert.equal(v.question!.endsAt, views[0].question!.endsAt);
    }
    const q = views[0].question!;
    assert.ok(now >= q.startsAt, "question has started");
    const correct = await secretCorrect(alice.code);

    // Alice answers correctly after 2s, Bob wrong, Cara correctly after 9s (or not at all on round 3).
    now = q.startsAt + 2000;
    assert.ok((await act(alice, "answer", { round, choice: correct })).data.ok);
    expected.set(alice.playerId, expected.get(alice.playerId)! + pointsFor(2000));
    const dup = await act(alice, "answer", { round, choice: (correct + 1) % 4 });
    assert.equal(!dup.data.ok && dup.data.code, "ALREADY_ANSWERED");

    now = q.startsAt + 5000;
    assert.ok((await act(bob, "answer", { round, choice: (correct + 1) % 4 })).data.ok);

    if (round === 3) {
      // Cara misses the deadline: round closes on timeout, her late answer is rejected.
      now = q.endsAt + 1000;
      const late = await act(cara, "answer", { round, choice: correct });
      assert.equal(!late.data.ok && late.data.code, "ROUND_CLOSED");
    } else {
      now = q.startsAt + 9000;
      const res = await act(cara, "answer", { round, choice: correct });
      assert.ok(res.data.ok, JSON.stringify(res.data));
      expected.set(cara.playerId, expected.get(cara.playerId)! + pointsFor(9000));
      // Everyone answered: round closes immediately, no waiting for the timer.
      assert.equal(res.data.ok && res.data.room.phase, "reveal");
    }

    const reveals = await allStates(players);
    for (const v of reveals) {
      assert.equal(v.phase, "reveal");
      assert.equal(v.reveal!.round, round);
      assert.equal(v.reveal!.correctIndex, correct);
      for (const p of v.players) assert.equal(p.score, expected.get(p.id), `score sync round ${round}`);
    }
    const res = reveals[0].reveal!.results;
    assert.equal(res.find((r) => r.playerId === bob.playerId)!.points, 0);
    assert.equal(res.find((r) => r.playerId === alice.playerId)!.points, pointsFor(2000));
    if (round === 3) assert.equal(res.find((r) => r.playerId === cara.playerId)!.choice, null);

    // Answers during reveal are blocked.
    const during = await act(bob, "answer", { round, choice: correct });
    assert.equal(!during.data.ok && during.data.code, "ROUND_CLOSED");

    now = reveals[0].reveal!.endsAt + 10;
    const next = await state(bob);
    if (round < TOTAL_ROUNDS) {
      assert.equal(next.phase, "question");
      assert.equal(next.round, round + 1);
      assert.equal(next.question!.startsAt, now + LEAD_IN_MS);
      const early = await act(alice, "answer", { round: round + 1, choice: 0 });
      assert.equal(!early.data.ok && early.data.code, "TOO_EARLY");
      now = next.question!.startsAt;
    } else {
      assert.equal(next.phase, "final");
    }
  }

  const finals = await allStates(players);
  for (const f of finals) {
    assert.equal(f.phase, "final");
    assert.deepEqual(f.winners, [alice.playerId]);
    for (const p of f.players) assert.equal(p.score, expected.get(p.id));
  }
  assert.equal(expected.get(alice.playerId), TOTAL_ROUNDS * pointsFor(2000));
  assert.equal(expected.get(bob.playerId), 0);

  // Rematch: only host, everyone returns to lobby with zero scores.
  const notHost = await act(bob, "rematch");
  assert.equal(!notHost.data.ok && notHost.data.code, "NOT_HOST");
  const rem = await act(alice, "rematch");
  assert.ok(rem.data.ok);
  const lobby = await state(cara);
  assert.equal(lobby.phase, "lobby");
  assert.equal(lobby.gameNumber, 2);
  assert.equal(lobby.players.length, 3);
  for (const p of lobby.players) assert.equal(p.score, 0);
  // New players may join during the rematch lobby.
  await join(alice.code, "Dee");
  const again = await act(alice, "start");
  assert.ok(again.data.ok);
  assert.equal(again.data.ok && again.data.room.round, 1);
});

async function playTieGame(answers: (round: number) => Array<{ c: Client; delay: number; correct: boolean } | null>, clients: Client[]) {
  await act(clients[0], "start");
  now += FIRST_LEAD_IN_MS;
  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    const v = await state(clients[0]);
    const q = v.question!;
    const correct = await secretCorrect(clients[0].code);
    const plan = answers(round).filter(Boolean) as Array<{ c: Client; delay: number; correct: boolean }>;
    plan.sort((a, b) => a.delay - b.delay);
    for (const a of plan) {
      now = q.startsAt + a.delay;
      const r = await act(a.c, "answer", { round, choice: a.correct ? correct : (correct + 1) % 4 });
      assert.ok(r.data.ok, JSON.stringify(r.data));
    }
    if ((await state(clients[0])).phase === "question") now = q.endsAt + 1000;
    await heartbeat(clients);
    const rv = await state(clients[0]);
    assert.equal(rv.phase, "reveal");
    now = rv.reveal!.endsAt + 1;
    await heartbeat(clients);
    if (round < TOTAL_ROUNDS) now = (await state(clients[0])).question!.startsAt;
  }
  return state(clients[0]);
}

test("exact tie on every tie-breaker produces a shared win", async () => {
  const [a, b] = await setupRoom(2);
  const final = await playTieGame(() => [{ c: a, delay: 3000, correct: true }, { c: b, delay: 3000, correct: true }], [a, b]);
  assert.equal(final.phase, "final");
  assert.equal(final.winners.length, 2);
  assert.ok(final.winners.includes(a.playerId) && final.winners.includes(b.playerId));
});

test("equal score is broken by number of correct answers, then by speed", async () => {
  // Points are rounded, so different delays can land on equal totals.
  // Find two delays d1 != d2 with equal points to test the speed tie-break.
  let d1 = 0;
  let d2 = 0;
  for (let x = 0; x < QUESTION_MS && !d2; x += 1) if (pointsFor(x) === pointsFor(x + 10)) [d1, d2] = [x, x + 10];
  assert.ok(d2, "found rounding-equal delays");
  const [a, b] = await setupRoom(2);
  const final = await playTieGame(
    () => [{ c: a, delay: d2, correct: true }, { c: b, delay: d1, correct: true }],
    [a, b],
  );
  const pa = final.players.find((p) => p.id === a.playerId)!;
  const pb = final.players.find((p) => p.id === b.playerId)!;
  assert.equal(pa.score, pb.score);
  assert.equal(pa.correct, pb.correct);
  assert.deepEqual(final.winners, [b.playerId], "faster total correct time wins");
});

test("refresh recovery: same token restores the same player and score", async () => {
  const [host, guest] = await setupRoom(2);
  await act(host, "start");
  now += FIRST_LEAD_IN_MS + 1000;
  const correct = await secretCorrect(host.code);
  await act(guest, "answer", { round: 1, choice: correct });
  // "Refresh": a brand-new client using only the saved code/playerId/token.
  const restored = await state({ ...guest });
  assert.equal(restored.yourChoice, correct);
  assert.equal(restored.phase, "question");
  const stranger = await call({ action: "state", code: host.code, playerId: guest.playerId, token: "other" });
  assert.equal(!stranger.data.ok && stranger.data.code, "NOT_IN_ROOM");
});

test("host who disconnects hands host controls to another player", async () => {
  const [host, guest] = await setupRoom(2);
  now += CONNECTED_MS + 10_000; // host stops polling; guest keeps polling
  const v = await state(guest);
  assert.equal(v.hostId, guest.playerId);
  const hostStart = await act(host, "start");
  assert.equal(!hostStart.data.ok && hostStart.data.code, "NOT_HOST");
});

test("leaving the lobby removes the player; host leaving passes host", async () => {
  const [host, guest, third] = await setupRoom(3);
  await act(host, "leave");
  const v = await state(guest);
  assert.equal(v.players.length, 2);
  assert.equal(v.hostId, guest.playerId);
  assert.ok(third);
});

test("concurrency: 8 players answering at the same instant are all recorded", { skip: useBlobs }, async () => {
  const clients = await setupRoom(8);
  await act(clients[0], "start");
  now += FIRST_LEAD_IN_MS + 4000;
  const correct = await secretCorrect(clients[0].code);
  const results = await Promise.all(clients.map((c) => act(c, "answer", { round: 1, choice: correct })));
  for (const r of results) assert.ok(r.data.ok, JSON.stringify(r.data));
  const v = await state(clients[0]);
  assert.equal(v.phase, "reveal");
  assert.equal(v.reveal!.results.filter((r) => r.correct).length, 8);
  for (const p of v.players) assert.equal(p.score, pointsFor(4000));
  // Duplicate submissions racing each other: exactly one wins.
  now = v.reveal!.endsAt + 1;
  const q2 = (await state(clients[0])).question!;
  now = q2.startsAt + 1000;
  const c2 = await secretCorrect(clients[0].code);
  const racing = await Promise.all([0, 1, 2, 3].map((i) => act(clients[1], "answer", { round: 2, choice: (c2 + i) % 4 })));
  assert.equal(racing.filter((r) => r.data.ok).length, 1);
  assert.equal(racing.filter((r) => !r.data.ok && r.data.code === "ALREADY_ANSWERED").length, 3);
  // Concurrent joins never exceed capacity or duplicate names.
  const [h] = await create("Cap");
  const joins = await Promise.all(Array.from({ length: 10 }, (_, i) => call({ action: "join", code: h.code, name: i < 2 ? "Same" : `J${i}` })));
  const room = (await state(h)).players;
  assert.equal(room.length, 8);
  assert.equal(room.filter((p) => p.name === "Same").length, 1);
  assert.equal(joins.filter((j) => j.data.ok).length, 7);
});

test("non-POST and garbage requests fail cleanly", async () => {
  const get = await handleGame(new Request("http://x/", { method: "GET" }), store, clock);
  assert.equal(get.status, 405);
  const junk = await handleGame(new Request("http://x/", { method: "POST", body: "{not json" }), store, clock);
  assert.equal(junk.status, 400);
  const unknown = await call({ action: "hack" });
  assert.equal(unknown.status, 400);
});
