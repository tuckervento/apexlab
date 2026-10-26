// Measurement only. Each subprocess loads a disposable APEX_SRC tree, deleted in finally.
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadCore } from '../../tests/load-core.mjs';
import { fixtureCase } from '../../tests/fixture-util.mjs';

const src = fileURLToPath(new URL('../../src', import.meta.url));
const faults = {
  first: ['this.target=Float64Array.from(this.off);\n    if(this.stage', 'this.evalc(this.c,null);this.clamp(this.off);this.done=true;return false;\n    if(this.stage'],
  noPolish: ['if(!this.polish){this.polish=', 'if(!this.polish){this.evalc(this.c,null);this.clamp(this.off);this.done=true;return false;}\n    if(!this.polish){this.polish='],
  stall: ['if(this.stall>12)', 'if(this.stall>6)'],
  reject: ['if(fn<=this.f+1e-4*a*gd)', 'if(false)'],
  evals: ['const f=this.evalc(c,null);P.tries++;', 'this.evalc(c,null);this.evalc(c,null);const f=this.evalc(c,null);P.tries++;'],
  steps: ['if(this.done)return false;', 'this.waitStep=(this.waitStep??0)+1;if(this.waitStep%3)return false;\n    if(this.done)return false;'],
  delay: ['this.clamp(this.off);this.done=true;', 'this.clamp(this.off);const until=performance.now()+121000;while(performance.now()<until){}this.done=true;'],
};
if (!process.argv.includes('--child')) {
  const runs = [ ...Array.from({length:3}, (_, i) => ['healthy', 'direct', i+1]),
    ...Array.from({length:3}, (_, i) => ['healthy', 'protocol', i+1]), ['hilly', 'direct', 1],
    ...Object.keys(faults).map(f => [f, 'direct', 1]) ];
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
  for (const [fault, mode, repeat] of runs.filter(r => !only || only.split(',').includes(r[0]))) {
    const dir = mkdtempSync(join(tmpdir(), 'apex-search-'));
    try {
      cpSync(src, dir, {recursive:true});
      if (faults[fault]) {
        const p = join(dir, 'core/optimiser.js'), s = readFileSync(p, 'utf8'), [a,b] = faults[fault];
        assert.equal(s.split(a).length, 2, `unique mutation ${fault}`);
        let changed = s.replace(a,b);
        if (fault === 'reject') {
          assert.equal(changed.split('if(f<this.f-1e-9)').length, 2, 'unique polish rejection mutation');
          changed = changed.replace('if(f<this.f-1e-9)', 'if(false)');
        }
        writeFileSync(p, changed);
      }
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', fault, mode, String(repeat)],
        {env:{...process.env, APEX_SRC:dir, APEX_CHECK:process.argv.includes('--check')?'1':''}, encoding:'utf8', timeout:180000});
      process.stdout.write(r.stdout); process.stderr.write(r.stderr);
      if (process.argv.includes('--check') && faults[fault]) {
        assert.equal(r.status, 1, `mutation ${fault} must fail`);
        const message = fault === 'evals' ? 'search evaluations <= 160000' : fault === 'steps' ? 'search steps <= 160000'
          : fault === 'delay' ? 'search wall time <= 120 s' : 'search gain >= 0.9987';
        assert.ok(r.stderr.includes(`AssertionError [ERR_ASSERTION]: ${message}`), `mutation ${fault}: intended assertion`);
      } else assert.equal(r.status, 0, `measurement ${fault}/${mode}`);
    } finally { rmSync(dir, {recursive:true, force:true}); }
  }
} else {
  const [fault, mode, repeat] = process.argv.slice(3), key = `GT racer|Harrow Ring${fault === 'hilly' ? ' · hills 25 m' : ''}`;
  const env = {node:process.version, v8:process.versions.v8, cpu:cpus()[0].model, load:loadavg(), at:new Date().toISOString()};
  const core = await loadCore(), fx = await fixtureCase(key), T = fx.T;
  assert.deepEqual(fx.car, core.CARS['GT racer'], 'fixture car equals preset');
  if (T.flat) {
    const {ctrl:a, ...actual} = T, {ctrl:b, ...expected} = core.buildTrack(core.genCtrl(core.TRACKS[0].seed,12),12);
    assert.deepEqual(a,b.map(p=>[...p,0]), 'fixture controls equal preset with zero heights');
    assert.deepEqual(actual,expected, 'fixture geometry equals preset');
  }
  const car = core.buildCar(fx.car, {loads:!T.flat}), B = core.makeBounds(T,car), N = T.N;
  const centre = Float64Array.from(B.lo, (lo,i) => Math.min(B.hi[i],Math.max(lo,0)));
  const centreLap = core.lapEval(T,car,centre,core.makeScratch(N));
  assert.ok(fx.off.every((v,i) => v>=B.lo[i] && v<=B.hi[i]), 'fixture reference feasible');
  const referenceLap = core.lapEval(T,car,fx.off,core.makeScratch(N));
  assert.ok(centreLap-referenceLap>1, 'reference improvement exceeds one second');
  let steps=0, opt, line, reported, ticks=0, stages=new Set(), polish=false, snapshots=0, errors=[];
  const observe = o => { stages.add(o.stage+1); polish ||= !!o.polish; };
  const t0=performance.now();
  if (mode === 'direct') {
    opt = new core.Optimizer(); opt.setup(T,car,B,centre);
    while (!opt.converged) {
      observe(opt); opt.step(); steps++; observe(opt);
      assert.ok(steps<500000 && performance.now()-t0<175000, 'measurement emergency guard');
    }
    line=opt.current(new Float64Array(N)); reported=opt.exactLap();
  } else {
    let last;
    const s = new core.Solver(e => { if(e.type==='snapshot'){last=e;snapshots++;} if(e.type==='error')errors.push(e); });
    s.handle({type:'setCar',rev:1,params:{...core.CARS['GT racer']}});
    s.handle({type:'setTrack',rev:2,ctrl:core.genCtrl(core.TRACKS[0].seed,12),width:12,keepLine:false});
    s.handle({type:'run'}); opt=s.opt;
    const step=opt.step;
    opt.step=function(){observe(this); const r=step.call(this); steps++; observe(this); return r;};
    while(s.tick(20)){ticks++; assert.ok(performance.now()-t0<175000, 'protocol measurement emergency guard');}
    line=last.line.off; reported=last.lap;
    assert.deepEqual(errors,[], 'solver emitted errors');
  }
  const wall=(performance.now()-t0)/1000, scratch=core.makeScratch(N);
  const resultLap=core.lapEval(T,car,line,scratch), gain=(centreLap-resultLap)/(centreLap-referenceLap);
  const row={fault,mode,repeat:+repeat,...env,evals:opt.evals,steps,stages:[...stages],polish,polishTries:opt.polish?.tries??0,converged:opt.converged,wall,centreLap,referenceLap,denominator:centreLap-referenceLap,resultLap,reported,difference:resultLap-reported,gain,ticks,snapshots,
    warnings:{stall:scratch.stall,air:scratch.air,ntop:scratch.ntop}, nonlevel:Array.from(T.cth).filter((v,i)=>v!==1||T.kv[i]!==0).length};
  console.log(JSON.stringify(row));
  if (process.env.APEX_CHECK) {
    assert.ok(wall<=120, 'search wall time <= 120 s');
    assert.ok(opt.evals<=160000, 'search evaluations <= 160000');
    assert.ok(steps<=160000, 'search steps <= 160000');
    assert.ok(opt.converged, 'search converged');
    assert.ok(gain>=0.9987, 'search gain >= 0.9987');
  }
}
