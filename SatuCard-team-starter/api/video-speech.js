import { configuration } from '../lib/supabase.js';
import { accountJson, accountFailure, AccountError, readAccount } from '../lib/account.js';
import { readBoundedBody } from '../lib/request-body.js';

const enabled=()=>process.env.VIDEO_SPEECH_ENABLED==='true'&&Boolean(process.env.VIDEO_OPENAI_API_KEY)&&/^[0-9a-f-]{36}$/i.test(process.env.VIDEO_SPEECH_OWNER_ID||'');
export async function GET(){return accountJson({available:enabled(),provider:'OpenAI',speechModel:'gpt-4o-mini-tts',transcriptionModel:'whisper-1'});}
export async function POST(request){
  if(!enabled())return accountJson({error:'Речевое подключение подготовлено, но ещё не включено. Запись голоса и импорт SRT доступны без него.'},503);
  const config=configuration();if(!config)return accountJson({error:'Сервер пока не настроен.'},503);
  try{
    const {user}=await readAccount(request,config,{complete:true});
    if(user.id!==process.env.VIDEO_SPEECH_OWNER_ID)throw new AccountError('Тест речевых функций доступен владельцу проекта.',403,'owner_only');
    const bytes=await readBoundedBody(request,1050000);
    const form=await new Response(bytes,{headers:{'content-type':request.headers.get('content-type')||''}}).formData();
    const action=form.get('action'),language=form.get('language');
    if(!['speech','transcribe'].includes(action)||!['ru','kk'].includes(language))throw new AccountError('Проверьте действие и язык.',400,'invalid_input');
    let body,headers={Authorization:'Bearer '+process.env.VIDEO_OPENAI_API_KEY};
    if(action==='speech'){
      const text=form.get('text'),voice=form.get('voice');
      if(typeof text!=='string'||!text.trim()||text.length>400||!['coral','alloy','sage'].includes(voice))throw new AccountError('Нужен текст до 400 символов и один из предложенных голосов.',400,'invalid_input');
      body=JSON.stringify({model:'gpt-4o-mini-tts',input:text,voice,response_format:'mp3',instructions:language==='kk'?'Speak naturally in Kazakh.':'Speak naturally in Russian.'});headers['Content-Type']='application/json';
    }else{
      const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function'||file.size>960044||file.size<46)throw new AccountError('Нужна WAV-запись до 30 секунд.',400,'invalid_audio');
      const data=Buffer.from(await file.arrayBuffer());
      if(data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE'||data.toString('ascii',12,16)!=='fmt '||data.readUInt32LE(16)!==16||data.readUInt16LE(20)!==1||data.readUInt16LE(22)!==1||data.readUInt32LE(24)!==16000||data.readUInt16LE(34)!==16||data.toString('ascii',36,40)!=='data'||data.readUInt32LE(40)!==data.length-44)throw new AccountError('Нужен PCM WAV 16 кГц, моно, 16 бит.',400,'invalid_audio');
      body=new FormData();body.set('file',new Blob([data],{type:'audio/wav'}),'voice.wav');body.set('model','whisper-1');body.set('response_format','verbose_json');body.set('language',language);body.append('timestamp_granularities[]','segment');
    }
    // A shared, atomic request allowance is required before every paid request.
    const reserve=await fetch(config.base+'/rest/v1/rpc/reserve_video_speech',{method:'POST',headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify({p_owner:user.id})});
    if(!reserve.ok||await reserve.json()!==true)throw new AccountError('Тестовый лимит речевых запросов не настроен или исчерпан.',429,'speech_limit');
    const response=await fetch('https://api.openai.com/v1/audio/'+(action==='speech'?'speech':'transcriptions'),{method:'POST',headers,body,signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error('Speech provider request failed');
    if(action==='speech')return new Response(await response.arrayBuffer(),{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}});
    const result=await response.json();
    const segments=(Array.isArray(result.segments)?result.segments:[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.start<30&&typeof s.text==='string').slice(0,200).map(s=>({start:s.start,end:Math.min(s.end,30),text:s.text.slice(0,500)}));
    return accountJson({segments});
  }catch(error){return accountFailure(error);}
}
