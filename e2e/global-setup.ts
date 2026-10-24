// Seeds the fresh e2e database (see e2e/server.ts) through the real API with
// the same accounts, postings and saved listing as the MSW mock seed, so ids
// match (kash = user 1, posting 2 is bench's "Tofu65 aluminum case", ...).
import { type FullConfig, request } from "@playwright/test";
import { SEED_POSTINGS, SEED_USERS } from "../src/client/mocks/fixtures";
import { randomIp, SEED_PASSPHRASE, TURNSTILE_DUMMY_TOKEN } from "./support";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) {
    throw new Error("baseURL is not configured");
  }

  const sessions = new Map<number, Awaited<ReturnType<typeof request.newContext>>>();
  for (const seed of SEED_USERS) {
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: { origin: baseURL, "cf-connecting-ip": randomIp() },
    });
    const res = await api.post("/api/auth/register", {
      data: {
        username: seed.username,
        password: SEED_PASSPHRASE,
        turnstileToken: TURNSTILE_DUMMY_TOKEN,
      },
    });
    if (res.status() !== 201) {
      throw new Error(`seeding ${seed.username}: ${res.status()} ${await res.text()}`);
    }
    const { user } = (await res.json()) as { user: { id: number } };
    if (user.id !== seed.id) {
      throw new Error(`expected ${seed.username} to be user ${seed.id}, got ${user.id}`);
    }
    sessions.set(seed.id, api);
  }

  for (const posting of SEED_POSTINGS) {
    const api = sessions.get(posting.userId);
    const res = await api?.post("/api/postings", {
      data: {
        title: posting.title,
        description: posting.description,
        imageUrl: posting.imageUrl,
        priceCents: posting.priceCents,
      },
    });
    const body = (await res?.json()) as { id?: number } | undefined;
    if (res?.status() !== 201 || body?.id !== posting.id) {
      throw new Error(`seeding posting ${posting.id}: ${res?.status()}`);
    }
  }

  // kash has one saved listing (bench's posting 2), as in the mock seed.
  const saved = await sessions.get(1)?.put("/api/me/saved/2");
  if (saved?.status() !== 201) {
    throw new Error(`seeding the saved listing: ${saved?.status()}`);
  }

  await Promise.all([...sessions.values()].map((api) => api.dispose()));
}
