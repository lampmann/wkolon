// The importer emits a closed document tree. No source HTML or event attributes reach the DOM.
export const WIKI_TAGS = new Set('p b i strong em ul ol li dl dt dd table thead tbody tr th td caption h2 h3 h4 h5 br sub sup blockquote hr a'.split(' '));
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wikiURL(value) {
  try { const u=new URL(value);return u.protocol==='https:' && u.hostname==='swse.miraheze.org' && u.pathname.startsWith('/wiki/') && !u.username && !u.password ? u.href : null; } catch { return null; }
}
export function articleText(article) {
  const text = node => typeof node==='string'?node:(node?.children||[]).map(text).join(' ');
  return (article?.blocks||[]).map(text).join(' ').replace(/\s+/g,' ').trim();
}
export function renderArticle(article) {
  function render(node) {
    if(typeof node==='string')return escapeHTML(node);
    if(!node || !WIKI_TAGS.has(node.tag) || !Array.isArray(node.children))return '';
    const body=node.children.map(render).join('');
    let attrs='';
    if(node.tag==='a') {
      const url=wikiURL(node.href);if(!url)return body;
      attrs=` href="${escapeHTML(url)}" target="_blank" rel="noopener"`;
      if(/^rule:[a-z0-9-]+$/.test(node.ruleId||''))attrs+=` data-rule-page="${escapeHTML(node.ruleId)}"`;
    }
    for(const key of ['colspan','rowspan'])if(['th','td'].includes(node.tag) && Number.isInteger(node[key]) && node[key]>=1 && node[key]<=30)attrs+=` ${key}="${node[key]}"`;
    return ['br','hr'].includes(node.tag)?`<${node.tag}>`:`<${node.tag}${attrs}>${body}</${node.tag}>`;
  }
  return `<div class="wiki-article">${(article?.blocks||[]).map(render).join('')}</div>`;
}
