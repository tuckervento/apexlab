// Run explicitly: node tests/check-race-mutations.mjs. Each APEX_SRC copy must fail its targeted property.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const mutations=[
  ['continuous laps','race/race.js','lapTimes.push(summary.time);','lapTimes.push(summary.time+lapTimes.length);'],
  ['interpolated lap times','race/race.js','dt*(-before)/(after-before)','dt'],
  ['scripted steering','race/judge.js','judge.incidents.push(incident);','judge.incidents.push(incident,incident);'],
  ['default reset across finish','race/race.js','crossingReady=false;','crossingReady=true;'],
  ['formation is lap zero','race/race.js','lap:lapStart===null?0:lapTimes.length+1','lap:lapTimes.length'],
  ['formation is lap zero','race/race.js','judge.incidents.slice(incidentAtStart)','judge.incidents'],
  ['default reset across finish','race/race.js','if(wraps)cross(t);','if(false)cross(t);'],
  ['reset informs driver','race/race.js','judge.penalties+=incidentPenalty;','judge.penalties+=2*incidentPenalty;'],
  ['judge classifies off','race/judge.js','over>3','over>30'],
  ['judge classifies tangent spin','race/judge.js','angle>0.45','angle>4.5'],
  ['judge classifies sideslip spin','race/judge.js','Math.abs(beta)>0.45','Math.abs(beta)>4.5'],
  ['known edge excursions','race/judge.js','if(outside&&!judge.outside)','if(outside)'],
  ['scripted steering','race/judge.js','const incident={type,station,t,over};','const incident={type,station:station+(judgeStep.calls=(judgeStep.calls||0)+1),t,over};','identical steering repeats the incident station'],
  ['scripted steering','race/judge.js','const incident={type,station,t,over};','const incident={type,station,t:0,over};','steering incident follows the lock at one second'],
  ['scripted steering','race/race.js','dnf:dnf||!complete','dnf:false','steering incident ends the race as a DNF'],
  ['default reset across finish.*before','race/judge.js','const incident={type,station,t,over};','const incident={type,station:0,t,over};','incident is before the finish'],
  ['default reset across finish.*after','race/judge.js','const incident={type,station,t,over};','const incident={type,station:T.N-1,t,over};','incident is after the finish'],
  ['default reset across finish.*before','race/race.js','if(wraps)cross(t);','if(wraps)cross(t+dt);','reset crossing is scored at incident time'],
  ['default reset across finish.*after','race/race.js','if(wraps)cross(t);','if(wraps||idx<N/2)cross(t);','after-finish incident stays inside lap two'],
  ['default reset across finish','race/race.js','judge.penalties+=incidentPenalty;','judge.penalties+=2*incidentPenalty;','finish incident charges the configured penalties'],
  ['default reset across finish','race/race.js','penaltyAtStart=judge.penalties;','penaltyAtStart=0;','finish penalties belong only to lap two'],
  ['default reset across finish','race/race.js','driver.lap?.(driverState,summary);','driver.lap?.(driverState,summary);driver.lap?.(driverState,summary);','lap callback fires exactly once per lap'],
];
for(const [name,file,from,to,message] of mutations){
  const dir=mkdtempSync(join(tmpdir(),'apex-race-broken-'));
  try{
    cpSync(new URL('../src',import.meta.url),dir,{recursive:true});
    const path=join(dir,file),source=readFileSync(path,'utf8');
    assert.ok(source.includes(from));writeFileSync(path,source.replace(from,to));
    const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern',name,'tests/race.test.mjs'],
      {env:{...process.env,APEX_SRC:dir},encoding:'utf8'});
    assert.equal(result.status,1,result.stdout+result.stderr);
    assert.match(result.stdout,/AssertionError/);
    const failure=result.stdout.match(/error: (?:\|-\n\s+)?([^\n]+)/)?.[1].replace(/^'|'$/g,'');
    assert.ok(failure,result.stdout+result.stderr);
    if(message)assert.equal(failure,message,result.stdout+result.stderr);
    const line=source.slice(0,source.indexOf(from)).split('\n').length;
    console.log(`Expected failure: ${file}:${line} ${JSON.stringify(to)} → ${name}: ${failure}`);
  }finally{rmSync(dir,{recursive:true,force:true});}
}
