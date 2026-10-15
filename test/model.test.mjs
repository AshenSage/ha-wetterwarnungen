import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, buildModel, alertLevel, awareTimestamp, inRegion, formatValidity, formatStamp, iconFor } from '../src/model.js';

const config = normalizeConfig();
const now = Date.parse('2026-10-15T12:00:00+02:00');
const source = (incidents = [], extra = {}) => ({ schema: 1, device: 'cap-device', stamp_entity: config.updated_entity, count_entity: config.count_entity,
  stamp: '2026-10-15T11:59:00+02:00', count: String(incidents.length), incidents, ...extra });
const warning = (attributes = {}, state = 'severe') => ({ entity_id: 'sensor.cap_alert', name: 'Wind', state, attributes: {
  area_desc: 'Šumadija', status: 'Actual', phase: 'active', event: 'Starker Wind', severity_normalized: 'severe',
  onset: '2026-10-15T10:00:00+02:00', expires: '2026-10-15T20:00:00+02:00', ...attributes,
} });
const model = (incidents, extra, error) => buildModel(source(incidents, extra), config, now, error);

test('confirmed empty result is clear', () => { const m = model([]); assert.equal(m.clear, true); assert.equal(m.tone, 'clear'); });
test('orange warning keeps its validity and weather icon', () => { const m = model([warning()]); assert.equal(m.clear, false); assert.equal(m.tone, 'orange'); assert.equal(m.records[0].bucket, 'active'); assert.equal(m.records[0].icon, 'mdi:weather-windy'); });
test('future warning remains upcoming', () => { assert.equal(model([warning({ onset: '2026-10-15T13:00:00+02:00' })]).records[0].bucket, 'upcoming'); });
test('expired, cancelled, tests and empty no-warning markers are excluded', () => {
  const cases = [warning({ expires: '2026-10-15T11:00:00+02:00' }), warning({ phase: 'cancel' }), warning({ msg_type: 'Cancel' }), warning({ status: 'Test' }), warning({ ends: '2026-10-15T09:00:00+02:00' })];
  assert.equal(model(cases).records.length, 0); assert.equal(model(cases).clear, true);
});
test('effective is used if onset is absent, earliest end wins', () => {
  const m = model([warning({ onset: null, effective: '2026-10-15T10:00:00+02:00', ends: '2026-10-15T15:00:00+02:00' })]);
  assert.equal(m.records[0].windows[0].end, Date.parse('2026-10-15T15:00:00+02:00'));
});
test('stale timestamp does not imply no warnings', () => {
  assert.equal(model([], { stamp: '2026-10-15T11:00:00+02:00' }).clear, false);
  const m = model([warning()], { stamp: '2026-10-15T11:00:00+02:00' }); assert.equal(m.tone, 'unknown'); assert.equal(m.records[0].bucket, 'uncertain');
});
test('unavailable, malformed, fractional and future diagnostic data stay unknown', () => {
  for (const extra of [{ count: 'unavailable' }, { count: 'NaN' }, { count: '-1' }, { count: '1.5' }, { count: null }, { stamp: '2026-10-15T13:00:00+02:00' }, { stamp: '2026-10-15T11:59:00' }, { stamp_entity: null }, { device: null }]) assert.equal(model([], extra).clear, false, JSON.stringify(extra));
});
test('incomplete incident list is unknown and retains warning', () => {
  const m = model([warning()], { count: '3' }); assert.equal(m.clear, false); assert.equal(m.incomplete, true); assert.equal(m.records[0].bucket, 'uncertain');
});
test('unknown area prevents falsely clear status', () => { const m = model([warning({ area_desc: null })]); assert.equal(m.clear, false); assert.equal(m.records.length, 0); });
test('other region does not appear on local card', () => { assert.equal(model([warning({ area_desc: 'Beograd' })]).clear, true); });
test('region names support Latin, Cyrillic and boundaries', () => {
  for (const s of ['Šumadija', 'sumadija', 'Шумадија', 'Region: Šumadija / Pomoravlje']) assert.equal(inRegion(s, 'sumadija'), true);
  assert.equal(inRegion('XsumadijaY', 'sumadija'), false); assert.equal(inRegion('a.b', 'a.b'), true); assert.equal(inRegion('axb', 'a.b'), false);
});
test('unconfirmed green marker cannot clear warning status', () => {
  const green = warning({ parameters: { awareness_level: '1; green' } }); assert.equal(model([green]).clear, true);
  assert.equal(model([{ ...green, state: 'unavailable' }]).clear, false);
});
test('unknown severity, missing time, invalid expiry and non-actual are uncertain', () => {
  for (const attrs of [{ severity_normalized: 'unknown' }, { onset: null }, { expires: 'bad date' }, { status: '' }]) assert.equal(model([warning(attrs)]).records[0].bucket, 'uncertain');
  assert.equal(model([warning({}, 'unavailable')]).records[0].bucket, 'uncertain');
});
test('connection failure preserves last warnings but marks them uncertain', () => {
  assert.equal(model([], {}, 'Verbindung unterbrochen').clear, false);
  assert.equal(model([warning()], {}, 'Verbindung unterbrochen').records[0].bucket, 'uncertain');
});
test('severity tokens follow color before normalized fallback', () => {
  assert.equal(alertLevel({ parameters: { awareness_level: ['2', 'orange'] }, severity_normalized: 'extreme' }), 3);
  assert.equal(alertLevel({ parameters: { awareness_level: '3' } }), 3);
  assert.equal(alertLevel({ parameters: { awareness_level: 'orange-ish' } }), 0);
});
test('duplicate messages group, different windows retained, active sorted first', () => {
  const m = model([warning(), warning(), warning({ onset: '2026-10-15T11:00:00+02:00' }), warning({ event: 'Starkregen', severity_normalized: 'extreme' })]);
  assert.equal(m.records.length, 2); assert.equal(m.records[0].rank, 4); assert.equal(m.records[1].windows.length, 2);
});
test('CAP times require explicit timezone', () => {
  assert.equal(awareTimestamp('2026-10-15T12:00:00'), null);
  assert.equal(awareTimestamp('unavailable'), null);
  assert.equal(awareTimestamp('2026-10-15T10:00:00Z'), now);
  assert.equal(awareTimestamp('2026-02-30T10:00:00Z'), null);
  assert.equal(awareTimestamp('2026-10-15T24:00:00Z'), null);
});
test('dates, all-day periods, DST and timestamps are formatted in target zone', () => {
  const w = (s, e) => ({ start: Date.parse(s), end: Date.parse(e) });
  assert.equal(formatValidity(w('2026-10-15T12:00:00+02:00', '2026-10-15T20:00:00+02:00'), config.time_zone, now), 'Heute 12:00–20:00');
  assert.equal(formatValidity(w('2026-10-16T00:00:00+02:00', '2026-10-17T00:00:00+02:00'), config.time_zone, now), 'Morgen ganztägig');
  const dst = formatValidity(w('2026-10-25T02:30:00+02:00', '2026-10-25T02:30:00+01:00'), config.time_zone, now); assert.match(dst, /UTC\+2.*UTC\+1/);
  assert.match(formatStamp(now, config.time_zone, now), /12:00/);
});
test('unknown and Serbian event names receive appropriate icons', () => {
  assert.equal(iconFor('Grmljavina'), 'mdi:weather-lightning'); assert.equal(iconFor('Sneg'), 'mdi:weather-snowy'); assert.equal(iconFor('Unknown'), 'mdi:alert-outline');
});
test('invalid config fails visibly before subscribing', () => {
  for (const bad of [{ time_zone: 'Moon/Base' }, { max_age_minutes: 0 }, { max_visible: 1.5 }, { count_entity: 'bad' }]) assert.throws(() => normalizeConfig(bad));
});
