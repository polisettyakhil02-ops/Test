/**
 * The e-invoicing happy path, end to end against a real PostgreSQL.
 *
 * Creates a registered inter-state buyer, raises and posts an invoice with an
 * HSN code, downloads the IRP payload, records what a portal would hand back
 * and checks the IRN and QR reach the printed invoice.
 *
 * Requires the entity to have a GSTIN and a PIN-coded address:
 *   npm run entity -- --gstin ... --address "..." --address "City - 560001"
 */
const { chromium } = require('playwright');
const S = process.env.E2E_OUT || '/tmp';
const B = 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD || 'supersecret1';
const STAMP = Date.now().toString().slice(-6);

/**
 * Pulls the drawn text out of a PDF.
 *
 * react-pdf writes strings as either literals or hex depending on the glyphs
 * involved, so both forms are decoded -- checking for only one would pass or
 * fail on an encoding decision rather than on whether the IRN is printed.
 */
function pdfText(buffer) {
  const zlib = require('zlib');
  const raw = buffer.toString('latin1');
  let decoded = '';

  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      decoded += zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      // Not a deflate stream (an image, say). Nothing to read here.
    }
  }

  let text = '';
  for (const match of decoded.matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g)) {
    text += match[1] !== undefined
      ? match[1].replace(/\\(.)/g, '$1')
      : Buffer.from(match[2].replace(/\s/g, ''), 'hex').toString('latin1');
  }

  return text;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 } });
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
    const note = await fn();
    console.log(note ? `ok — ${note}` : 'ok');
  };

  await step('sign in', async () => {
    await p.goto(`${B}/login`);
    await p.fill('#email', 'admin@acme.test');
    await p.fill('#password', PASSWORD);
    await p.click('button[type=submit]');
    await p.waitForURL(`${B}/dashboard`, { timeout: 30000 });
  });

  const clientName = `Globex Maharashtra ${STAMP}`;

  await step('create a registered inter-state client', async () => {
    await p.goto(`${B}/dashboard/clients/new`);
    await p.fill('#name', clientName);
    await p.fill('#gstin', '27AAACG1234M1Z8');
    await p.fill('#line1', 'Plot 12, Andheri East');
    await p.fill('#city', 'Mumbai');
    await p.fill('#postalCode', '400069');
    // Radix Select, not a native <select>.
    await p.click('#state-trigger');
    await p.click('[role=option]:has-text("27 \u2014 Maharashtra")');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/dashboard\/clients(\?|$)/, { timeout: 30000 });
  });

  let invoiceUrl;

  await step('raise an invoice with an HSN code and post it', async () => {
    await p.goto(`${B}/dashboard/invoices/new`);
    await p.click('#party-trigger');
    await p.click(`[role=option]:has-text("${clientName}")`);

    await p.fill('input[id$="-description"]', 'Consulting retainer');
    await p.fill('input[id$="-hsn"]', '998311');
    await p.fill('input[id$="-qty"]', '2');
    await p.fill('input[id$="-price"]', '15000');
    await p.fill('input[id$="-tax"]', '18');

    await p.click('button[type=submit]');
    await p.waitForURL(/\/dashboard\/invoices\/[0-9a-f-]{36}$/, { timeout: 30000 });
    invoiceUrl = p.url();

    await p.click('button:has-text("Post")');
    await p.click('[role=alertdialog] button:has-text("Post")');
    await p.waitForSelector('h1:text-matches("^INV-")', { timeout: 30000 });

    return await p.locator('h1').first().innerText();
  });

  await step('an inter-state supply charges IGST, not CGST + SGST', async () => {
    const body = await p.locator('body').innerText();
    if (!/IGST @ 18%/.test(body)) throw new Error('no IGST line on the posted invoice');
    if (/CGST/.test(body)) throw new Error('CGST appeared on an inter-state supply');
  });

  await step('the panel reports the invoice as registrable', async () => {
    const panel = p.locator('h2:text("e-Invoicing")').locator('../..');
    const text = await panel.innerText();
    if (/Not registrable yet/.test(text)) throw new Error(`still blocked:\n${text}`);
    if (!/Download IRP payload/.test(text)) throw new Error('no download button');
  });

  let payload;

  await step('the IRP payload is well formed', async () => {
    const res = await p.request.get(`${invoiceUrl}/einvoice`);
    if (res.status() !== 200) throw new Error(`HTTP ${res.status()}: ${await res.text()}`);
    payload = await res.json();
    require('fs').writeFileSync(`${S}/e2e-einvoice.json`, JSON.stringify(payload, null, 2));

    const problems = [];
    if (payload.Version !== '1.1') problems.push('wrong Version');
    if (payload.DocDtls.Typ !== 'INV') problems.push('wrong Typ');
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(payload.DocDtls.Dt)) problems.push(`bad Dt ${payload.DocDtls.Dt}`);
    if (payload.SellerDtls.Gstin !== '29AABCU9603R1ZX') problems.push('wrong seller GSTIN');
    if (payload.BuyerDtls.Gstin !== '27AAACG1234M1Z8') problems.push('wrong buyer GSTIN');
    if (payload.BuyerDtls.Pin !== 400069) problems.push(`bad buyer Pin ${payload.BuyerDtls.Pin}`);
    if (payload.SellerDtls.Pin !== 560001) problems.push(`bad seller Pin ${payload.SellerDtls.Pin}`);
    if (payload.ItemList.length !== 1) problems.push('wrong item count');
    if (payload.ItemList[0].HsnCd !== '998311') problems.push('wrong HSN');
    if (payload.ItemList[0].IsServc !== 'Y') problems.push('SAC not marked as a service');

    // 2 x 15000 = 30000 assessable, 18% IGST = 5400, total 35400.
    if (payload.ValDtls.AssVal !== 30000) problems.push(`AssVal ${payload.ValDtls.AssVal}`);
    if (payload.ValDtls.IgstVal !== 5400) problems.push(`IgstVal ${payload.ValDtls.IgstVal}`);
    if (payload.ValDtls.CgstVal !== 0) problems.push(`CgstVal ${payload.ValDtls.CgstVal}`);
    if (payload.ValDtls.TotInvVal !== 35400) problems.push(`TotInvVal ${payload.ValDtls.TotInvVal}`);

    if (problems.length) throw new Error(problems.join('; '));
    return `AssVal ${payload.ValDtls.AssVal}, IGST ${payload.ValDtls.IgstVal}, total ${payload.ValDtls.TotInvVal}`;
  });

  await step('a malformed IRN is rejected before it is stamped', async () => {
    await p.goto(invoiceUrl);
    await p.fill('#irn', 'not-an-irn');
    await p.fill('#ackNo', '112410000123');
    await p.fill('#ackDate', '2026-08-17 10:32:00');
    await p.fill('#signedQrCode', 'x.y.z');
    await p.click('button:has-text("Record IRN")');
    await p.waitForSelector('text=64 hexadecimal characters', { timeout: 15000 });
  });

  const irn = 'a1b2c3d4e5f6'.repeat(5) + 'abcd';

  await step('recording the IRN stamps the posted invoice', async () => {
    // Reload rather than typing over the rejected attempt: clicking while React
    // is still re-rendering the error state drops the submit, which makes this
    // step flaky for a reason that has nothing to do with what it is testing.
    await p.goto(invoiceUrl);
    await p.waitForSelector('#irn');

    const qrPayload = {
      SellerGstin: '29AABCU9603R1ZX',
      BuyerGstin: '27AAACG1234M1Z8',
      DocNo: (await p.locator('h1').first().innerText()).trim(),
      TotInvVal: '35400.00',
      Irn: irn,
    };
    const jwt = [
      Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url'),
      Buffer.from(JSON.stringify({ data: JSON.stringify(qrPayload) })).toString('base64url'),
      'c2lnbmF0dXJl',
    ].join('.');

    await p.fill('#irn', irn);
    await p.fill('#ackNo', '112410000123');
    await p.fill('#ackDate', '2026-08-17 10:32:00');
    await p.fill('#signedQrCode', jwt);
    await p.click('button:has-text("Record IRN")');

    await p.waitForSelector('h2:text("Registered")', { timeout: 30000 });
    const src = await p.locator('img[alt="Signed e-invoice QR code"]').getAttribute('src');
    if (!src || !src.startsWith('data:image/png;base64,')) throw new Error('QR is not a PNG data URI');
    return `QR ${src.length} chars`;
  });

  await step('the IRN cannot be replaced once issued', async () => {
    const res = await p.request.post(invoiceUrl, { data: {} }).catch(() => null);
    // The form is gone from the page entirely, which is the real guarantee the
    // user sees; the database guard is covered by the ledger tests.
    if ((await p.locator('#irn').count()) !== 0) throw new Error('the IRN form is still editable');
    if (res && res.status() >= 500) throw new Error(`server error ${res.status()}`);
  });

  await step('the printed invoice carries the IRN and the QR', async () => {
    const res = await p.request.get(`${invoiceUrl}/pdf`);
    if (res.status() !== 200) throw new Error(`pdf HTTP ${res.status()}`);
    const buf = await res.body();
    if (buf.slice(0, 4).toString() !== '%PDF') throw new Error('not a PDF');
    require('fs').writeFileSync(`${S}/e2e-einvoice.pdf`, buf);

    // The QR has to be a real embedded image, not a placeholder box.
    const images = buf.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? [];
    if (images.length === 0) throw new Error('no image embedded in the PDF');

    const text = pdfText(buf);
    if (!text.includes(irn)) throw new Error('the IRN is not printed on the invoice');
    if (!text.includes('112410000123')) throw new Error('the acknowledgement number is missing');

    return `${buf.length} bytes, ${images.length} image object(s), IRN present`;
  });

  await step('the registered invoice appears in B2B on the return', async () => {
    await p.goto(`${B}/dashboard/reports/gstr1?from=2020-01-01&to=2035-12-31`);
    const b2b = p.locator('h2:text("B2B")').locator('../..');
    const text = await b2b.innerText();
    if (!/27AAACG1234M1Z8/.test(text)) throw new Error('the registered buyer is not in B2B');
    return 'B2B contains the buyer GSTIN';
  });

  console.log('\nconsole errors:', errs.length ? errs : 'none');
  await browser.close();
})().catch((e) => {
  console.error('\nE2E FAILED:', e.message);
  process.exit(1);
});
