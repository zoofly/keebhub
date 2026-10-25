// Q-B2 (unit): PBKDF2 + pepper hashing and the PHC string format.
import { describe, expect, it } from "vitest";
import {
  formatPasswordHash,
  hashPassword,
  PBKDF2_ITERATIONS,
  PepperMissingError,
  type Peppers,
  parsePasswordHash,
  verifyPassword,
} from "../auth/password";

// Fake, test-only pepper values.
const V1: Peppers = { current: 1, keys: { 1: "pepper-one" } };
const V2: Peppers = { current: 2, keys: { 1: "pepper-one", 2: "pepper-two" } };
const PASSWORD = "fake test words";

describe("password hashing", () => {
  it("uses at most workerd's PBKDF2 limit", () => {
    expect(PBKDF2_ITERATIONS).toBeLessThanOrEqual(100_000);
  });

  it("uses 50,000 iterations (fits the Free plan's CPU budget with a password change)", () => {
    expect(PBKDF2_ITERATIONS).toBe(50_000);
  });

  it("formats a PHC-style string that parses and re-formats unchanged", async () => {
    const stored = await hashPassword(PASSWORD, V1);
    expect(stored).toMatch(
      new RegExp(
        `^\\$pbkdf2-sha256\\$v=1\\$i=${PBKDF2_ITERATIONS}\\$p=1\\$[A-Za-z0-9+/]{22}\\$[A-Za-z0-9+/]{43}$`,
      ),
    );
    const parsed = parsePasswordHash(stored);
    expect(parsed).not.toBeNull();
    expect(parsed && formatPasswordHash(parsed)).toBe(stored);
  });

  it("salts every hash", async () => {
    expect(await hashPassword(PASSWORD, V1)).not.toBe(await hashPassword(PASSWORD, V1));
  });

  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword(PASSWORD, V1);
    expect(await verifyPassword(PASSWORD, stored, V1)).toEqual({ valid: true, needsRehash: false });
    expect((await verifyPassword("other words", stored, V1)).valid).toBe(false);
  });

  it("NFC-normalizes before hashing", async () => {
    const stored = await hashPassword("café latte!", V1);
    expect((await verifyPassword("café latte!", stored, V1)).valid).toBe(true);
  });

  it("depends on the pepper", async () => {
    const stored = await hashPassword(PASSWORD, V1);
    const otherPepper: Peppers = { current: 1, keys: { 1: "a-different-pepper" } };
    expect((await verifyPassword(PASSWORD, stored, otherPepper)).valid).toBe(false);
  });

  it("asks for a rehash when the pepper version is not current", async () => {
    const stored = await hashPassword(PASSWORD, V1);
    expect(await verifyPassword(PASSWORD, stored, V2)).toEqual({ valid: true, needsRehash: true });
    const rehashed = await hashPassword(PASSWORD, V2);
    expect(parsePasswordHash(rehashed)?.pepperVersion).toBe(2);
    expect(await verifyPassword(PASSWORD, rehashed, V2)).toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("asks for a rehash when the iteration count is not current", async () => {
    const stored = await hashPassword(PASSWORD, V1, 1000);
    expect(await verifyPassword(PASSWORD, stored, V1)).toEqual({ valid: true, needsRehash: true });
  });

  it("never asks to rehash on a wrong password", async () => {
    const stored = await hashPassword(PASSWORD, V1, 1000);
    expect(await verifyPassword("wrong words", stored, V1)).toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  it("treats a missing or malformed hash as invalid (after a dummy derivation)", async () => {
    expect(await verifyPassword(PASSWORD, null, V1)).toEqual({ valid: false, needsRehash: false });
    for (const bad of [
      "",
      "plain",
      "$2a$10$abcdefghijklmnopqrstuv",
      "$pbkdf2-sha256$v=1$i=200000$p=1$AAAA$AAAA",
    ]) {
      expect((await verifyPassword(PASSWORD, bad, V1)).valid, bad).toBe(false);
    }
  });

  it("throws when a needed pepper is not configured", async () => {
    await expect(hashPassword(PASSWORD, { current: 1, keys: {} })).rejects.toThrow(
      PepperMissingError,
    );
    const stored = await hashPassword(PASSWORD, V2);
    await expect(verifyPassword(PASSWORD, stored, V1)).rejects.toThrow(PepperMissingError);
  });
});
