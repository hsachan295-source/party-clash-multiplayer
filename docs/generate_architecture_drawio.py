# Generates docs/party-clash-architecture.drawio from the real implementation.
# Usage: python docs/generate_architecture_drawio.py docs/party-clash-architecture.drawio
# Then open the .drawio in draw.io (app.diagrams.net or desktop) and use
# File > Export as > SVG to refresh docs/party-clash-architecture.svg.
# Keep labels in sync with the code when the implementation changes.
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1]
cells = []
FONT = "Segoe UI,Helvetica,Arial,sans-serif"
BG = "#07081a"

def q(s):
    return escape(s, {'"': "&quot;", "\n": "&#xa;"})

def add(id, value, style, x=None, y=None, w=None, h=None, edge=False, src=None, tgt=None, points=None, parent="1"):
    if edge:
        pts = ""
        if points:
            pts = '<Array as="points">' + "".join(f'<mxPoint x="{px}" y="{py}"/>' for px, py in points) + "</Array>"
        cells.append(
            f'<mxCell id="{id}" value="{q(value)}" style="{style}" edge="1" parent="{parent}" source="{src}" target="{tgt}">'
            f'<mxGeometry relative="1" as="geometry">{pts}</mxGeometry></mxCell>'
        )
    else:
        cells.append(
            f'<mxCell id="{id}" value="{q(value)}" style="{style}" vertex="1" parent="{parent}">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>'
        )

def group(id, title, x, y, w, h, color):
    add(id, title,
        f"rounded=1;arcSize=3;html=0;fillColor=#0f1130;strokeColor={color};strokeWidth=2;"
        f"verticalAlign=top;align=left;spacingLeft=14;spacingTop=8;fontColor={color};fontStyle=1;fontSize=17;fontFamily={FONT};",
        x, y, w, h)

def item(id, label, x, y, w, h, color, fill="#1a1d45", size=12):
    add(id, label,
        f"rounded=1;arcSize=10;html=0;fillColor={fill};strokeColor={color};strokeOpacity=70;"
        f"fontColor=#f5f5ff;fontSize={size};align=left;verticalAlign=middle;spacingLeft=10;spacingRight=6;fontFamily={FONT};",
        x, y, w, h)

def text(id, label, x, y, w, h, color, size, bold=False, align="left"):
    add(id, label,
        f"text;html=0;strokeColor=none;fillColor=none;align={align};verticalAlign=middle;fontColor={color};"
        f"fontSize={size};fontStyle={1 if bold else 0};fontFamily={FONT};",
        x, y, w, h)

def arrow(id, src, tgt, label, color, dashed=False, points=None, exit=None, entry=None, width=2.5):
    style = (f"edgeStyle=orthogonalEdgeStyle;rounded=1;html=0;strokeColor={color};strokeWidth={width};"
             f"endArrow=block;endFill=1;fontColor={color};fontSize=12;fontStyle=1;fontFamily={FONT};"
             f"labelBackgroundColor={BG};")
    if dashed:
        style += "dashed=1;dashPattern=8 5;"
    if exit:
        style += f"exitX={exit[0]};exitY={exit[1]};exitDx=0;exitDy=0;"
    if entry:
        style += f"entryX={entry[0]};entryY={entry[1]};entryDx=0;entryDy=0;"
    add(id, label, style, edge=True, src=src, tgt=tgt, points=points)

W, H = 2370, 1370
LIME, PURPLE, CYAN, YELLOW, PINK, ORANGE, GREEN, BLUE = "#c6ff3d", "#a78bfa", "#22d3ee", "#facc15", "#f472b6", "#fb923c", "#4ade80", "#60a5fa"

