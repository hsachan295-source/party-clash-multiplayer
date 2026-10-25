// Local development + test helper: starts Netlify's own Blobs emulator and
// points the @netlify/blobs client at it, so local runs exercise exactly the
// same storage code (strong reads, ETag conditional writes) as production.

import { setEnvironmentContext } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";

export async function startLocalBlobs(directory: string, port = 0) {
  const token = "local-dev-token";
  const server = new BlobsServer({ directory, token, port });
  const { port: actualPort } = await server.start();
  const url = `http://localhost:${actualPort}`;
  setEnvironmentContext({ edgeURL: url, uncachedEdgeURL: url, siteID: "local-site", token });
  return server;
}
