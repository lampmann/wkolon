const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

module.exports=async function checkAccents(page,trackSelector,root){
 const original=await page.locator('#theme-select').inputValue();
 const themes=await page.locator('#theme-select option').evaluateAll(options=>options.map(o=>o.value));
 fs.mkdirSync(path.join(root,'.build'),{recursive:true});
 const apply=async file=>{
  await page.locator('#theme-select').selectOption(file);
  await page.waitForFunction(file=>{const link=document.getElementById('theme-css');return file? !link.disabled&&link.href.endsWith('/'+file)&&[...document.styleSheets].some(s=>!s.disabled&&s.href===link.href):link.disabled&&!link.getAttribute('href');},file);
 };
 try{
  for(const theme of themes){
   await apply(theme);
   const colors=await page.evaluate(selector=>{
    const root=getComputedStyle(document.documentElement),canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');
    const rgb=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
    const probe=document.createElement('button');probe.className='cr-method active';probe.type='button';document.body.append(probe);const selected=getComputedStyle(probe);
    const result={accent:rgb(root.getPropertyValue('--accent')),background:rgb(root.getPropertyValue('--bg')),checkbox:rgb(getComputedStyle(document.querySelector('input[type=checkbox]')).accentColor),selection:rgb(selected.backgroundColor),foreground:rgb(selected.color),tab:rgb(getComputedStyle(document.querySelector('.char-tab.active')).borderBottomColor),track:rgb(getComputedStyle(document.querySelector(selector)).backgroundColor),textSelection:rgb(getComputedStyle(document.body,'::selection').backgroundColor)};
    probe.remove();return result;
   },trackSelector);
   if(theme==='')assert.deepEqual(colors.accent,[26,86,196]);
   if(theme==='dracula-dark.css')assert.deepEqual(colors.accent,[189,147,249]);
   for(const key of ['checkbox','selection','tab','textSelection'])assert.deepEqual(colors[key],colors.accent,`${theme||'Default'} ${key}`);
   colors.track.forEach((c,i)=>assert(Math.abs(c-Math.round(colors.accent[i]*.24+colors.background[i]*.76))<=1,`${theme||'Default'} track tint`));
   const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
   const [lo,hi]=[luminance(colors.selection),luminance(colors.foreground)].sort((a,b)=>a-b);assert((hi+.05)/(lo+.05)>=4.5,`${theme||'Default'} selection text contrast`);
   if(theme===''||theme==='dracula-dark.css'){
    await page.locator(trackSelector).first().hover();
    const hover=await page.locator(trackSelector).first().evaluate(el=>getComputedStyle(el).backgroundColor);
    await page.mouse.move(0,0);assert.equal(await page.locator(trackSelector).first().evaluate(el=>getComputedStyle(el).backgroundColor),hover);
    await page.screenshot({path:path.join(root,'.build/accent-'+(theme?'dracula':'default')+'.png')});
   }
  }
  console.log(`Theme accents: ${themes.length} palettes, native checkboxes, selected controls, tabs, text selection, track tint/hover and readable selection text passed`);
 }finally{await apply(original);}
};
