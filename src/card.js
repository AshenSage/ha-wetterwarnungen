const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, extra = '') => `<ha-icon icon="${escapeHTML(name)}" ${extra}></ha-icon>`;
const levelLabel = (rank) => ({ 4: 'Rot', 3: 'Orange', 2: 'Gelb' })[rank] || 'Stufe unklar';
const phaseLabel = (bucket) => ({ active: 'Jetzt gültig', upcoming: 'Angekündigt', uncertain: 'Unbestätigt' })[bucket];
const recordTone = (r) => r.bucket === 'uncertain' ? 'unknown' : ({ 4: 'red', 3: 'orange', 2: 'yellow' })[r.rank] || 'unknown';

class WetterwarnungenCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._generation = 0;
    this._expanded = false;
    this._pending = false;
    this._error = '';
    this._technicalError = '';
    this.shadowRoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'toggle-details') {
        this._expanded = !this._expanded;
        this._render();
        this.shadowRoot.querySelector('[data-action="toggle-details"]')?.focus({ preventScroll: true });
      }
    });
  }

  static getStubConfig() {
    return { title: 'Wetterwarnungen', region: 'Šumadija', region_match: 'sumadija', count_entity: DEFAULT_CONFIG.count_entity, updated_entity: DEFAULT_CONFIG.updated_entity };
  }
  static getConfigElement() { return document.createElement('wetterwarnungen-card-editor'); }
  getCardSize() { return this._expanded ? 7 : this._snapshot && this._model?.records.length ? 4 : 3; }
  getGridOptions() { return { columns: 12, rows: 'auto', min_columns: 6 }; }

  setConfig(value) {
    this._config = normalizeConfig(value);
    this._snapshot = undefined;
    this._error = '';
    this._technicalError = '';
    this._expanded = false;
    this._stop();
    this._render();
    this._start();
  }
  set hass(hass) {
    const previous = this._hass?.connection;
    this._hass = hass;
    if (previous !== hass.connection) {
      this._stop();
      if (previous) this._snapshot = undefined;
    }
    const offline = hass.connected === false || hass.connection?.connected === false;
    if (this._offline !== offline) { this._offline = offline; this._render(); }
    this._start();
  }
  connectedCallback() {
    this._timer = setInterval(() => { this._render(); this._start(); }, 30000);
    this._start();
  }
  disconnectedCallback() {
    clearInterval(this._timer);
    this._stop();
  }
  _stop() {
    this._generation++;
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = undefined;
    this._pending = false;
    if (unsubscribe) Promise.resolve().then(unsubscribe).catch(() => {});
  }
  async _start() {
    if (!this.isConnected || !this._config || !this._hass?.connection || this._pending || this._unsubscribe || this._offline) return;
    const generation = this._generation;
    this._pending = true;
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage((message) => {
        if (generation !== this._generation || !this.isConnected) return;
        try {
          if (message.error) {
            this._technicalError = String(typeof message.error === 'string' ? message.error : message.error.message || JSON.stringify(message.error)).slice(0, 1500);
            throw new Error('CAP-Daten konnten nicht ausgewertet werden.');
          }
          const snapshot = typeof message.result === 'string' ? JSON.parse(message.result) : message.result;
          if (snapshot?.schema !== 1 || !Array.isArray(snapshot.incidents)) throw new Error('Unerwartetes Datenformat.');
          this._snapshot = snapshot;
          this._error = '';
          this._technicalError = '';
        } catch (error) { this._error = error.message || 'Daten konnten nicht gelesen werden.'; }
        this._render();
      }, { type: 'render_template', template: SOURCE_TEMPLATE, variables: { card: { ...this._config, region_pattern: regionPattern(this._config.region_match) } }, report_errors: true });
      if (generation !== this._generation || !this.isConnected) await unsubscribe();
      else this._unsubscribe = unsubscribe;
    } catch (error) {
      if (generation === this._generation) {
        this._error = 'Verbindung zur Datenquelle fehlgeschlagen.';
        this._technicalError = String(error?.message || error?.code || error || '').slice(0, 1500);
        this._render();
      }
    } finally { if (generation === this._generation) this._pending = false; }
  }
  _record(record) {
    const c = this._config;
    const times = record.windows.map((w) => formatValidity(w, c.time_zone));
    const subtitle = record.instruction || record.description;
    return `<section class="warning-row" data-tone="${recordTone(record)}" aria-label="${escapeHTML(record.event)}">
      <div class="status-icon">${icon(record.icon)}</div>
      <div class="warning-content">
        <div class="event-line"><h3>${escapeHTML(record.event)}</h3><span class="level">${escapeHTML(levelLabel(record.rank))}</span></div>
        <div class="phase">${phaseLabel(record.bucket)}</div>
        <div class="validity">${times.map((t) => `<div>${escapeHTML(t)}</div>`).join('')}</div>
        ${record.notes.length ? `<div class="notes">${record.notes.map(escapeHTML).join(' · ')}</div>` : ''}
        ${subtitle ? `<p class="preview">${escapeHTML(subtitle)}</p>` : ''}
      </div>
    </section>`;
  }
  _details(model) {
    const c = this._config;
    return `<div id="warning-details" class="details-panel">
      ${model.records.map((r) => `<section class="detail-record">
        <h4>${icon(r.icon)} ${escapeHTML(r.event)} <span>${escapeHTML(levelLabel(r.rank))} · ${phaseLabel(r.bucket)}</span></h4>
        ${r.windows.map((w) => `<p class="muted">${escapeHTML(formatValidity(w, c.time_zone))}</p>`).join('')}
        ${r.description ? `<p class="full-text">${escapeHTML(r.description)}</p>` : ''}
        ${r.instruction && r.instruction !== r.description ? `<p class="instruction full-text">${escapeHTML(r.instruction)}</p>` : ''}
        ${r.notes.length ? `<p class="muted">${r.notes.map(escapeHTML).join(' · ')}</p>` : ''}
        ${r.confirmed !== null ? `<p class="muted">Zuletzt bestätigt: ${escapeHTML(new Intl.DateTimeFormat('de-CH', { timeZone: c.time_zone, dateStyle: 'short', timeStyle: 'short' }).format(r.confirmed))}</p>` : ''}
        ${r.windows[0].start === null && r.sent !== null ? `<p class="muted">Veröffentlicht: ${escapeHTML(new Intl.DateTimeFormat('de-CH', { timeZone: c.time_zone, dateStyle: 'short', timeStyle: 'short' }).format(r.sent))}</p>` : ''}
      </section>`).join('')}
      <div class="data-status"><h4>Datenstand</h4>
        <p>${escapeHTML(formatStamp(model.stamp, c.time_zone))} · ${escapeHTML(c.time_zone)}</p>
        <p>${model.healthy ? 'Abruf bestätigt' : 'Aktuelle Warnlage nicht vollständig beurteilbar'} · ${model.records.length} Warnmeldung(en) für ${escapeHTML(c.region)}</p>
        ${model.device && /^[a-zA-Z0-9_-]+$/.test(model.device) ? `<a href="/config/devices/device/${encodeURIComponent(model.device)}">Datenquelle öffnen ${icon('mdi:chevron-right')}</a>` : ''}
      </div>
      ${!model.healthy ? `<details class="diagnostics"><summary>Quellenzuordnung prüfen</summary><div>${model.diagnostics.map((d) => `<p><code>${escapeHTML(d.entity_id)}</code><br>${escapeHTML(d.state)}</p>`).join('') || 'Keine CAP-Entitäten gefunden.'}</div></details>` : ''}
    </div>`;
  }
  _render() {
    if (!this._config) return;
    const c = this._config;
    const model = this._snapshot ? buildModel(this._snapshot, c, Date.now(), this._offline ? 'Verbindung zu Home Assistant unterbrochen.' : this._error) : null;
    this._model = model;
    const tone = model?.tone || 'unknown';
    let content;
    if (!model) {
      content = `<div class="state-row"><div class="status-icon">${icon('mdi:shield-outline')}</div><div><h3>${this._error || this._offline ? 'Warnlage unbekannt' : 'Warnstatus wird geladen'}</h3><p>${escapeHTML(this._error || (this._offline ? 'Verbindung zu Home Assistant unterbrochen.' : 'Daten werden geprüft …'))}</p></div></div>`;
    } else if (model.clear) {
      content = `<div class="state-row"><div class="status-icon">${icon('mdi:shield-check-outline')}</div><div><h3>Keine Warnungen</h3><p>Für deine Region liegt keine Warnung vor.</p></div></div>`;
    } else {
      const visible = this._expanded ? model.records : model.records.slice(0, c.max_visible);
      content = `${model.uncertain ? `<div class="uncertainty" role="status">${icon('mdi:help-circle-outline')}<div><strong>Warnlage unbestätigt</strong>${model.notices.map((n) => `<p>${escapeHTML(n)}</p>`).join('') || '<p>Bei vorhandenen Meldungen ist der Status unklar.</p>'}</div></div>` : ''}
        ${visible.map((r) => this._record(r)).join('')}
        ${model.records.length > visible.length ? `<button class="more" data-action="toggle-details">${model.records.length - visible.length} weitere Warnung(en) ${icon('mdi:chevron-down')}</button>` : ''}`;
    }
    this.shadowRoot.innerHTML = `<style>${CARD_CSS}</style><ha-card data-tone="${tone}">
      <header><div><h2>${escapeHTML(c.title)}</h2><div class="region">${escapeHTML(c.region)} · ${escapeHTML(c.provider_label)}</div></div>${icon(model?.clear ? 'mdi:shield-check-outline' : model?.records.length && !model.uncertain ? 'mdi:shield-alert-outline' : 'mdi:shield-outline', 'class="header-icon"')}</header>
      <main aria-live="polite">${content}${this._error && this._technicalError ? `<details class="diagnostics"><summary>Fehlerdetails</summary><p class="full-text">${escapeHTML(this._technicalError)}</p></details>` : ''}</main>
      <footer><div class="updated" title="${escapeHTML(c.time_zone)}">${icon('mdi:clock-outline')}<span>${model ? escapeHTML(formatStamp(model.stamp, c.time_zone)) : 'Abruf wird geprüft'}</span></div>
        ${model ? `<button data-action="toggle-details" aria-expanded="${this._expanded}" aria-controls="warning-details">${this._expanded ? 'Schliessen' : 'Details'}${icon(this._expanded ? 'mdi:chevron-up' : 'mdi:chevron-right')}</button>` : ''}
      </footer>
      ${this._expanded && model ? this._details(model) : ''}
    </ha-card>`;
  }
}