add("bg", "", f"rounded=0;fillColor={BG};strokeColor=none;", 0, 0, W, H)
text("title", "Party Clash: After Hours Trivia  —  Architecture & Game Flow", 40, 18, 1500, 40, "#ffffff", 28, True)
text("subtitle", "As implemented: Vite + vanilla TypeScript frontend  ·  one Netlify Function (POST /.netlify/functions/game)  ·  Netlify Blobs room state  ·  2–8 players per room",
     40, 56, 1700, 26, "#a9acd0", 15)
text("legend1", "━━  request / response", 1820, 22, 500, 22, YELLOW, 13, True)
text("legend2", "┅┅  synchronized state (polling) / game loop", 1820, 46, 520, 22, LIME, 13, True)

# ---------------- Row A: architecture columns
COLW, GAP, TOP, HGT = 340, 50, 100, 730
cols = [40 + i * (COLW + GAP) for i in range(6)]
IX = 14  # inner padding
IW = COLW - 2 * IX

# 1. Player devices
x = cols[0]
group("g_dev", "PLAYER DEVICES", x, TOP, COLW, HGT, LIME)
item("dev_host", "Host browser (desktop or phone)\nCreates the room, gets the 4-letter code\nand host controls: Start / Play Again", x + IX, TOP + 50, IW, 92, LIME)
item("dev_p2", "Player 2 browser (phone or desktop)\nJoins with room code + nickname\nor the invite link  ?room=CODE", x + IX, TOP + 158, IW, 92, LIME)
item("dev_more", "Players 3 … 8 browsers\nSame join flow — max 8 per room\nJoin only while the room is in the lobby", x + IX, TOP + 266, IW, 92, LIME)
item("dev_note", "Separate devices, separate identities\nEach browser keeps its own session\nin localStorage — no accounts, no login", x + IX, TOP + 374, IW, 92, LIME, fill="#141633")
item("dev_mobile", "Mobile-first responsive UI\nPhones from 360 px wide up to desktop;\nlarge tap targets, no horizontal scroll", x + IX, TOP + 482, IW, 92, LIME, fill="#141633")
item("dev_same", "Every player sees the same lobby,\nquestion, countdown, results,\nleaderboard and winner", x + IX, TOP + 590, IW, 92, LIME, fill="#141633")

# 2. Frontend
x = cols[1]
group("g_fe", "FRONTEND   src/main.ts · styles.css", x, TOP, COLW, HGT, PURPLE)
fe = [
    ("fe_land", "Landing — Create Room / Join Room"),
    ("fe_create", "Create Room — host nickname"),
    ("fe_join", "Join Room — code + nickname, clear errors"),
    ("fe_lobby", "Lobby — code tiles, players n/8, host Start"),
    ("fe_rules", "How to Play — rules modal on every screen"),
    ("fe_round", "Trivia round — get ready, 15 s timer, 4 options"),
    ("fe_answer", "Answer submission — one tap, then Locked"),
    ("fe_results", "Round results — correct answer, who picked what"),
    ("fe_board", "Leaderboard — +points this round, ranking"),
    ("fe_final", "Final winner — podium, standings, Play Again"),
]
for i, (cid, label) in enumerate(fe):
    item(cid, label, x + IX, TOP + 48 + i * 67, IW, 56, PURPLE)

# 3. Client state
x = cols[2]
group("g_cs", "CLIENT STATE", x, TOP, COLW, HGT, CYAN)
item("cs_session", "src/session.ts — player/session identity\nlocalStorage: room code, playerId,\nsecret token, nickname", x + IX, TOP + 50, IW, 92, CYAN)
item("cs_code", "Room code\nShown in lobby + kept in the URL ?room=CODE\n(Copy invite link)", x + IX, TOP + 158, IW, 92, CYAN)
item("cs_api", "src/api.ts — API client\nPOST JSON to /.netlify/functions/game;\nestimates server clock offset for countdowns", x + IX, TOP + 266, IW, 92, CYAN)
item("cs_poll", "Polling / synchronization\n'state' every 0.8 s (question) / 1 s,\n4 s in a hidden tab; re-render on change", x + IX, TOP + 374, IW, 92, CYAN)
item("cs_refresh", "Refresh recovery\nOn reload the saved session calls 'state' →\nsame seat, score and locked-in answer", x + IX, TOP + 482, IW, 92, CYAN)
item("cs_err", "Connection handling\nNetwork error → 'Reconnecting…' banner;\nNOT_IN_ROOM / NO_ROOM → back to home", x + IX, TOP + 590, IW, 92, CYAN)

