// Netlify Function: the single multiplayer backend endpoint.
// Served at /.netlify/functions/game. Room state lives in Netlify Blobs.

import { handleGame } from "../../server/handler.ts";
import { blobsRoomStore } from "../../server/store.ts";

export default async (req: Request): Promise<Response> => handleGame(req, blobsRoomStore());