class WetterwarnungenCardEditor extends HTMLElement {
  constructor() {
    super(); this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('change', (event) => {
      const input = event.target;
      if (!input.name) return;
      const config = { ...this._config, [input.name]: input.type === 'number' ? Number(input.value) : input.value };
      try { normalizeConfig(config); this._config = config; input.setCustomValidity(''); }
      catch (e) { input.setCustomValidity(e.message); input.reportValidity(); return; }
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
    });
  }
  set hass(hass) { this._hass = hass; }
  setConfig(config) { this._config = config; this._render(); }
  _render() {
    const c = { ...DEFAULT_CONFIG, ...this._config };
    const fields = [['title', 'Titel'], ['region', 'Region (Anzeige)'], ['region_match', 'Region in CAP-Meldungen'], ['provider_label', 'Quelle (Anzeige)'], ['count_entity', 'Sensor: Warnanzahl'], ['updated_entity', 'Sensor: letzter Abruf'], ['device_id', 'CAP-Geräte-ID (optional)'], ['time_zone', 'Zeitzone'], ['max_age_minutes', 'Daten nach Minuten als veraltet markieren', 'number'], ['max_visible', 'Warnungen vor dem Aufklappen', 'number']];
    this.shadowRoot.innerHTML = `<style>:host{display:block}label{display:block;margin:14px 0;color:var(--primary-text-color)}span{display:block;font-size:13px;margin-bottom:6px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--divider-color,#aaa);border-radius:9px;background:var(--secondary-background-color,#fff);color:var(--primary-text-color,#222);font:inherit}p{color:var(--secondary-text-color);font-size:13px;line-height:1.5}</style><p>Benötigt vorhandene Sensoren aus CAP Alerts. Die Gerätezuordnung wird automatisch geprüft.</p>${fields.map(([name, label, type = 'text']) => `<label><span>${label}</span><input name="${name}" type="${type}" value="${escapeHTML(c[name])}" ${type === 'number' ? `min="1" max="${name === 'max_visible' ? 10 : 1440}" step="1"` : ''}></label>`).join('')}`;
  }
}

if (!customElements.get('wetterwarnungen-card')) customElements.define('wetterwarnungen-card', WetterwarnungenCard);
if (!customElements.get('wetterwarnungen-card-editor')) customElements.define('wetterwarnungen-card-editor', WetterwarnungenCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'wetterwarnungen-card')) window.customCards.push({ type: 'wetterwarnungen-card', name: 'Wetterwarnungen', description: 'Kompakte CAP-Warnkarte mit verlässlichem Datenstatus.', preview: true, documentationURL: 'https://github.com/AshenSage/ha-wetterwarnungen' });
console.info(`%c WETTERWARNUNGEN %c v${VERSION} `, 'background:#83b998;color:#12271e;padding:3px 6px;border-radius:4px 0 0 4px', 'background:#223b30;color:#edf8ef;padding:3px 6px;border-radius:0 4px 4px 0');
