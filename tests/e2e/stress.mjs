// Usage: node tests/e2e/stress.mjs http://localhost:8888  (needs a server with conditional-write Blobs, e.g. a deploy preview)
// Production-style stress: 8 API clients against the bundled Netlify Function,
// all polling ~1/s like browsers, all answering simultaneously, full game + rematch.
const BASE = process.argv[2] ?? "http://localhost:8888";
const call = async (body) => {
  const r = await fetch(`${BASE}/.netlify/functions/game`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, d = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${d ? " — " + d : ""}`); };

const host = (await call({ action: "create", name: "P0" })).data;
const code = host.room.code;
// 10 simultaneous joins (incl. duplicate names) — must cap at 8 total, no dup names
const joins = await Promise.all(Array.from({ length: 10 }, (_, i) => call({ action: "join", code, name: i < 2 ? "Dupe" : `P${i}` })));
const players = [host, ...joins.filter((j) => j.data.ok).map((j) => j.data)];
check("concurrent joins capped at 8", players.length === 8, String(players.length));
const s = (p, extra = {}) => call({ action: "state", code, playerId: p.playerId, token: p.token, ...extra });
const lobby = (await s(host)).data.room;
check("lobby shows 8 unique names", new Set(lobby.players.map((p) => p.name.toLowerCase())).size === 8);

// background pollers
let stop = false;
const views = new Map();
const pollers = players.map(async (p) => {
  while (!stop) {
    const r = await s(p);
    if (r.data.ok) views.set(p.playerId, r.data.room);
    else check("poll ok", false, JSON.stringify(r.data));
    await sleep(700 + Math.random() * 600);
  }
});

const act = (p, action, extra = {}) => call({ action, code, playerId: p.playerId, token: p.token, ...extra });
check("start", (await act(host, "start")).data.ok);
const expected = new Map(players.map((p) => [p.playerId, 0]));
let lastScores;
for (let round = 1; round <= 8; round++) {
  let room;
  while (true) {
    room = (await s(host)).data.room;
    if (room.phase === "question" && room.round === round && Date.now() + 0 >= room.question.startsAt - (room.serverNow - Date.now())) break;
    await sleep(150);
  }
  // wait until question really started (server clock)
  while ((await s(host)).data.room.serverNow < room.question.startsAt + 200) await sleep(100);
  // everyone answers at once, each also double-submits
  const choices = players.map((_, i) => i % 4);
  const res = await Promise.all(players.flatMap((p, i) => [act(p, "answer", { round, choice: choices[i] }), act(p, "answer", { round, choice: (choices[i] + 1) % 4 })]));
  const okCount = res.filter((r) => r.data.ok).length;
  const dupCount = res.filter((r) => !r.data.ok && ["ALREADY_ANSWERED", "ROUND_CLOSED"].includes(r.data.code)).length;
  check(`round ${round}: exactly 8 answers accepted, 8 duplicates rejected`, okCount === 8 && dupCount === 8, `ok=${okCount} dup=${dupCount} other=${JSON.stringify(res.filter((r) => !r.data.ok && r.data.code !== "ALREADY_ANSWERED").map((r) => r.data.code))}`);
  let rv;
  while (true) {
    rv = (await s(host)).data.room;
    if (rv.phase === "reveal" && rv.reveal.round === round) break;
    await sleep(150);
  }
  check(`round ${round}: closed early once all answered`, rv.reveal.results.every((r) => r.choice !== null));
  for (const r of rv.reveal.results) {
    if (r.correct) expected.set(r.playerId, expected.get(r.playerId) + r.points);
    check(`round ${round}: points ${r.points} valid`, r.correct ? r.points >= 500 && r.points <= 1000 : r.points === 0);
  }
  const ok = rv.players.every((p) => p.score === expected.get(p.id));
  check(`round ${round}: scores = sum of round results (no lost updates)`, ok);
  // all clients agree
  const all = await Promise.all(players.map((p) => s(p)));
  check(`round ${round}: all 8 clients see same reveal & scores`, all.every((a) => a.data.room.phase === "reveal" && JSON.stringify(a.data.room.players.map((p) => p.score)) === JSON.stringify(rv.players.map((p) => p.score))));
  lastScores = rv.players;
}
let fin;
while (true) {
  fin = (await s(host)).data.room;
  if (fin.phase === "final") break;
  await sleep(200);
}
const ranked = fin.players.slice().sort((a, b) => b.score - a.score || b.correct - a.correct);
check("final: winner has top score", fin.winners.length >= 1 && fin.winners.every((w) => fin.players.find((p) => p.id === w).score === ranked[0].score), JSON.stringify(fin.winners.map((w) => fin.players.find((p) => p.id === w).name)));
check("final scores match", fin.players.every((p) => p.score === expected.get(p.id)));
const rem = await Promise.all([act(host, "rematch"), act(players[1], "rematch")]);
check("rematch: host ok, non-host rejected", rem[0].data.ok && rem[1].data.code === "NOT_HOST");
stop = true;
await Promise.all(pollers);
const after = (await s(players[3])).data.room;
check("rematch: lobby, scores reset, 8 players", after.phase === "lobby" && after.players.length === 8 && after.players.every((p) => p.score === 0));
console.log(fails ? `\n${fails} FAILURES` : "\nALL STRESS CHECKS PASSED");
process.exit(fails ? 1 : 0);