# 4. API layer
x = cols[3]
group("g_api", "API LAYER   server/handler.ts", x, TOP, COLW, HGT, YELLOW)
item("api_ep", "POST /.netlify/functions/game\nOne endpoint · JSON body { action, … }", x + IX, TOP + 48, IW, 62, YELLOW, fill="#2a2610", size=13)
item("api_val", "Request validation\nPOST only, ≤ 2 KB JSON, known action,\n4-letter code, playerId + secret token", x + IX, TOP + 122, IW, 80, YELLOW)
acts = [
    ("api_create", "create — room actions: new room, unique code"),
    ("api_join", "join — join actions: name rules, 2–8 cap"),
    ("api_start", "start — start game (host only, ≥ 2 players)"),
    ("api_state", "state — get game state (poll + heartbeat)"),
    ("api_answer", "answer — submit answer { round, choice }"),
    ("api_rematch", "rematch / leave — rematch (host), leave room"),
]
for i, (cid, label) in enumerate(acts):
    item(cid, label, x + IX, TOP + 214 + i * 54, IW, 46, YELLOW)
item("api_mutate", "mutate(): read → apply rules → conditional\nwrite; on ETag conflict re-read & retry\n(up to 12×, jittered backoff)", x + IX, TOP + 544, IW, 80, YELLOW)
item("api_resp", "Response: public room view JSON\nor { ok: false, error, code } + HTTP status", x + IX, TOP + 636, IW, 62, YELLOW)

# 5. Backend + game content
x = cols[4]
BH = 488
group("g_be", "BACKEND   netlify/functions/game.ts", x, TOP, COLW, BH, PINK)
be = [
    ("be_state", "server/logic.ts — authoritative game state\nOne RoomState per room; clients only send intent"),
    ("be_time", "advance() — server-side timing / round transitions\nlead-in 3.5 s / 2.5 s · question 15 s · reveal 6 s;\ncloses early when every connected player answered"),
    ("be_dup", "submitAnswer() — duplicate submission protection\nrejects duplicate, late (300 ms grace), early,\ninvalid choice, wrong round"),
    ("be_score", "closeQuestion() — server-side scoring\n500 + up to 500 speed bonus; wrong / none = 0"),
    ("be_rank", "ranking() — winner & tie-breakers\nscore → most correct → fastest time → shared win"),
    ("be_host", "Host authorization: start / rematch host-only;\nhost hand-off after 20 s away"),
    ("be_pub", "toPublic() — hides correct answer, others' picks\nand tokens until the round is revealed"),
]
hs = [44, 62, 62, 46, 46, 46, 46]
yy = TOP + 46
for (cid, label), h in zip(be, hs):
    item(cid, label, x + IX, yy, IW, h, PINK)
    yy += h + 14 if cid != "be_state" else h + 12
# concurrency note sits in API column (mutate) and storage; backend notes conditional writes too
CT = TOP + BH + 36
group("g_gc", "GAME CONTENT   server/questions.ts", x, CT, COLW, HGT - BH - 36, ORANGE)
item("gc_bank", "Built-in trivia question bank\n88 questions · 10 categories · 4 options each\nServer-only — never sent in the browser bundle", x + IX, CT + 40, IW, 66, ORANGE)
item("gc_deck", "buildDeck(): question selection — 8 random\nquestions per game, no repeats within a game\n(usedQuestions also avoids repeats on rematch);\noption order shuffled per question", x + IX, CT + 114, IW, 76, ORANGE)

