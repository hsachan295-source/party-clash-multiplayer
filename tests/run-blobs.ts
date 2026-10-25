// Runs the whole test suite through the real @netlify/blobs client against
// Netlify's local Blobs emulator: `npm run test:blobs`.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx tsx --test tests/multiplayer.test.ts", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, STORE: "blobs" },
});
process.exit(result.status ?? 1);
