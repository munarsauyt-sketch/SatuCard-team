import { DEMOS, MUSIC, clamp } from './video-model.js';

export const MAX_FILE = 40 * 1024 * 1024;
export const MAX_TOTAL = 100 * 1024 * 1024;
export class MediaStore {
  constructor() {
    this.files = new Map();
    this.images = new Map();
    this.videos = new Map();
    this.urls = new Map();
    this.audio = new Map();
    this.context = null;
  }
  url(asset) {
    if (DEMOS[asset.id]) return 'assets/images/' + DEMOS[asset.id] + '.jpg';
    if (!this.urls.has(asset.id)) {
      const file = this.files.get(asset.id);
      if (!file) throw new Error('Не найден файл «' + asset.name + '». Откройте проект с исходными медиа.');
      this.urls.set(asset.id, URL.createObjectURL(file));
    }
    return this.urls.get(asset.id);
  }
  async image(asset) {
    if (!this.images.has(asset.id)) {
      const image = new Image();
      image.src = this.url(asset);
      await image.decode();
      this.images.set(asset.id, image);
    }
    return this.images.get(asset.id);
  }
  async video(asset, layerId) {
    const key = layerId + ':' + asset.id;
    if (!this.videos.has(key)) {
      const video = document.createElement('video');
      video.preload = 'auto'; video.muted = true; video.playsInline = true;
      const ready = new Promise((resolve, reject) => {
        const timer=setTimeout(() => reject(new Error('Видео долго загружается. Попробуйте другой файл.')), 15000);
        video.onloadeddata = () => {clearTimeout(timer);resolve();};
        video.onerror = () => {clearTimeout(timer);reject(new Error('Браузер не прочитал видео «' + asset.name + '». Попробуйте MP4 с H.264.'));};
      });
      video.src = this.url(asset);
      await ready;
      this.videos.set(key, video);
    }
    return this.videos.get(key);
  }
  async prepare(project) {
    await Promise.all(project.layers.filter(item=>item.assetId && item.type !== 'audio').map(async item => {
      const asset = project.assets.find(asset=>asset.id===item.assetId);
      if (asset.kind === 'image') await this.image(asset);
      if (asset.kind === 'video') await this.video(asset, item.id);
    }));
  }
  visual(project, item) {
    const asset = project.assets.find(asset=>asset.id===item.assetId);
    return asset?.kind === 'video' ? this.videos.get(item.id+':'+asset.id) : this.images.get(asset?.id);
  }
  async seek(project, time, exact = false, playing = false) {
    const promises = [];
    for (const item of project.layers.filter(item=>item.assetId)) {
      const asset = project.assets.find(asset=>asset.id===item.assetId);
      if (asset?.kind !== 'video') continue;
      const video = await this.video(asset, item.id);
      if (item.hidden || time<item.start || time>=item.end) { video.pause(); continue; }
      const target = Math.min(Math.max(0, video.duration-.04), item.offset+(time-item.start));
      if (exact) {
        video.pause();
        if (Math.abs(video.currentTime-target)>.004) {
          promises.push(new Promise((resolve,reject)=>{
            const done=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);resolve();};
            const timer=setTimeout(()=>{video.removeEventListener('seeked',done);reject(new Error('Не удалось прочитать кадр видео.'));},10000);
            video.addEventListener('seeked',done,{once:true});
            video.currentTime=target;
          }));
        }
      } else {
        if (Math.abs(video.currentTime-target)>.18) video.currentTime=target;
        if (playing && target<video.duration-.05) video.play().catch(()=>{});
        else video.pause();
      }
    }
    await Promise.all(promises);
  }
  pause() { for (const video of this.videos.values()) video.pause(); }
  async decode(asset) {
    if (!this.audio.has(asset.id)) {
      this.context ||= new AudioContext();
      const file=this.files.get(asset.id);
      if (!file) throw new Error('Не найден аудиофайл.');
      try { this.audio.set(asset.id,await this.context.decodeAudioData(await file.arrayBuffer())); }
      catch (_) { throw new Error('Не удалось прочитать звук «'+asset.name+'». Выключите его громкость или загрузите MP3/WAV.'); }
    }
    return this.audio.get(asset.id);
  }
  dispose() {
    this.pause();
    for (const video of this.videos.values()) { video.removeAttribute('src'); video.load(); }
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.context?.close();
  }
}
export async function inspectFile(file) {
  if (file.size>MAX_FILE || !file.size) throw new Error('Один файл — до 40 МБ.');
  const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : null;
  if (!kind || (kind === 'image' && !['image/jpeg','image/png','image/webp'].includes(file.type))) throw new Error('Поддерживаются JPG, PNG, WebP, видео MP4/WebM и аудио MP3/WAV/M4A.');
  let duration=0;
  if (kind !== 'image') {
    const element=document.createElement(kind==='video'?'video':'audio');
    const url=URL.createObjectURL(file);
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Не удалось прочитать медиа.')),12000);
        element.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
        element.onerror=()=>{clearTimeout(timer);reject(new Error('Браузер не поддерживает этот файл.'));};
        element.src=url;
      });
      duration=element.duration;
      if (!(duration>0&&Number.isFinite(duration)&&duration<=3600)) throw new Error('Длительность исходника должна быть меньше часа.');
    } finally { element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url); }
  }
  return { id:crypto.randomUUID(),kind,name:file.name.slice(0,200),duration };
}