# 6. Data storage
x = cols[5]
group("g_db", "DATA STORAGE   Netlify Blobs", x, TOP, COLW, HGT, GREEN)
item("db_store", "Store 'party-clash-rooms'\nkey room-<CODE> → one JSON doc per room", x + IX, TOP + 48, IW, 62, GREEN, fill="#10291c", size=13)
db = [
    ("db_status", "Game status: phase (lobby · question · reveal ·\nfinal), gameNumber, hostId"),
    ("db_players", "Player state: id, name, secret token,\nlastSeen, left"),
    ("db_scores", "Scores: score, correct, correctTimeMs;\nreveal results, winners"),
    ("db_round", "Current round: round, deck, question\n(correctIndex, startsAt, endsAt)"),
    ("db_answers", "Submitted answers: { playerId: choice, at }"),
    ("db_time", "Timestamps / session data: createdAt,\nupdatedAt (idle rooms recycled after 6 h)"),
]
for i, (cid, label) in enumerate(db):
    item(cid, label, x + IX, TOP + 124 + i * 74, IW, 62, GREEN)
item("db_cas", "Concurrency: strong-consistency reads;\nwrites with onlyIfNew (create) or\nonlyIfMatch: ETag (every update)", x + IX, TOP + 124 + 6 * 74, IW, 92, GREEN, fill="#10291c")

# Main request flow
arrow("e1", "dev_p2", "fe_join", "1  tap / type", YELLOW)
arrow("e2", "fe_answer", "cs_api", "2  action", YELLOW, exit=(1, 0.5), entry=(0, 0.75))
arrow("e3", "cs_api", "api_val", "3  POST", YELLOW, exit=(1, 0.3), entry=(0, 0.5))
arrow("e4", "api_mutate", "be_time", "4  apply rules", YELLOW, exit=(1, 0.3), entry=(0, 0.5))
arrow("e5", "be_state", "db_store", "5 read /\nwrite", YELLOW, exit=(1, 0.5), entry=(0, 0.5))
arrow("e6", "g_gc", "g_be", "8 questions / game", ORANGE, exit=(0.5, 0), entry=(0.5, 1), width=2)
# Return path: synchronized state to all browsers (below row A)
RY = TOP + HGT + 32
arrow("e7", "g_db", "g_dev", "6  Blobs → game function → public room view JSON → every player's poll  →  same lobby, round, countdown, results, scores & winner on all devices",
      LIME, dashed=True, exit=(0.5, 1), entry=(0.5, 1),
      points=[(cols[5] + COLW / 2, RY), (cols[0] + COLW / 2, RY)])

# ---------------- Row B: game lifecycle
LT = RY + 34
LH = 200
group("g_life", "GAME LIFECYCLE   (server/logic.ts phases: lobby → question → reveal → … → final)", 40, LT, W - 80, LH, PURPLE)
steps = [
    ("s1", "Create Room\nhost gets code"),
    ("s2", "Join Lobby\ncode + nickname"),
    ("s3", "2–8 Players\nlobby syncs"),
    ("s4", "Start Game\nhost only"),
    ("s5", "Question\n15 s timer"),
    ("s6", "Submit Answers\none per player"),
    ("s7", "Server Scores\n500 + speed bonus"),
    ("s8", "Reveal\ncorrect answer"),
    ("s9", "Leaderboard\n+points, ranks"),
    ("s10", "Next Round\nrounds 1 → 8"),
    ("s11", "Final Winner\ntie-breakers"),
    ("s12", "Rematch\nPlay Again"),
]
SW, SG = 150, 42
sx0 = 40 + ((W - 80) - (len(steps) * SW + (len(steps) - 1) * SG)) / 2
SY = LT + 52
for i, (cid, label) in enumerate(steps):
    fill = "#2a1f55" if cid in ("s5", "s6", "s7", "s8", "s9", "s10") else "#1a1d45"
    add(cid, label,
        f"rounded=1;arcSize=18;html=0;fillColor={fill};strokeColor={PURPLE};strokeWidth=2;"
        f"fontColor=#ffffff;fontSize=13;fontStyle=1;align=center;verticalAlign=middle;fontFamily={FONT};",
        sx0 + i * (SW + SG), SY, SW, 64)
    if i:
        arrow(f"l{i}", steps[i - 1][0], cid, "", PURPLE, width=2)
