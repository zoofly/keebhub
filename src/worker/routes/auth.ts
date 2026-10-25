// /api/auth: register, login, logout, me, change password.
import { Hono } from "hono";
import {
  ChangePasswordInput,
  LoginInput,
  normalizeUsername,
  RegisterInput,
} from "../../shared/schemas";
import { isPwnedPassword } from "../auth/hibp";
import { logAuthEvent } from "../auth/log";
import { hashPassword, peppersFromEnv, verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
} from "../auth/session";
import { verifyTurnstile } from "../auth/turnstile";
import { deleteOtherSessionsStatement } from "../db/sessions";
import {
  clearThrottleStatement,
  LOGIN_IP_RULE,
  LOGIN_USER_RULE,
  lockedFor,
  loginIpKey,
  loginUserKey,
  REGISTER_IP_RULE,
  recordAttemptStatement,
  registerIpKey,
} from "../db/throttle";
import {
  createUser,
  findCredentials,
  findCredentialsById,
  updatePasswordHashStatement,
  usernameTaken,
} from "../db/users";
import type { AppEnv } from "../env";
import { jsonError } from "../middleware/errors";
import { authRateLimit, clientIp, rateLimited } from "../middleware/rateLimit";
import { requireUser } from "../middleware/session";
import { zJson } from "../middleware/validate";

export const BREACHED_PASSWORD_MESSAGE =
  "This password has appeared in a data breach. Choose a different one.";
const BOT_CHECK_MESSAGE = "Bot check failed. Please try again.";
const BAD_CREDENTIALS_MESSAGE = "Invalid username or password";

