import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/video-speech.js';
const owner='12345678-1234-1234-1234-123456789abc';
async function fixture(fn,{allow=true,user=owner}={}){
  const names=['VIDEO_SPEECH_ENABLED','VIDEO_OPENAI_API_KEY','VIDEO_SPEECH_OWNER_ID','SUPABASE_URL','SUPABASE_SECRET_KEY'];
  const saved=names.map(n=>process.env[n]),original=global.fetch,calls=[];
  Object.assign(process.env,{VIDEO_SPEECH_ENABLED:'true',VIDEO_OPENAI_API_KEY:'test-only-key',VIDEO_SPEECH_OWNER_ID:owner,SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'test-service-key'});
  global.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/auth/v1/user'))return Response.json({id:user,email_confirmed_at:'2026-01-01'});if(String(url).includes('/profiles?'))return Response.json([{id:user,profile_completed_at:'2026-01-01'}]);if(String(url).endsWith('/rpc/reserve_video_speech'))return Response.json(allow);if(String(url).includes('api.openai.com'))return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg'}});throw new Error('Unexpected request');};
  try{await fn(calls);}finally{global.fetch=original;names.forEach((n,i)=>{if(saved[i]===undefined)delete process.env[n];else process.env[n]=saved[i];});}
}
function request(text='Сәлем!'){const data=new FormData();data.set('action','speech');data.set('text',text);data.set('voice','coral');data.set('language','kk');return new Request('https://site.example/api/video-speech',{method:'POST',headers:{Authorization:'Bearer test'},body:data});}
test('speech rejects non-owner before reservation and provider',()=>fixture(async calls=>{const result=await POST(request());assert.equal(result.status,403);assert.equal(calls.length,2);},{user:'abcdefab-1234-1234-1234-123456789abc'}));
test('speech cannot call provider without a shared allowance',()=>fixture(async calls=>{const result=await POST(request());assert.equal(result.status,429);assert.equal(calls.length,3);},{allow:false}));
test('speech bounds text before reservation and pins the model after successful reservation',()=>fixture(async calls=>{
  assert.equal((await POST(request('x'.repeat(401)))).status,400);assert.equal(calls.length,2);calls.length=0;
  const result=await POST(request());assert.equal(result.status,200);assert.equal(calls.length,4);assert.ok(calls[2].url.includes('reserve_video_speech'));
  const payload=JSON.parse(calls[3].options.body);assert.equal(payload.model,'gpt-4o-mini-tts');assert.equal(payload.input,'Сәлем!');assert.equal(result.headers.get('cache-control'),'no-store');
}));
