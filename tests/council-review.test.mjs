import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'spacehub-review-'));
const oldFetch=globalThis.fetch, saved={...process.env};
try {
  delete process.env.OPENAI_API_KEY;
  process.env.ANTHROPIC_API_KEY='fixture';
  process.env.COUNCIL_DIFF=path.join(dir,'diff');
  process.env.COUNCIL_OUT=path.join(dir,'review');
  fs.writeFileSync(process.env.COUNCIL_DIFF,'fixture diff');
  let calls=0;
  globalThis.fetch=async(url)=>{
    assert.equal(url,'https://api.anthropic.com/v1/messages');calls++;
    return {ok:true,json:async()=>({content:[{type:'text',text:'Verdict: APPROVE (fixture)'}]})};
  };
  await import('../scripts/ai-council-review.mjs');
  const report=fs.readFileSync(process.env.COUNCIL_OUT,'utf8');
  assert.equal(calls,1,'Claude is reviewed even with no OpenAI key');
  assert.ok(report.includes('AUTO_REVIEW_ACTIVE=true'));
  assert.ok(report.includes('NOT RUN: OPENAI_API_KEY'));
  assert.ok(report.includes('Verdict: APPROVE (fixture)'));
} finally {
  globalThis.fetch=oldFetch;
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
  Object.assign(process.env,saved);
  fs.rmSync(dir,{recursive:true,force:true});
}
console.log('council review: one provider cannot block the other — all assertions passed');
