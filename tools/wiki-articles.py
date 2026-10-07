#!/usr/bin/env python3
"""Fetch revision-pinned species/feat articles for offline presentation, without images."""
import concurrent.futures
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / '.build'
BUILD.mkdir(exist_ok=True)


def api(**params):
    args = ['curl', '-fLsS', '--retry', '2', '--retry-delay', '1', '--get', 'https://swse.miraheze.org/w/api.php']
    for key, value in dict(params, format='json', formatversion=2, maxlag=5).items():
        args += ['--data-urlencode', f'{key}={value}']
    result = json.loads(subprocess.check_output(args))
    if result.get('error'):
        raise RuntimeError(result['error'])
    return result


def snapshot(titles, filename):
    combined = {'query': {'pages': [], 'redirects': []}}
    for start in range(0, len(titles), 40):
        result = api(action='query', prop='revisions', titles='|'.join(titles[start:start + 40]),
            rvslots='main', rvprop='ids|timestamp|content', redirects=1)
        combined['query']['pages'] += result['query']['pages']
        combined['query']['redirects'] += result['query'].get('redirects', [])
    for page in combined['query']['pages']:
        if not page.get('revisions'):
            raise RuntimeError(f"Could not fetch {page['title']}")
    (BUILD / filename).write_text(json.dumps(combined, ensure_ascii=False))
    return combined


def slug(title):
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')


def fetch_parse(page):
    rev = page['revisions'][0]['revid']
    path = BUILD / ('article-' + slug(page['title']) + '-parse.json')
    if path.exists() and json.loads(path.read_text()).get('revision') == rev:
        return
    result = api(action='parse', oldid=rev, prop='text|sections', disabletoc=1, disableeditsection=1)
    assert result['parse']['revid'] == rev
    path.write_text(json.dumps(dict(title=page['title'], revision=rev, result=result), ensure_ascii=False))
    print('Parsed', page['title'], rev, flush=True)


if __name__ == '__main__':
    pack = json.loads((ROOT / 'data/core.json').read_text())
    species = sorted(set([r['name'] for r in pack['species']] + ['Gamorrean', 'Gungan']))
    result = snapshot(species, 'species-browser-snapshot.json')
    feats = set()
    for page in result['query']['pages']:
        raw = page['revisions'][0]['slots']['main']['content']
        match = re.search(r'^==[^\n]*Species Feats[^\n]*==\s*$', raw, re.M)
        if match:
            feats.update(re.findall(r'^\|\[\[([^\]|]+)(?:\|[^\]]+)?\]\]', raw[match.end():], re.M))
    feat_result = snapshot(sorted(feats), 'species-feats-snapshot.json')
    print('Fetching', len(species), 'species and', len(feats), 'species feats', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch_parse, result['query']['pages'] + feat_result['query']['pages']))
