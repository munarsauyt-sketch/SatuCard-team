'use strict';
// Source spring values: DesignBookmark Motion. Native controls and product handlers remain authoritative.
window.SATUCARD_MOTION_WORKSPACE = ({makeSpring:S, stepSpring:step, wake, mountedComponents, isReduced}) => {
  const $=id=>document.getElementById(id), kk=()=>document.documentElement.lang==='kk';
  const icon=(path)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
  // A compact palette drives existing editor inputs; originals remain inside #editor-form.
  if($('editor-form')){
    const workspace=$('preview'),rail=document.querySelector('.studio-command-rail'),tabs=document.querySelector('.studio-tabs');
    const palette=document.createElement('section');palette.className='motion-palette';palette.setAttribute('aria-label','Быстрые инструменты карточки');
    palette.innerHTML='<div class="motion-palette-top"><div class="motion-palette-tabs"></div><div class="motion-palette-actions"></div></div><details class="motion-quick" open><summary>Быстрые настройки</summary><div class="motion-quick-fields"></div></details>';
    workspace.before(palette);
    palette.querySelector('.motion-palette-tabs').append(tabs);
    if(rail)rail.hidden=true;
    document.querySelector('.studio-layout').classList.add('has-motion-palette');
    const actions=palette.querySelector('.motion-palette-actions');
    for(const id of ['undo-button','redo-button','crop-photo','preview-fit-button']){
      const button=$(id);if(!button)continue;
      if(!button.dataset.morphTip)button.dataset.morphTip=button.getAttribute('aria-label')||button.textContent.trim();
      actions.append(button);
    }
    const ai=document.createElement('button');ai.type='button';ai.textContent='sAI';ai.dataset.morphTip='Открыть sAI';ai.className='studio-quiet-button';
    ai.addEventListener('click',()=>$('open-ai-chat').click());actions.append(ai);
    const fields=palette.querySelector('.motion-quick-fields');
    const bindings=[];
    for(const [id,label] of [['product-name','Название товара'],['product-price','Цена, ₸'],['card-format','Формат карточки'],['accent-color','Акцент']]){
      const original=$(id),wrap=document.createElement('label'),name=document.createElement('span');
      name.textContent=label;wrap.append(name);const proxy=original.cloneNode(true);
      proxy.id='quick-'+id;proxy.removeAttribute('aria-describedby');proxy.removeAttribute('name');proxy.removeAttribute('form');
      proxy.dataset.quickTarget=id;wrap.append(proxy);fields.append(wrap);
      const apply=event=>{original.value=proxy.value;original.dispatchEvent(new Event(event.type,{bubbles:true}));};
      proxy.addEventListener('input',apply);proxy.addEventListener('change',apply);
      bindings.push({original,proxy});
    }
    const priceError=document.createElement('p');priceError.className='motion-quick-error';priceError.id='quick-price-error';priceError.setAttribute('role','status');
    fields.after(priceError);$('quick-product-price').setAttribute('aria-describedby',priceError.id);
    const sync=()=>{bindings.forEach(({original,proxy})=>{if(document.activeElement!==proxy)proxy.value=original.value;});priceError.textContent=$('price-error').textContent;};
    document.addEventListener('satucard:editor-change',sync);document.addEventListener('satucard:editor-ready',sync);sync();
    new MutationObserver(sync).observe($('price-error'),{childList:true,subtree:true,characterData:true});
    const reveal=()=>{const s=S(.97,520,16);s.target=1;const tick=dt=>{const active=step(s,dt);palette.style.transform='scale('+s.x.toFixed(4)+')';return active;};wake(tick);};
    tabs.addEventListener('click',reveal);
    const upload=$('upload-own-photo');upload.classList.add('motion-drop-entry');
    upload.innerHTML='<span class="motion-drop-core">'+icon('M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6')+'</span><span class="motion-drop-copy"><strong>Добавить фото товара</strong><small>Перетащите фото или нажмите · до 10 МБ</small></span><span class="motion-drop-check" aria-hidden="true">✓</span>';
    upload.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
    upload.addEventListener('drop',e=>{e.preventDefault();const files=e.dataTransfer?.files;if(!files?.length)return;$('photo-input').files=files;$('photo-input').dispatchEvent(new Event('change',{bubbles:true}));});
    mountedComponents.push('editor-palette');
  }

  // File Drop: display only real local decode/import progress.
  for(const zone of [$('drop-zone'),$('upload-own-photo')].filter(Boolean)){
    zone.classList.add('motion-drop');
    const core=zone.querySelector('.upload-symbol,.motion-drop-core'),scale=S(1,380,16),lift=S(0,300,26),gulp=S(1,420,14);
    const label=document.createElement('span');label.className='motion-drop-status';zone.append(label);
    // #file-status announces the import once for both drop targets.
    const svgNS='http://www.w3.org/2000/svg', ring=document.createElementNS(svgNS,'svg'), progress=document.createElementNS(svgNS,'circle');
    ring.classList.add('motion-drop-ring');ring.setAttribute('viewBox','0 0 44 44');ring.setAttribute('aria-hidden','true');
    for(const [key,value] of Object.entries({cx:22,cy:22,r:20,pathLength:100,'stroke-dasharray':100,'stroke-dashoffset':100}))progress.setAttribute(key,value);
    ring.append(progress);core?.append(ring);
    const tick=dt=>{const a=step(scale,dt),b=step(lift,dt),c=step(gulp,dt);zone.style.transform='scale('+scale.x.toFixed(4)+')';zone.style.setProperty('--drop-hover',Math.max(0,Math.min(1,lift.x)));if(core)core.style.transform='translateY('+(-5*lift.x).toFixed(2)+'px) scale('+gulp.x.toFixed(4)+')';return a||b||c;};
    const hover=on=>{scale.target=on?1.015:1;lift.target=on?1:0;wake(tick);};
    zone.addEventListener('dragenter',()=>hover(true));zone.addEventListener('dragleave',e=>{if(!zone.contains(e.relatedTarget))hover(false);});
    zone.addEventListener('pointerenter',()=>hover(true));zone.addEventListener('pointerleave',()=>hover(false));
    zone.addEventListener('drop',()=>hover(false));zone.addEventListener('pointerdown',()=>{scale.x=.975;wake(tick);});
    document.addEventListener('satucard:photo-import',e=>{
      const d=e.detail;zone.dataset.importState=d.state;zone.setAttribute('aria-busy',String(d.state==='loading'));
      progress.setAttribute('stroke-dashoffset',d.total?100-100*d.completed/d.total:100);
      label.textContent=d.state==='loading'?(kk()?'Фотолар өңделуде…':'Обрабатываем фото…'):d.state==='done'?(kk()?'Фото қосылды':'Фото добавлено'):d.message;
      if(d.state==='done'){gulp.x=.84;gulp.target=1;}else if(d.state==='error'){scale.x=.985;}
      wake(tick);
    });
  }
  if($('photo-input'))mountedComponents.push('file-drop');

  // Springy input: native password, caret, selection, autofill and validation are preserved.
  for(const id of ['auth-email','auth-password','auth-confirm','email-code']){
    const input=$(id);if(!input)continue;
    const shell=document.createElement('div');shell.className='motion-input';
    input.before(shell);shell.append(input);
    const frame=S(0,300,20),shake=S(0,700,10),caret=S(0,700,32);
    const line=document.createElement('span');line.className='motion-input-line';line.setAttribute('aria-hidden','true');shell.append(line);
    const trail=document.createElement('span');trail.className='motion-caret-trail';trail.setAttribute('aria-hidden','true');shell.append(trail);
    const measure=id==='auth-email'?document.createElement('canvas').getContext('2d'):null;
    const tick=dt=>{
      const a=step(frame,dt),b=step(shake,dt),c=step(caret,dt);
      shell.style.transform='translateX('+shake.x.toFixed(2)+'px)';
      line.style.transform='scale('+Math.max(0,frame.x).toFixed(4)+','+(1+Math.max(0,caret.x)).toFixed(3)+')';
      line.style.opacity=Math.min(1,frame.x).toFixed(3);
      trail.style.opacity=measure?Math.max(0,Math.min(1,caret.x)).toFixed(3):'0';
      trail.style.transform='translateX('+(-6*caret.x).toFixed(2)+'px) scaleY('+(1+.3*caret.x).toFixed(3)+')';
      return a||b||c;
    };
    const clearTrail=()=>{caret.x=caret.v=0;trail.style.opacity='0';};
    input.addEventListener('focus',()=>{frame.target=1;wake(tick);});
    input.addEventListener('blur',()=>{clearTrail();frame.target=0;wake(tick);});
    input.addEventListener('input',e=>{
      if(e.isComposing||isReduced()||!e.data||e.inputType!=='insertText'){clearTrail();return;}
      if(measure){
        if(!input.value.endsWith(e.data)){clearTrail();return;}
        const style=getComputedStyle(input);
        measure.font=style.font||style.fontSize+' '+style.fontFamily;
        const left=input.clientLeft+parseFloat(style.paddingLeft)+measure.measureText(input.value).width-input.scrollLeft;
        trail.style.left=Math.max(0,Math.min(left,input.clientWidth-3))+'px';
      }
      caret.x=1;caret.target=0;wake(tick);
    });
    new MutationObserver(()=>{if(input.getAttribute('aria-invalid')==='true'){shake.v=200;wake(tick);}}).observe(input,{attributes:true,attributeFilter:['aria-invalid']});
    input.addEventListener('select',clearTrail);
    input.addEventListener('compositionstart',clearTrail);
    input.addEventListener('pointerdown',clearTrail);
  }
  if($('auth-form'))mountedComponents.push('auth-springy-input');

  const chat=$('ai-chat');
  if(chat){
    chat.classList.add('motion-prompt');
    const input=$('ai-chat-input'),form=$('ai-chat-form');
    form.querySelector('.ai-input-shell').prepend($('ai-chat-status'));
    input.placeholder=kk()?'Тауар туралы не жазамыз?':'Что написать о вашем товаре?';
    const tags=document.createElement('div');tags.className='motion-tags';tags.setAttribute('role','group');tags.setAttribute('aria-label','Инструкции для sAI');
    tags.innerHTML='<div class="motion-tags-list"></div><input id="ai-tag-input" maxlength="32" aria-label="Добавить инструкцию для sAI" placeholder="Добавить инструкцию…"><span class="motion-tags-help">Enter или запятая · до 6</span>';
    const suggestions=document.createElement('div');suggestions.className='motion-tag-suggestions';
    for(const ru of ['Без эмодзи','Коротко','Для Instagram','Для WhatsApp']){
      const b=document.createElement('button');b.type='button';b.textContent=ru;b.addEventListener('click',()=>add(b.textContent));suggestions.append(b);
    }
    form.querySelector('.ai-input-shell').after(tags,suggestions);
    const values=[],list=tags.querySelector('.motion-tags-list'),tagInput=$('ai-tag-input');
    const status=document.createElement('span');status.className='motion-tag-status';status.setAttribute('role','status');tags.append(status);
    function add(raw){
      const value = raw.trim().replace(/[,\n\r]/g,' ').slice(0,32);
      if (!value || values.includes(value)) { tagInput.value=''; return; }
      if(values.length>=6){status.textContent=kk()?'Ең көбі 6 нұсқау':'Не больше 6 инструкций';return;}
      values.push(value);tagInput.value='';status.textContent='';
      const chip=document.createElement('span');chip.className='motion-tag';const text=document.createElement('span');text.textContent=value;text.dataset.productLabel='';
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Убрать: '+value);
      chip.append(text,remove);list.append(chip);
      const width=chip.getBoundingClientRect().width, w=S(0,340,26,1,.05),s=S(.6,420,16),o=S(0,300,26);
      w.target=width;s.target=1;o.target=1;let removing=false;
      const tick=dt=>{const a=step(w,dt),b=step(s,dt),c=step(o,dt);chip.style.width=Math.max(0,w.x).toFixed(2)+'px';chip.style.transform='scale('+s.x.toFixed(4)+')';chip.style.opacity=Math.max(0,Math.min(1,o.x)).toFixed(3);if(!(a||b||c)&&removing)chip.remove();return a||b||c;};
      remove.addEventListener('click',()=>{if(removing)return;values.splice(values.indexOf(value),1);removing=true;w.target=0;s.target=.6;o.target=0;wake(tick);tagInput.focus();});wake(tick);
    }
    tagInput.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Enter'||e.key===','){e.preventDefault();e.stopPropagation();add(tagInput.value);}
      else if(e.key==='Backspace'&&!tagInput.value){list.lastElementChild?.querySelector('button')?.click();}
    });
    tagInput.addEventListener('blur',()=>add(tagInput.value));
    // Exposed only to the existing submit controller; no separate AI request path.
    chat.getPromptTags = () => { if (tagInput.value.trim()) add(tagInput.value); return values.slice(); };
    document.addEventListener('satucard:chat-reset',()=>{values.length=0;list.replaceChildren();tagInput.value='';});
    const h=S(56,420,34,1,.1),pop=S(1,520,30),sendRow=form.querySelector('.ai-chat-send-row');
    const tick=dt=>{const a=step(h,dt),b=step(pop,dt);input.style.height=Math.max(44,h.x).toFixed(2)+'px';sendRow.style.transform='scale('+pop.x.toFixed(4)+')';return a||b;};
    chat.resizePrompt=()=>{
      if(chat.hidden)return;
      input.style.height='auto';const height=input.scrollHeight;h.target=Math.max(56,Math.min(160,height));input.style.height=h.x+'px';input.style.overflowY=height>160?'auto':'hidden';wake(tick);
    };
    let busy=form.getAttribute('aria-busy');
    new MutationObserver(()=>{const next=form.getAttribute('aria-busy');if(next!==busy&&!chat.hidden){pop.x=.75;wake(tick);}busy=next;}).observe(form,{attributes:true,attributeFilter:['aria-busy']});
    document.addEventListener('satucard:language-change',()=>{input.placeholder=kk()?'Тауар туралы не жазамыз?':'Что написать о вашем товаре?';});
    mountedComponents.push('prompt-box','tag-input');
  }
};