function synthetic(context, type, duration) {
  const sampleRate=context.sampleRate;
  const music=MUSIC[type], length=Math.max(.1,duration);
  const buffer=context.createBuffer(2,Math.ceil(sampleRate*length),sampleRate);
  const left=buffer.getChannelData(0),right=buffer.getChannelData(1);
  let seed=1729;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
  const note=(time,seconds,fn,pan=0)=>{
    const start=Math.round(time*sampleRate),n=Math.ceil(seconds*sampleRate);
    for(let i=0;i<n&&start+i<left.length;i++){
      const value=fn(i/sampleRate);
      left[start+i]+=value*(1-pan*.5);right[start+i]+=value*(1+pan*.5);
    }
  };
  const tau=Math.PI*2;
  if (music) {
    const beat=60/music.bpm,roots=[110,87.307,130.813,97.999];
    for(let index=0;index*beat<length;index++){
      const time=index*beat,root=roots[Math.floor(index/8)%4];
      note(time,.3,t=>Math.sin(tau*(48*t+1.7*(1-Math.exp(-t*30))))*Math.exp(-t*18)*.36);
      note(time+beat*.5,.07,t=>random()*Math.exp(-t*80)*.07,index%2?.6:-.6);
      if(index%2)note(time,.15,t=>random()*Math.exp(-t*34)*.10);
      note(time+beat*.5,beat*.7,t=>Math.sin(tau*root*t)*Math.exp(-t*7)*.19);
      const ratio=[1,1.25,1.5,2][index%4];
      note(time,.6,t=>(Math.sin(tau*root*4*ratio*t)+.2*Math.sin(tau*root*8*ratio*t))*Math.min(1,t*300)*Math.exp(-t*8)*.07,index%2?.4:-.4);
      if(index%4===0)for(const interval of [1,1.25,1.5])note(time,beat*4,t=>Math.sin(tau*root*2*interval*t)*Math.min(1,t*8)*Math.min(1,(beat*4-t)*4)*.025);
    }
  } else if(type==='whoosh')note(0,length,t=>random()*Math.sin(Math.PI*t/length)**2*.32);
  else if(type==='impact')note(0,length,t=>(Math.sin(tau*55*t)+random()*.18)*Math.exp(-t*9)*.55);
  else if(type==='tap')note(0,Math.min(.1,length),t=>(random()+Math.sin(tau*1500*t))*.2*Math.exp(-t*70));
  else [660,880,1320].forEach((f,i)=>note(i*.055,length-i*.055,t=>Math.sin(tau*f*t)*Math.exp(-t*7)*.13));
  return buffer;
}
export async function mixAudio(project, store) {
  const layers=project.layers.filter(item=>!item.hidden&&item.volume>0&&(item.type==='audio'||item.type==='video'));
  if (!layers.length) return null;
  const context=new OfflineAudioContext(2,Math.ceil(project.duration*48000),48000);
  const compressor=context.createDynamicsCompressor();
  compressor.threshold.value=-6;compressor.knee.value=4;compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.12;
  compressor.connect(context.destination);
  for(const item of layers){
    const asset=project.assets.find(asset=>asset.id===item.assetId);
    const buffer=item.builtin ? synthetic(context,item.builtin,item.end-item.start+item.offset) : await store.decode(asset);
    const offset=item.offset;
    const duration=Math.min(item.end-item.start,Math.max(0,buffer.duration-offset));
    if(duration<=0)continue;
    const source=context.createBufferSource(),gain=context.createGain();
    source.buffer=buffer;source.connect(gain);gain.connect(compressor);
    const fadeIn=Math.min(item.fadeIn,duration/2),fadeOut=Math.min(item.fadeOut,duration/2);
    gain.gain.setValueAtTime(fadeIn?0:item.volume,item.start);
    gain.gain.linearRampToValueAtTime(item.volume,item.start+fadeIn);
    gain.gain.setValueAtTime(item.volume,item.start+duration-fadeOut);
    gain.gain.linearRampToValueAtTime(0,item.start+duration);
    source.start(item.start,offset,duration);
  }
  return context.startRendering();
}
export function detectBeats(buffer) {
  const data=buffer.getChannelData(0),step=Math.round(buffer.sampleRate*.025);
  const energies=[];
  for(let offset=0;offset<data.length;offset+=step){
    let energy=0;
    for(let i=offset;i<Math.min(offset+step,data.length);i++)energy+=data[i]*data[i];
    energies.push(energy/step);
  }
  const beats=[];
  for(let i=2;i<energies.length-2;i++){
    const local=energies.slice(Math.max(0,i-20),i).reduce((sum,v)=>sum+v,0)/Math.min(i,20);
    const time=i*.025;
    if(energies[i]>local*1.45&&energies[i]>energies[i-1]&&energies[i]>=energies[i+1]&&time-(beats.at(-1)||-1)>.28)beats.push(time);
  }
  return beats.slice(0,120);
}
