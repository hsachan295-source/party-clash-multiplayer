// Usage: npm run dev (or netlify serve), then: node tests/e2e/browser-game.mjs http://localhost:5173
// Browser E2E: 3 independent players (separate browser contexts = separate
// devices/storage), one desktop + two phone-sized, full 8-round game.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5173";
const SHOTS = "test-results/screenshots/";
mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// Uses an installed Chrome (set CHROME_PATH to override).
const browser = await chromium.launch({ channel: process.env.CHROME_PATH ? undefined : "chrome", executablePath: process.env.CHROME_PATH, headless: true });
const desktop = { viewport: { width: 1280, height: 800 } };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const ctxs = [await browser.newContext(desktop), await browser.newContext(phone), await browser.newContext({ ...phone, viewport: { width: 360, height: 740 } })];
const [host, bob, cara] = await Promise.all(ctxs.map((c) => c.newPage()));
const errors = [];
for (const [n, p] of [["host", host], ["bob", bob], ["cara", cara]]) {
  p.on("pageerror", (e) => errors.push(`${n}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${n}: ${m.text()}`));
}
const shot = (p, name) => p.screenshot({ path: SHOTS + name + ".png", fullPage: true });
const noHScroll = async (p, label) => {
  const { sw, cw } = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(`no horizontal scroll: ${label}`, sw <= cw, `${sw} <= ${cw}`);
};
const text = (p, sel) => p.locator(sel).first().innerText();

// Landing
await host.goto(BASE);
await shot(host, "01-home-desktop");
await bob.goto(BASE);
await shot(bob, "01-home-phone");
await noHScroll(bob, "home phone");

// Rules modal
await bob.getByRole("button", { name: "How to play" }).first().click();
check("rules modal visible", await bob.getByRole("dialog").isVisible());
await shot(bob, "02-rules-phone");
await bob.getByRole("button", { name: "Got it" }).click();

// Create
await host.getByRole("button", { name: "Create Room" }).click();
await host.fill("#name", "Alice");
await host.getByRole("button", { name: "Create Room" }).click();
await host.waitForSelector(".code-tiles");
const code = (await text(host, ".code-tiles")).replace(/\s/g, "");
check("room code generated", /^[A-HJ-NP-Z]{4}$/.test(code), code);
check("start disabled with 1 player", await host.getByRole("button", { name: "Start Game" }).isDisabled());

