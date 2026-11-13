import { FORMATS, frameAt, clamp } from './video-model.js';

function path(ctx,x,y,w,h,r) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/2,h/2));
}
function cover(ctx, image, width, height, fit, zoom = 1, pan = 0, cropX=.5,cropY=.5) {
  const iw=image.videoWidth||image.naturalWidth||image.width,ih=image.videoHeight||image.naturalHeight||image.height;
  if(!iw||!ih)return;
  const scale=(fit==='contain'?Math.min(width/iw,height/ih):Math.max(width/iw,height/ih))*zoom;
  ctx.drawImage(image,(width-iw*scale)*cropX+pan,(height-ih*scale)*cropY,iw*scale,ih*scale);
}
function textLines(ctx,text,width) {
  const output=[];
  for(const paragraph of text.split('\n')){
    let line='';
    for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(line+(line?' ':'')+word).width>width&&line){output.push(line);line=word;}
      else line+=(line?' ':'')+word;
    }
    output.push(line);
  }
  return output;
}
export function drawProject(canvas,project,store,time,{safe=false,selected=null,transitions=true}={}) {
  const ctx=canvas.getContext('2d');
  const dimensions=FORMATS[project.format],width=canvas.width,height=canvas.height;
  const ratio=width/dimensions.width;
  ctx.resetTransform();ctx.globalAlpha=1;ctx.fillStyle=project.background;ctx.fillRect(0,0,width,height);
  for(const item of project.layers){
    if(item.hidden||item.type==='audio'||time<item.start||time>=item.end)continue;
    const state=frameAt(item,time);
    const x=state.x*width,y=state.y*height,w=state.w*width,h=state.h*height;
    ctx.save();ctx.globalAlpha=state.opacity;
    ctx.translate(x+w/2,y+h/2);ctx.rotate(state.rotation*Math.PI/180);ctx.translate(-w/2,-h/2);
    if(item.type==='image'||item.type==='video'){
      path(ctx,0,0,w,h,state.radius*width);ctx.clip();
      if(item.entrance==='wipe'){ctx.beginPath();ctx.rect(0,0,w*state.enter,h);ctx.clip();}
      if(state.fit!=='contain'){ctx.fillStyle='#ffffff12';ctx.fillRect(0,0,w,h);}
      const image=store.visual(project,item);
      if(state.shadow){ctx.shadowColor='#00000090';ctx.shadowBlur=width*.04*state.shadow;ctx.shadowOffsetY=width*.02*state.shadow;}
      ctx.filter='brightness('+(state.exposure??1)+') saturate('+(state.saturation??1)+')';
      if(image)cover(ctx,image,w,h,state.fit,state.motion==='zoom'?1+state.progress*.10:state.motion==='pan'?1.08:1,state.motion==='pan'?(state.progress-.5)*w*.06:0,state.cropX??.5,state.cropY??.5);
    }else if(item.type==='shape'){
      let fill=state.color;
      if(state.gradient==='linear'||state.gradient==='radial'){
        const angle=(state.gradientAngle??45)*Math.PI/180;
        const dx=Math.cos(angle)*w/2,dy=Math.sin(angle)*h/2;
        fill=state.gradient==='radial'?ctx.createRadialGradient(w*.5,h*.4,0,w*.5,h*.4,Math.max(w,h)*.8):ctx.createLinearGradient(w/2-dx,h/2-dy,w/2+dx,h/2+dy);
        fill.addColorStop(0,state.color);fill.addColorStop(1,state.gradientColor||state.color);
      }
      ctx.fillStyle=fill;path(ctx,0,0,w,h,state.radius*width);ctx.fill();
    }else{
      let text=state.text;
      if(item.type==='subtitles')text=item.cues.find(cue=>time>=cue.start&&time<cue.end)?.text||'';
      if(!text){ctx.restore();continue;}
      let size=state.fontSize*width;
      ctx.font=state.weight+' '+size+'px "'+state.font+'"';
      let lines=textLines(ctx,text,w-16*ratio);
      const available=Math.max(1,Math.floor(h/(size*1.16)));
      if(lines.length>available){
        size=Math.max(width*.012,Math.min(size,h/(lines.length*1.16)));
        ctx.font=state.weight+' '+size+'px "'+state.font+'"';
        lines=textLines(ctx,text,w-16*ratio);
      }
      if(state.background!=='transparent'){
        ctx.fillStyle=state.background;path(ctx,-10*ratio,-5*ratio,w+20*ratio,Math.min(h,lines.length*size*1.16)+10*ratio,.012*width);ctx.fill();
      }
      ctx.textBaseline='top';ctx.textAlign=state.align;ctx.fillStyle=state.color;
      const tx=state.align==='center'?w/2:state.align==='right'?w:0;
      lines.forEach((line,index)=>{if(index*size*1.16+size<=h+1)ctx.fillText(line,tx,index*size*1.16,w);});
    }
    ctx.restore();
  }
  if(transitions&&project.transition&&project.transition!=='none'){
    const starts=[...new Set(project.layers.filter(i=>i.scene&&i.name==='Фон сцены').map(i=>i.start))].sort((a,b)=>a-b);
    const boundary=starts.find(start=>start>0&&time>=start&&time<start+.35);
    if(boundary!==undefined){
      const outgoing=document.createElement('canvas');outgoing.width=width;outgoing.height=height;
      drawProject(outgoing,project,store,Math.max(0,boundary-.35),{transitions:false});
      const progress=(time-boundary)/.35;
      ctx.save();if(project.transition==='fade')ctx.globalAlpha=1-progress;
      if(project.transition==='slide')ctx.translate(-width*progress,0);
      if(project.transition==='wipe'){ctx.beginPath();ctx.rect(width*progress,0,width*(1-progress),height);ctx.clip();}
      ctx.drawImage(outgoing,0,0);ctx.restore();
    }
  }
  if(safe){
    ctx.save();ctx.strokeStyle='#e4fd8a';ctx.fillStyle='#11182745';ctx.setLineDash([8,7]);ctx.lineWidth=1;
    const inset=project.format==='vertical'?.09:.06,bottom=project.format==='vertical'?.17:.10;
    ctx.fillRect(0,0,width,height*inset);ctx.fillRect(0,height*(1-bottom),width,height*bottom);
    ctx.strokeRect(width*.06,height*inset,width*.88,height*(1-inset-bottom));ctx.restore();
  }
  const target=project.layers.find(item=>item.id===selected);
  if(target&&target.type!=='audio'&&time>=target.start&&time<target.end){
    const state=frameAt(target,time);
    ctx.save();ctx.strokeStyle='#d9f780';ctx.lineWidth=2;ctx.setLineDash([5,3]);
    ctx.strokeRect(state.x*width,state.y*height,state.w*width,state.h*height);ctx.restore();
  }
}
export function hitLayer(project,time,x,y) {
  return [...project.layers].reverse().find(item=>{
    if(item.hidden||item.locked||item.type==='audio'||item.name==='Фон сцены'||time<item.start||time>=item.end)return false;
    const frame=frameAt(item,time);
    return x>=frame.x&&x<=frame.x+frame.w&&y>=frame.y&&y<=frame.y+frame.h;
  });
}
