const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function checkSpecies(browser,base,root){
 const context=await browser.newContext({viewport:{width:1100,height:900},acceptDownloads:true});
 try {
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'#creation');await page.locator('[data-step="1"]').click();
  const results=page.locator('#species-results'),search=page.locator('#species-search');
  const names=()=>results.locator('.sp-name-link').allTextContents();
  const initial=await names();assert.equal(initial.length,10);assert.deepEqual(initial,[...initial].sort((a,b)=>a.localeCompare(b)));
  assert.equal(await results.locator('[data-sort="name"]').innerText(),'Species ▼');
  await results.locator('[data-sort="name"]').click();assert.deepEqual(await names(),[...initial].reverse());assert.equal(await results.locator('[data-sort="name"]').innerText(),'Species ▲');
  await results.locator('[data-sort="name"]').press('Enter');assert.deepEqual(await names(),initial);
  await results.locator('[data-species-detail="species:gungan"]').click();
  const article=page.locator('#species-description-gungan');assert(await article.isVisible());
  assert.equal(await results.locator('[data-select-species="species:human"]').getAttribute('aria-pressed'),'true');
  const text=await article.innerText();assert(text.indexOf('Characteristics')<text.indexOf('Gungan Species Traits'));assert(text.indexOf('Gungan Species Traits')<text.indexOf('Gungan Species Feats'));
  assert.equal(await article.locator('a').filter({hasText:/^Concealment$/}).getAttribute('href'),'https://swse.miraheze.org/wiki/Concealment');
  assert.equal(await article.locator('a').filter({hasText:/^Total Concealment$/}).getAttribute('href'),'https://swse.miraheze.org/wiki/Total_Concealment');
  assert(await article.locator('table').count()>0);assert(await article.locator('b').count()>0);
  const feat=article.locator('[data-rule-page="rule:gungan-weapon-master"]');await feat.click();
  const modal=page.locator('#rule-detail-modal');assert(await modal.isVisible());assert.equal(await modal.locator('h2').innerText(),'Gungan Weapon Master');
  const featText=await modal.locator('#rule-detail-body').innerText();assert(featText.includes('Prerequisite:'));assert(featText.includes('from d6 to d8, or from d8 to d10'));
  assert.equal(await modal.locator('a').filter({hasText:/^Force Point$/}).getAttribute('href'),'https://swse.miraheze.org/wiki/Force_Point');
  await page.keyboard.press('Escape');assert(await page.locator('#creator-modal').isVisible());assert(!(await modal.isVisible()));assert(await feat.evaluate(el=>el===document.activeElement));
  await search.evaluate(el=>el._sameSearch=true);await search.fill('BIOTECH');assert.deepEqual(await names(),['Gungan']);assert(await search.evaluate(el=>el._sameSearch && el===document.activeElement));assert(await article.isVisible());
  await search.fill('no species matches this phrase');assert.equal(await names().then(n=>n.length),0);assert.equal(await results.locator('[role="status"]').innerText(),'No matches');
  await search.fill('');await results.locator('[data-sort="speed"]').click();assert.equal((await names())[0],'Gungan');assert.equal(await results.locator('th[aria-sort="descending"]').innerText(),'Speed ▲');
  await results.locator('[data-sort="speed"]').click();assert.equal((await names()).at(-1),'Gungan');
  await results.locator('[data-sort="abilities"]').click();assert.equal((await names())[0],'Duros');await results.locator('[data-sort="abilities"]').click();assert.equal((await names())[0],'Gamorrean');
  await search.fill('gungan');await results.locator('[data-select-species="species:gungan"]').click();assert.equal(await search.inputValue(),'gungan');assert.equal(await results.locator('[data-select-species="species:gungan"]').getAttribute('aria-pressed'),'true');assert(await article.isVisible());
  await page.locator('[data-step="0"]').click();assert.equal(await page.locator('#cr-final-dex').innerText(),'12');
  await page.locator('[data-step="1"]').click();assert.equal(await search.inputValue(),'gungan');
  await search.fill('');await results.locator('[data-sort="name"]').click();
  await page.screenshot({path:path.join(root,'.build/species-desktop.png')});
  await page.setViewportSize({width:390,height:844});await search.fill('gungan');
  const overflow=await results.evaluate(el=>{const box=el.querySelector('.table-scroll');return [box.scrollWidth>box.clientWidth,document.documentElement.scrollWidth<=innerWidth];});assert.deepEqual(overflow,[true,true]);
  assert(await article.locator('.wiki-article').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'Expanded article fits the mobile viewport without sideways scrolling');
  await article.locator('[data-rule-page="rule:perfect-swimmer"]').click();assert(await modal.isVisible());
  assert(await modal.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));await page.locator('#rule-detail-close').click();
  await page.screenshot({path:path.join(root,'.build/species-mobile.png')});
  // Every complete description and feat stays available in the hosted offline snapshot.
  if(base.startsWith('https:')) {
   await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,null,{timeout:60000});await context.setOffline(true);await page.reload();
   await page.locator('[data-step="1"]').click();await page.locator('#species-search').fill('gungan');await page.locator('[data-species-detail="species:gungan"]').click();await page.locator('#species-description-gungan [data-rule-page="rule:gungan-weapon-master"]').click();
   assert((await page.locator('#rule-detail-body').innerText()).includes('from d6 to d8'));await page.locator('#rule-detail-close').click();
  }
  assert.deepEqual(errors,[]);console.log('Species: separate selection/disclosure, full-text search, reversible sorts and arrows, verbatim wiki sections, rule links, complete feat dialogs, retained choices and mobile overflow passed');
 }finally{await context.close();}
};