LOOPY = SY + 64 + 30
x5 = sx0 + 4 * (SW + SG) + SW / 2
x10 = sx0 + 9 * (SW + SG) + SW / 2
x2 = sx0 + 1 * (SW + SG) + SW / 2
x12 = sx0 + 11 * (SW + SG) + SW / 2
arrow("loop", "s10", "s5", "repeat × 8 rounds", LIME, dashed=True, exit=(0.5, 1), entry=(0.5, 1), points=[(x10, LOOPY), (x5, LOOPY)], width=2)
arrow("rem", "s12", "s2", "Play Again → same room, scores reset, fresh questions; new players may join", LIME, dashed=True,
      exit=(0.5, 1), entry=(0.5, 1), points=[(x12, LOOPY + 30), (x2, LOOPY + 30)], width=2)

# ---------------- Row C: deployment
DT = LT + LH + 30
DH = H - DT - 20
group("g_dep", "DEPLOYMENT", 40, DT, W - 80, DH, BLUE)
BY = DT + 46
BHH = DH - 64
item("d_gh", "GitHub repository\nhsachan295-source/\nparty-clash-multiplayer  (main)", 70, BY, 300, BHH, BLUE, size=13)
item("d_build", "Netlify build  (netlify.toml)\nnpm run build = tsc + vite build → dist/\nesbuild bundles netlify/functions/game.ts\nno env vars, API keys or database setup", 440, BY, 360, BHH, BLUE, size=13)
add("d_site", "Netlify site", f"rounded=1;arcSize=6;html=0;fillColor=#0b1a33;strokeColor={BLUE};dashed=1;verticalAlign=top;align=left;spacingLeft=10;spacingTop=2;fontColor={BLUE};fontSize=12;fontStyle=1;fontFamily={FONT};",
    870, BY - 18, 1040, BHH + 30)
item("d_static", "Netlify static frontend\ndist/ (index.html, JS, CSS)\nserved from Netlify's CDN", 890, BY + 6, 320, BHH - 18, BLUE, size=13)
item("d_fn", "Netlify Functions\ngame.ts at\n/.netlify/functions/game", 1230, BY + 6, 320, BHH - 18, BLUE, size=13)
item("d_blobs", "Netlify Blobs\nstore party-clash-rooms\n(built in, no manual setup)", 1570, BY + 6, 320, BHH - 18, BLUE, size=13)
item("d_url", "Public game URL\nhttps://<your-site>.netlify.app\nopen on any phone or desktop", 1980, BY, 300, BHH, LIME, fill="#1f2a0e", size=13)
arrow("d1", "d_gh", "d_build", "import / push", BLUE)
arrow("d2", "d_build", "d_site", "deploy", BLUE)
arrow("d3", "d_site", "d_url", "serve", BLUE)

xml = (
    '<mxfile host="drawio" agent="party-clash generator" version="24.7.17">'
    '<diagram id="party-clash-architecture" name="Architecture &amp; Game Flow">'
    f'<mxGraphModel dx="{W}" dy="{H}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" '
    f'page="1" pageScale="1" pageWidth="{W}" pageHeight="{H}" background="{BG}" math="0" shadow="0">'
    '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' + "".join(cells) + "</root></mxGraphModel></diagram></mxfile>\n"
)
open(OUT, "w", encoding="utf-8", newline="\n").write(xml)
print(f"wrote {OUT}: {len(cells)} cells")
