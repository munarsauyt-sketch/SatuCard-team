import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateChat } from '../lib/chat.js';
import { GET, POST } from '../api/chat.js';
import { imageDataUrl } from './copy-fixtures.js';
const input = { message:'Сократи текст',history:[],card:{title:'Чашка',subtitle:'',description:'Керамика',features:[],template:'minimal'},facts:'Керамика',language:'ru',tone:'neutral' };
const result = {reply:'Предлагаю лаконичный вариант.',proposal:input.card};
const answer = (value=result, finishReason='STOP') => ({candidates:[{finishReason,content:{role:'model',parts:[{text:JSON.stringify(value)}]}}]});
const keys=['SATUCARD_AI_PROVIDER','GEMINI_CHAT_ENABLED','GEMINI_CHAT_MODEL','GEMINI_API_KEY','GEMINI_ALLOWED_USER_IDS','GEMINI_ADMIN_USER_ID','GROQ_CHAT_FALLBACK_ENABLED','GROQ_API_KEY','SUPABASE_URL','SUPABASE_SECRET_KEY',
 'VERCEL_ENV','SAI_PREVIEW_FALLBACKS','SAI_PREVIEW_EVALUATION','MISTRAL_API_KEY','CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','COHERE_API_KEY','ALIBABA_API_KEY','SCALEWAY_API_KEY',
 'SAI_PREVIEW_ANYMODEL_ENABLED','SAI_PRODUCTION_ANYMODEL_ENABLED','ANYMODEL_API_KEY'];
const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]])), oldFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=oldFetch;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k]}});
test('Gemini uses only its endpoint, header key, bounded schema and shared output validation',async()=>{
 let body;const calls=[];const fetcher=async(url,o)=>{calls.push(url);assert.equal(o.headers['x-goog-api-key'],'test-key');assert.ok(!url.includes('test-key'));body=JSON.parse(o.body);return Response.json(answer())};
 assert.deepEqual(await generateChat(input,{key:'test-key',provider:'gemini',fetcher}),result);
 assert.equal(calls.length,1);assert.match(calls[0],/generativelanguage.googleapis.com/);assert.equal(body.generationConfig.maxOutputTokens,2400);assert.equal(body.generationConfig.thinkingConfig.thinkingLevel,'MINIMAL');assert.equal(body.contents[0].parts.length,1);assert.equal(body.tools,undefined);
 for(const bad of [answer(result,'MAX_TOKENS'),answer({reply:'300 мл',proposal:null}),{error:{message:'private'}}, {candidates:[]}])await assert.rejects(generateChat(input,{key:'test',provider:'gemini',fetcher:async()=>Response.json(bad)}));
});
test('Gemini never retries or falls back to paid OpenAI',async()=>{
 let calls=0;await assert.rejects(generateChat(input,{key:'test',provider:'gemini',fetcher:async()=>{calls++;return new Response('',{status:429})}}));assert.equal(calls,1);
 await assert.rejects(generateChat(input,{key:'test',provider:'gemini',timeoutMs:5,fetcher:()=>new Promise(()=>{})}));
});
test('Gemini activation requires explicit model key allowlist and database quota before generation',async()=>{
 const id='3f5a04c4-15e4-467a-9dc8-78c1409531ec';Object.assign(process.env,{SATUCARD_AI_PROVIDER:'gemini',GEMINI_CHAT_ENABLED:'true',GEMINI_API_KEY:'test',GEMINI_ALLOWED_USER_IDS:id,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'private'});
 const pilot = await (await GET()).json();
 assert.equal(pilot.available, true);
 assert.equal(pilot.singleUserPilot, true);
 process.env.GEMINI_ALLOWED_USER_IDS = id + ',11111111-1111-4111-8111-111111111111';
 assert.equal((await (await GET()).json()).singleUserPilot, false);
 process.env.GEMINI_ALLOWED_USER_IDS = id;
 process.env.GEMINI_CHAT_MODEL='unknown';assert.equal((await (await GET()).json()).available,false);delete process.env.GEMINI_CHAT_MODEL;
 let providerCalls=0;
 globalThis.fetch=async(url)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id,email_confirmed_at:'today'});if(url.includes('/rest/v1/profiles?'))return Response.json([{id,profile_completed_at:'today',mail_proof_required:false}]);if(url.includes('/rpc/'))return new Response('',{status:404});providerCalls++;throw Error('Must not call model')};
 const response=await POST(new Request('https://example.com/api/chat',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test.token.signature'},body:JSON.stringify(input)}));assert.equal(response.status,503);assert.equal(providerCalls,0);
 process.env.GEMINI_ALLOWED_USER_IDS='*';assert.equal((await (await GET()).json()).available,false);
});

