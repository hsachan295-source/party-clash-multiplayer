// Room persistence. Production uses Netlify Blobs with strong consistency and
// ETag-conditional writes, so two players acting at the same moment can never
// overwrite each other's changes — the loser of the race simply retries.

import { getStore } from "@netlify/blobs";
import type { RoomState } from "./logic.ts";

export interface StoredRoom {
  room: RoomState;
  etag: string;
}

export interface RoomStore {
  get(code: string): Promise<StoredRoom | null>;
  /** Writes only if no room exists under this code. Returns false otherwise. */
  create(code: string, room: RoomState): Promise<boolean>;
  /** Writes only if the stored room still has this etag. Returns false otherwise. */
  replace(code: string, room: RoomState, etag: string): Promise<boolean>;
}

export const STORE_NAME = "party-clash-rooms";

export function blobsRoomStore(): RoomStore {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const key = (code: string) => `room-${code}`;
  return {
    async get(code) {
      const entry = await store.getWithMetadata(key(code), { type: "json", consistency: "strong" });
      if (!entry) return null;
      // Netlify Blobs always returns an ETag. Netlify's local emulator does
      // not, so locally we fall back to an unconditional write.
      return { room: entry.data as RoomState, etag: entry.etag ?? "" };
    },
    async create(code, room) {
      const res = await store.setJSON(key(code), room, { onlyIfNew: true });
      return res.modified;
    },
    async replace(code, room, etag) {
      const res = await store.setJSON(key(code), room, etag ? { onlyIfMatch: etag } : {});
      return res.modified;
    },
  };
}

/**
 * In-memory store with the same compare-and-swap contract as Blobs. Used by
 * the local dev server and the test suite (strict ETag semantics).
 */
export function memoryRoomStore(): RoomStore {
  const rooms = new Map<string, { json: string; etag: string }>();
  let version = 0;
  const put = (code: string, room: RoomState) => {
    rooms.set(code, { json: JSON.stringify(room), etag: `"v${++version}"` });
  };
  return {
    async get(code) {
      const entry = rooms.get(code);
      return entry ? { room: JSON.parse(entry.json) as RoomState, etag: entry.etag } : null;
    },
    async create(code, room) {
      if (rooms.has(code)) return false;
      put(code, room);
      return true;
    },
    async replace(code, room, etag) {
      if (rooms.get(code)?.etag !== etag) return false;
      put(code, room);
      return true;
    },
  };
}
