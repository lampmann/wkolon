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


def compile_articles(pack, root, pages, source, record):
    feats = json.loads((root / '.build/species-feats-snapshot.json').read_text())['query']['pages']
    feat_ids = {p['title']: 'rule:' + re.sub(r'[^a-z0-9]+', '-', p['title'].lower()).strip('-') for p in feats}
    pack['rulePages'] = [record('rule', name, article=article(root, name, pages, source, feat_ids)) for name in sorted(feat_ids)]
    for species in pack['species']:
        species['article'] = article(root, species['name'], pages, source, feat_ids)
    pack['license']['changes'] += ' Species and species feat articles retain wiki wording and formatting; images, comments, scripts and site chrome are omitted. Wiki links are retained.'
