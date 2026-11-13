import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { templateProject, validateProject } from '../video-model.js';
import { unpackProject } from '../video-storage.js';
import { checkImageHeader, checkImportQuota, checkMediaBundle, MAX_FILE, MAX_TOTAL } from '../video-file-safety.js';

function portable(bytes, {kind='image',type='image/png'}={}) {
  const project=templateProject('launch');
  project.assets.push({id:'user-photo',name:'Photo',kind,duration:0});
  const media=[{id:'user-photo',data:`data:${type};base64,${Buffer.from(bytes).toString('base64')}`}];
  return new Blob([JSON.stringify({app:'SatuCardVideoFile',version:1,project,media})]);
}
function png(width,height) {
  const buffer=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(buffer);buffer.write('IHDR',12);buffer.writeUInt32BE(width,16);buffer.writeUInt32BE(height,20);return buffer;
}
test('portable project rejects huge image dimensions before decoding or replacing a draft',async()=>{
  await assert.rejects(unpackProject(portable(png(10000,5000))),/40 мегапикселей/);
  await assert.rejects(checkImageHeader(new Blob([png(0,50)],{type:'image/png'})),/Повреждённое/);
});
test('portable project rejects MIME confusion and disguised executable markup',async()=>{
  await assert.rejects(unpackProject(portable('fake-audio',{type:'audio/wav'})),/Тип исходника/);
  await assert.rejects(unpackProject(portable('<svg onload="alert(1)"></svg>')),/Повреждённое/);
  const file=JSON.parse(await portable('x').text());file.media[0].id='demo-headphones';
  await assert.rejects(unpackProject(new Blob([JSON.stringify(file)])),/Некорректный исходник/);
});
test('valid JPEG, PNG and WebP headers and portable embedded media still work',async()=>{
  const jpeg=await readFile(new URL('../assets/images/ceramics.jpg',import.meta.url));
  const dimensions=await checkImageHeader(new Blob([jpeg],{type:'image/jpeg'}));assert.ok(dimensions.width>0&&dimensions.height>0);
  const saved=await unpackProject(portable(jpeg,{type:'image/jpeg'}));assert.equal(saved.files.get('user-photo').size,jpeg.length);
  const lossless=Buffer.alloc(30);lossless.write('RIFF');lossless.write('WEBP',8);lossless.write('VP8L',12);lossless[20]=47;
  lossless.writeUInt32LE((19<<14)|9,21);assert.deepEqual(await checkImageHeader(new Blob([lossless],{type:'image/webp'})),{width:10,height:20});
  const extended=Buffer.alloc(30);extended.write('RIFF');extended.write('WEBP',8);extended.write('VP8X',12);extended[24]=9;extended[27]=19;
  assert.deepEqual(await checkImageHeader(new Blob([extended],{type:'image/webp'})),{width:10,height:20});
  const lossy=Buffer.alloc(30);lossy.write('RIFF');lossy.write('WEBP',8);lossy.write('VP8 ',12);lossy.set([157,1,42],23);lossy.writeUInt16LE(10,26);lossy.writeUInt16LE(20,28);
  assert.deepEqual(await checkImageHeader(new Blob([lossy],{type:'image/webp'})),{width:10,height:20});
});
test('quota check re-reads current asset and byte counts after another import commits',()=>{
  const p=templateProject('launch'),files=new Map(),file=new Blob(['photo'],{type:'image/png'});
  p.assets=Array.from({length:39},(_,i)=>({id:String(i)}));checkImportQuota(p,files,file);
  p.assets.push({id:'other-import'});assert.throws(()=>checkImportQuota(p,files,file),/40 исходников/);
  p.assets=[];files.set('existing',{size:MAX_TOTAL-1});assert.throws(()=>checkImportQuota(p,files,file),/100 МБ/);
  const oversized=new Blob();Object.defineProperty(oversized,'size',{value:MAX_FILE+1});assert.throws(()=>checkImportQuota(p,new Map(),oversized),/40 МБ/);
});
test('save boundary checks real Blob types and aggregate byte limits',()=>{
  // Undo can retain more cached sources than the active project has assets.
  const cached=new Map(Array.from({length:41},(_,i)=>[String(i),new Blob(['x'],{type:'image/png'})]));
  assert.doesNotThrow(()=>checkMediaBundle(templateProject('launch'),cached));
  const p=templateProject('launch');p.assets.push({id:'private',kind:'image'});
  assert.throws(()=>checkMediaBundle(p,new Map([['private',{type:'image/png',size:1}]])),/40 МБ/);
  assert.throws(()=>checkMediaBundle(p,new Map([['private',new Blob(['x'],{type:'audio/wav'})]])),/Тип исходника/);
  const file=new Blob(['x'],{type:'image/png'});Object.defineProperty(file,'size',{value:MAX_FILE});
  assert.throws(()=>checkMediaBundle(p,new Map([['private',file],['two',file],['three',file]])),/100 МБ/);
});
test('untrusted layer metadata and gradient values are rejected',()=>{
  for(const change of [p=>p.layers[0].scene={},p=>p.layers[0].role=[],p=>p.layers[0].hidden='false',p=>p.layers[0].gradient='url(https://example.com)',p=>p.layers[0].gradientColor='red;alert(1)',p=>p.layers[0].gradientAngle=Infinity]){
    const p=templateProject('launch');change(p);assert.throws(()=>validateProject(p));
  }
});
