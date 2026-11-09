import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateChat } from '../lib/chat.js';
import { GET, POST } from '../api/chat.js';
const input = { message:'Сократи текст',history:[],card:{title:'Чашка',subtitle:'',description:'Керамика',features:[],template:'minimal'},facts:'Керамика',language:'ru',tone:'neutral' };
const result = {reply:'Предлагаю лаконичный вариант.',proposal:input.card};
const answer = (value=result, finishReason='STOP') => ({candidates:[{finishReason,content:{role:'model',parts:[{text:JSON.stringify(value)}]}}]});
const keys=['SATUCARD_AI_PROVIDER','GEMINI_CHAT_ENABLED','GEMINI_CHAT_MODEL','GEMINI_API_KEY','GEMINI_ALLOWED_USER_IDS','SUPABASE_URL','SUPABASE_SECRET_KEY'];
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
 assert.equal((await GET().json()).available,true);process.env.GEMINI_CHAT_MODEL='unknown';assert.equal((await GET().json()).available,false);delete process.env.GEMINI_CHAT_MODEL;
 let providerCalls=0;
 globalThis.fetch=async(url)=>{if(url.endsWith('/auth/v1/user'))return Response.json({id,email_confirmed_at:'today'});if(url.includes('/rest/v1/profiles?'))return Response.json([{id,profile_completed_at:'today',mail_proof_required:false}]);if(url.includes('/rpc/'))return new Response('',{status:404});providerCalls++;throw Error('Must not call model')};
 const response=await POST(new Request('https://example.com/api/chat',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test.token.signature'},body:JSON.stringify(input)}));assert.equal(response.status,503);assert.equal(providerCalls,0);
 process.env.GEMINI_ALLOWED_USER_IDS='*';assert.equal((await GET().json()).available,false);
});
