import test from 'node:test';
import assert from 'node:assert/strict';
import {templateProject,validateProject,TEMPLATES,layer} from '../video-model.js';
import {scenes,reorderScene,duplicateScene,removeScene,openingVariant,adaptFormat,parseCatalog,snapTime,catalogProject} from '../video-workflow.js';
import {POST} from '../api/video-speech.js';

test('scene reorder preserves relative timing and a duplicate can be removed without changing total coverage',()=>{
  const p=templateProject('launch'),list=scenes(p),first=list[0].id;
  reorderScene(p,first,1);assert.equal(scenes(p)[1].id,first);assert.equal(p.duration,12);validateProject(p);
  duplicateScene(p,first);assert.equal(p.duration,16);assert.equal(scenes(p).length,4);validateProject(p);
  removeScene(p,scenes(p)[2].id);assert.equal(p.duration,12);validateProject(p);
});
test('all templates adapt into valid wide square and portrait compositions without modifying original',()=>{
  for(const t of TEMPLATES){const original=templateProject(t.id),json=JSON.stringify(original);for(const format of ['wide','square','vertical']){const p=adaptFormat(original,format);assert.equal(p.format,format);validateProject(p);}assert.equal(JSON.stringify(original),json);}
});
test('scene copies retain short transition sounds and shift later cues without stretching effects',()=>{
  const p=templateProject('launch'),second=scenes(p)[1],effect=p.layers.find(i=>i.followScene===second.id);
  const effectLength=effect.end-effect.start;
  p.layers.push(layer('subtitles',{end:12,cues:[{start:1,end:3,text:'Один'},{start:8,end:10,text:'Три'}]}));
  duplicateScene(p,scenes(p)[0].id);
  assert.ok(Math.abs(effect.end-effect.start-effectLength)<.001);assert.ok(Math.abs(effect.start-7.78)<.001);
  assert.deepEqual(p.layers.find(i=>i.type==='subtitles').cues.map(c=>[c.start,c.end]),[[1,3],[12,14]]);
  const before=p.layers.filter(i=>i.followScene).length;
  duplicateScene(p,second.id);
  assert.equal(p.layers.filter(i=>i.followScene).length,before+1);
  assert.ok(p.layers.filter(i=>i.followScene).every(i=>i.end-i.start<.53));
});
test('scene deletion cuts subtitle time and keeps the next transition attached',()=>{
  const p=templateProject('launch'),second=scenes(p)[1],third=scenes(p)[2];
  p.layers.push(layer('subtitles',{end:12,cues:[{start:1,end:3,text:'Один'},{start:5,end:7,text:'Два'},{start:8,end:10,text:'Три'}]}));
  removeScene(p,second.id);
  assert.equal(p.duration,8);
  assert.deepEqual(p.layers.find(i=>i.type==='subtitles').cues.map(c=>[c.start,c.end]),[[1,3],[4,6]]);
  const effect=p.layers.find(i=>i.followScene===third.id);
  assert.ok(Math.abs(effect.start-3.78)<.001);assert.ok(Math.abs(effect.end-4.3)<.001);
});
test('overlapping scene operations are rejected before changing the montage',()=>{
  const p=templateProject('launch'),second=scenes(p)[1];second.items.forEach(i=>i.start-=1);
  const before=JSON.stringify(p);
  assert.throws(()=>duplicateScene(p,second.id),/перекрывающиеся/);assert.equal(JSON.stringify(p),before);
  assert.throws(()=>removeScene(p,second.id),/перекрывающиеся/);assert.equal(JSON.stringify(p),before);
});
test('catalog preserves a long product title while keeping a valid project name',()=>{
  const p=templateProject('launch'),title='Т'.repeat(120),row=parseCatalog('title;price;image\n'+title+';100;a.jpg')[0];
  const copy=catalogProject(p,row,p.assets[1]);assert.equal(copy.name.length,100);assert.equal(copy.product.title,title);validateProject(copy);
});
test('opening variants only change the opening and preserve seller claims',()=>{
  const p=templateProject('launch'),first=scenes(p)[0];const offer=openingVariant(p,'offer');assert.equal(scenes(offer)[0].items.find(i=>i.name==='Заголовок').text,p.product.price);
  assert.deepEqual(offer.layers.filter(i=>i.scene!==first.id),p.layers.filter(i=>i.scene!==first.id));
});
test('catalog handles quoted delimiters and rejects missing image or oversized batches',()=>{
  const rows=parseCatalog('title;price;image\n"Кружка; белая";4900 ₸;cup.jpg');assert.equal(rows[0].title,'Кружка; белая');
  assert.throws(()=>parseCatalog('title;price;image\nЧашка;100;'));
  assert.throws(()=>parseCatalog('title;price;image\n'+Array(11).fill('X;1;x.jpg').join('\n')));
  const p=templateProject('launch');const copy=catalogProject(p,rows[0],p.assets[1]);assert.ok(copy.layers.filter(i=>i.role==='product').every(i=>i.assetId===p.assets[1].id));assert.equal(p.product.title,'Беспроводные наушники');
});
test('timeline snap respects a pixel threshold and excludes selected layers',()=>{
  const p=templateProject('launch');assert.equal(snapTime(p,3.95,[],55),4);assert.equal(snapTime(p,3.6,[],55),3.6);
});
test('speech integration is disabled without explicit activation and makes no outbound request',async()=>{
  const saved=process.env.VIDEO_SPEECH_ENABLED;delete process.env.VIDEO_SPEECH_ENABLED;const original=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw new Error('not expected');};
  try{const result=await POST(new Request('http://localhost/api/video-speech',{method:'POST'}));assert.equal(result.status,503);assert.equal(calls,0);}finally{global.fetch=original;if(saved===undefined)delete process.env.VIDEO_SPEECH_ENABLED;else process.env.VIDEO_SPEECH_ENABLED=saved;}
});
