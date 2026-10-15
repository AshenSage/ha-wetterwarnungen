/* ha-wetterwarnungen v1.0.0 | MIT | AshenSage */
(() => {
"use strict";
const VERSION = "1.0.0";
const SOURCE_TEMPLATE = "{# Read-only snapshot. Discovery follows the existing CAP Alerts 0.6.1 card. #}\n{% set preferred_count = card.count_entity %}\n{% set preferred_stamp = card.updated_entity %}\n{% set preferred_device = card.device_id or device_id(preferred_count) %}\n{% set weather_providers = ['wmo', 'meteoalarm'] %}\n{% set integration_ids = integration_entities('cap_alerts') | list %}\n{% set preferred_ids = device_entities(preferred_device) | list if preferred_device else [] %}\n{% set discovery = namespace(ids=(integration_ids + preferred_ids) | unique | list) %}\n{% for s in states.sensor %}\n  {% if s.attributes.get('provider') in weather_providers\n    and s.attributes.get('incident_platform_version') is not none\n    and s.entity_id not in discovery.ids %}\n    {% set discovery.ids = discovery.ids + [s.entity_id] %}\n  {% endif %}\n{% endfor %}\n{% macro region_macro(value, returns) -%}\n  {% set value = value | default('', true) | string | lower | trim\n    | replace('š', 's') | replace('шумадија', 'sumadija') %}\n  {% set target = card.region_match | lower | trim | replace('š', 's') | replace('шумадија', 'sumadija') %}\n  {% do returns(value | regex_search('(^|[^a-z])' ~ (target | regex_escape) ~ '([^a-z]|$)')) %}\n{%- endmacro %}\n{% set in_region = region_macro | as_function %}\n{% set source = namespace(devices=[], regional=[], device=none, counts=[], stamps=[], incidents=[], ids=[], diagnostics=[]) %}\n{% for e in discovery.ids %}\n  {% set d = device_id(e) %}\n  {% set model = device_attr(d, 'model') | default('', true) | string | lower | trim if d else '' %}\n  {% set is_warning = state_attr(e, 'provider') in weather_providers and state_attr(e, 'incident_platform_version') is not none %}\n  {% if d and (d == preferred_device or model in weather_providers or is_warning) %}\n    {% if d not in source.devices %}{% set source.devices = source.devices + [d] %}{% endif %}\n    {% if is_warning and in_region(state_attr(e, 'area_desc')) and d not in source.regional %}\n      {% set source.regional = source.regional + [d] %}\n    {% endif %}\n  {% endif %}\n{% endfor %}\n{% if preferred_device in source.devices %}{% set source.device = preferred_device %}\n{% elif source.regional | count == 1 %}{% set source.device = source.regional[0] %}\n{% elif source.devices | count == 1 %}{% set source.device = source.devices[0] %}{% endif %}\n{% if source.device %}\n  {% set source.ids = (device_entities(source.device) + discovery.ids) | unique | list %}\n  {% for e in source.ids if device_id(e) == source.device and e.startswith('sensor.') %}\n    {% set s = states[e] %}\n    {% if s is not none %}\n      {% set a = s.attributes %}\n      {% if a.get('provider') in weather_providers and a.get('incident_platform_version') is not none %}\n        {% set source.incidents = source.incidents + [{'entity_id': e, 'name': s.name, 'state': s.state, 'attributes': a}] %}\n      {% elif a.get('device_class') == 'timestamp' %}\n        {% set source.stamps = source.stamps + [e] %}\n      {% elif a.get('active') is not none and a.get('upcoming') is not none %}\n        {% set source.counts = source.counts + [e] %}\n      {% endif %}\n    {% endif %}\n  {% endfor %}\n{% else %}\n  {# Retain possible warnings when source assignment is ambiguous. #}\n  {% for e in discovery.ids if e.startswith('sensor.') %}\n    {% set s = states[e] %}\n    {% if s is not none and s.attributes.get('provider') in weather_providers and s.attributes.get('incident_platform_version') is not none %}\n      {% set source.incidents = source.incidents + [{'entity_id': e, 'name': s.name, 'state': s.state, 'attributes': s.attributes}] %}\n    {% endif %}\n  {% endfor %}\n{% endif %}\n{% set stamp_entity = preferred_stamp if source.device and preferred_stamp in source.ids and device_id(preferred_stamp) == source.device\n  else source.stamps[0] if source.stamps | count == 1 else none %}\n{% set count_entity = preferred_count if source.device and preferred_count in source.ids and device_id(preferred_count) == source.device\n  else source.counts[0] if source.counts | count == 1 else none %}\n{% for e in (source.ids + discovery.ids) | unique | sort if e.startswith('sensor.') %}\n  {% set source.diagnostics = source.diagnostics + [{'entity_id': e, 'state': states(e)}] %}\n{% endfor %}\n{{ {\n  'schema': 1,\n  'rendered_at': now().isoformat(),\n  'device': source.device,\n  'device_count': source.devices | count,\n  'integration_count': integration_ids | count,\n  'count_entity': count_entity,\n  'stamp_entity': stamp_entity,\n  'count': states(count_entity) if count_entity else none,\n  'stamp': states(stamp_entity) if stamp_entity else none,\n  'incidents': source.incidents,\n  'diagnostics': source.diagnostics\n} | to_json }}\n";
const CARD_CSS = ":host{display:block;container-type:inline-size;color:var(--primary-text-color,#eef5ef);font-family:var(--paper-font-body1_-_font-family,var(--ha-font-family,Roboto,Arial,sans-serif))}\n*{box-sizing:border-box}ha-card{--tone:138,192,156;display:block;position:relative;overflow:hidden;padding:18px 18px 0;border-radius:var(--ha-card-border-radius,20px);background:var(--ha-card-background,var(--card-background-color,#304b3e));border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--divider-color,rgba(160,197,172,.25)));box-shadow:var(--ha-card-box-shadow,none);color:var(--primary-text-color,#eef5ef)}\nha-card[data-tone=\"orange\"],*[data-tone=\"orange\"]{--tone:245,163,52}ha-card[data-tone=\"red\"],*[data-tone=\"red\"]{--tone:231,100,100}ha-card[data-tone=\"yellow\"],*[data-tone=\"yellow\"]{--tone:226,192,74}ha-card[data-tone=\"unknown\"],*[data-tone=\"unknown\"]{--tone:161,174,173}\nha-card:not([data-tone=\"clear\"]):before{content:\"\";position:absolute;left:0;top:0;bottom:0;width:4px;background:rgb(var(--tone))}\nheader{display:flex;justify-content:space-between;align-items:center;gap:12px}h2,h3,h4,p{margin:0}h2{font-size:19px;line-height:1.25;font-weight:650;letter-spacing:-.25px}.region{font-size:13px;color:var(--secondary-text-color,#b9ccbf);margin-top:4px;line-height:1.4}.header-icon{--mdc-icon-size:25px;color:var(--secondary-text-color,#b9ccbf);flex:none;opacity:.85}main{padding:20px 0}h3{font-size:19px;line-height:1.35;font-weight:650;letter-spacing:-.2px;overflow-wrap:anywhere}main p{font-size:13px;line-height:1.45;color:var(--secondary-text-color,#b9ccbf);margin-top:5px}.state-row,.warning-row{display:flex;align-items:center;gap:13px}.state-row>div:last-child,.warning-content{min-width:0;flex:1}.status-icon{width:49px;height:49px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:50%;background:rgba(var(--tone),.16);color:rgb(var(--tone))}.status-icon ha-icon{--mdc-icon-size:29px}.warning-row{align-items:flex-start}.warning-row+.warning-row{border-top:1px solid var(--divider-color,rgba(180,202,189,.16));padding-top:15px;margin-top:15px}.event-line{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap}.event-line h3{font-size:17px}.level{display:inline-block;flex:none;border:1px solid rgba(var(--tone),.45);background:rgba(var(--tone),.13);color:rgb(var(--tone));border-radius:20px;padding:2px 8px;font-size:11px;font-weight:600;line-height:1.6}.phase{font-size:11px;color:var(--secondary-text-color,#b9ccbf);margin-top:4px}.validity{font-size:13px;line-height:1.5;margin-top:3px}.notes{font-size:12px;line-height:1.45;color:var(--secondary-text-color,#b9ccbf);margin-top:4px}.preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.uncertainty{display:flex;gap:10px;align-items:flex-start;padding:10px 11px;border-radius:11px;background:rgba(var(--tone),.10);margin-bottom:16px;font-size:13px}.uncertainty:last-child{margin-bottom:0}.uncertainty ha-icon{--mdc-icon-size:21px;flex:none;color:rgb(var(--tone))}.uncertainty strong{font-size:14px}.uncertainty p{font-size:12px;margin-top:3px}\nfooter{display:flex;align-items:center;justify-content:space-between;gap:5px;border-top:1px solid var(--divider-color,rgba(180,202,189,.16));min-height:48px}.updated{display:flex;align-items:center;gap:6px;min-width:0;color:var(--secondary-text-color,#b9ccbf);font-size:11px;line-height:1.4}.updated ha-icon{--mdc-icon-size:16px;flex:none}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:6px 0 6px 10px;font-size:13px;border-radius:8px;flex:none}button ha-icon{--mdc-icon-size:19px}button:focus-visible,a:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color,#9bcbb0);outline-offset:2px}button:hover{background:rgba(var(--tone),.08)}.more{width:100%;font-size:12px;margin-top:8px;padding:8px}.details-panel{padding:4px 0 16px;font-size:13px;line-height:1.5;border-top:1px solid var(--divider-color,rgba(180,202,189,.16))}.detail-record{padding:14px 0;border-bottom:1px solid var(--divider-color,rgba(180,202,189,.16))}h4{font-size:14px;font-weight:600}h4 ha-icon{--mdc-icon-size:18px;vertical-align:middle}h4 span{display:block;font-size:11px;font-weight:400;color:var(--secondary-text-color,#b9ccbf);margin-top:4px}.detail-record p,.data-status p{margin-top:7px}.full-text{white-space:pre-wrap;overflow-wrap:anywhere}.instruction{padding:10px 12px;background:rgba(var(--tone),.07);border-radius:9px}.muted{color:var(--secondary-text-color,#b9ccbf);font-size:12px}.data-status{padding-top:14px}.data-status p{font-size:12px;color:var(--secondary-text-color,#b9ccbf)}a{color:var(--primary-color,#a8d7ba);text-decoration:none;display:inline-flex;align-items:center;min-height:44px;font-size:12px}a ha-icon{--mdc-icon-size:18px}.diagnostics{margin-top:10px;color:var(--secondary-text-color,#b9ccbf);font-size:11px}.diagnostics summary{cursor:pointer;min-height:40px;display:list-item;padding:10px 0}.diagnostics p{margin:5px 0}code{font-size:10px;overflow-wrap:anywhere}\n@container(max-width:340px){ha-card{padding:15px 14px 0}h2{font-size:18px}h3{font-size:17px}.status-icon{width:42px;height:42px}.status-icon ha-icon{--mdc-icon-size:26px}.state-row,.warning-row{gap:10px}.updated{font-size:10px}main{padding:17px 0}.event-line h3{font-size:16px}}\n@media(prefers-reduced-motion:no-preference){button{transition:background .15s ease}}\n";
const DEFAULT_CONFIG = Object.freeze({
  title: 'Wetterwarnungen', region: 'Šumadija', region_match: 'sumadija',
  provider_label: 'RHMZ', count_entity: 'sensor.cap_alerts_wmo_alert_count',
  updated_entity: 'sensor.cap_alerts_wmo_last_updated', device_id: '',
  max_age_minutes: 30, time_zone: 'Europe/Belgrade', max_visible: 2,
});

function normalizeConfig(value = {}) {
  const result = { ...DEFAULT_CONFIG, ...value };
  for (const key of ['title', 'region', 'region_match', 'provider_label', 'count_entity', 'updated_entity', 'device_id', 'time_zone']) {
    if (typeof result[key] !== 'string' || (key !== 'device_id' && !result[key].trim())) throw new Error(`${key} muss ein Text sein.`);
    result[key] = result[key].trim();
  }
  for (const key of ['count_entity', 'updated_entity']) {
    if (!/^sensor\.[a-z0-9_]+$/.test(result[key])) throw new Error(`${key}: eine gültige Sensor-Entität angeben.`);
  }
  if (!Number.isFinite(result.max_age_minutes) || result.max_age_minutes < 1 || result.max_age_minutes > 1440) throw new Error('max_age_minutes muss zwischen 1 und 1440 liegen.');
  if (!Number.isInteger(result.max_visible) || result.max_visible < 1 || result.max_visible > 10) throw new Error('max_visible muss eine ganze Zahl zwischen 1 und 10 sein.');
  try { new Intl.DateTimeFormat('de-CH', { timeZone: result.time_zone }).format(); }
  catch { throw new Error('time_zone ist ungültig.'); }
  return result;
}

function awareTimestamp(value) {
  // Never infer a timezone for CAP values. A missing offset is ambiguous.
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (!match) return null;
  const [, y, m, d, h, minute, second = '0', offset] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offset.toUpperCase() !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(-2)) > 59)) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function inRegion(value, target) {
  const normalize = (s) => String(s ?? '').toLowerCase().replaceAll('š', 's').replaceAll('шумадија', 'sumadija').trim();
  const escaped = normalize(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(normalize(value));
}

function alertLevel(a) {
  const raw = a.parameters?.awareness_level ?? '';
  const tokens = (Array.isArray(raw) ? raw.join(';') : String(raw)).toLowerCase().split(';').map((s) => s.trim());
  for (const [rank, color] of [[4, 'red'], [3, 'orange'], [2, 'yellow'], [1, 'green']]) if (tokens.includes(color)) return rank;
  if (tokens.length === 1 && ['1', '2', '3', '4'].includes(tokens[0])) return Number(tokens[0]);
  return ({ extreme: 4, severe: 3, moderate: 2 })[String(a.severity_normalized ?? '').toLowerCase()] ?? 0;
}

function cleanEvent(value) {
  return String(value || 'Wetterwarnung').replace(/ (?:Veoma visok|Visok|Umeren|Neznatan) nivo| (?:Веома висок|Висок|Умерен|Незнатан) ниво/g, '').trim();
}

function iconFor(value) {
  const s = String(value).toLowerCase();
  if (/wind|vetar|vjetar|ветар|böen/.test(s)) return 'mdi:weather-windy';
  if (/thunder|gewitter|grmljav|грмљав/.test(s)) return 'mdi:weather-lightning';
  if (/snow|schnee|sneg|снег|ice|eis|poled|полед/.test(s)) return 'mdi:weather-snowy';
  if (/rain|regen|kiš|kis|киш|flood|poplav|поплав/.test(s)) return 'mdi:weather-pouring';
  if (/heat|hitz|visok.*temper|висок.*темпер/.test(s)) return 'mdi:thermometer-high';
  if (/cold|kält|nisk.*temper|ниск.*темпер/.test(s)) return 'mdi:thermometer-low';
  if (/fog|nebel|magl|магл/.test(s)) return 'mdi:weather-fog';
  if (/fire|brand|požar|pozar|пожар/.test(s)) return 'mdi:fire-alert';
  return 'mdi:alert-outline';
}

function buildModel(snapshot, config, now = Date.now(), transportError = '') {
  const notices = [];
  const stamp = awareTimestamp(snapshot.stamp);
  const numericCount = snapshot.count !== null && snapshot.count !== undefined && String(snapshot.count).trim() !== '' ? Number(snapshot.count) : NaN;
  const count = Number.isInteger(numericCount) && numericCount >= 0 ? numericCount : null;
  const incidents = Array.isArray(snapshot.incidents) ? snapshot.incidents : [];
  const age = stamp === null ? null : now - stamp;
  const incomplete = count !== null && count > incidents.length;
  const available = (v) => v != null && !['unavailable', 'unknown', ''].includes(v);
  if (!snapshot.device) notices.push('Datenquelle fehlt oder ist nicht eindeutig zugeordnet.');
  else if (!snapshot.stamp_entity || !snapshot.count_entity) notices.push('Datenstatus fehlt.');
  else if (!available(snapshot.stamp) || !available(snapshot.count)) notices.push('Datenquelle nicht verfügbar.');
  else if (stamp === null || count === null) notices.push('Datenstatus ungültig.');
  else if (age < 0) notices.push('Abfragezeit liegt in der Zukunft.');
  else if (age > config.max_age_minutes * 60000) notices.push('Daten veraltet.');
  else if (incomplete) notices.push('Warnmeldungen unvollständig geladen.');
  if (transportError) notices.push(transportError);
  const healthy = !notices.length;
  let unknownArea = 0;
  let unconfirmedMarkers = 0;
  const records = [];
  for (const entity of incidents) {
    const a = entity.attributes ?? {};
    const phase = String(a.phase ?? '').toLowerCase();
    const status = String(a.status ?? '').toLowerCase();
    if (['cancel', 'expired'].includes(phase) || String(a.msg_type ?? '').toLowerCase() === 'cancel' || ['test', 'exercise', 'draft', 'system'].includes(status)) continue;
    const region = String(a.area_desc ?? '').trim();
    if (!region) unknownArea++;
    if (!inRegion(region, config.region_match)) continue;
    const rank = alertLevel(a);
    const startRaw = a.onset || a.effective;
    const start = awareTimestamp(startRaw);
    const expires = awareTimestamp(a.expires);
    const ends = awareTimestamp(a.ends);
    const end = ends !== null && (expires === null || ends < expires) ? ends : expires;
    const invalid = Boolean((startRaw && start === null) || (a.expires && expires === null) || (a.ends && ends === null));
    const expired = end !== null && end <= now;
    const empty = start !== null && end !== null && end <= start;
    if (expired || empty) continue;
    const stale = a.stale === true || entity.state === 'unavailable';
    const validTime = !invalid && start !== null && end !== null;
    if (rank === 1) {
      if (stale || !validTime || status !== 'actual') unconfirmedMarkers++;
      continue;
    }
    const bucket = stale || !healthy || !validTime || rank === 0 || status !== 'actual' ? 'uncertain' : start > now ? 'upcoming' : 'active';
    const notes = [];
    if (stale) notes.push('Nicht mehr bestätigt');
    if (!validTime) notes.push('Gültigkeit unklar');
    if (rank === 0) notes.push('Warnstufe unklar');
    if (status !== 'actual') notes.push('Meldungsstatus unklar');
    if (!healthy) notes.push('Datenstand unbestätigt');
    const event = cleanEvent(a.event || a.headline || entity.name);
    const description = String(a.description ?? '').trim();
    const instruction = String(a.instruction ?? '').trim();
    // Same grouping as the previous card; all validity windows remain visible.
    const key = JSON.stringify([bucket, rank, event, description, instruction, notes, a.last_confirmed ?? '', start === null ? a.sent ?? '' : '']);
    const existing = records.find((r) => r.key === key);
    const window = { start, end, valid: validTime };
    if (existing) {
      if (!existing.windows.some((w) => w.start === start && w.end === end)) existing.windows.push(window);
    } else {
      records.push({ key, bucket, rank, event, description, instruction, notes, windows: [window],
        entity_ids: [entity.entity_id], icon: iconFor(event), confirmed: awareTimestamp(a.last_confirmed), sent: awareTimestamp(a.sent) });
    }
  }
  if (unknownArea) notices.push(`${unknownArea} Meldung(en) ohne Region; Zuordnung unklar.`);
  if (unconfirmedMarkers) notices.push('Meldungen ohne Warnung sind nicht zuverlässig bestätigt.');
  records.sort((a, b) => ['active', 'upcoming', 'uncertain'].indexOf(a.bucket) - ['active', 'upcoming', 'uncertain'].indexOf(b.bucket) || b.rank - a.rank || (a.windows[0].start ?? now) - (b.windows[0].start ?? now));
  const uncertain = notices.length > 0 || records.some((r) => r.bucket === 'uncertain');
  const rank = Math.max(0, ...records.filter((r) => r.bucket !== 'uncertain').map((r) => r.rank));
  return { records, notices, healthy: healthy && !unknownArea && !unconfirmedMarkers, uncertain, clear: !records.length && !uncertain,
    tone: uncertain ? 'unknown' : rank === 4 ? 'red' : rank === 3 ? 'orange' : rank === 2 ? 'yellow' : 'clear',
    stamp, count, incomplete, device: snapshot.device, diagnostics: snapshot.diagnostics ?? [] };
}

function parts(ts, zone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('de-CH', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ts).map((p) => [p.type, p.value]));
  return { ...values, date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}
function formatStamp(ts, zone, now = Date.now()) {
  if (ts === null) return 'Abrufzeit unbekannt';
  const p = parts(ts, zone);
  const date = p.date === parts(now, zone).date ? '' : `${p.day}.${p.month}. `;
  return `Aktualisiert ${date}${p.time}`;
}
function formatValidity(window, zone, now = Date.now()) {
  const dayLabel = (ts) => {
    const p = parts(ts, zone);
    const today = parts(now, zone).date;
    const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    if (p.date === today) return 'Heute';
    if (p.date === next.toISOString().slice(0, 10)) return 'Morgen';
    return new Intl.DateTimeFormat('de-CH', { timeZone: zone, weekday: 'short', day: '2-digit', month: '2-digit' }).format(ts);
  };
  if (window.start === null && window.end === null) return 'Gültigkeitszeit fehlt/ungültig';
  if (window.start === null) return `Beginn unklar · bis ${dayLabel(window.end)} ${parts(window.end, zone).time}`;
  if (window.end === null) return `${dayLabel(window.start)} ab ${parts(window.start, zone).time} · Ende unklar`;
  const s = parts(window.start, zone), e = parts(window.end, zone);
  const dayDistance = Date.parse(`${e.date}T00:00Z`) - Date.parse(`${s.date}T00:00Z`);
  if (s.time === '00:00' && ((s.date === e.date && e.time === '23:59') || (dayDistance === 86400000 && e.time === '00:00'))) return `${dayLabel(window.start)} ganztägig`;
  const offset = (ts) => new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(ts).find((p) => p.type === 'timeZoneName').value.replace('GMT', 'UTC');
  const dst = offset(window.start) !== offset(window.end);
  return `${dayLabel(window.start)} ${s.time}${dst ? ` ${offset(window.start)}` : ''}–${s.date !== e.date ? `${dayLabel(window.end)} ` : ''}${e.time}${dst ? ` ${offset(window.end)}` : ''}`;
}

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
          if (message.error) throw new Error('CAP-Daten konnten nicht ausgewertet werden.');
          const snapshot = typeof message.result === 'string' ? JSON.parse(message.result) : message.result;
          if (snapshot?.schema !== 1 || !Array.isArray(snapshot.incidents)) throw new Error('Unerwartetes Datenformat.');
          this._snapshot = snapshot;
          this._error = '';
        } catch (error) { this._error = error.message || 'Daten konnten nicht gelesen werden.'; }
        this._render();
      }, { type: 'render_template', template: SOURCE_TEMPLATE, variables: { card: this._config }, report_errors: true });
      if (generation !== this._generation || !this.isConnected) await unsubscribe();
      else this._unsubscribe = unsubscribe;
    } catch {
      if (generation === this._generation) {
        this._error = 'Verbindung zur Datenquelle fehlgeschlagen.';
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
      <main aria-live="polite">${content}</main>
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

})();