test('only the verified and allowlisted Gemini administrator skips the SatuCard quota', async () => {
 const adminId = '11111111-1111-4111-8111-111111111111';
 const memberId = '22222222-2222-4222-8222-222222222222';
 Object.assign(process.env, {
  SATUCARD_AI_PROVIDER: 'gemini', GEMINI_CHAT_ENABLED: 'true', GEMINI_CHAT_MODEL: 'gemini-3.1-flash-lite', GEMINI_API_KEY: 'test',
  GEMINI_ALLOWED_USER_IDS: [adminId, memberId].join(','), GEMINI_ADMIN_USER_ID: adminId,
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'private'
 });
 let signedInId = adminId;
 let quotaCalls = 0, modelCalls = 0;
 globalThis.fetch = async url => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: signedInId, email_confirmed_at: 'today' });
  if (url.includes('/rest/v1/profiles?')) return Response.json([{ id: signedInId, profile_completed_at: 'today', mail_proof_required: false }]);
  if (url.includes('/rpc/')) { quotaCalls++; return Response.json({ allowed: false }); }
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\//);
  modelCalls++;
  return Response.json(answer());
 };
 const request = () => new Request('https://example.com/api/chat', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test.token.signature' },
  body: JSON.stringify({ ...input, userId: adminId })
 });
 const response = await POST(request());
 assert.equal(response.status, 200);
 assert.deepEqual(await response.json(), result);
 assert.equal(quotaCalls, 0);
 signedInId = memberId;
 assert.equal((await POST(request())).status, 429);
 assert.equal(quotaCalls, 1);
 signedInId = adminId;
 process.env.GEMINI_ALLOWED_USER_IDS = memberId;
 assert.equal((await POST(request())).status, 403);
 assert.equal(modelCalls, 1);
});

