import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { generatePaidChat } from '../lib/paid-chat.js';
import { defaultAiModel } from '../lib/ai-models.js';

const userId = '22222222-2222-4222-8222-222222222222';
const ownerId = '11111111-1111-4111-8111-111111111111';
const config = { base: 'https://accounting.example', key: 'test-key' };
const input = { message: 'Составь текст', history: [], language: 'ru', tone: 'neutral', facts: 'Керамика',
  card: { title: 'Чашка', subtitle: '', description: '', features: [], template: 'studio' } };
const valid = { reply: 'Готово.', proposal: { ...input.card, description: 'Керамика' } };
const rpcArgs = {
  get_paid_ai_accounting_version: [],
  reserve_paid_ai_attempt: ['p_user_id', 'p_request_id', 'p_model_id', 'p_token_cap'],
  settle_paid_ai_attempt: ['p_request_id', 'p_total_tokens', 'p_outcome']
};

test('model defaults are explicit, tier-specific and always allowed', () => {
  for (const [tier, id] of [[1, 'cx/gpt-6-luna'], [2, 'cx/gpt-6.1-terra'], [3, 'cx/gpt-6.1-sol']]) {
    assert.equal(defaultAiModel({ active: {tier}, isAdmin: false }).id, id);
  }
  assert.equal(defaultAiModel({active: null,isAdmin: false}), null);
  assert.equal(defaultAiModel({isAdmin: true}).id, 'cx/gpt-6.1-sol');
});

test('unusable and uncertain model answers preserve provider budgets and release customer quota', async t => {
  const db = new PGlite();
  const previousFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = previousFetch; await db.close(); });
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);');
  await db.query('insert into auth.users values($1,$2),($3,$4)',[userId,'buyer@test.example',ownerId,'owner@test.example']);
  await db.exec(await readFile(new URL('../database/paid-access.sql',import.meta.url),'utf8'));
  const migration = await readFile(new URL('../database/paid-ai-result-accounting.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const order = (await db.query('select public.create_billing_order($1,$2,$3) as data',[userId,'basic',randomUUID()])).rows[0].data.order;
  await db.query('select public.confirm_billing_order($1,$2,$3,$4)',[order.id,ownerId,'confirmed-payment',1500]);
  let content = JSON.stringify(valid), includeUsage = true;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith(config.base)) {
      const fn = url.split('/').at(-1), data = JSON.parse(options.body);
      const args = rpcArgs[fn].map(key=>data[key]);
      const result = await db.query('select public.' + fn + '(' + args.map((_,i)=>'$'+(i+1)).join(',') + ') as data',args);
      return Response.json(result.rows[0].data);
    }
    assert.equal(url, 'https://anymodel.org/v1/chat/completions');
    return Response.json({ ...(includeUsage ? {usage:{prompt_tokens:80,completion_tokens:20,total_tokens:100}} : {}),
      choices:[{finish_reason:'stop',message:{role:'assistant',content}}] });
  };
  const generate = () => generatePaidChat(input,{config,user:{id:userId},model:{id:'cx/gpt-6-luna'},key:'mock-key'});
  const allowance = async () => (await db.query('select tokens_used,tokens_reserved from public.billing_grants where user_id=$1',[userId])).rows[0];
  const cooldown = () => db.exec('update public.billing_accounts set last_attempt_at=null');

  assert.deepEqual(await generate(),valid);
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:0});
  await cooldown();
  content = '{invalid JSON';
  await assert.rejects(generate(), /Invalid response/);
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:0});
  const invalid = (await db.query("select * from public.paid_ai_reservations where outcome='invalid'")).rows[0];
  assert.equal(Number(invalid.total_tokens),100);
  assert.equal(Number(invalid.customer_tokens),0);
  assert.equal(Number((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units),150);
  await cooldown();
  includeUsage = false;
  content = JSON.stringify(valid);
  await assert.rejects(generate(),error=>error.code==='usage_unavailable');
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:0});
  const uncertain=(await db.query("select * from public.paid_ai_reservations where outcome='uncertain'")).rows[0];
  assert.equal(Number(uncertain.customer_tokens),0);
  const before=Number((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units);
  await db.query('select public.reconcile_paid_ai_attempt($1,$2)',[uncertain.request_id,100]);
  await db.query('select public.reconcile_paid_ai_attempt($1,$2)',[uncertain.request_id,100]);
  assert.equal(Number((await db.query('select units from public.paid_ai_daily_usage')).rows[0].units),225);
  assert.ok(before>225);
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:0});
  await assert.rejects(db.query('select public.reconcile_paid_ai_attempt($1,$2)',[uncertain.request_id,50]),/cannot be reconciled/);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select public.reconcile_paid_ai_attempt($1,$2)',[uncertain.request_id,100]),/permission denied/);
  await db.exec('reset role');

  await cooldown();
  const staleId = randomUUID();
  const staleReserve = (await db.query('select public.reserve_paid_ai_attempt($1,$2,$3,$4) as data',[userId,staleId,'cx/gpt-6-luna',1000])).rows[0].data;
  assert.equal(staleReserve.settlementVersion,2);
  await db.query("update public.paid_ai_reservations set created_at=clock_timestamp()-interval '121 seconds' where request_id=$1",[staleId]);
  await cooldown();
  const nextId=randomUUID();
  await db.query('select public.reserve_paid_ai_attempt($1,$2,$3,$4)',[userId,nextId,'cx/gpt-6-luna',500]);
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:500});
  const stale = (await db.query('select outcome,customer_tokens from public.paid_ai_reservations where request_id=$1',[staleId])).rows[0];
  assert.deepEqual(stale,{outcome:'uncertain',customer_tokens:0});
  await db.query('select public.settle_paid_ai_attempt($1,$2,$3)',[nextId,0,'rejected']);
  await db.exec(`insert into public.paid_ai_reservations(request_id,user_id,grant_id,model_id,multiplier_hundredths,
    token_cap,provider_cap_units,usage_day,total_tokens,customer_tokens,outcome,created_at,settled_at)
    select gen_random_uuid(),user_id,grant_id,model_id,multiplier_hundredths,token_cap,provider_cap_units,
      usage_day,total_tokens,customer_tokens,outcome,created_at,settled_at
    from public.paid_ai_reservations cross join generate_series(1,10) where outcome='invalid' limit 10`);
  await cooldown();
  const blocked=(await db.query('select public.reserve_paid_ai_attempt($1,$2,$3,$4) as data',[userId,randomUUID(),'cx/gpt-6-luna',500])).rows[0].data;
  assert.equal(blocked.code,'ai_failure_limit');
  assert.deepEqual(await allowance(),{tokens_used:100,tokens_reserved:0});
});
