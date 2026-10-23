// Seed data for the MSW mocks (dev and e2e builds only; never shipped in a
// production build). Accounts here exist only inside the mock.
import type { SwitchType } from "../../shared/schemas";

/** The passphrase of every seeded mock account. Not a real credential. */
export const MOCK_PASSPHRASE = "mock-only-passphrase";

export const SEED_USERS = [
  { id: 1, username: "kash" },
  { id: 2, username: "bench" },
  { id: 3, username: "switchfan" },
] as const;

/**
 * GET /api/config in the mocks: Cloudflare's documented always-pass
 * Turnstile TEST site key (visible widget). Public, test-only.
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const MOCK_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

/** A token the mock rejects with 403, to exercise the "bot check failed" path. */
export const MOCK_FAILING_TURNSTILE_TOKEN = "mock-turnstile-fail";

/** Images on this host are served by the e2e suite; elsewhere they fall back to "No photo". */
export const MOCK_IMAGE_HOST = "https://img.keebhub.test";

const TITLES: [string, number, string][] = [
  ["GMK Olivia++ base kit", 12000, "Lightly used, no shine. Comes in the original tray."],
  ["Tofu65 aluminum case (E-white)", 8500, "Small scratch on the back weight, otherwise clean."],
  ["Gateron Oil Kings x90", 0, "Free to a good home or trade for tactiles."],
  ["Keychron Q1 Pro, carbon black", 15000, "Barely used. Includes cable, keycap puller and box."],
  ["Durock V2 stabilizers (2u x4, 6.25u x1)", 1800, ""],
  [
    "NovelKeys Cream x70, lubed with 205g0",
    7000,
    "Hand lubed, very smooth. Spring swapped to 67g.",
  ],
  ["Akko Jelly Pink switches x45", 1200, ""],
  [
    "Mode Sonnet, slate, brass plate",
    42000,
    "Built once, used for a month. Selling to fund a group buy.",
  ],
  ["DSA blank keycaps, granite", 3500, "Full set, unused."],
  ["Holy Panda x67", 6000, "Original Drop run. Some light lube on the stems."],
  ["KBDfans 7v, purple", 22500, "Tray mount, FR4 plate. No PCB."],
  ["Zealios V2 67g x70", 9000, "Filmed, unlubed."],
  ["Coiled aviator cable, lavender", 4000, "USB-C to USB-C, 1.5m."],
  ["Kailh Box Jade x110", 4500, "Clicky as it gets."],
  ["Wooden wrist rest, walnut, 65%", 2500, ""],
  ["SA Bliss alphas and mods", 13000, "Mounted once for photos."],
  ["Boba U4T 62g x90", 7200, "Thocky tactile. Stock."],
  ["Hot-swap PCB for 65% (south-facing)", 3000, "Tested, all switches register."],
  ["Artisan keycap: purple sakura", 99999999, "One of a kind. Price is firm. Very firm."],
  ["Cherry MX Brown x104 (desoldered)", 1500, "Cleaned and tested."],
  ["Keycap and switch puller combo", 800, ""],
  ["Gateron Yellow x110", 2200, "Budget linears, great for a first build."],
  ["Brass weight for Tofu65", 5000, ""],
  ["Krytox 205g0, 5ml jar", 1400, "About half left."],
  ["Long description test board", 10000, "This board has a long story. ".repeat(20).trim()],
];

/** 25 postings, newest last, owned by bench mostly and kash for a few. */
export const SEED_POSTINGS = TITLES.map(([title, priceCents, description], index) => {
  const id = index + 1;
  const userId = id % 6 === 0 ? 1 : id % 5 === 0 ? 3 : 2;
  const created = new Date(Date.UTC(2026, 8, 1 + index, 15, 0, 0)).toISOString();
  return {
    id,
    userId,
    title,
    description,
    // Every fourth image is broken on purpose (shows the placeholder).
    imageUrl:
      id % 4 === 0
        ? `https://broken.keebhub.test/${id}.jpg`
        : `${MOCK_IMAGE_HOST}/listing-${id}.svg`,
    priceCents,
    createdAt: created,
    updatedAt: created,
  };
});

const SWITCH_ROWS: [string, string, SwitchType][] = [
  ["Cherry MX Red", "Cherry", "linear"],
  ["Cherry MX Black", "Cherry", "linear"],
  ["Cherry MX Silent Red", "Cherry", "linear"],
  ["Cherry MX Speed Silver", "Cherry", "linear"],
  ["Cherry MX Brown", "Cherry", "tactile"],
  ["Cherry MX Blue", "Cherry", "clicky"],
  ["Gateron Red", "Gateron", "linear"],
  ["Gateron Yellow", "Gateron", "linear"],
  ["Gateron Oil King", "Gateron", "linear"],
  ["Gateron Brown", "Gateron", "tactile"],
  ["Gateron Blue", "Gateron", "clicky"],
  ["Kailh Box White", "Kailh", "clicky"],
  ["Kailh Box Jade", "Kailh", "clicky"],
  ["Kailh Box Brown", "Kailh", "tactile"],
  ["NovelKeys Cream", "NovelKeys", "linear"],
  ["Akko CS Jelly Pink", "Akko", "linear"],
  ["Durock T1", "Durock", "tactile"],
  ["Boba U4T", "Gazzew", "tactile"],
  ["Zealios V2", "ZealPC", "tactile"],
  ["Holy Panda", "Drop", "tactile"],
];

/** Same catalog as migrations/0002_seed_switches.sql. */
export const SEED_SWITCHES = SWITCH_ROWS.map(([name, manufacturer, type], index) => ({
  id: index + 1,
  name,
  manufacturer,
  type,
  description: "",
  imageUrl: null,
}));
