"""Validate route integrity, referenced assets, and GitHub Pages subpath safety."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data = json.loads((root/'assets/data/journeys.json').read_text(encoding='utf-8'))
assert [j['id'] for j in data['journeys']] == [1, 2, 3, 4]
allowed = {'start', 'land', 'sea', 'drift', 'uncertain'}
for journey in data['journeys']:
    stops = journey['stops']
    assert len(stops) >= 2 and stops[0]['mode'] == 'start'
    for i, stop in enumerate(stops):
        assert stop['place'] in data['places'], (journey['id'], i)
        assert stop['mode'] in allowed and (i == 0 or stop['mode'] != 'start')
        assert stop['ref'] and stop['title'] and stop['text']
        profile = data['companionProfiles'][stop['companionProfile']]
        assert profile['refs'], ('missing companion evidence', journey['id'], i)
        assert profile['people'] or profile['note'], ('unknown group needs explanation', journey['id'], i)
        references = list(profile['refs']) + stop.get('companionChangeRefs', [])
        for person in profile['people']:
            assert person['name'] and person['role'] and person['refs']
            assert person['status'] in {'direct','context','inferred','translation','escort'}
            references.extend(person['refs'])
        for related in profile['related']: references.extend(related['refs'])
        for ref in references:
            assert data['scriptureEvidence'][ref]['text'], (ref, journey['id'], i)
        lon, lat = data['places'][stop['place']]['coordinates']
        assert -180 <= lon <= 180 and -85 <= lat <= 85
        if i:
            assert stops[i-1]['place'] != stop['place'], 'zero-length route'
        for lon, lat in stop.get('via', []):
            assert -180 <= lon <= 180 and -85 <= lat <= 85
    if journey['id'] in (1, 2):
        assert stops[0]['place'] == stops[-1]['place'] == 'Antioch 1'
assert data['journeys'][2]['stops'][-1]['place'] == 'Jerusalem'
assert data['journeys'][3]['stops'][-1]['place'] == 'Rome'
# Guard against misleading assumptions at explicit team changes.
def group(journey, index):
    return data['companionProfiles'][data['journeys'][journey-1]['stops'][index]['companionProfile']]
assert any(p['name'] == '約翰（馬可）' for p in group(1,4)['people'])
assert all(p['name'] != '約翰（馬可）' for p in group(1,5)['people'])
assert not any(p['name'] == '提摩太' for p in group(2,2)['people'])
assert any(p['name'] == '提摩太' for p in group(2,3)['people'])
assert all(p['name'] not in {'西拉','提摩太'} for p in group(2,11)['people'])
assert any(p['name'] == '百基拉' for p in group(2,14)['people'])
assert not group(2,15)['people']
assert not any(p['name'] in {'提摩太','所巴特','推基古'} for p in group(3,7)['people'])
assert not group(3,8)['people'], 'do not place the boat passengers on Paul walking leg'
assert any(p['status'] == 'escort' for p in group(4,1)['people'])
assert all(p['status'] == 'inferred' for pr in data['companionProfiles'].values() for p in pr['people'] if p['name'].startswith('路加'))
html = (root/'index.html').read_text(encoding='utf-8')
ids = re.findall(r'\bid="([^"]+)"', html)
assert len(ids) == len(set(ids)), 'duplicate HTML ids'
js = (root/'assets/app.js').read_text(encoding='utf-8')
for element_id in re.findall(r"\$\('([^']+)'\)", js):
    assert element_id in ids, element_id
for url in re.findall(r'(?:src|href)="(\./[^"]+)"', html):
    assert (root/url).exists(), url
assert 'href="/' not in html and 'src="/' not in html, 'root paths break project Pages'
land = json.loads((root/'assets/data/land.geojson').read_text(encoding='utf-8'))
assert land['type'] == 'FeatureCollection' and land['features']
for filename, types in [('ancient-boundaries.geojson', {'LineString', 'MultiLineString'}), ('ancient-regions.geojson', {'Polygon','MultiPolygon'}), ('modern-countries.geojson', {'Polygon','MultiPolygon'})]:
    layer = json.loads((root/'assets/data'/filename).read_text(encoding='utf-8'))
    assert layer['features'] and layer['license'], filename
    if filename.startswith('ancient'): assert layer['year'] == 69, 'historical layer needs a dated snapshot'
    def check_coords(coords):
        if isinstance(coords[0], (int,float)):
            assert -180 <= coords[0] <= 180 and -90 <= coords[1] <= 90, filename
        else:
            for child in coords: check_coords(child)
    for item in layer['features']:
        assert item['geometry']['type'] in types, filename
        check_coords(item['geometry']['coordinates'])
# The event panel must contain its companions, while station selection stays separate.
from html.parser import HTMLParser
class Panels(HTMLParser):
    def __init__(self): super().__init__(); self.stack=[]; self.parents={}
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs); key=attrs.get('id')
        if key: self.parents[key]=[entry[1] for entry in self.stack]
        if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}: self.stack.append((tag,key))
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,-1,-1):
            if self.stack[i][0] == tag: self.stack=self.stack[:i]; break
panels=Panels(); panels.feed(html)
assert 'panel-stops' in panels.parents['segment-companions']
assert 'panel-stops' not in panels.parents['stop-list']
assert 'panel-stoplist' in panels.parents['stop-list']
for file in ('assets/vendor/maplibre-gl.js', 'assets/vendor/maplibre-gl.css', 'assets/vendor/maplibre-LICENSE.txt', '.nojekyll', '.github/workflows/pages.yml'):
    assert (root/file).is_file(), file
print(f"PASS: 4 journeys, {sum(len(j['stops']) for j in data['journeys'])} annotated nodes, {len(data['scriptureEvidence'])} scripture verses; team changes, references, route integrity, assets, DOM IDs and Pages subpaths checked.")
