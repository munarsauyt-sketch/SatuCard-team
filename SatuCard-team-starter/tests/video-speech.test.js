import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../api/video-speech.js';
const owner='12345678-1234-1234-1234-123456789abc';
async function fixture(fn,{allow=true,user=owner,confirmed=true,complete=true,providerOk=true}={}){
  const names=['VIDEO_SPEECH_ENABLED','VIDEO_OPENAI_API_KEY','VIDEO_SPEECH_OWNER_ID','SUPABASE_URL','SUPABASE_SECRET_KEY'];
  const saved=names.map(n=>process.env[n]),original=global.fetch,calls=[];
  Object.assign(process.env,{VIDEO_SPEECH_ENABLED:'true',VIDEO_OPENAI_API_KEY:'test-only-key',VIDEO_SPEECH_OWNER_ID:owner,SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'test-service-key'});
  global.fetch=async(url,options)=>{calls.push({url:String(url),options});if(String(url).endsWith('/auth/v1/user'))return Response.json({id:user,email_confirmed_at:confirmed?'2026-01-01':null});if(String(url).includes('/profiles?'))return Response.json([{id:user,profile_completed_at:complete?'2026-01-01':null}]);if(String(url).endsWith('/rpc/reserve_video_speech'))return Response.json(allow);if(String(url).includes('api.openai.com'))return new Response(new Uint8Array([1,2,3]),{status:providerOk?200:429,headers:{'Content-Type':'audio/mpeg'}});throw new Error('Unexpected request');};
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

test('speech rejects absent or malformed authentication without any external request',()=>fixture(async calls=>{
  for(const authorization of [null,'Basic anything','Bearer token with spaces']){
    const req=request();if(authorization)req.headers.set('authorization',authorization);else req.headers.delete('authorization');
    assert.equal((await POST(req)).status,401);
  }
  assert.equal(calls.length,0);
}));
test('speech rejects unconfirmed owner before allowance reservation',()=>fixture(async calls=>{
  assert.equal((await POST(request())).status,403);assert.equal(calls.length,1);
},{confirmed:false}));
test('speech rejects incomplete owner before allowance reservation',()=>fixture(async calls=>{
  assert.equal((await POST(request())).status,403);assert.equal(calls.length,2);
},{complete:false}));
test('speech bounds streamed bytes even without Content-Length',()=>fixture(async calls=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(600000));controller.enqueue(new Uint8Array(600000));controller.close();}});
  const req=new Request('https://site.example/api/video-speech',{method:'POST',duplex:'half',headers:{Authorization:'Bearer test','Content-Type':'application/octet-stream'},body});
  assert.equal((await POST(req)).status,413);assert.equal(calls.length,2);
}));
test('speech rejects invalid WAV data and unsupported language before any paid reservation',()=>fixture(async calls=>{
  const form=new FormData();form.set('action','transcribe');form.set('language','ru');form.set('file',new Blob([new Uint8Array(46)],{type:'audio/wav'}),'bad.wav');
  assert.equal((await POST(new Request('https://site.example/api/video-speech',{method:'POST',headers:{Authorization:'Bearer test'},body:form}))).status,400);
  assert.equal(calls.length,2);calls.length=0;
  const req=request();const bad=await req.formData();bad.set('language','unsupported');
  assert.equal((await POST(new Request(req.url,{method:'POST',headers:{Authorization:'Bearer test'},body:bad}))).status,400);assert.equal(calls.length,2);
}));
test('speech provider failures do not refund allowance or expose server secrets',()=>fixture(async calls=>{
  const response=await POST(request());assert.equal(response.status,502);const text=await response.text();
  assert.ok(!text.includes('test-only-key'));assert.equal(calls.filter(c=>c.url.includes('reserve_video_speech')).length,1);assert.equal(calls.filter(c=>c.url.includes('api.openai.com')).length,1);
},{providerOk:false}));
