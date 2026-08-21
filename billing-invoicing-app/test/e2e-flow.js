const { chromium } = require('playwright');
const S = '/tmp/claude-0/-home-user-Test/a43938fe-2757-5dc3-8f74-c019bfa016d9/scratchpad';
const B = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,160)); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0,160)));

  const step = async (name, fn) => {
    try { await fn(); console.log(`  ok   ${name}`); }
    catch (e) { console.log(`  FAIL ${name}: ${String(e.message).slice(0,180)}`); throw e; }
  };

  // 1. Sign in through the real form
  await step('sign in via the login form', async () => {
    await p.goto(`${B}/login`, { waitUntil: 'domcontentloaded' });
    await p.fill('#email', 'admin@acme.test');
    await p.fill('#password', 'supersecret1');
    await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard', { timeout: 30000 });
  });

  // 2. Create a client
  await step('create a client', async () => {
    await p.goto(`${B}/dashboard/clients/new`, { waitUntil: 'domcontentloaded' });
    await p.fill('#name', 'Globex (India) Ltd');
    await p.fill('#email', 'ap@globex.in');
    await p.fill('#gstin', '29aabcu9603r1zm');
    await p.click('#state-trigger');
    await p.click('[role="option"]:has-text("29 — Karnataka")');
    await p.fill('#line1', '9th Floor, Prestige Tower');
    await p.fill('#city', 'Bengaluru');
    await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard/clients', { timeout: 30000 });
    await p.waitForSelector('text=Globex (India) Ltd');
  });

  // 3. Create an item
  await step('create an item', async () => {
    await p.goto(`${B}/dashboard/items/new`, { waitUntil: 'domcontentloaded' });
    await p.fill('#name', 'Design retainer');
    await p.fill('#hsnSac', '998314');
    await p.fill('#unit', 'month');
    await p.fill('#unitPrice', '50000');
    await p.fill('#taxRatePercent', '18');
    await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard/items', { timeout: 30000 });
    await p.waitForSelector('text=Design retainer');
  });

  // 4. Draft an invoice using the saved item
  let invoiceUrl;
  await step('draft an invoice from the item master', async () => {
    await p.goto(`${B}/dashboard/invoices/new`, { waitUntil: 'domcontentloaded' });
    await p.click('#party-trigger');
    await p.click('[role="option"]:has-text("Globex")');
    await p.click('button[aria-label="Add a saved item"]');
    await p.click('[role="option"]:has-text("Design retainer")');
    await p.waitForTimeout(300);
    // Remove the blank first line
    await p.click('button[aria-label="Remove line 1"]');
    await p.waitForTimeout(300);
    await p.click('button[type=submit]');
    await p.waitForURL(/\/dashboard\/invoices\/[0-9a-f-]{36}$/, { timeout: 30000 });
    invoiceUrl = p.url();
  });

  await step('draft shows the GST split and no number yet', async () => {
    const body = await p.textContent('body');
    if (!/CGST/.test(body)) throw new Error('no CGST shown');
    if (!/Draft/.test(body)) throw new Error('not shown as draft');
  });
  await p.screenshot({ path: `${S}/e2e-draft.png`, fullPage: true });

  // 5. Post it
  await step('post the invoice', async () => {
    await p.click('button:has-text("Post")');
    await p.waitForSelector('[data-slot="alert-dialog-content"]');
    await p.click('[data-slot="alert-dialog-content"] button:has-text("Post")');
    // router.refresh() is async -- wait for the heading itself to carry the
    // issued number, not merely for the number to appear anywhere on the page.
    await p.waitForFunction(
      () => /INV-\d{5}/.test(document.querySelector('h1')?.textContent || ''),
      { timeout: 30000 },
    );
  });
  const number = (await p.textContent('h1')).trim().match(/INV-\d{5}/)[0];
  console.log(`       posted as ${number}`);
  await p.screenshot({ path: `${S}/e2e-posted.png`, fullPage: true });

  await step('the ledger entry is shown on the document', async () => {
    const body = await p.textContent('body');
    if (!/Ledger entry/.test(body)) throw new Error('no ledger entry section');
    if (!/Accounts Receivable/.test(body)) throw new Error('no AR line');
    if (!/GST Output Payable/.test(body)) throw new Error('no GST line');
  });

  await step('the posted invoice shows its stored CGST/SGST breakdown', async () => {
    // Regression: the totals block used to pass an empty tax array, so the
    // components stored at posting were never displayed.
    const body = await p.textContent('body');
    if (!/CGST @ 9%/.test(body)) throw new Error('CGST row missing from totals');
    if (!/SGST @ 9%/.test(body)) throw new Error('SGST row missing from totals');
  });

  await step('a posted invoice offers no edit button', async () => {
    // Exact match: :has-text() is case-insensitive, so "Edit" would otherwise
    // match the "Credit note" link (cr-EDIT-).
    const editable = await p.getByRole('link', { name: 'Edit', exact: true }).count();
    if (editable > 0) throw new Error('edit still offered on a posted document');
  });

  // 6. Trial balance
  await step('trial balance balances', async () => {
    await p.goto(`${B}/dashboard/reports/trial-balance`, { waitUntil: 'domcontentloaded' });
    const body = await p.textContent('body');
    if (!/Balanced/.test(body)) throw new Error('trial balance reports NOT balanced');
    if (/NOT BALANCED/.test(body)) throw new Error('trial balance is not balanced');
  });
  await p.screenshot({ path: `${S}/e2e-trial-balance.png`, fullPage: true });

  // 7. Record a partial payment
  await step('record a partial payment', async () => {
    await p.goto(`${B}/dashboard/invoices/payment`, { waitUntil: 'domcontentloaded' });
    await p.fill('#amount', '20000');
    // Target this run's invoice explicitly. Auto-apply settles the oldest open
    // invoice, which makes the assertion depend on pre-existing data.
    await p.fill(`input[aria-label="Amount to apply to ${number}"]`, '20000');
    await p.waitForTimeout(200);
    await p.click('button[type=submit]');
    await p.waitForURL('**/dashboard/invoices**', { timeout: 30000 });
  });

  await step('the invoice now reads as partly paid', async () => {
    await p.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
    const body = await p.textContent('body');
    if (!/Partly paid/.test(body)) throw new Error('not showing as partly paid');
  });

  // 8. Ageing
  await step('ageing shows the open balance', async () => {
    await p.goto(`${B}/dashboard/reports/ageing`, { waitUntil: 'domcontentloaded' });
    const body = await p.textContent('body');
    if (!/Globex/.test(body)) throw new Error('invoice missing from ageing');
  });
  await p.screenshot({ path: `${S}/e2e-ageing.png`, fullPage: true });

  // 9. Credit note
  await step('raise and post a credit note', async () => {
    await p.goto(invoiceUrl, { waitUntil: 'domcontentloaded' });
    await p.getByRole('link', { name: 'Credit note' }).click();
    await p.waitForURL(/invoices\/new/, { timeout: 30000 });
    await p.click('button[type=submit]');
    await p.waitForURL(/\/dashboard\/invoices\/[0-9a-f-]{36}$/, { timeout: 30000 });
    await p.click('button:has-text("Post")');
    await p.waitForSelector('[data-slot="alert-dialog-content"]');
    await p.click('[data-slot="alert-dialog-content"] button:has-text("Post")');
    await p.waitForFunction(
      () => /CRN-\d{5}/.test(document.querySelector('h1')?.textContent || ''),
      { timeout: 30000 },
    );
  });

  await step('trial balance still balances after the credit note', async () => {
    await p.goto(`${B}/dashboard/reports/trial-balance`, { waitUntil: 'domcontentloaded' });
    const body = await p.textContent('body');
    if (/NOT BALANCED/.test(body)) throw new Error('books no longer balance');
  });

  // 10. Dashboard + PDF
  await step('dashboard renders ledger figures', async () => {
    await p.goto(`${B}/dashboard`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('text=Revenue');
  });
  await p.screenshot({ path: `${S}/e2e-dashboard.png`, fullPage: true });

  await step('PDF downloads for the posted invoice', async () => {
    const res = await p.request.get(`${invoiceUrl}/pdf`);
    if (res.status() !== 200) throw new Error(`pdf HTTP ${res.status()}`);
    const buf = await res.body();
    if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('not a PDF');
    require('fs').writeFileSync(`${S}/e2e-invoice.pdf`, buf);
    console.log(`       pdf ${buf.length} bytes`);
  });

  console.log('\nconsole errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch(e => { console.error('\nE2E FAILED:', e.message); process.exit(1); });
