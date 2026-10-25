import { defineConfig, type Plugin } from "vite";

// In `npm run dev`, serve /.netlify/functions/game from the same handler the
// Netlify Function uses, backed by an in-memory store with identical
// compare-and-swap semantics. Production uses Netlify Blobs.
function localGameFunction(): Plugin {
  return {
    name: "local-netlify-game-function",
    apply: "serve",
    async configureServer(server) {
      const { handleGame } = await import("./server/handler.ts");
      const { memoryRoomStore } = await import("./server/store.ts");
      const store = memoryRoomStore();
      server.middlewares.use("/.netlify/functions/game", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const request = new Request("http://localhost/.netlify/functions/game", {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
        });
        const response = await handleGame(request, store);
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [localGameFunction()],
  server: { host: true, port: 5173 },
  build: { outDir: "dist", target: "es2020" },
});
