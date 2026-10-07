const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function checkHeader(browser,base,root){
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#module-header').waitFor();
  assert.equal(await page.locator('#navigation,#delete-character').count(),0);
  assert.equal(await page.locator('#roster [data-delid]').count(),0);
  const row=await page.locator('.toolbar-row').boundingBox(),controls=await page.locator('.toolbar-controls').boundingBox();assert(Math.abs(row.x+row.width-controls.x-controls.width)<2);
  const first=await page.locator('#roster [data-character]').getAttribute('data-character');
  await page.locator('#module-abilities [data-roll]').first().click();
  assert(await page.locator('#roll-mirror-grip').evaluate(el=>{const s=getComputedStyle(el);return Math.abs(parseFloat(s.width)-17.6)<1&&Math.abs(parseFloat(s.height)-17.6)<1&&s.borderLeftWidth==='2px'&&s.borderTopWidth==='2px'&&s.borderRightWidth==='0px'&&s.borderBottomWidth==='0px'&&getComputedStyle(el,'::before').content==='none';}));
  await page.locator('#roll-mirror').screenshot({path:path.join(root,'.build/rolls-sister-grip.png')});
  await page.locator('#new-character').click();await page.locator('[data-step="7"]').click();
  await page.locator('#cr-body [data-field="name"]').fill('Second');await page.locator('#cr-body [data-field="name"]').press('Tab');await page.locator('#cr-done').click();
  const second=await page.locator('#roster [data-character][aria-pressed=true]').getAttribute('data-character');
  await page.locator('#module-abilities [data-roll]').first().click();assert.equal(await page.locator('#roll-mirror-body .ev').count(),1);
  assert.equal(await page.locator('#roster [data-delid]').count(),2);
  const removeFirst=page.locator(`[data-delid="${first}"]`);await removeFirst.focus();await page.keyboard.press('Enter');
  await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('main [data-field="name"]').inputValue(),'Second');
  await page.locator('#confirm-dialog [value="cancel"]').click();assert.equal(await page.locator('#roster [data-character]').count(),2);
  await page.screenshot({path:path.join(root,'.build/header-character-tabs.png')});
  await removeFirst.click();await page.locator('#confirm-dialog [value="confirm"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#roster [data-character]').length===1);
  assert.equal(await page.locator('#roster [data-character]').count(),1);assert.equal(await page.locator('#roster [data-delid]').count(),0);
  assert.equal(await page.locator('main [data-field="name"]').inputValue(),'Second');assert.equal(await page.locator('#roll-mirror-body .ev').count(),1);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('wkolon-roster-v1')));assert.equal(saved.activeId,second);assert(!saved.logs[first]);assert.equal(saved.logs[second].length,1);
  await page.reload();await page.locator('#module-header').waitFor();assert.equal(await page.locator('main [data-field="name"]').inputValue(),'Second');
  await page.locator('#duplicate').click();await page.locator('#roster .active [data-delid]').click();await page.locator('#confirm-dialog [value="confirm"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#roster [data-character]').length===1);
  assert.equal(await page.locator('main [data-field="name"]').inputValue(),'Second');assert.equal(await page.locator('#roster [data-character]').count(),1);
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(root,'.build/header-mobile.png')});
  assert.deepEqual(errors,[]);console.log('Header: right-aligned controls, sister-site grip, module navigation, keyboard/cancel/delete tab controls, active selection, log isolation, persistence and mobile passed');
 }finally{await context.close();}
};
