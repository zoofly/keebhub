// Real end-to-end flows against the keebhub server (real Postgres, production build).
// usage: node e2e.js <width> <tag> [--ratelimit]
const { chromium } = require('playwright');
const fs = require('fs');

const ORIGIN = process.env.ORIGIN || 'http://localhost:5055';
const BASE = `${ORIGIN}/#`;
const width = Number(process.argv[2] || 1280);
const tag = process.argv[3] || `w${width}`;
const doRateLimit = process.argv.includes('--ratelimit');
const OUT = process.env.SHOTS_DIR || `./shots/e2e-${tag}`;
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} [${tag}] ${name}${detail ? ` -- ${detail}` : ''}`);
};
const step = async (name, fn) => {
  try {
    const detail = await fn();
    record(name, true, detail || '');
  } catch (err) {
    record(name, false, err.message.split('\n')[0]);
    await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png`, fullPage: true }).catch(() => {});
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

let page;
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  page = await context.newPage();
  const dialogs = [];
  const consoleErrors = [];
  const apiLog = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && !u.pathname.startsWith('/static')) {
      apiLog.push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`);
    }
  });

  const username = `e2e_${tag}_${Date.now().toString(36)}`;
  const password = 'correct-horse-battery';
  const noHScroll = async () => {
    const { sw, cw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(sw <= cw, `horizontal scroll: scrollWidth ${sw} > clientWidth ${cw}`);
  };
  const openMenuIfNeeded = async () => {
    const toggle = page.locator('.nav-toggle');
    if (await toggle.isVisible()) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }
  };
  const swalOk = async (title) => {
    const modal = page.locator('.swal-overlay--show-modal .swal-modal', { hasText: title });
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    await modal.locator('.swal-button--confirm').click();
    await page.locator('.swal-overlay--show-modal').waitFor({ state: 'detached', timeout: 5000 });
  };

  await step('guest landing renders', async () => {
    await page.goto(`${BASE}/home`);
    await page.waitForSelector('h1');
    await noHScroll();
    await page.screenshot({ path: `${OUT}/01-landing.png`, fullPage: true });
  });

  await step('guest deep link to /market shows login form', async () => {
    await page.goto(`${BASE}/market`);
    await page.reload();
    await page.waitForSelector('#login-username', { timeout: 5000 });
  });

  await step('non-hash path /about serves the SPA', async () => {
    const res = await page.goto(`${ORIGIN}/about`);
    expect(res.status() === 200, `status ${res.status()}`);
    await page.waitForSelector('.site-header', { timeout: 5000 });
  });

  await step('register: too-short password blocked client-side', async () => {
    await page.goto(`${BASE}/registration`);
    await page.fill('#register-username', username);
    await page.fill('#register-password', 'short');
    const before = apiLog.length;
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Passwords need at least 8', { timeout: 3000 });
    expect(!apiLog.slice(before).some((l) => l.includes('/register')), 'request was sent');
    await page.screenshot({ path: `${OUT}/02-register-short.png`, fullPage: true });
  });

  await step('register: duplicate username shows a message', async () => {
    await page.fill('#register-username', 'bench');
    await page.fill('#register-password', password);
    await page.click('button[type=submit]');
    const alert = page.locator('.auth-card [role=alert]');
    await alert.waitFor({ timeout: 5000 });
    const text = await alert.innerText();
    await page.screenshot({ path: `${OUT}/03-register-dup.png`, fullPage: true });
    expect(/taken/i.test(text), `message: ${text}`);
    return text;
  });

  await step('register: new account logs in and lands on market', async () => {
    await page.fill('#register-username', username);
    await page.fill('#register-password', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/#\/market$/, { timeout: 10000 });
    await openMenuIfNeeded();
    await page.locator('text=Log out').first().waitFor({ timeout: 5000 });
  });

  await step('market lists postings with formatted prices, no foreign edit buttons', async () => {
    await page.goto(`${BASE}/market`);
    await page.waitForSelector('.listing-card', { timeout: 10000 });
    const count = await page.locator('.listing-card').count();
    const prices = await page.locator('.listing-card__price').allInnerTexts();
    const edits = await page.locator('.listing-card >> text=Edit').count();
    expect(prices.every((p) => /^\$[\d,]+\.\d\d$|^Free \/ trade$/.test(p)), `bad prices: ${prices.slice(0, 5)}`);
    expect(edits === 0, `${edits} edit buttons on others' listings`);
    await noHScroll();
    await page.screenshot({ path: `${OUT}/04-market.png` });
    return `${count} cards, e.g. ${prices[0]}`;
  });

  await step('create: javascript: image URL rejected client-side', async () => {
    await page.goto(`${BASE}/create`);
    await page.fill('#new-listing-title', 'E2E <b>board</b>');
    await page.fill('#new-listing-image', 'javascript:alert(1)');
    await page.fill('#new-listing-price', '12.5');
    await page.fill('#new-listing-description', '<img src=x onerror=alert(1)> desc');
    const before = apiLog.length;
    await page.click('button[type=submit]');
    await page.waitForSelector('text=Use a full web address', { timeout: 3000 });
    expect(!apiLog.slice(before).some((l) => l.startsWith('POST /market')), 'request was sent');
    await noHScroll();
    await page.screenshot({ path: `${OUT}/05-create-invalid.png`, fullPage: true });
  });

  await step('create: valid listing posts (201) and shows on market', async () => {
    await page.fill('#new-listing-image', 'https://example.com/e2e.jpg');
    await page.click('button[type=submit]');
    await swalOk('Listing posted');
    await page.waitForURL(/#\/market$/);
    const first = page.locator('.listing-card').first();
    await first.waitFor();
    const t = await first.innerText();
    expect(t.includes('E2E <b>board</b>'), `first card: ${t.slice(0, 80)}`);
    expect(t.includes('$12.50'), `price missing in ${t.slice(0, 120)}`);
    expect(await first.locator('text=Edit').count() === 1, 'no edit button on own listing');
    expect(apiLog.some((l) => l.startsWith('POST /market 201')), 'no 201');
  });

  await step('edit: form pre-fills NUMERIC price and saves (200)', async () => {
    await page.goto(`${BASE}/mylistings`);
    await page.waitForSelector('.listing-card');
    await page.locator('.listing-card').first().locator('button:has-text("Edit")').click();
    const price = await page.inputValue('#edit-listing-price');
    expect(price === '12.50', `price field "${price}"`);
    await page.fill('#edit-listing-title', 'E2E board edited');
    await page.fill('#edit-listing-price', '15');
    await page.screenshot({ path: `${OUT}/06-edit-dialog.png` });
    await page.click('[role=dialog] button[type=submit]');
    await swalOk('Listing updated');
    const t = await page.locator('.listing-card').first().innerText();
    expect(t.includes('E2E board edited') && t.includes('$15.00'), t.slice(0, 120));
    expect(apiLog.some((l) => /^PUT \/market\/\d+ 200/.test(l)), 'no PUT 200');
  });

  await step('stored XSS payloads render as text (no dialog)', async () => {
    await page.goto(`${BASE}/market`);
    await page.waitForSelector('.listing-card');
    await page.waitForTimeout(500);
    expect(dialogs.length === 0, `dialogs: ${dialogs}`);
    const imgs = await page.locator('.listing-card img[src="x"]').count();
    expect(imgs === 0, 'raw <img> injected');
  });

  await step('deep link reload keeps the session', async () => {
    await page.goto(`${BASE}/mylistings`);
    await page.reload();
    await page.waitForSelector('h1:has-text("My listings")', { timeout: 5000 });
    await page.waitForSelector('.listing-card', { timeout: 5000 });
  });

  await step('delete: own listing deleted (204)', async () => {
    await page.locator('.listing-card').first().locator('button:has-text("Delete")').click();
    await page.locator('.swal-overlay--show-modal .swal-button--danger').click();
    await swalOk('Listing deleted');
    await page.waitForSelector('text=You haven\'t listed anything yet', { timeout: 5000 });
    expect(apiLog.some((l) => /^DELETE \/market\/\d+ 204/.test(l)), 'no DELETE 204');
  });

  await step('expired session (cookie cleared) drops to login without a request loop', async () => {
    await page.goto(`${BASE}/user`);
    await page.waitForSelector('h1:has-text("Hi")');
    await context.clearCookies();
    const before = apiLog.length;
    await openMenuIfNeeded();
    await page.locator('a[href="#/market"]').first().click();
    await page.waitForSelector('#login-username', { timeout: 5000 });
    await page.waitForTimeout(1500);
    const reqs = apiLog.slice(before);
    expect(reqs.length < 6, `requests: ${reqs.join(', ')}`);
    return reqs.join(', ');
  });

  await step('login: wrong password message', async () => {
    await page.goto(`${BASE}/login`);
    await page.fill('#login-username', username);
    await page.fill('#login-password', 'wrong-password');
    await page.click('button[type=submit]');
    const alert = page.locator('.auth-card [role=alert]');
    await alert.waitFor({ timeout: 5000 });
    const text = await alert.innerText();
    expect(/didn't match/.test(text), text);
  });

  await step('login then logout', async () => {
    await page.fill('#login-username', username);
    await page.fill('#login-password', password);
    await page.click('button[type=submit]');
    await page.waitForURL(/#\/market$/, { timeout: 10000 });
    await openMenuIfNeeded();
    await page.locator('button:has-text("Log out")').first().click();
    await page.waitForURL(/#\/home$/);
    await openMenuIfNeeded();
    await page.locator('a:has-text("Log in")').first().waitFor();
    const cookies = await context.cookies();
    const me = await page.evaluate(() => fetch('/api/user').then((r) => r.status));
    expect(me === 403, `/api/user after logout: ${me}`);
    await page.goto(`${BASE}/market`);
    await page.reload();
    await page.waitForSelector('#login-username', { timeout: 5000 });
    return `cookies after logout: ${cookies.map((c) => c.name).join(',')}`;
  });

  await step('mobile/desktop layout: no horizontal scroll on key pages', async () => {
    for (const p of ['/home', '/about', '/login', '/registration']) {
      await page.goto(`${BASE}${p}`);
      await page.waitForSelector('h1');
      await noHScroll();
    }
    const toggle = page.locator('.nav-toggle');
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.screenshot({ path: `${OUT}/07-menu-open.png` });
      expect((await toggle.getAttribute('aria-expanded')) === 'true', 'menu not expanded');
    }
  });

  if (doRateLimit) {
    await step('login: rate limit shows "Too many attempts"', async () => {
      await page.goto(`${BASE}/login`);
      let text = '';
      for (let i = 0; i < 30; i += 1) {
        await page.fill('#login-username', username);
        await page.fill('#login-password', `wrong-${i}-password`);
        const resp = page.waitForResponse((r) => r.url().endsWith('/api/user/login'));
        await page.click('button[type=submit]');
        const r = await resp;
        if (r.status() === 429) {
          await page.waitForTimeout(200);
          text = await page.locator('.auth-card [role=alert]').innerText();
          break;
        }
      }
      await page.screenshot({ path: `${OUT}/08-ratelimit.png`, fullPage: true });
      expect(/Too many attempts/.test(text), `message: ${text}`);
      return text;
    });
  }

  console.log(`console errors: ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);
  fs.writeFileSync(`${OUT}/api.log`, apiLog.join('\n'));
  fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[${tag}] ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
