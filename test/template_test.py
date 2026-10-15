"""Exercise the actual discovery template with HA-like helpers (Jinja2 required)."""
import json
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from jinja2.sandbox import ImmutableSandboxedEnvironment


class States:
    def __init__(self, values):
        self.values = {s.entity_id: s for s in values}
        self.sensor = list(values)

    def __getitem__(self, key):
        return self.values.get(key)

    def __call__(self, key):
        s = self[key]
        return s.state if s else 'unknown'


def render(devices, entities, card=None):
    states = States(entities)
    env = ImmutableSandboxedEnvironment(extensions=['jinja2.ext.do'])

    def as_function(macro):
        def wrapper(*args):
            result = []
            macro(*args, returns=result.append)
            return result[0]
        return wrapper

    # Only register custom filters actually provided by Home Assistant.
    env.filters.update(as_function=as_function,
        regex_search=lambda s, p: re.search(p, s) is not None,
        to_json=lambda v: json.dumps(v, ensure_ascii=False))
    ids = {e.entity_id: e for e in entities}
    env.globals.update(states=states, integration_entities=lambda _: list(ids),
        device_id=lambda e: ids[e].device if e in ids else None,
        device_entities=lambda d: [e.entity_id for e in entities if e.device == d],
        device_attr=lambda d, k: devices.get(d, {}).get(k),
        state_attr=lambda e, k: ids[e].attributes.get(k) if e in ids else None,
        now=lambda: datetime.now(timezone.utc))
    config = dict(count_entity='sensor.cap_alerts_wmo_alert_count', updated_entity='sensor.cap_alerts_wmo_last_updated', device_id='', region_match='sumadija')
    config.update(card or {})
    normalized = config['region_match'].lower().replace('š', 's').replace('шумадија', 'sumadija').strip()
    config['region_pattern'] = '(^|[^a-z])' + re.escape(normalized) + '([^a-z]|$)'
    return json.loads(env.from_string(Path('src/source.jinja').read_text()).render(card=config))


def sensor(eid, device, state='0', **attributes):
    return SimpleNamespace(entity_id=eid, name=eid, device=device, state=state, attributes=attributes)


class DiscoveryTests(unittest.TestCase):
    def test_existing_entities_without_model_metadata(self):
        values = [sensor('sensor.cap_alerts_wmo_alert_count', 'd', active=0, upcoming=0),
            sensor('sensor.cap_alerts_wmo_last_updated', 'd', '2026-10-15T08:47:00+02:00', device_class='timestamp')]
        s = render({'d': {}}, values)
        self.assertEqual(s['device'], 'd')
        self.assertEqual(s['count'], '0')
        self.assertEqual(s['stamp'], '2026-10-15T08:47:00+02:00')
        self.assertEqual(s['incidents'], [])

    def test_other_source_selected_by_real_region_attributes(self):
        values = [sensor('sensor.counter', 'x', active=1, upcoming=0), sensor('sensor.stamp', 'x', device_class='timestamp'),
            sensor('sensor.wind', 'x', provider='meteoalarm', incident_platform_version=1, area_desc='Шумадија')]
        s = render({'x': {}}, values)
        self.assertEqual(s['device'], 'x')
        self.assertEqual(s['count_entity'], 'sensor.counter')
        self.assertEqual(s['incidents'][0]['entity_id'], 'sensor.wind')

    def test_ambiguous_sources_keep_incidents_without_claiming_clear(self):
        values = [sensor('sensor.a', 'a', provider='wmo', incident_platform_version=1, area_desc='Šumadija'),
            sensor('sensor.b', 'b', provider='wmo', incident_platform_version=1, area_desc='Šumadija')]
        s = render({'a': {}, 'b': {}}, values)
        self.assertIsNone(s['device'])
        self.assertIsNone(s['count_entity'])
        self.assertEqual(len(s['incidents']), 2)

    def test_empty_registry_is_unknown(self):
        s = render({}, [])
        self.assertIsNone(s['device'])
        self.assertIsNone(s['count'])

    def test_explicit_device_wins(self):
        values = [sensor('sensor.a', 'a', provider='wmo', incident_platform_version=1, area_desc='Šumadija'),
            sensor('sensor.b', 'b', provider='wmo', incident_platform_version=1, area_desc='Šumadija')]
        self.assertEqual(render({'a': {}, 'b': {}}, values, {'device_id': 'b'})['device'], 'b')

    def test_region_metacharacters_remain_literal(self):
        values = [sensor('sensor.a', 'a', provider='wmo', incident_platform_version=1, area_desc='A.B'),
            sensor('sensor.b', 'b', provider='wmo', incident_platform_version=1, area_desc='AXB')]
        self.assertEqual(render({'a': {}, 'b': {}}, values, {'region_match': 'A.B'})['device'], 'a')


if __name__ == '__main__':
    unittest.main()
