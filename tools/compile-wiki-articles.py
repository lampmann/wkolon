"""Convert pinned MediaWiki HTML to a closed, image-free presentation tree."""
import json
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urljoin, urlparse

TAGS = {'p', 'b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table',
    'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'h2', 'h3', 'h4', 'h5', 'br', 'sub', 'sup', 'blockquote', 'hr', 'a'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
BLOCKED = {'figure', 'figcaption', 'img', 'script', 'style', 'iframe', 'object', 'embed', 'audio', 'video', 'nav'}


class Tree(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': 'root', 'attrs': {}, 'children': []}
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i]['tag'] == tag:
                self.stack = self.stack[:i]
                return

    def handle_data(self, text):
        self.stack[-1]['children'].append(text)


def article(root, title, pages, source, feat_ids):
    page = pages[title]
    rev = page['revisions'][0]['revid']
    slug = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
    parsed = json.loads((root / '.build' / ('article-' + slug + '-parse.json')).read_text())
    assert parsed['title'] == title and parsed['revision'] == rev
    assert parsed['result']['parse']['revid'] == rev

    def clean(node):
        if isinstance(node, str):
            return [node]
        tag, attrs = node['tag'], node['attrs']
        classes = set((attrs.get('class') or '').split())
        if tag in BLOCKED or classes.intersection({'comments-body', 'mw-editsection', 'toc', 'catlinks', 'navbox'}):
            return []
        if 'tabs-label' in classes:
            # The wiki's disclosure repeats its label for open/closed controls.
            # Preserve one heading and the content, rather than duplicate controls.
            label = next((n for n in node['children'] if isinstance(n,dict) and 'tabs-open' in (n['attrs'].get('class') or '').split()), None)
            return [dict(tag='h4',children=clean(label))] if label else []
        children = [child for n in node['children'] for child in clean(n)]
        if tag not in TAGS:
            return children
        result = dict(tag=tag, children=children)
        if tag == 'a':
            url = urljoin('https://swse.miraheze.org/', attrs.get('href') or '')
            parsed_url = urlparse(url)
            if parsed_url.scheme != 'https' or parsed_url.netloc != 'swse.miraheze.org' or not parsed_url.path.startswith('/wiki/'):
                return children
            result['href'] = url
            target = unquote(parsed_url.path[len('/wiki/'):]).replace('_', ' ')
            if target in feat_ids:
                result['ruleId'] = feat_ids[target]
        if tag in {'th', 'td'}:
            for key in ['colspan', 'rowspan']:
                value = attrs.get(key)
                if value and value.isdigit() and 1 <= int(value) <= 30:
                    result[key] = int(value)
        return [result]
    blocks = clean(Tree(parsed['result']['parse']['text']).root)
    return dict(sourceId=source(title), blocks=blocks)


def compile_articles(pack, root, pages, source, record, sources):
    feats = json.loads((root / '.build/species-feats-snapshot.json').read_text())['query']['pages']
    feat_ids = {p['title']: 'rule:' + re.sub(r'[^a-z0-9]+', '-', p['title'].lower()).strip('-') for p in feats}
    feat_ids.update({r['name']: 'rule:' + re.sub(r'[^a-z0-9]+', '-', r['name'].lower()).strip('-') for key in ['feats', 'talents'] for r in pack[key]})
    feat_ids['Weapon Proficiency'] = 'rule:weapon-proficiency'
    pack['rulePages'] = [record('rule', name, article=article(root, name, pages, source, feat_ids)) for name in sorted(p['title'] for p in feats)]
    for species in pack['species']:
        species['article'] = article(root, species['name'], pages, source, feat_ids)
    pack['license']['changes'] += ' Species and species feat articles retain wiki wording and formatting; images, comments, scripts and site chrome are omitted. Wiki links are retained.'

    def text(node):
        return node if isinstance(node, str) else ''.join(text(c) for c in node['children'])
    for key in ['feats', 'talents']:
        for feature in pack[key]:
            src = sources[feature['sourceId']]
            full = article(root, src['title'], pages, source, feat_ids)
            blocks = full['blocks']
            if src.get('section'):
                start = next((i for i, n in enumerate(blocks) if isinstance(n, dict) and
                    n['tag'] in {'h2','h3','h4','h5'} and text(n).strip() == src['section']), None)
                if start is None:
                    raise RuntimeError('Missing feature section: ' + feature['name'])
                rank = int(blocks[start]['tag'][1])
                end = next((i for i in range(start + 1, len(blocks)) if isinstance(blocks[i], dict) and
                    blocks[i]['tag'] in {'h2','h3','h4','h5'} and int(blocks[i]['tag'][1]) <= rank), len(blocks))
                section = blocks[start + 1:end]
                first = next((n for n in section if text(n).strip()), None)
                if first is None or not text(first).strip().startswith('Reference Book:'):
                    refs = [n for n in blocks[:start] if isinstance(n,dict) and n['tag']=='p' and 'Reference Book:' in text(n)]
                    section = refs[:1] + section
                blocks = section
            feature['article'] = dict(sourceId=feature['sourceId'], blocks=blocks)
            pack['rulePages'].append(dict(id=feat_ids[feature['name']], name=feature['name'],
                sourceId=feature['sourceId'], article=feature['article']))
    pack['rulePages'].append(record('rule','Weapon Proficiency',article=article(root,'Weapon Proficiency',pages,source,feat_ids)))
    pack['rulePages'].sort(key=lambda r:r['name'])
    pack['license']['changes'] += ' Talent and feat articles retain wiki wording; individual talents are extracted from their pinned tree headings.'
