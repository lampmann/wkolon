#!/usr/bin/env python3
"""Capture wiki revisions for review. No game rules are inferred from prose."""
import argparse
import hashlib
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

API = 'https://swse.miraheze.org/w/api.php'


def request(params):
    params = dict(action='query', format='json', formatversion=2, maxlag=5, **params)
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'wkolon/0.1 (https://github.com/lampmann/wkolon)'})
            with urllib.request.urlopen(req, timeout=45) as response:
                result = json.load(response)
            if 'error' in result:
                raise RuntimeError(result['error']['info'])
            return result
        except (OSError, RuntimeError, json.JSONDecodeError):
            if attempt == 4:
                raise
            time.sleep(min(2 ** attempt, 15))


def discover(category):
    seen, pending, titles = set(), [category], set()
    while pending:
        cat = pending.pop()
        if cat in seen:
            continue
        seen.add(cat)
        continuation = {}
        while True:
            result = request(dict(list='categorymembers', cmtitle=cat, cmlimit=500, **continuation))
            for page in result['query']['categorymembers']:
                if page['ns'] == 14:
                    pending.append(page['title'])
                elif page['ns'] == 0:
                    titles.add(page['title'])
            continuation = result.get('continue')
            if not continuation:
                break
            time.sleep(1)
        time.sleep(1)
    return titles


def xml_pages(path):
    root = ET.parse(path).getroot()
    ns = {'m': root.tag.split('}')[0].strip('{')}
    for page in root.findall('m:page', ns):
        rev = page.find('m:revision', ns)
        if rev is None:
            continue
        content = rev.findtext('m:text', '', ns)
        yield dict(title=page.findtext('m:title', namespaces=ns),
                   pageid=int(page.findtext('m:id', namespaces=ns)),
                   revisions=[dict(revid=int(rev.findtext('m:id', namespaces=ns)),
                                   timestamp=rev.findtext('m:timestamp', namespaces=ns),
                                   sha1=rev.findtext('m:sha1', namespaces=ns),
                                   slots={'main': {'content': content}})])


def save(path, result):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--titles', nargs='*', default=[])
    parser.add_argument('--titles-file', type=Path)
    parser.add_argument('--category', action='append', default=[])
    parser.add_argument('--xml', type=Path)
    parser.add_argument('--output', type=Path, default=Path('.build/wiki-snapshot.json'))
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    result = json.loads(args.output.read_text()) if args.output.exists() else {
        'api': API, 'query': {'pages': [], 'redirects': [], 'normalized': []}, 'requested': []}
    if args.xml:
        incoming = {p['title']: p for p in xml_pages(args.xml)}
        old = {p['title']: p for p in result['query']['pages']}
        old.update(incoming)
        result['query']['pages'] = list(old.values())
        save(args.output, result)
        return
    titles = set(args.titles)
    if args.titles_file:
        titles.update(line.strip() for line in args.titles_file.read_text().splitlines() if line.strip())
    for cat in args.category:
        titles.update(discover(cat if cat.startswith('Category:') else 'Category:' + cat))
    if not titles:
        parser.error('Supply titles, categories, a titles file, or an XML export')
    if not args.refresh:
        titles.difference_update(result.get('requested', []))
    ordered = sorted(titles)
    for i in range(0, len(ordered), 50):
        batch = ordered[i:i + 50]
        response = request(dict(titles='|'.join(batch), prop='revisions',
                                rvprop='ids|timestamp|sha1|content', rvslots='main', redirects=1))
        query = response['query']
        old = {p['title']: p for p in result['query']['pages']}
        for page in query['pages']:
            if page.get('missing'):
                print('REVIEW missing:', page['title'])
            elif page.get('revisions'):
                content = page['revisions'][0]['slots']['main']['content']
                page['contentSha256'] = hashlib.sha256(content.encode()).hexdigest()
            old[page['title']] = page
        result['query']['pages'] = list(old.values())
        for key in ['redirects', 'normalized']:
            entries = {p['from']: p for p in result['query'].get(key, [])}
            entries.update({p['from']: p for p in query.get(key, [])})
            result['query'][key] = list(entries.values())
        result['requested'] = sorted(set(result.get('requested', []) + batch))
        result['capturedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        save(args.output, result)
        print(f'Captured {min(i + 50, len(ordered))}/{len(ordered)} requested titles')
        time.sleep(1)


if __name__ == '__main__':
    main()
