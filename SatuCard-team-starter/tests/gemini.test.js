import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateChat } from '../lib/chat.js';
import { GET, POST } from '../api/chat.js';
import { imageDataUrl } from './copy-fixtures.js';
const input = { message:'Сократи текст',history:[],card:{title:'Чашка',subtitle:'',description:'Керамика',features:[],template:'minimal'},facts:'Керамика',language:'ru',tone:'neutral' };
const result = {reply:'Предлагаю лаконичный вариант.',proposal:input.card};
const answer = (value=result, finishReason='STOP') => ({candidates:[{finishReason,content:{role:'model',parts:[{text:JSON.stringify(value)}]}}]});
const keys=['SATUCARD_AI_PROVIDER','GEMINI_CHAT_ENABLED','GEMINI_CHAT_MODEL','GEMINI_API_KEY','GEMINI_ALLOWED_USER_IDS','GEMINI_ADMIN_USER_ID','GROQ_CHAT_FALLBACK_ENABLED','GROQ_API_KEY','SUPABASE_URL','SUPABASE_SECRET_KEY'];
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
 const pilot = await GET().json();
 assert.equal(pilot.available, true);
 assert.equal(pilot.singleUserPilot, true);
 process.env.GEMINI_ALLOWED_USER_IDS = id + ',11111111-1111-4111-8111-111111111111';
 assert.equal((await GET().json()).singleUserPilot, false);
 process.env.GEMINI_ALLOWED_USER_IDS = id;
 process.env.GEMINI_CHAT_MODEL='unknown';assert.equal((await GET().json()).available,false);delete process.env.GEMINI_CHAT_MODEL;
 let providerCalls=0;
 globalThis.fetch=async(url)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id,email_confirmed_at:'today'});if(url.includes('/rest/v1/profiles?'))return Response.json([{id,profile_completed_at:'today',mail_proof_required:false}]);if(url.includes('/rpc/'))return new Response('',{status:404});providerCalls++;throw Error('Must not call model')};
 const response=await POST(new Request('https://example.com/api/chat',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test.token.signature'},body:JSON.stringify(input)}));assert.equal(response.status,503);assert.equal(providerCalls,0);
 process.env.GEMINI_ALLOWED_USER_IDS='*';assert.equal((await GET().json()).available,false);
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
 assert.equal((await GET().json()).groqFallbackAvailable, true);
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
 assert.equal((await GET().json()).groqFallbackAvailable, undefined);
});
