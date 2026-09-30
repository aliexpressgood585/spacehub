import fs from 'node:fs';

const diffPath=process.env.COUNCIL_DIFF || '/tmp/council.diff';
const outPath=process.env.COUNCIL_OUT || 'ai-council/AUTO_REVIEW.md';
const openaiKey=process.env.OPENAI_API_KEY || '';
const anthropicKey=process.env.ANTHROPIC_API_KEY || '';
const openaiModel=process.env.OPENAI_MODEL || 'gpt-6-astra';
const anthropicModel=process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const diff=fs.existsSync(diffPath)?fs.readFileSync(diffPath,'utf8'):'';
const clipped=diff.slice(0,90000);

if(!openaiKey || !anthropicKey){
  fs.writeFileSync(outPath,[
    '# AI Council auto-review',
    '',
    'AUTO_REVIEW_ACTIVE=false',
    '',
    'Automatic GPT ↔ Claude API review is not active because one or both API secrets are missing.',
    'The repository-based council protocol and manual dual-review guard remain active.',
  ].join('\n'));
  process.exit(0);
}

const system=[
  'You are one reviewer in the SpaceHub AI Council.',
  'The system is PAPER trading only. Never recommend enabling live execution.',
  'Review the proposed code diff independently.',
  'Focus on net expectancy after fees/slippage, overfitting, sample size, risk, execution realism, regressions, and rollback criteria.',
  'Return concise Markdown with: Verdict (APPROVE / REQUEST_CHANGES / EXPERIMENT), Key evidence, Risks, Required test, Rollback trigger.',
].join(' ');

const prompt=[
  'Repository: aliexpressgood585/spacehub',
  'Review this material CHAN-X trading change. Do not assume profitability from small samples.',
  '',
  'DIFF:',
  clipped || '(no diff supplied)',
].join('\n');

async function openaiReview(){
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'authorization':`Bearer ${openaiKey}`,'content-type':'application/json'},
    body:JSON.stringify({model:openaiModel,instructions:system,input:prompt,store:false})
  });
  const j=await r.json();
  if(!r.ok) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(j).slice(0,700)}`);
  if(typeof j.output_text==='string'&&j.output_text.trim()) return j.output_text.trim();
  const parts=[];
  for(const item of j.output||[]) for(const part of item.content||[]) if(typeof part.text==='string') parts.push(part.text);
  return parts.join('\n').trim() || '(no text returned)';
}

async function claudeReview(){
  const r=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{
      'x-api-key':anthropicKey,
      'anthropic-version':'2023-06-01',
      'content-type':'application/json'
    },
    body:JSON.stringify({model:anthropicModel,max_tokens:2200,system,messages:[{role:'user',content:prompt}]})
  });
  const j=await r.json();
  if(!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(j).slice(0,700)}`);
  return (j.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').trim() || '(no text returned)';
}

const [gpt,claude]=await Promise.allSettled([openaiReview(),claudeReview()]);
const gptText=gpt.status==='fulfilled'?gpt.value:`ERROR: ${gpt.reason?.message||gpt.reason}`;
const claudeText=claude.status==='fulfilled'?claude.value:`ERROR: ${claude.reason?.message||claude.reason}`;

const md=[
  '# AI Council auto-review',
  '',
  'AUTO_REVIEW_ACTIVE=true',
  '',
  `OpenAI model: \`${openaiModel}\``,
  `Anthropic model: \`${anthropicModel}\``,
  '',
  '## GPT review',
  gptText,
  '',
  '## Claude review',
  claudeText,
  '',
  '## Council rule',
  'This output is advisory evidence. It does not auto-enable live trading and does not auto-approve deployment. Record the final dual-review decision in ai-council/STATE.md.',
].join('\n');

fs.writeFileSync(outPath,md);
