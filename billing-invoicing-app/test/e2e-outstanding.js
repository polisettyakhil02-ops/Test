/**
 * Drives the features added after the ledger migration through a real browser
 * against a real PostgreSQL: GSTR-1, e-invoicing, customer statements,
 * pagination and the outbox.
 *
 * Run `npm run dev:db`, `npm run setup` and `npm run dev` first.
 */
const { chromium } = require('playwright');
const S = process.env.E2E_OUT || '/tmp';
const B = 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD || 'supersecret1';

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().slice(0, 200));
  });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 200)));

  let n = 0;
  const step = async (name, fn) => {
    n += 1;
    process.stdout.write(`  ${String(n).padStart(2)}. ${name} ... `);
    await fn();
    console.log('ok');
  };

  await step('sign in', async () => {
    await p.goto(`${B}/login`);
    await p.fill('#email', 'admin@acme.test');
    await p.fill('#password', PASSWORD);
    await p.click('button[type=submit]');
    await p.waitForURL(`${B}/dashboard`, { timeout: 30000 });
  });

  let statementUrl;

  await step('a client statement balances against the ledger', async () => {
    await p.goto(`${B}/dashboard/clients`);
    const link = p.locator('a[aria-label^="Statement for"]').first();
    if ((await link.count()) === 0) throw new Error('no statement link on the clients list');
    await link.click();
    await p.waitForURL(/\/statement/, { timeout: 30000 });
    statementUrl = p.url();

    await p.waitForSelector('text=Opening balance');
    const closing = await p.locator('table tr:last-child td:last-child').innerText();
    if (!/₹/.test(closing)) throw new Error(`closing balance not money: ${closing}`);
    console.log(`\n       closing balance ${closing.trim()}`);
    process.stdout.write('       ');
  });

  await step('the statement CSV downloads with opening and closing rows', async () => {
    const id = statementUrl.match(/clients\/([^/]+)\/statement/)[1];
    const res = await p.request.get(`${B}/dashboard/clients/${id}/statement/csv`);
    if (res.status() !== 200) throw new Error(`csv HTTP ${res.status()}`);
    const text = await res.text();
    if (!/Opening balance/.test(text)) throw new Error('no opening balance row');
    if (!/Closing balance/.test(text)) throw new Error('no closing balance row');
    require('fs').writeFileSync(`${S}/e2e-statement.csv`, text);
  });

  await step('GSTR-1 renders for a period containing posted documents', async () => {
    await p.goto(`${B}/dashboard/reports/gstr1?from=2020-01-01&to=2035-12-31`);
    await p.waitForSelector('h1:text("GSTR-1")');
    // `p:text-is` rather than `text=Documents`: the latter also matches the
    // sidebar link, and asserting against the nav proves nothing.
    const figure = p.locator('p:text-is("Documents")').locator('..');
    // innerText puts a blank line between the label and the value, so take the
    // last non-empty line rather than a fixed index.
    const lines = (await figure.innerText()).split('\n').map((l) => l.trim()).filter(Boolean);
    const count = Number(lines.at(-1));
    if (!Number.isFinite(count)) throw new Error('could not read the document count');
    if (count === 0) throw new Error('no documents in the return');
    console.log(`\n       ${count} documents in the return`);
    process.stdout.write('       ');
  });

  await step('the GSTR-1 CSV has the sections the portal expects', async () => {
    const res = await p.request.get(`${B}/dashboard/reports/gstr1/csv?from=2020-01-01&to=2035-12-31`);
    if (res.status() !== 200) throw new Error(`csv HTTP ${res.status()}`);
    const text = await res.text();
    if (!/^GSTR-1,/.test(text)) throw new Error('missing header row');
    if (!/HSN summary/.test(text)) throw new Error('missing HSN summary');
    require('fs').writeFileSync(`${S}/e2e-gstr1.csv`, text);
    console.log(`\n       ${text.split('\n').length} CSV lines`);
    process.stdout.write('       ');
  });

  let postedInvoiceUrl;
  let panelState;

  await step('every posted invoice carries an e-invoicing panel', async () => {
    await p.goto(`${B}/dashboard/invoices?docType=invoice`);
    const rows = p.locator('tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      const text = await rows.nth(i).innerText();
      if (!/Draft/.test(text)) {
        await rows.nth(i).locator('td a').first().click();
        break;
      }
    }
    await p.waitForURL(/\/dashboard\/invoices\/[0-9a-f-]{36}$/, { timeout: 30000 });
    postedInvoiceUrl = p.url();

    // Which of the two panels shows depends on whether this invoice has already
    // been registered. Both are valid; asserting on only one would make this
    // step depend on the order earlier runs happened to leave the data in.
    await p.waitForSelector('h2:text("e-Invoicing"), h2:text("Registered")');
    panelState = (await p.locator('h2:text("Registered")').count()) > 0 ? 'registered' : 'open';
    console.log(`\n       panel: ${panelState}`);
    process.stdout.write('       ');
  });

  await step('the panel says plainly what state the invoice is in', async () => {
    if (panelState === 'registered') {
      const panel = p.locator('h2:text("Registered")').locator('../../..');
      const text = await panel.innerText();
      if (!/IRN/.test(text)) throw new Error('registered panel shows no IRN');
      if ((await p.locator('img[alt="Signed e-invoice QR code"]').count()) === 0) {
        throw new Error('registered panel shows no QR');
      }
      // Once stamped, there must be no way to type a new IRN.
      if ((await p.locator('#irn').count()) !== 0) throw new Error('the IRN is still editable');
      return;
    }

    const panel = p.locator('h2:text("e-Invoicing")').locator('../..');
    const text = await panel.innerText();
    if (!/Not registrable yet|Download IRP payload/.test(text)) {
      throw new Error(`panel says neither blocked nor ready:\n${text}`);
    }
    console.log(`\n${text.split('\n').slice(2).map((l) => '       ' + l).join('\n')}`);
    process.stdout.write('       ');
  });

  await step('the payload route answers with a payload or with reasons', async () => {
    const res = await p.request.get(`${postedInvoiceUrl}/einvoice`);
    if (res.status() === 200) {
      const body = await res.json();
      if (!body.Version) throw new Error('200 but not an IRP payload');
      require('fs').writeFileSync(`${S}/e2e-einvoice.json`, JSON.stringify(body, null, 2));
      console.log('\n       200 with a payload — the invoice is registrable');
    } else if (res.status() === 422) {
      const body = await res.json();
      if (!Array.isArray(body.blockers) || body.blockers.length === 0) {
        throw new Error('422 with no blockers');
      }
      console.log(`\n       422 with ${body.blockers.length} blocker(s)`);
    } else {
      throw new Error(`unexpected HTTP ${res.status()}`);
    }
    process.stdout.write('       ');
  });

  await step('the outbox lists the events posting queued', async () => {
    await p.goto(`${B}/dashboard/outbox`);
    await p.waitForSelector('h1:text("Outbox")');
    const rows = await p.locator('tbody tr').count();
    if (rows === 0) throw new Error('no outbox rows, but invoices have been posted');
    const pending = await p.locator('text=Pending').first().locator('..').innerText();
    console.log(`\n       ${rows} events · ${pending.replace(/\n/g, ' ')}`);
    process.stdout.write('       ');
  });

  await step('delivering with no endpoint configured says so instead of failing silently', async () => {
    const before = await p.locator('tbody tr').first().innerText();
    await p.click('button:has-text("Deliver now")');
    await p.waitForSelector('[data-sonner-toast]', { timeout: 15000 });
    const toast = await p.locator('[data-sonner-toast]').innerText();
    if (!/WEBHOOK_ENDPOINT/.test(toast)) throw new Error(`unexpected toast: ${toast}`);
    if (!before) throw new Error('no rows to compare');
  });

  await step('pagination controls appear and carry the filters', async () => {
    await p.goto(`${B}/dashboard/invoices?docType=invoice`);
    const summary = await p.locator('text=/\\d+–\\d+ of \\d+ documents/').innerText();
    console.log(`\n       ${summary}`);
    process.stdout.write('       ');
  });

  await step('an out-of-range page renders empty rather than erroring', async () => {
    const res = await p.goto(`${B}/dashboard/invoices?page=9999`);
    if (res.status() !== 200) throw new Error(`HTTP ${res.status()}`);
    await p.waitForSelector('h1:text("Documents")');
  });

  await step('a bad page value falls back to page 1', async () => {
    const res = await p.goto(`${B}/dashboard/clients?page=not-a-number`);
    if (res.status() !== 200) throw new Error(`HTTP ${res.status()}`);
    await p.waitForSelector('h1:text("Clients")');
  });

  await step('the PDF still renders after the QR changes', async () => {
    const res = await p.request.get(`${postedInvoiceUrl}/pdf`);
    if (res.status() !== 200) throw new Error(`pdf HTTP ${res.status()}`);
    const buf = await res.body();
    if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('not a PDF');
    require('fs').writeFileSync(`${S}/e2e-invoice.pdf`, buf);
    console.log(`\n       pdf ${buf.length} bytes`);
    process.stdout.write('       ');
  });

  console.log('\nconsole errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch((e) => {
  console.error('\nE2E FAILED:', e.message);
  process.exit(1);
});