// Invalid code
await bob.getByRole("button", { name: "Join Room" }).click();
await bob.fill("#code", "QQQQ");
await bob.fill("#name", "Bob");
await bob.getByRole("button", { name: "Join Room" }).click();
await bob.waitForSelector(".form-error");
check("invalid room code error", /doesn't exist/.test(await text(bob, ".form-error")), await text(bob, ".form-error"));
await shot(bob, "03-join-error-phone");

// Join
await bob.fill("#code", code.toLowerCase());
await bob.getByRole("button", { name: "Join Room" }).click();
await bob.waitForSelector(".code-tiles");
// Cara joins through invite link, tries duplicate name first
await cara.goto(`${BASE}/?room=${code}`);
check("invite link prefills code", (await cara.inputValue("#code")) === code);
await cara.fill("#name", "bob");
await cara.getByRole("button", { name: "Join Room" }).click();
await cara.waitForSelector(".form-error");
check("duplicate nickname rejected", /already taken/.test(await text(cara, ".form-error")));
await cara.fill("#name", "Cara");
await cara.getByRole("button", { name: "Join Room" }).click();
await cara.waitForSelector(".code-tiles");

await host.waitForFunction(() => document.querySelectorAll(".player:not(.slot)").length === 3, null, { timeout: 5000 });
for (const [n, p] of [["host", host], ["bob", bob], ["cara", cara]]) {
  await p.waitForFunction(() => document.querySelectorAll(".player:not(.slot)").length === 3, null, { timeout: 5000 });
  const names = await p.locator(".player:not(.slot) .pname").allInnerTexts();
  check(`lobby synced for ${n}`, names.join(",") === "Alice,Bob,Cara", names.join(","));
}
check("non-host has no start button", (await bob.getByRole("button", { name: "Start Game" }).count()) === 0);
check("non-host sees waiting message", /Waiting for/.test(await text(bob, ".waiting")));
await shot(host, "04-lobby-desktop");
await shot(bob, "04-lobby-phone");
await noHScroll(cara, "lobby 360px");

// Start
check("host start enabled with 3", await host.getByRole("button", { name: "Start Game" }).isEnabled());
await host.getByRole("button", { name: "Start Game" }).click();
await Promise.all([host, bob, cara].map((p) => p.waitForSelector(".get-ready", { timeout: 5000 })));
check("all see get-ready", true);
await shot(bob, "05-get-ready-phone");

const scoreOf = async (p) => Number((await text(p, ".my-score b")).replace(/[^0-9]/g, ""));
for (let round = 1; round <= 8; round++) {
  await Promise.all([host, bob, cara].map((p) => p.waitForSelector(".answer", { timeout: 15000 })));
  const qs = await Promise.all([host, bob, cara].map((p) => text(p, ".question-text")));
  const rl = await Promise.all([host, bob, cara].map((p) => text(p, ".round-label")));
  check(`round ${round}: same question for all`, qs.every((q) => q === qs[0]), qs[0]);
  check(`round ${round}: round label`, rl.every((r) => r.replace(/\s/g, "") === `Round${round}/8`), rl[0]);
  if (round === 1) {
    await shot(host, "06-question-desktop");
    await shot(bob, "06-question-phone");
    await noHScroll(cara, "question 360px");
  }
  await host.locator(".answer.a0").click();
  await host.waitForSelector(".answer.chosen .lock:has-text('Locked')");
  check(`round ${round}: answer locked & buttons disabled`, await host.locator(".answer.a1").isDisabled());
  await bob.locator(".answer.a1").tap();
  if (round === 4) {
    // Refresh recovery mid-round
    await bob.waitForSelector(".answer.chosen .lock:has-text('Locked')");
    const before = await scoreOf(bob);
    await bob.reload();
    await bob.waitForSelector(".game-header", { timeout: 8000 });
    const after = await scoreOf(bob);
    check("refresh restores player & score", before === after, `${before} -> ${after}`);
    const chosen = await bob.locator(".answer.chosen").count();
    const phase = await bob.evaluate(() => document.getElementById("app").dataset.phase);
    check("refresh restores locked answer", phase !== "question" || chosen === 1, `phase=${phase} chosen=${chosen}`);
  }
  if (round !== 2) await cara.locator(".answer.a2").tap(); // Cara skips round 2 (timer path)
  await Promise.all([host, bob, cara].map((p) => p.waitForSelector(".reveal-options", { timeout: 20000 })));
  const banners = await Promise.all([host, bob, cara].map((p) => text(p, ".result-banner")));
  const correctTexts = await Promise.all([host, bob, cara].map((p) => text(p, ".reveal-options li.correct .opt")));
  check(`round ${round}: reveal synced`, correctTexts.every((t) => t === correctTexts[0]), correctTexts[0]);
  if (round === 2) check("no-answer shown on timeout", /No answer/.test(banners[2]), banners[2]);
  const boards = await Promise.all([host, bob, cara].map((p) => p.locator(".board .score").allInnerTexts()));
  check(`round ${round}: leaderboard synced`, boards.every((b) => b.join() === boards[0].join()), boards[0].join("|"));
  // Banner points == header score delta consistent with board
  if (round === 1) {
    await shot(host, "07-reveal-desktop");
    await shot(bob, "07-reveal-phone");
    await noHScroll(cara, "reveal 360px");
  }
}

await Promise.all([host, bob, cara].map((p) => p.waitForSelector(".winner-hero", { timeout: 15000 })));
const headlines = await Promise.all([host, bob, cara].map((p) => text(p, ".winner-name")));
check("final winner synced", headlines.every((h) => h === headlines[0]), headlines[0]);
const finalRows = await host.locator(".board li").evaluateAll((els) =>
  els.map((li) => ({ name: li.querySelector(".pname").textContent, score: Number(li.querySelector(".score").textContent.replace(/[^0-9]/g, "")) })),
);
const top = Math.max(...finalRows.map((r) => r.score));
const leaders = finalRows.filter((r) => r.score === top).map((r) => r.name);
check("winner is highest score", leaders.some((n) => headlines[0].includes(n)), `${JSON.stringify(finalRows)} / ${headlines[0]}`);
check("only host sees Play Again", (await host.getByRole("button", { name: "Play Again" }).count()) === 1 && (await bob.getByRole("button", { name: "Play Again" }).count()) === 0);
await host.waitForTimeout(1200);
await shot(host, "08-final-desktop");
await shot(bob, "08-final-phone");
await noHScroll(cara, "final 360px");

// Rematch
await host.getByRole("button", { name: "Play Again" }).click();
await Promise.all([host, bob, cara].map((p) => p.waitForSelector(".code-tiles", { timeout: 5000 })));
const label = await text(bob, ".code-card .label");
check("rematch returns everyone to lobby", /game 2/i.test(label), label);
check("rematch keeps all players", (await cara.locator(".player:not(.slot)").count()) === 3);

// Leave
await cara.getByRole("button", { name: "Leave room" }).click();
await cara.getByRole("button", { name: "Tap again to leave" }).click();
await cara.waitForSelector(".home");
await host.waitForFunction(() => document.querySelectorAll(".player:not(.slot)").length === 2, null, { timeout: 5000 });
check("leave removes player from lobby", true);

check("no client JS errors", errors.length === 0, errors.join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
