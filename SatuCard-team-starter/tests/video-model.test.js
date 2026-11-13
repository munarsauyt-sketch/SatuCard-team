import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, templateProject, validateProject, frameAt, layer, parseSubtitles, fitToBeats } from '../video-model.js';

test('all 54 video templates have valid bounded layers, demo assets and complete coverage',()=>{
  assert.equal(TEMPLATES.length,54);
  assert.equal(new Set(TEMPLATES.map(template=>template.id)).size,54);
  assert.equal(TEMPLATES.filter(template=>template.vivid).length,24);
  for(const template of TEMPLATES){
    const project=validateProject(templateProject(template.id));
    for(let time=0;time<project.duration;time+=.1)assert.ok(project.layers.some(item=>item.name==='Фон сцены'&&item.start<=time&&item.end>time));
    assert.ok(project.layers.some(item=>item.type==='audio'&&item.volume>0));
    fitToBeats(project,Array.from({length:61},(_,index)=>index*.5));
    validateProject(project);
  }
});
test('project rejects foreign media, non-finite transforms, oversized text and inconsistent types',()=>{
  for(const change of [p=>p.layers[2].assetId='missing',p=>p.layers[1].x=NaN,p=>p.layers[1].text='x'.repeat(3001),p=>p.layers[2].type='video',p=>p.product.features=null,p=>p.duration=31,p=>p.format='constructor',p=>p.assets[0].id='__proto__']){
    const project=templateProject('launch');change(project);assert.throws(()=>validateProject(project));
  }
});
test('keyframes interpolate position, rotation and opacity and hold the endpoint',()=>{
  const item=layer('text',{entrance:'none',exit:'none',keyframes:[{t:0,ease:'linear',x:0,y:0,w:.5,h:.5,rotation:0,opacity:0},{t:1,ease:'linear',x:1,y:1,w:1,h:1,rotation:90,opacity:1}]});
  const middle=frameAt(item,2.5);assert.equal(middle.x,.5);assert.equal(middle.rotation,45);assert.equal(middle.opacity,.5);
  assert.equal(frameAt(item,20).x,1);
});
test('SRT and VTT preserve Kazakh and Russian, strip markup and cap the timeline',()=>{
  const cues=parseSubtitles('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<b>Жаңа өнім</b>\n\n2\n00:00:29,000 --> 00:00:35,000\nНовый товар');
  assert.deepEqual(cues,[{start:0,end:2,text:'Жаңа өнім'},{start:29,end:30,text:'Новый товар'}]);
  assert.throws(()=>parseSubtitles('без таймкодов'));
});