test('Groq requires opt-in and a Gemini 429, uses one quota reservation and receives no image', async () => {
 const id = '33333333-3333-4333-8333-333333333333';
 Object.assign(process.env, {
  SATUCARD_AI_PROVIDER:'gemini', GEMINI_CHAT_ENABLED:'true', GEMINI_CHAT_MODEL:'gemini-3.1-flash-lite', GEMINI_API_KEY:'test',
  GEMINI_ALLOWED_USER_IDS:id, GROQ_CHAT_FALLBACK_ENABLED:'true', GROQ_API_KEY:'groq-test',
  SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'private'
 });
 delete process.env.GEMINI_ADMIN_USER_ID;
 assert.equal((await (await GET()).json()).groqFallbackAvailable, true);
 const calls = [];
 let primaryStatus = 429, groqStatus = 200, allowed = true;
 globalThis.fetch = async (url, options) => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id, email_confirmed_at:'today' });
  if (url.includes('/rest/v1/profiles?')) return Response.json([{ id, profile_completed_at:'today', mail_proof_required:false }]);
  if (url.includes('/rpc/')) { calls.push('quota'); return Response.json({ allowed }); }
  const body = JSON.parse(options.body);
  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
   calls.push('gemini');
   assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'image/jpeg');
   return new Response(null, { status: primaryStatus });
  }
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  calls.push('groq');
  assert.equal(options.headers.Authorization, 'Bearer groq-test');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.tools, undefined);
  const context = JSON.parse(body.messages[1].content);
  assert.equal(context.imageDataUrl, undefined);
  assert.equal(context.imageConsent, undefined);
  assert.equal(context.groqFallbackConsent, undefined);
  if (groqStatus !== 200) return new Response(null, { status: groqStatus });
  return Response.json({ choices:[{ finish_reason:'stop', message:{ role:'assistant', content:JSON.stringify(result) } }] });
 };
 const request = consent => new Request('https://example.com/api/chat', {
  method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer test.token.signature' },
  body:JSON.stringify({ ...input, imageConsent:true, imageDataUrl, groqFallbackConsent:consent })
 });
 assert.equal((await (await POST(request(false))).json()).code, 'gemini_quota');
 assert.deepEqual(calls.splice(0), ['quota', 'gemini']);
 assert.deepEqual(await (await POST(request(true))).json(), { ...result, providerUsed:'groq' });
 assert.deepEqual(calls.splice(0), ['quota', 'gemini', 'groq']);
 groqStatus = 429;
 assert.equal((await (await POST(request(true))).json()).code, 'groq_quota');
 assert.deepEqual(calls.splice(0), ['quota', 'gemini', 'groq']);
 primaryStatus = 503;
 assert.equal((await (await POST(request(true))).json()).code, 'ai_failed');
 assert.deepEqual(calls.splice(0), ['quota', 'gemini']);
 allowed = false;
 assert.equal((await (await POST(request(true))).json()).code, 'ai_rate_limited');
 assert.deepEqual(calls, ['quota']);
 delete process.env.GROQ_API_KEY;
 assert.equal((await (await GET()).json()).groqFallbackAvailable, undefined);
});

test('only the chosen Preview reserve receives the chat after a Gemini 429', async () => {
 const id = '44444444-4444-4444-8444-444444444444';
 Object.assign(process.env, {
  SATUCARD_AI_PROVIDER:'gemini', GEMINI_CHAT_ENABLED:'true', GEMINI_CHAT_MODEL:'gemini-3.1-flash-lite', GEMINI_API_KEY:'test',
  GEMINI_ALLOWED_USER_IDS:id, GROQ_CHAT_FALLBACK_ENABLED:'true', GROQ_API_KEY:'groq-test',
  SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'private',
  VERCEL_ENV:'preview', SAI_PREVIEW_FALLBACKS:'mistral, cloudflare, cohere',
  MISTRAL_API_KEY:'mistral-test', COHERE_API_KEY:'cohere-test', CLOUDFLARE_API_TOKEN:'cloudflare-test', CLOUDFLARE_ACCOUNT_ID:'wrong',
  SAI_PREVIEW_EVALUATION:'alibaba', ALIBABA_API_KEY:'alibaba-test'
 });
 delete process.env.GEMINI_ADMIN_USER_ID;
 const options = await (await GET()).json();
 assert.deepEqual(options.fallbackProviders.map(p => p.id), ['groq','mistral','cohere']);
 assert.deepEqual(options.evaluationProviders, [{ id:'alibaba', label:'Alibaba Cloud' }]);
 const calls = [];
 let fallbackStatus = 200;
 globalThis.fetch = async (url, init) => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id, email_confirmed_at:'today' });
  if (url.includes('/rest/v1/profiles?')) return Response.json([{ id, profile_completed_at:'today', mail_proof_required:false }]);
  if (url.includes('/rpc/')) { calls.push('quota'); return Response.json({ allowed:true }); }
  if (url.startsWith('https://generativelanguage.googleapis.com/')) { calls.push('gemini'); return new Response(null, { status:429 }); }
  assert.equal(url, 'https://api.mistral.ai/v1/chat/completions');
  calls.push('mistral');
  const body = JSON.parse(init.body);
  assert.equal(init.headers.Authorization, 'Bearer mistral-test');
  const context = JSON.parse(body.messages[1].content);
  assert.equal(context.imageDataUrl, undefined);
  assert.equal(context.fallbackProvider, undefined);
  if (fallbackStatus !== 200) return new Response(null, { status:fallbackStatus });
  return Response.json({ choices:[{ finish_reason:'stop', message:{ role:'assistant', content:JSON.stringify(result) } }] });
 };
 const request = fallbackProvider => new Request('https://example.com/api/chat', {
  method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer test.token.signature' },
  body:JSON.stringify({ ...input, imageConsent:true, imageDataUrl, fallbackProvider })
 });
 assert.equal((await POST(request('alibaba'))).status, 400);
 assert.deepEqual(calls, []);
 assert.equal((await (await POST(request())).json()).code, 'gemini_quota');
 assert.deepEqual(calls.splice(0), ['quota', 'gemini']);
 assert.deepEqual(await (await POST(request('mistral'))).json(), { ...result, providerUsed:'mistral' });
 assert.deepEqual(calls.splice(0), ['quota', 'gemini', 'mistral']);
 fallbackStatus = 429;
 assert.equal((await (await POST(request('mistral'))).json()).code, 'fallback_quota');
 assert.deepEqual(calls.splice(0), ['quota', 'gemini', 'mistral']);
 process.env.VERCEL_ENV = 'production';
 assert.deepEqual((await (await GET()).json()).fallbackProviders.map(p => p.id), ['groq']);
 assert.equal((await (await GET()).json()).evaluationProviders, undefined);
 assert.equal((await (await POST(request('mistral'))).json()).code, 'gemini_quota');
 assert.deepEqual(calls, ['quota', 'gemini']);
});

