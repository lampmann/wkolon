const choose=async(page,kind,value,level=0,slot=0)=>{
 const body=page.locator('#cr-body'),modal=page.locator('#feature-tree-modal');
 const control=body.locator(`[data-choice="${kind}"][data-level="${level}"][data-slot="${slot}"][data-primary]`);
 if(await control.count())await control.click();
 const root=await modal.isVisible()?modal:body;
 if(await root.locator('[data-tree-group="all"]').count())await root.locator('[data-tree-group="all"]').click();
 await root.locator(`[data-tree-pick="${value}"]`).click();
 // Secondary controls also remain in the parent editor after closing the level-up browser.
 if(await modal.isVisible())await page.locator('#feature-tree-close').click();
};
module.exports=choose;
