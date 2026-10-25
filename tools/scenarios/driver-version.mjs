// Check actual browser exports, live hashes and old-file compatibility through the UI.
export default async ({run})=>{
  const result=await run(`(async()=>{
    const c=await import('/src/app/controls.js');
    c.setRunning(false);await new Promise(r=>setTimeout(r,200));
    let blob;const original=URL.createObjectURL;
    URL.createObjectURL=b=>{blob=b;return original(b);};
    try{document.querySelector('#exportRun').click();}finally{URL.createObjectURL=original;}
    if(!blob)throw new Error(document.querySelector('#runInfo').textContent);
    const file=JSON.parse(await blob.text());
    const {PHYSICS,DRIVER}=await import('/src/app/physics-version.js');
    const input=document.querySelector('#runFile');
    async function load(o){
      const data=new DataTransfer();data.items.add(new File([JSON.stringify(o)],'identity-test.json',{type:'application/json'}));
      document.querySelector('#loadRun').click();input.files=data.files;input.dispatchEvent(new Event('change'));
      await new Promise(r=>setTimeout(r,500));return document.querySelector('#runInfo').textContent;
    }
    const current=await load(file);
    const changed=await load({...file,driver:{...file.driver,sha256:'0'.repeat(64),live:'0'.repeat(64)}});
    const old={...file};delete old.driver;const legacy=await load(old);
    return {physicsMatches:file.physics.sha256===PHYSICS.sha256&&file.physics.live===PHYSICS.sha256,
      driverMatches:file.driver.sha256===DRIVER.sha256&&file.driver.live===DRIVER.sha256,current,changed,legacy};
  })()`);
  const checks={physicsMatches:result.physicsMatches===true,driverMatches:result.driverMatches===true,
    currentMatches:/Driver source matches/.test(result.current),changedDiffers:/Driver source differs/.test(result.changed),
    legacyNoIdentity:/no separate driver identity/.test(result.legacy)};
  return {allTrue:Object.values(checks).every(Boolean),checks,seen:result};
};