test('a trial evaluation is authenticated, quota-limited, and sends only the built-in sample in Preview', async () => {
 const id = '55555555-5555-4555-8555-555555555555';
 Object.assign(process.env, {
  SATUCARD_AI_PROVIDER:'gemini', GEMINI_CHAT_ENABLED:'true', GEMINI_CHAT_MODEL:'gemini-3.1-flash-lite', GEMINI_API_KEY:'test',
  GEMINI_ALLOWED_USER_IDS:id, GEMINI_ADMIN_USER_ID:id, SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'private',
  VERCEL_ENV:'preview', SAI_PREVIEW_EVALUATION:'alibaba', ALIBABA_API_KEY:'alibaba-test'
 });
 let allowed = true;
 const calls = [];
 globalThis.fetch = async (url, init) => {
  if (url.endsWith('/auth/v1/user')) return Response.json({ id, email_confirmed_at:'today' });
  if (url.includes('/rest/v1/profiles?')) return Response.json([{ id, profile_completed_at:'today', mail_proof_required:false }]);
  if (url.includes('/rpc/')) { calls.push('quota'); return Response.json({ allowed }); }
  calls.push('alibaba');
  assert.equal(url, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
  const body = JSON.parse(init.body);
  const context = JSON.parse(body.messages[1].content);
  assert.equal(context.card.title, 'Демо-чашка');
  assert.equal(context.imageDataUrl, undefined);
  assert.ok(!init.body.includes('private-card'));
  return Response.json({ choices:[{ finish_reason:'stop', message:{ role:'assistant', content:JSON.stringify(result) } }] });
 };
 const request = (provider = 'alibaba', auth = true) => new Request('https://example.com/api/chat?previewEvaluation=' + provider, {
  method:'POST', headers:{ 'content-type':'application/json', ...(auth ? { authorization:'Bearer test.token.signature' } : {}) },
  body:JSON.stringify({ ...input, message:'private-card', imageConsent:true, imageDataUrl })
 });
 assert.equal((await POST(request('alibaba', false))).status, 401);
 assert.equal((await POST(request('scaleway'))).status, 404);
 assert.deepEqual(calls, []);
 allowed = false;
 assert.equal((await (await POST(request())).json()).code, 'ai_rate_limited');
 assert.deepEqual(calls.splice(0), ['quota']);
 allowed = true;
 const response = await (await POST(request())).json();
 assert.equal(response.providerUsed, 'alibaba');
 assert.equal(response.proposal.title, result.proposal.title);
 assert.ok(Number.isInteger(response.elapsedMs));
 assert.deepEqual(calls.splice(0), ['quota','alibaba']);
 process.env.VERCEL_ENV = 'production';
 assert.equal((await POST(request())).status, 404);
 assert.deepEqual(calls, []);
});

test('production Sol is owner-only and works even when the shared quota is exhausted', async () => {
 const owner = '11111111-1111-4111-8111-111111111111';
 const member = '22222222-2222-4222-8222-222222222222';
 Object.assign(process.env, {
  SATUCARD_AI_PROVIDER:'gemini', GEMINI_CHAT_ENABLED:'true', GEMINI_CHAT_MODEL:'gemini-3.1-flash-lite', GEMINI_API_KEY:'test',
  GEMINI_ALLOWED_USER_IDS:[owner, member].join(','), GEMINI_ADMIN_USER_ID:owner,
  SUPABASE_URL:'https://example.supabase.co', SUPABASE_SECRET_KEY:'private',
  VERCEL_ENV:'production', SAI_PREVIEW_ANYMODEL_ENABLED:'true', SAI_PRODUCTION_ANYMODEL_ENABLED:'false', ANYMODEL_API_KEY:'test'
 });
 const calls = [];
 globalThis.fetch = async (url, init) => {
  if (url.endsWith('/auth/v1/user')) {
   const id = init.headers.Authorization === 'Bearer owner' ? owner : member;
   return Response.json({ id, email_confirmed_at:'today' });
  }
  if (url.includes('/rest/v1/profiles?')) return Response.json([{ profile_completed_at:'today', mail_proof_required:false }]);
  if (url.includes('/rpc/')) {
   calls.push('quota');
   return Response.json({ allowed:false });
  }
  calls.push(url);
  assert.equal(JSON.parse(init.body).model, 'cx/gpt-6.1-sol');
  return Response.json({ choices:[{ finish_reason:'stop', message:{ role:'assistant', content:JSON.stringify(result) } }] });
 };
 const request = (token, method = 'GET') => new Request('https://example.com/api/chat', {
  method, headers:{ authorization:'Bearer ' + token, 'content-type':'application/json' },
  ...(method === 'POST' ? { body:JSON.stringify({ ...input, selectedProvider:'anymodel' }) } : {})
 });
 assert.equal((await (await GET(request('owner'))).json()).selectableProviders, undefined);
 process.env.SAI_PRODUCTION_ANYMODEL_ENABLED = 'true';
 const publicStatus = await (await GET()).json();
 assert.equal(publicStatus.available, true);
 assert.equal(publicStatus.selectableProviders, undefined);
 assert.equal((await (await GET(request('member'))).json()).selectableProviders, undefined);
 assert.deepEqual((await (await GET(request('owner'))).json()).selectableProviders.map(p => p.id), ['anymodel']);
 const denied = await POST(request('member', 'POST'));
 assert.equal(denied.status, 403);
 assert.equal((await denied.json()).code, 'sol_access_required');
 assert.deepEqual(calls, []);
 assert.deepEqual(await (await POST(request('owner', 'POST'))).json(), { ...result, providerUsed:'anymodel' });
 assert.deepEqual(calls.splice(0), ['https://anymodel.org/v1/chat/completions']);
 process.env.VERCEL_ENV = 'preview';
 assert.equal((await (await POST(request('owner', 'POST'))).json()).code, 'ai_rate_limited');
 assert.deepEqual(calls, ['quota']);
});
