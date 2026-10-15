// Optional integration/visual check: install playwright and @mdi/js locally.
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const mdi = await import(process.env.MDI_MODULE || '@mdi/js');
const paths = Object.fromEntries(Object.entries(mdi.default || mdi).filter(([key]) => key.startsWith('mdi')).map(([key, value]) => ['mdi:' + key.slice(3).replace(/[A-Z]/g, (c, i) => (i ? '-' : '') + c.toLowerCase()), value]));
const bundle = await readFile('ha-wetterwarnungen.js', 'utf8');
await mkdir('test-output', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-10-15T08:58:00+02:00') });
await page.setContent(`<html lang="de"><meta charset="utf-8"><style>body{margin:0;padding:16px 12px;background:#293f35;font:14px Arial,sans-serif;--ha-card-background:#334f41;--primary-text-color:#eef6ef;--secondary-text-color:#bacdc0;--divider-color:#536f5e;--ha-card-border-color:#56735f;--ha-card-border-radius:20px;--primary-color:#acd2b9}h1{font-size:17px;margin:8px 5px 20px;color:#eef6ef}#cards>div{margin-bottom:20px}.label{font-size:10px;color:#bacdc0;letter-spacing:1px;font-weight:600;margin:0 4px 9px}</style><h1>Wetterwarnungen · Variante 1</h1><div id="cards"></div></html>`);
await page.evaluate((paths) => {
  window.iconPaths = paths;
  customElements.define('ha-icon', class extends HTMLElement {
    static get observedAttributes() { return ['icon']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }
    render() { this.shadowRoot.innerHTML = `<style>:host{display:inline-flex;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);align-items:center;justify-content:center;vertical-align:middle}svg{width:100%;height:100%;fill:currentColor}</style><svg viewBox="0 0 24 24"><path d="${window.iconPaths[this.getAttribute('icon')] || window.iconPaths['mdi:alert-outline']}"></path></svg>`; }
  });
}, paths);
await page.addScriptTag({ content: bundle });
await page.evaluate(() => {
  window.calls = 0; window.unsubscribes = 0; window.cards = [];
  const incident = (a = {}) => ({ entity_id: 'sensor.cap_wind', name: 'Wind', state: 'severe', attributes: { area_desc: 'Šumadija', status: 'actual', phase: 'active', event: 'Starker Wind', severity_normalized: 'severe', onset: '2026-10-15T08:00:00+02:00', expires: '2026-10-15T20:00:00+02:00', description: 'Starke Böen möglich. Lose Gegenstände sichern.', instruction: 'Gegenstände auf der Terrasse sichern und unnötige Fahrten vermeiden.', ...a } });
  window.incident = incident;
  const snap = (incidents = [], extra = {}) => ({ schema: 1, device: 'cap-device', stamp_entity: 'sensor.cap_alerts_wmo_last_updated', count_entity: 'sensor.cap_alerts_wmo_alert_count', stamp: '2026-10-15T08:57:00+02:00', count: String(incidents.length), incidents, diagnostics: [{ entity_id: 'sensor.cap_alerts_wmo_alert_count', state: String(incidents.length) }], ...extra });
  window.snapshot = snap;
  for (const [label, incidents, extra] of [['OHNE WARNUNG', [], {}], ['WARNFALL · BEISPIELDATEN', [incident()], {}], ['DATENAUSFALL · BEISPIELDATEN', [incident()], { stamp: '2026-10-15T07:00:00+02:00' }]]) {
    const holder = document.createElement('div'); holder.innerHTML = `<div class="label">${label}</div>`;
    const card = document.createElement('wetterwarnungen-card');
    card.setConfig({ type: 'custom:wetterwarnungen-card' });
    const connection = { connected: true, async subscribeMessage(callback, message) { window.calls++; card.push = callback; queueMicrotask(() => callback({ result: JSON.stringify(snap(incidents, extra)) })); return () => { window.unsubscribes++; }; } };
    card.hass = { connected: true, connection };
    holder.append(card); document.getElementById('cards').append(holder); window.cards.push(card);
  }
});
await page.waitForFunction(() => window.cards.every((c) => c._snapshot));
assert.equal(await page.evaluate(() => calls), 3);
for (const width of [320, 390, 460, 768]) {
  await page.setViewportSize({ width, height: 1100 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `page overflow at ${width}`);
  assert.equal(await page.evaluate(() => cards.some((c) => { const h = c.shadowRoot.querySelector('ha-card'); return h.scrollWidth > h.clientWidth + 1; })), false, `card overflow at ${width}`);
}
await page.setViewportSize({ width: 390, height: 1100 });
await page.screenshot({ path: 'test-output/mobile-390.png', fullPage: true });
const second = page.locator('wetterwarnungen-card').nth(1);
await second.locator('button[data-action="toggle-details"]').click();
assert.equal(await second.locator('.details-panel').count(), 1);
assert.match(await second.locator('.details-panel').innerText(), /Terrasse sichern/);
assert.equal(await second.locator('button[data-action="toggle-details"]').getAttribute('aria-expanded'), 'true');
await second.screenshot({ path: 'test-output/details-390.png' });
await second.locator('button[data-action="toggle-details"]').click();
assert.equal(await second.locator('.details-panel').count(), 0);
// CAP content is text, not HTML.
await page.evaluate(() => cards[0].push({ result: JSON.stringify(snapshot([incident({ event: '<img src=x onerror="window.injected=true">', description: '<script>window.injected=true</script>' })])) }));
assert.equal(await page.evaluate(() => Boolean(window.injected)), false);
assert.equal(await page.locator('wetterwarnungen-card').nth(0).locator('img').count(), 0);
// Disconnection downgrades the previous clear result immediately.
await page.evaluate(() => { const c = cards[0]; c.push({ result: JSON.stringify(snapshot()) }); c.hass = { connected: false, connection: c._hass.connection }; });
assert.match(await page.locator('wetterwarnungen-card').nth(0).locator('main').innerText(), /Warnlage unbestätigt/);
// Removing a card always removes its subscription; stale pending promises are safe.
await page.evaluate(async () => { cards[2].remove(); await Promise.resolve(); });
assert.equal(await page.evaluate(() => unsubscribes), 1);
// Schema failures must never retain a confirmed clear state.
await page.evaluate(() => cards[1].push({ result: 'invalid json' }));
assert.match(await second.locator('main').innerText(), /Warnlage unbestätigt/);
// The local clock detects stale data even without a new websocket response.
await page.evaluate(() => cards[1].push({ result: JSON.stringify(snapshot()) }));
assert.match(await second.locator('main').innerText(), /Keine Warnungen/);
await page.clock.fastForward(31 * 60000);
assert.match(await second.locator('main').innerText(), /Daten veraltet/);
// Pending subscriptions are cleaned up after detach.
await page.evaluate(async () => {
  window.pendingUnsubscribe = 0;
  let resolve;
  const c = document.createElement('wetterwarnungen-card');
  c.setConfig({ type: 'custom:wetterwarnungen-card' });
  c.hass = { connection: { subscribeMessage: () => new Promise((r) => { resolve = r; }) } };
  document.body.append(c); c.remove(); resolve(() => { window.pendingUnsubscribe++; });
  await Promise.resolve(); await Promise.resolve();
});
assert.equal(await page.evaluate(() => pendingUnsubscribe), 1);
assert.deepEqual(errors, []);
console.log('Browser: 320/390/460/768 px, details, XSS, disconnect, unsubscribe, invalid schema, aging and pending cleanup passed.');
await browser.close();
