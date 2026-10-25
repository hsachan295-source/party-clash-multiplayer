import type { ApiAction, ApiResponse } from "../shared/types.ts";

export const API_URL = "/.netlify/functions/game";

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public network = false,
  ) {
    super(message);
  }
}

/** Estimated (serverTime - localTime), refined from the lowest-latency sample. */
let clockOffset = 0;
let bestRtt = Infinity;

export const serverNow = () => Date.now() + clockOffset;

export async function api(body: ApiAction): Promise<Extract<ApiResponse, { ok: true }>> {
  const sent = Date.now();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the game server. Check your connection.", "NETWORK", true);
  }
  const received = Date.now();
  let data: ApiResponse;
  try {
    data = (await res.json()) as ApiResponse;
  } catch {
    throw new ApiError("The game server sent an unexpected response.", "NETWORK", true);
  }
  if (!data.ok) throw new ApiError(data.error, data.code ?? "ERROR");
  const rtt = received - sent;
  // Prefer fast round trips; let the estimate drift slowly so it can recover.
  if (rtt <= bestRtt * 1.2) {
    bestRtt = Math.min(bestRtt, rtt);
    clockOffset = data.room.serverNow - (sent + rtt / 2);
  } else {
    bestRtt += 5;
  }
  return data;
}
