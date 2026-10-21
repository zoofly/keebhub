// zod schemas shared by the Worker (request validation) and the client
// (forms, MSW mocks, response typing). No DOM or Worker APIs in here.
import { z } from "zod";
import {
  CURSOR_MAX,
  DESCRIPTION_MAX,
  ID_MAX,
  IMAGE_URL_MAX,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PRICE_MAX_CENTS,
  TITLE_MAX,
  TURNSTILE_TOKEN_MAX,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_PATTERN,
} from "./limits";
import { parseDollarsToCents } from "./money";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/**
 * A username as typed at registration: trimmed, 3-32 characters of
 * [A-Za-z0-9._-], starting with a letter or digit. Case is kept for
 * display; uniqueness and lookups are case-insensitive (see
 * normalizeUsername and the NOCASE column).
 */
export const Username = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(
    USERNAME_PATTERN,
    "Use only letters, numbers, dots, underscores and hyphens, starting with a letter or number",
  );

/** Canonical form for comparisons and throttle keys: trimmed, lower-case. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

const codePointLength = (value: string) => [...value].length;

/**
 * A new password: NFC-normalized, 8-128 code points, any printable
 * characters (no composition rules, per ASVS L1).
 */
export const Password = z
  .string()
  .normalize("NFC")
  .refine((value) => codePointLength(value) >= PASSWORD_MIN, {
    message: `Password must be at least ${PASSWORD_MIN} characters`,
  })
  .refine((value) => codePointLength(value) <= PASSWORD_MAX, {
    message: `Password must be at most ${PASSWORD_MAX} characters`,
  });

const TurnstileToken = z.string().min(1).max(TURNSTILE_TOKEN_MAX);

export const RegisterInput = z.object({
  username: Username,
  password: Password,
  turnstileToken: TurnstileToken,
});
export type RegisterInput = z.infer<typeof RegisterInput>;

/**
 * Login only checks shape and size: the rules for new accounts must not
 * tell an attacker anything about existing ones.
 */
export const LoginInput = z.object({
  username: z.string().trim().min(1).max(USERNAME_MAX),
  password: z
    .string()
    .normalize("NFC")
    .min(1)
    .max(PASSWORD_MAX * 4),
  turnstileToken: TurnstileToken,
});
export type LoginInput = z.infer<typeof LoginInput>;

export const User = z.object({
  id: z.int().positive(),
  username: z.string(),
});
export type User = z.infer<typeof User>;

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

/** https only, at most 2048 characters, no credentials in the URL. */
export const ImageUrl = z
  .string()
  .trim()
  .min(1, "Image URL is required")
  .max(IMAGE_URL_MAX, `Image URL must be at most ${IMAGE_URL_MAX} characters`)
  .refine(
    (value) => {
      if (!URL.canParse(value)) {
        return false;
      }
      const url = new URL(value);
      return url.protocol === "https:" && url.username === "" && url.password === "";
    },
    { message: "Image URL must be an https:// link" },
  );

/** Integer cents, 0 to 99,999,999.99. Used by the API. */
export const PriceCents = z.int().min(0).max(PRICE_MAX_CENTS);

/** A dollar amount typed into a form ("199.99"), converted to cents. */
export const PriceDollars = z.string().transform((value, ctx) => {
  const cents = parseDollarsToCents(value);
  if (cents === null) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a price like 199.99 (0 to 99,999,999.99)",
    });
    return z.NEVER;
  }
  return cents;
});

const Title = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(TITLE_MAX, `Title must be at most ${TITLE_MAX} characters`);

const Description = z
  .string()
  .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`);

/** Body of POST /api/postings and PUT /api/postings/:id. */
export const PostingInput = z.object({
  title: Title,
  description: Description.default(""),
  imageUrl: ImageUrl,
  priceCents: PriceCents,
});
export type PostingInput = z.infer<typeof PostingInput>;

/** The create/edit form: price is typed in dollars; output matches PostingInput. */
export const PostingFormInput = z
  .object({
    title: Title,
    description: Description,
    imageUrl: ImageUrl,
    price: PriceDollars,
  })
  .transform(({ price, ...rest }): PostingInput => ({ ...rest, priceCents: price }));
export type PostingFormValues = z.input<typeof PostingFormInput>;

export const Posting = z.object({
  id: z.int().positive(),
  userId: z.int().positive(),
  title: z.string(),
  description: z.string(),
  imageUrl: z.string(),
  priceCents: PriceCents,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Posting = z.infer<typeof Posting>;

// ---------------------------------------------------------------------------
// Switches
// ---------------------------------------------------------------------------

export const SwitchType = z.enum(["linear", "tactile", "clicky"]);
export type SwitchType = z.infer<typeof SwitchType>;

export const Switch = z.object({
  id: z.int().positive(),
  name: z.string(),
  manufacturer: z.string(),
  type: SwitchType,
  description: z.string(),
  imageUrl: z.string().nullable(),
});
export type Switch = z.infer<typeof Switch>;

// ---------------------------------------------------------------------------
// Request parameters and paging
// ---------------------------------------------------------------------------

/** A positive integer id from a URL segment ("abc", "0", "1.5" are rejected). */
export const IdParam = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, "Must be a positive integer")
  .transform(Number)
  .refine((id) => id <= ID_MAX, "Must be a positive integer");

/**
 * ?limit=&cursor= for keyset-paged lists. A missing limit means
 * PAGE_SIZE_DEFAULT; larger values are clamped to PAGE_SIZE_MAX and 0 to 1.
 * The cursor is opaque to clients.
 */
export const PageQuery = z.object({
  limit: z
    .string()
    .regex(/^\d{1,9}$/, "limit must be a non-negative integer")
    .optional()
    .transform((value) =>
      value === undefined ? PAGE_SIZE_DEFAULT : Math.min(Math.max(Number(value), 1), PAGE_SIZE_MAX),
    ),
  cursor: z
    .string()
    .max(CURSOR_MAX)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid cursor")
    .optional(),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const ErrorCode = z.enum([
  "validation_failed",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "rate_limited",
  "unavailable",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Every error response from /api/* has this shape. */
export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Health = z.object({
  status: z.literal("ok"),
});
export type Health = z.infer<typeof Health>;