export const authRoutes = new Hono<AppEnv>()
  .post("/register", authRateLimit, zJson(RegisterInput), async (c) => {
    const { username, password, turnstileToken } = c.req.valid("json");
    const db = c.env.DB;
    const ip = clientIp(c);
    const cfRay = c.req.header("cf-ray") ?? null;
    const ipKey = registerIpKey(ip);

    // Reads and the bot check come before any D1 write.
    const wait = await lockedFor(db, ipKey);
    if (wait > 0) {
      await logAuthEvent("auth.locked", { username, ip, cfRay });
      return rateLimited(c, wait);
    }
    if (!(await verifyTurnstile(c.env, turnstileToken, ip))) {
      await logAuthEvent("auth.turnstile_failed", { username, ip, cfRay });
      return jsonError(c, 403, "forbidden", BOT_CHECK_MESSAGE);
    }
    await recordAttemptStatement(db, ipKey, REGISTER_IP_RULE).run();

    if (await usernameTaken(db, username)) {
      return jsonError(c, 409, "conflict", "That username is taken", {
        username: ["That username is taken"],
      });
    }
    if (await isPwnedPassword(password)) {
      return jsonError(c, 400, "validation_failed", "Choose a different password", {
        password: [BREACHED_PASSWORD_MESSAGE],
      });
    }

    const passwordHash = await hashPassword(password, peppersFromEnv(c.env));
    const user = await createUser(db, username, passwordHash);
    if (!user) {
      // Lost a race with another registration of the same name.
      return jsonError(c, 409, "conflict", "That username is taken", {
        username: ["That username is taken"],
      });
    }

    const previous = c.get("session");
    if (previous) {
      await deleteSession(db, previous.id);
    }
    const session = await createSession(db, user.id);
    setSessionCookie(c, session.token, session.expiresAt);
    await logAuthEvent("auth.register", { username, userId: user.id, ip, cfRay });
    return c.json({ user }, 201);
  })

  .post("/login", authRateLimit, zJson(LoginInput), async (c) => {
    const { username, password, turnstileToken } = c.req.valid("json");
    const db = c.env.DB;
    const ip = clientIp(c);
    const cfRay = c.req.header("cf-ray") ?? null;
    const userKey = loginUserKey(normalizeUsername(username));
    const ipKey = loginIpKey(ip);

    const wait = await lockedFor(db, userKey, ipKey);
    if (wait > 0) {
      await logAuthEvent("auth.locked", { username, ip, cfRay });
      return rateLimited(c, wait);
    }
    if (!(await verifyTurnstile(c.env, turnstileToken, ip))) {
      await logAuthEvent("auth.turnstile_failed", { username, ip, cfRay });
      return jsonError(c, 403, "forbidden", BOT_CHECK_MESSAGE);
    }

    const peppers = peppersFromEnv(c.env);
    const credentials = await findCredentials(db, username);
    // Runs a full derivation even for unknown users (no timing difference).
    const result = await verifyPassword(password, credentials?.passwordHash, peppers);
    if (!credentials || !result.valid) {
      await db.batch([
        recordAttemptStatement(db, userKey, LOGIN_USER_RULE),
        recordAttemptStatement(db, ipKey, LOGIN_IP_RULE),
      ]);
      await logAuthEvent("auth.login_failed", { username, ip, cfRay });
      return jsonError(c, 401, "unauthorized", BAD_CREDENTIALS_MESSAGE);
    }

    const writes = [clearThrottleStatement(db, userKey)];
    if (result.needsRehash) {
      const rehashed = await hashPassword(password, peppers);
      writes.push(updatePasswordHashStatement(db, credentials.user.id, rehashed));
    }
    await db.batch(writes);

    // A fresh session on every login (no fixation); drop the old one.
    const previous = c.get("session");
    if (previous) {
      await deleteSession(db, previous.id);
    }
    const session = await createSession(db, credentials.user.id);
    setSessionCookie(c, session.token, session.expiresAt);
    await logAuthEvent("auth.login", { username, userId: credentials.user.id, ip, cfRay });
    return c.json({ user: credentials.user }, 200);
  })

  .post("/logout", async (c) => {
    const session = c.get("session");
    if (session) {
      await deleteSession(c.env.DB, session.id);
      await logAuthEvent("auth.logout", { userId: session.userId, ip: clientIp(c) });
    }
    clearSessionCookie(c);
    return c.body(null, 204);
  })

  .get("/me", requireUser, (c) => {
    const user = c.get("user");
    return c.json({ id: user.id, username: user.username }, 200);
  })

  .post("/password", authRateLimit, requireUser, zJson(ChangePasswordInput), async (c) => {
    const { currentPassword, newPassword } = c.req.valid("json");
    const user = c.get("user");
    const session = c.get("session");
    const db = c.env.DB;
    const ip = clientIp(c);
    const userKey = loginUserKey(normalizeUsername(user.username));

    const wait = await lockedFor(db, userKey);
    if (wait > 0) {
      return rateLimited(c, wait);
    }
    const peppers = peppersFromEnv(c.env);
    const credentials = await findCredentialsById(db, user.id);
    const result = await verifyPassword(currentPassword, credentials?.passwordHash, peppers);
    if (!result.valid) {
      await recordAttemptStatement(db, userKey, LOGIN_USER_RULE).run();
      await logAuthEvent("auth.password_change_failed", { userId: user.id, ip });
      // 400, not 401: the session is fine, only the confirmation is wrong.
      return jsonError(c, 400, "validation_failed", "Current password is incorrect", {
        currentPassword: ["Current password is incorrect"],
      });
    }
    if (await isPwnedPassword(newPassword)) {
      return jsonError(c, 400, "validation_failed", "Choose a different password", {
        newPassword: [BREACHED_PASSWORD_MESSAGE],
      });
    }

    const passwordHash = await hashPassword(newPassword, peppers);
    // Atomic: new hash, every other session revoked, failure count reset.
    await db.batch([
      updatePasswordHashStatement(db, user.id, passwordHash),
      deleteOtherSessionsStatement(db, user.id, session.id),
      clearThrottleStatement(db, userKey),
    ]);
    await logAuthEvent("auth.password_changed", { userId: user.id, ip });
    return c.body(null, 204);
  });
