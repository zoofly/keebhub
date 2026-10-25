// In-memory data for the MSW mocks, persisted to sessionStorage in the
// browser so a reload (or a deep link in the same tab) keeps the session and
// data, like the real API would. Component tests get a fresh copy per test.
import type { Posting } from "../../shared/schemas";
import { MOCK_PASSPHRASE, SEED_POSTINGS, SEED_SWITCHES, SEED_USERS } from "./fixtures";

export type MockUser = { id: number; username: string; passphrase: string };

export type MockState = {
  users: MockUser[];
  postings: Posting[];
  saved: { userId: number; postingId: number; savedAt: string }[];
  switches: typeof SEED_SWITCHES;
  sessionUserId: number | null;
  /** Consecutive failed logins per normalized username. */
  failedLogins: Record<string, number>;
  /** Test hooks: "GET /api/switches" -> how many upcoming requests fail with 500. */
  failNext: Record<string, number>;
  /** When each user created a posting (ms), for the hourly listing cap. Kept after deletes. */
  postingsCreated: { userId: number; at: number }[];
  nextId: number;
};

const STORAGE_KEY = "keebhub-mock-db-v3";

function seed(): MockState {
  return {
    users: SEED_USERS.map((user) => ({ ...user, passphrase: MOCK_PASSPHRASE })),
    postings: SEED_POSTINGS.map((posting) => ({ ...posting })),
    saved: [{ userId: 1, postingId: 2, savedAt: "2026-10-01T12:00:00.000Z" }],
    switches: SEED_SWITCHES.map((item) => ({ ...item })),
    sessionUserId: null,
    failedLogins: {},
    failNext: {},
    postingsCreated: [],
    nextId: 1000,
  };
}

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

function load(): MockState {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as MockState;
    } catch {
      // fall through to a fresh seed
    }
  }
  return seed();
}

let state: MockState = load();

export const db = {
  get state() {
    return state;
  },
  /** Call after every write. */
  save() {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  },
  reset() {
    state = seed();
    storage()?.removeItem(STORAGE_KEY);
  },
  nextId() {
    state.nextId += 1;
    return state.nextId;
  },
};
