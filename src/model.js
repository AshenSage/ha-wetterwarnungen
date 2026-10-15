export const DEFAULT_CONFIG = Object.freeze({
  title: 'Wetterwarnungen', region: 'Šumadija', region_match: 'sumadija',
  provider_label: 'RHMZ', count_entity: 'sensor.cap_alerts_wmo_alert_count',
  updated_entity: 'sensor.cap_alerts_wmo_last_updated', device_id: '',
  max_age_minutes: 30, time_zone: 'Europe/Belgrade', max_visible: 2,
});

export function normalizeConfig(value = {}) {
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

export function awareTimestamp(value) {
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

export function inRegion(value, target) {
  const normalize = (s) => String(s ?? '').toLowerCase().replaceAll('š', 's').replaceAll('шумадија', 'sumadija').trim();
  const escaped = normalize(target).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(normalize(value));
}

export function alertLevel(a) {
  const raw = a.parameters?.awareness_level ?? '';
  const tokens = (Array.isArray(raw) ? raw.join(';') : String(raw)).toLowerCase().split(';').map((s) => s.trim());
  for (const [rank, color] of [[4, 'red'], [3, 'orange'], [2, 'yellow'], [1, 'green']]) if (tokens.includes(color)) return rank;
  if (tokens.length === 1 && ['1', '2', '3', '4'].includes(tokens[0])) return Number(tokens[0]);
  return ({ extreme: 4, severe: 3, moderate: 2 })[String(a.severity_normalized ?? '').toLowerCase()] ?? 0;
}

export function cleanEvent(value) {
  return String(value || 'Wetterwarnung').replace(/ (?:Veoma visok|Visok|Umeren|Neznatan) nivo| (?:Веома висок|Висок|Умерен|Незнатан) ниво/g, '').trim();
}

export function iconFor(value) {
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

export function buildModel(snapshot, config, now = Date.now(), transportError = '') {
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
export function formatStamp(ts, zone, now = Date.now()) {
  if (ts === null) return 'Abrufzeit unbekannt';
  const p = parts(ts, zone);
  const date = p.date === parts(now, zone).date ? '' : `${p.day}.${p.month}. `;
  return `Aktualisiert ${date}${p.time}`;
}
export function formatValidity(window, zone, now = Date.now()) {
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
