// Per-IP rate-limit keys: IPv4 whole, IPv6 by /64.
import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginIpKey, registerIpKey } from "../db/throttle";
import { ipKeyPart } from "../lib/ip";
import { api, GOOD_PASSWORD, mockOutbound, PASS_TOKEN } from "./helpers";

describe("ipKeyPart", () => {
  it.each([
    ["192.0.2.1", "192.0.2.1"],
    [" 192.0.2.1 ", "192.0.2.1"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:0DB8:0001:0002:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["[2001:db8:1:2::9]", "2001:db8:1:2::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["::ffff:192.0.2.7", "192.0.2.7"],
    ["::ffff:c000:0207", "192.0.2.7"],
    ["64:ff9b::192.0.2.1", "64:ff9b:0:0::/64"],
  ])("%s -> %s", (ip, key) => {
    expect(ipKeyPart(ip)).toBe(key);
  });

  it("keys every address in one /64 the same and different /64s apart", () => {
    const a = ipKeyPart("2001:db8:aaaa:1::1");
    expect(ipKeyPart("2001:db8:aaaa:1:ffff:ffff:ffff:fffe")).toBe(a);
    expect(ipKeyPart("2001:db8:aaaa:2::1")).not.toBe(a);
  });

  it("passes through what it can't parse, and names a missing IP", () => {
    expect(ipKeyPart(null)).toBe("unknown");
    expect(ipKeyPart("")).toBe("unknown");
    expect(ipKeyPart("999.1.1.1")).toBe("999.1.1.1");
    expect(ipKeyPart("1:2:3")).toBe("1:2:3");
    expect(ipKeyPart("not-an-ip")).toBe("not-an-ip");
  });

  it("is used by the per-IP throttle keys", () => {
    expect(loginIpKey("2001:db8:1:2::7")).toBe("login:ip:2001:db8:1:2::/64");
    expect(registerIpKey("2001:db8:1:2::8")).toBe("register:ip:2001:db8:1:2::/64");
    expect(loginIpKey("198.51.100.4")).toBe("login:ip:198.51.100.4");
  });
});

describe("register limit per IPv6 /64", () => {
  beforeEach(() => {
    mockOutbound();
  });
  afterEach(() => vi.restoreAllMocks());

  it("counts every address in a /64 together", async () => {
    // The Rate Limiting binding is keyed the same way, so spread the
    // registrations past its 10-per-minute window by seeding the counter.
    const prefix = "2001:db8:5a:7";
    await env.DB.prepare(
      "INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?, 4, unixepoch(), NULL)",
    )
      .bind(registerIpKey(`${prefix}::1`))
      .run();
    const fifth = await api("/api/auth/register", {
      body: { username: "v6-fifth", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: `${prefix}:aaaa:bbbb:cccc:dddd`,
    });
    expect(fifth.status).toBe(201);
    const sixth = await api("/api/auth/register", {
      body: { username: "v6-sixth", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: `${prefix}:1111:2222:3333:4444`,
    });
    expect(sixth.status).toBe(429);
    const elsewhere = await api("/api/auth/register", {
      body: { username: "v6-other", password: GOOD_PASSWORD, turnstileToken: PASS_TOKEN },
      ip: "2001:db8:5a:8::1",
    });
    expect(elsewhere.status).toBe(201);
  });
});
