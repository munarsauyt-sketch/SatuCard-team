import { FORMATS } from './video-model.js';
import { drawProject } from './video-renderer.js';
import { mixAudio } from './video-media.js';

export async function exportVideo(project,store,{height=1280,signal,onProgress=()=>{}}={}) {
  const { Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,Quality,canEncodeVideo,canEncodeAudio }=await import('./assets/vendor/mediabunny/mediabunny.mjs');
  const format=FORMATS[project.format],ratio=height/Math.max(format.width,format.height);
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(format.width*ratio/2)*2;canvas.height=Math.round(format.height*ratio/2)*2;
  const quality=new Quality({bitrate:height>1280?7e6:4e6});
  if(!await canEncodeVideo('avc',{width:canvas.width,height:canvas.height,quality}))throw new Error('Этот браузер не умеет экспортировать H.264. Откройте студию в актуальном Chrome или Edge на компьютере.');
  const check=()=>{if(signal?.aborted)throw new DOMException('Экспорт отменён','AbortError');};
  check();onProgress(.01,'Подготавливаем медиа');
  await store.prepare(project);
  const audio=await mixAudio(project,store);
  check();
  if(audio&&!await canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48000}))throw new Error('Браузер не поддерживает AAC. Выключите звук или откройте студию в Chrome / Edge.');
  const target=new BufferTarget();
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const videoSource=new CanvasSource(canvas,{codec:'avc',quality});
  output.addVideoTrack(videoSource,{frameRate:project.fps});
  const audioSource=audio?new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:192000})}):null;
  if(audioSource)output.addAudioTrack(audioSource);
  try{
    await output.start();
    const audioTask=audioSource?audioSource.add(audio).then(()=>audioSource.close()):Promise.resolve();
    audioTask.catch(()=>{});
    const frames=Math.ceil(project.duration*project.fps);
    for(let frame=0;frame<frames;frame++){
      check();
      const time=frame/project.fps;
      await store.seek(project,time,true);
      drawProject(canvas,project,store,time);
      await videoSource.add(time,Math.min(1/project.fps,project.duration-time));
      if(frame%6===0){
        onProgress(.05+.90*frame/frames,'Кадр '+(frame+1)+' из '+frames);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    videoSource.close();await audioTask;check();
    onProgress(.97,'Собираем MP4');
    await output.finalize();check();
    return new Blob([target.buffer],{type:'video/mp4'});
  }catch(error){await output.cancel().catch(()=>{});throw error;}
  finally{store.pause();}
}
