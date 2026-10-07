import {renderStatBlock} from './stat-block.js';

export function installStatBlock({current,derived,pack,closeEditor,notify}){
 const dialog=document.getElementById('stat-block-modal');
 const text=document.getElementById('stat-block-text');
 const copy=document.getElementById('stat-block-copy');
 const root=document.getElementById('print-stat-block');
 const refresh=()=>{root.innerHTML=renderStatBlock(current(),derived(),pack);};
 document.getElementById('print').onclick=()=>{
  closeEditor();if(document.getElementById('creator-modal').open)return;
  refresh();
  text.value=[...root.querySelector('.stat-block').children].map(el=>el.textContent.trim()).filter(Boolean).join('\n\n');
  copy.textContent='Copy';dialog.showModal();
 };
 document.getElementById('stat-block-close').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>document.getElementById('print').focus());
 copy.onclick=async()=>{
  try{
   await navigator.clipboard.writeText(text.value);copy.textContent='Copied';
  }catch{
   text.focus();text.select();
   try{if(document.execCommand('copy')){copy.textContent='Copied';return;}}catch{}
   notify('Select the text to copy.');
  }
 };
 document.getElementById('stat-block-print').onclick=()=>window.print();
 window.addEventListener('beforeprint',refresh);
}
