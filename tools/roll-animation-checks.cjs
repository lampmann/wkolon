const assert=require('node:assert/strict');
const path=require('node:path');

module.exports=async function checkTumble(browser,base,root){
 const context=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:'reduce'});
 try{
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#module-header').waitFor();
  const toggle=page.locator('#roll-anim-toggle');assert.equal(await toggle.innerText(),'Tumble: On');assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  const newest=()=>page.locator('#dicelog > .ev').first();
  const settled=async()=>{
   await page.waitForFunction(()=>!document.querySelector('#dicelog > .ev.rolling'));
   assert(await newest().evaluate(el=>[...el.querySelectorAll('.die,.roll-total')].every(n=>n.textContent===n.dataset.final)));
  };
  const rolling=async()=>{
   await page.waitForFunction(()=>document.querySelectorAll('#dicelog > .ev.rolling,#roll-mirror-body > .ev.rolling').length===2);
   assert(await page.evaluate(()=>{
    const a=document.querySelector('#dicelog > .ev'),b=document.querySelector('#roll-mirror-body > .ev:last-child');
    return a.innerHTML===b.innerHTML;
   }));
  };
  await page.locator('#module-abilities [data-roll]').first().click();await rolling();await settled();
  const cmd=page.locator('#roll-mirror-cmd');await cmd.fill('4d6kh3+2');await cmd.press('Enter');await rolling();
  assert(await newest().evaluate(el=>{
   const kept=[...el.querySelectorAll('.die:not(.die-dropped)')].map(n=>Number(n.textContent));
   return kept.length===3 && kept.reduce((a,b)=>a+b,2)===Number(el.querySelector('.roll-total').textContent);
  }));
  await settled();assert.equal(await newest().locator('.die-dropped').count(),1);
  await page.locator('#roll-mirror').screenshot({path:path.join(root,'.build/rolls-tumble.png')});
  await toggle.click();assert.equal(await toggle.innerText(),'Tumble: Off');
  await cmd.fill('1d20+5');await cmd.press('Enter');await settled();assert.equal(await page.locator('.ev.rolling').count(),0);
  await page.locator('#new-character').click();await page.locator('#cr-done').click();assert.equal(await toggle.innerText(),'Tumble: Off');
  await page.reload();await page.locator('#module-header').waitFor();assert.equal(await toggle.innerText(),'Tumble: Off');
  await toggle.click();assert.equal(await toggle.innerText(),'Tumble: On');
  await page.locator('#module-header a[href="#creation"]').click();await page.locator('[data-step="0"]').click();
  await page.locator('[data-crmethod="rolled"]').click();await page.locator('[data-action="roll-abilities"]').click();await rolling();await settled();
  assert.equal(await newest().locator('.die').count(),24);assert.equal(await newest().locator('.die-dropped').count(),6);
  assert(await newest().evaluate(el=>[...el.querySelectorAll('.roll-total')].every(total=>{
   const kept=[...el.querySelectorAll(`.die[data-roll="${total.dataset.roll}"]:not(.die-dropped)`)];
   return kept.length===3&&kept.reduce((sum,n)=>sum+Number(n.textContent),0)===Number(total.textContent);
  })));
  await page.locator('[data-step="6"]').click();await page.locator('[data-action="starting-credits"]').click();await rolling();await settled();
  const credits=await page.locator('#cr-body [data-field="credits"]').inputValue();assert.equal(await newest().locator('.roll-total').innerText(),credits);
  await page.locator('#cr-done').click();
  const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('wkolon-roster-v1')));
  assert(Object.values(persisted.logs).flat().every(e=>!e.text.includes('<span')));
  assert.deepEqual(errors,[]);
  console.log('Tumble: on by default, synced dice and totals, keep/drop arithmetic, settled results, toggle persistence, character switching, ability/credit rolls and plain-text saved history passed');
 }finally{await context.close();}
};
