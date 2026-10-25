// Client IPs as rate-limit keys. IPv4 addresses are used whole. IPv6 is
// keyed by its /64 prefix: one subscriber usually gets a whole /64 (or more),
// so keying on the full address would let a single client rotate through
// 2^64 addresses to dodge per-IP limits.

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(value: string): string | null {
  const match = IPV4.exec(value);
  if (!match) {
    return null;
  }
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= 255) ? parts.join(".") : null;
}

/** The 8 hextets of an IPv6 address, or null if it isn't one. */
function parseIpv6(value: string): number[] | null {
  let text = value;
  // An embedded IPv4 tail (e.g. ::ffff:192.0.2.1) is two hextets.
  const lastColon = text.lastIndexOf(":");
  const tail = parseIpv4(text.slice(lastColon + 1));
  if (tail) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) {
    return null;
  }
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const missing = 8 - head.length - rest.length;
  if ((halves.length === 2 && missing < 1) || (halves.length === 1 && missing !== 0)) {
    return null;
  }
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) {
    return null;
  }
  return groups.map((group) => Number.parseInt(group, 16));
}

/**
 * The part of a client IP that per-IP limits key on: the IPv4 address, or
 * the IPv6 /64 prefix written as "2001:db8:1:2::/64". IPv4-mapped IPv6
 * addresses count as IPv4. Anything unparseable is used as given (trimmed,
 * lower-case), and a missing IP is "unknown".
 */
export function ipKeyPart(ip: string | null | undefined): string {
  if (!ip) {
    return "unknown";
  }
  const value = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  const v4 = parseIpv4(value);
  if (v4) {
    return v4;
  }
  const v6 = parseIpv6(value);
  if (!v6) {
    return value;
  }
  // ::ffff:a.b.c.d is an IPv4 client.
  if (v6.slice(0, 5).every((group) => group === 0) && v6[5] === 0xffff) {
    const [hi = 0, lo = 0] = v6.slice(6);
    return [hi >> 8, hi & 255, lo >> 8, lo & 255].join(".");
  }
  return `${v6
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
