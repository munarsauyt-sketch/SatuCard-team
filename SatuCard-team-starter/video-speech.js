export async function speechRequest({action,text,voice,language,file}){
  const session=await window.SATUCARD_AUTH?.getSession();
  if(!session?.access_token)throw new Error('Для речевых функций войдите в аккаунт SatuCard.');
  const body=new FormData();body.set('action',action);body.set('language',language);
  if(file)body.set('file',file,'voice.wav');else{body.set('text',text);body.set('voice',voice);}
  const response=await fetch('/api/video-speech',{method:'POST',headers:{Authorization:'Bearer '+session.access_token},body,signal:AbortSignal.timeout(90000)});
  if(!response.ok){const value=await response.json().catch(()=>null);throw new Error(value?.error||'Речевой сервис недоступен.');}
  return action==='speech'?response.blob():response.json();
}
export function wavBlob(buffer,offset,duration,speed=1){
  const rate=16000,length=Math.max(1,Math.floor(Math.min(duration,(buffer.duration-offset)/speed)*rate));
  const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes),put=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
  put(0,'RIFF');view.setUint32(4,36+length*2,true);put(8,'WAVE');put(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');view.setUint32(40,length*2,true);
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  for(let i=0;i<length;i++){const source=Math.floor((offset+i/rate*speed)*buffer.sampleRate);const value=channels.reduce((sum,c)=>sum+(c[source]||0),0)/channels.length;view.setInt16(44+i*2,Math.max(-1,Math.min(1,value))*32767,true);}
  return new Blob([bytes],{type:'audio/wav'});
}
