// Lightweight player identity: the room code, player id and secret token are
// kept in localStorage so a refresh (or brief disconnect) rejoins seamlessly.

export interface Session {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

const KEY = "party-clash-session";
const NAME_KEY = "party-clash-name";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.code && s.playerId && s.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(NAME_KEY, s.name);
  } catch {
    /* storage unavailable: the game still works, refresh just won't resume */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function lastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
