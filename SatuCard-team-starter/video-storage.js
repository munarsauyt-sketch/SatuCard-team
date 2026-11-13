import { validateProject, DEMOS } from './video-model.js';
import { MAX_TOTAL, MAX_FILE } from './video-media.js';
import { checkMediaBundle, checkImageHeader } from './video-file-safety.js';

const DATABASE = 'satucard-video-v1';
function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('records');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function record(key,value) {
  const db=await database();
  try {
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction('records',value===undefined?'readonly':'readwrite');
      const request=transaction.objectStore('records')[value===undefined?'get':'put'](...(value===undefined?[key]:[value,key]));
      let result;
      request.onsuccess=()=>{result=request.result;};
      transaction.oncomplete=()=>resolve(result);
      transaction.onerror=()=>reject(transaction.error);
      transaction.onabort=()=>reject(transaction.error||new Error('Сохранение прервано.'));
    });
  } finally { db.close(); }
}
export async function saveProject(project,files) {
  validateProject(project);
  checkMediaBundle(project,files);
  await record('active',{project,files:[...files],updatedAt:Date.now()});
}
export async function loadProject() {
  const saved=await record('active');
  if(!saved)return null;
  saved.project=validateProject(saved.project);
  saved.files=new Map(saved.files);
  checkMediaBundle(saved.project,saved.files);
  for(const asset of saved.project.assets)if(!DEMOS[asset.id]&&!saved.files.has(asset.id))throw new Error('В черновике отсутствуют исходные медиа. Откройте сохранённый файл проекта.');
  return saved;
}
export const saveBrand=value=>record('brand',value);
export const loadBrand=()=>record('brand');
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
export async function packProject(project,files) {
  validateProject(project);
  checkMediaBundle(project,files);
  const media=[];
  for(const asset of project.assets){
    if(DEMOS[asset.id])continue;
    const file=files.get(asset.id);
    if(!file)throw new Error('Не найден исходник «'+asset.name+'».');
    media.push({id:asset.id,data:await dataUrl(file)});
  }
  return new Blob([JSON.stringify({app:'SatuCardVideoFile',version:1,project,media})],{type:'application/json'});
}
export async function unpackProject(file) {
  if(file.size>MAX_TOTAL*1.4)throw new Error('Файл проекта слишком большой.');
  const saved=JSON.parse(await file.text());
  if(saved.app!=='SatuCardVideoFile'||saved.version!==1||!Array.isArray(saved.media)||saved.media.length>40)throw new Error('Выберите файл проекта .satuvideo.json.');
  const project=validateProject(saved.project),files=new Map();
  let total=0;
  for(const entry of saved.media){
    if(!project.assets.some(asset=>asset.id===entry.id)||Object.hasOwn(DEMOS,entry.id)||files.has(entry.id)||typeof entry.data!=='string')throw new Error('Некорректный исходник проекта.');
    const match=/^data:((?:image\/(?:jpeg|png|webp)|video\/[\w.+-]+|audio\/[\w.+-]+));base64,([A-Za-z0-9+/=]+)$/.exec(entry.data);
    if(!match)throw new Error('Неподдерживаемый формат исходника.');
    if(match[2].length>4*Math.ceil(MAX_FILE/3))throw new Error('Один файл — до 40 МБ.');
    const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));
    total+=bytes.length;
    if(bytes.length>MAX_FILE||total>MAX_TOTAL)throw new Error('Медиа проекта превышают 100 МБ.');
    files.set(entry.id,new Blob([bytes],{type:match[1]}));
  }
  for(const asset of project.assets)if(!DEMOS[asset.id]&&!files.has(asset.id))throw new Error('В проекте не хватает исходных медиа.');
  checkMediaBundle(project,files);
  for(const asset of project.assets)if(asset.kind==='image'&&files.has(asset.id))await checkImageHeader(files.get(asset.id));
  return {project,files};
}
