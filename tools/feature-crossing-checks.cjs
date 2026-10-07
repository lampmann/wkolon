const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

module.exports=async function checkCrossings(browser,base,root){
 // A K2,2 prerequisite fixture guarantees a crossing even after ordering improves.
 const pack=JSON.parse(fs.readFileSync(path.join(root,'data/core.json'),'utf8'));
 for(const id of ['talent:reset-initiative','talent:weak-point'])pack.talents.find(r=>r.id===id).prerequisite={kind:'all',requirements:['talent:improved-initiative','talent:keen-shot'].map(value=>({kind:'talent',value}))};
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 try{
  await context.route('**/data/core.json',route=>route.fulfill({json:pack}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#creation');assert.equal(await page.title(),'wkolon');
  assert(!(await page.locator('header').innerText()).includes('Saga Edition'));
  assert.equal(await page.locator('header a[href*="pmcrwf"]').count(),0);
  await page.locator('[data-step="2"]').click();await page.locator('[data-class="0"]').selectOption('class:scout');
  await page.locator('[data-step="5"]').click();await page.locator('[data-tree-group="tree:awareness"]').click();
  const svg=page.locator('#cr-body .feature-tree-arrows'),gaps=svg.locator('.feature-crossing-gap');assert(await gaps.count()>0);
  assert(await svg.locator('.feature-edge[mask]').count()>0);assert.equal(await svg.locator('.feature-arrowhead[mask]').count(),0);
  assert(await svg.evaluate(svg=>[...svg.querySelectorAll('[mask]')].every(el=>{const id=el.getAttribute('mask').slice(5,-1),mask=svg.querySelector(`[id="${id}"]`);return mask?.getAttribute('maskUnits')==='userSpaceOnUse'&&mask.querySelector('rect').getAttribute('fill')==='white'&&[...mask.querySelectorAll('circle')].every(c=>c.getAttribute('fill')==='black'&&Number(c.getAttribute('r'))===6);})));
  const geometry=await gaps.evaluateAll(gaps=>gaps.map(g=>[g.getAttribute('cx'),g.getAttribute('cy')]));
  await page.locator('[data-tree-zoom="in"]').click();await page.locator('[data-tree-zoom="in"]').click();
  assert.deepEqual(await gaps.evaluateAll(gaps=>gaps.map(g=>[g.getAttribute('cx'),g.getAttribute('cy')])),geometry);
  await page.screenshot({path:path.join(root,'.build/feature-crossings-light.png')});
  await page.locator('#cr-close').click();await page.locator('#theme-select').selectOption({label:'Truesight Dark'});
  await page.waitForFunction(()=>getComputedStyle(document.body).backgroundColor==='rgb(22, 22, 26)');
  await page.locator('nav a[href="#creation"]').click();await page.locator('[data-step="5"]').click();
  assert(await gaps.count()>0);await page.screenshot({path:path.join(root,'.build/feature-crossings-dark.png')});
  assert.deepEqual(errors,[]);
  console.log('Crossovers: curved underpasses, connected branch joins, preserved arrowheads, zoom and light/dark themes passed');
 }finally{await context.close();}
};
