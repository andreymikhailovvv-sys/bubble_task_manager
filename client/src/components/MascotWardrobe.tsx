
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LockKeyhole, Shirt, X } from 'lucide-react';
import { api, type MascotVariant, type MascotWardrobeState } from '../lib/api';
import { PlanikMascot, type PlanikMode } from './PlanikMascot';
import './MascotWardrobe.css';

export function useMascotWardrobe(userId?:string, plan?:string, expiresAt?:string|null) {
  const [data,setData]=useState<MascotWardrobeState|null>(null);
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  const owner=useRef(userId);
  owner.current=userId;
  const sequence=useRef(0);
  const refresh=useCallback(async()=>{
    if(!userId)return;
    const call=++sequence.current;
    try {
      const result=await api.getMascotWardrobe();
      if(call===sequence.current&&owner.current===userId&&result.userId===userId){setData(result);setError('');}
    } catch(cause) {
      if(call===sequence.current&&owner.current===userId)setError(cause instanceof Error?cause.message:'Не удалось загрузить гардероб.');
    }
  },[userId]);
  useEffect(()=>{
    setOpen(false);
    setData(null);
    setError('');
    return ()=>{sequence.current++;};
  },[userId,refresh]);
  useEffect(()=>{if(userId)void refresh();},[plan,expiresAt,refresh,userId]);
  useEffect(()=>{
    if(!userId)return;
    const focus=()=>void refresh();
    window.addEventListener('focus',focus);
    return()=>window.removeEventListener('focus',focus);
  },[userId,refresh]);
  const current=data?.userId===userId?data:null;
  useEffect(()=>{
    if(!current?.expiresAt||!current.rank)return;
    const delay=Math.max(0,new Date(current.expiresAt).getTime()-Date.now());
    const timer=window.setTimeout(()=>void refresh(),Math.min(delay+50,2_147_000_000));
    return()=>window.clearTimeout(timer);
  },[current?.expiresAt,current?.rank,refresh]);
  const rank=current?.expiresAt&&new Date(current.expiresAt).getTime()>Date.now()?current.rank:0;
  const selected=(variant:MascotVariant)=>{
    const id=current?.selected[variant]??'classic';
    const skin=current?.catalog.find(item=>item.id===id&&item.variant===variant);
    return skin&&skin.rank<=rank?id:'classic';
  };
  const show=useCallback(()=>{setOpen(true);void refresh();},[refresh]);
  const save=useCallback(async(variant:MascotVariant,skinId:string)=>{
    if(!userId)throw new Error('Войдите в аккаунт.');
    const call=++sequence.current;
    const result=await api.equipMascotSkin(variant,skinId);
    if(owner.current!==userId||result.userId!==userId)throw new Error('Аккаунт изменился.');
    if(call===sequence.current){setData(result);setError('');}
    else void refresh();
    return result;
  },[userId,refresh]);
  return {data:current,error,rank,selected,open:open&&Boolean(userId),show,close:()=>setOpen(false),save,refresh};
}
export type MascotWardrobeController=ReturnType<typeof useMascotWardrobe>;
export function MascotWardrobeTrigger({onClick}:{onClick:()=>void}) {
  const button=useRef<HTMLButtonElement>(null);
  const [hovered,setHovered]=useState(false);
  const hideTimer=useRef<number|undefined>(undefined);
  const cancelHide=()=>window.clearTimeout(hideTimer.current);
  useEffect(()=>{
    const anchor=button.current?.closest('.mascot-wardrobe-anchor');
    if(!anchor)return;
    const isTarget=(target:EventTarget|null)=>target instanceof Element &&
      Boolean(target.closest('.planik-body-surface,.mascot-wardrobe-trigger'));
    const enter=(event:Event)=>{if(isTarget(event.target)){window.clearTimeout(hideTimer.current);setHovered(true);}};
    const leave=(event:Event)=>{
      const pointer=event as PointerEvent;
      if(isTarget(pointer.target)&&!isTarget(pointer.relatedTarget)){
        window.clearTimeout(hideTimer.current);
        // Briefly bridge the small gap between the painted torso and the button.
        hideTimer.current=window.setTimeout(()=>setHovered(false),220);
      }
    };
    anchor.addEventListener('pointerover',enter);
    anchor.addEventListener('pointerout',leave);
    return()=>{anchor.removeEventListener('pointerover',enter);anchor.removeEventListener('pointerout',leave);window.clearTimeout(hideTimer.current);};
  },[]);
  return <button ref={button} type="button" className="mascot-wardrobe-trigger" data-hovered={hovered}
    aria-haspopup="dialog" onClick={event=>{
      event.stopPropagation();
      cancelHide();setHovered(false);
      // Pointer activation must not leave a sticky focus-within state on return.
      // Keyboard activation retains the native dialog focus restoration.
      if(event.detail>0)event.currentTarget.blur();
      onClick();
    }}><Shirt size={12}/>Аксессуары и скины</button>;
}
const tier=(rank:number)=>rank===3?'Максимум':rank===2?'Про':'Бесплатно';
export function MascotWardrobeDialog({wardrobe,variant,theme}:{wardrobe:MascotWardrobeController;variant:MascotVariant;theme:'light'|'dark'}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  const [selected,setSelected]=useState(()=>wardrobe.selected(variant));
  const [displayed,setDisplayed]=useState(selected);
  const [phase,setPhase]=useState<'idle'|'leaving'|'entering'|'showing'>('idle');
  const [previewMode,setPreviewMode]=useState<Exclude<PlanikMode,'showcase'>>('idle');
  const [replay,setReplay]=useState(0);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const timers=useRef<number[]>([]);
  const close=wardrobe.close;
  const closeRef=useRef(close);
  closeRef.current=close;
  useEffect(()=>{
    const element=dialog.current;
    if(!element)return;
    const previous=document.activeElement as HTMLElement|null;
    element.showModal();
    return()=>{if(element.open)element.close();previous?.focus({preventScroll:true});};
  },[]);
  useEffect(()=>()=>timers.current.forEach(id=>window.clearTimeout(id)),[]);
  const select=(id:string)=>{
    if(id===selected||saving)return;
    timers.current.forEach(timer=>window.clearTimeout(timer));timers.current=[];
    setSelected(id);setSaveError('');setPreviewMode('idle');
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setDisplayed(id);setPhase('idle');return;}
    setPhase('leaving');
    timers.current.push(window.setTimeout(()=>{
      setDisplayed(id);setPhase('entering');
      timers.current.push(window.setTimeout(()=>setPhase('idle'),440));
    },220));
  };
  const catalog=wardrobe.data?.catalog.filter(skin=>skin.variant===variant)??[];
  const list=useRef<HTMLElement>(null);
  const [moreBelow,setMoreBelow]=useState(false);
  const updateListFade=useCallback(()=>{
    const element=list.current;
    if(element)setMoreBelow(element.scrollHeight-element.clientHeight-element.scrollTop>2);
  },[]);
  useEffect(()=>{
    const element=list.current;
    if(!element)return;
    updateListFade();
    const observer=new ResizeObserver(updateListFade);
    observer.observe(element);
    // Items can load or change height independently of the viewport.
    Array.from(element.children).forEach(child=>observer.observe(child));
    return()=>observer.disconnect();
  },[catalog.length,updateListFade]);
  const skin=catalog.find(item=>item.id===selected);
  const allowed=Boolean(skin&&skin.rank<=wardrobe.rank);
  const specialModes: Exclude<PlanikMode,'showcase'>[] = selected==='banker'?['idle','typing','hover']:['wizard','pirate','space'].includes(selected)?['idle','hover','thinking']:['northern','zoomer','ninja'].includes(selected)?['idle','hover']:[];
  const isEquipped=selected===wardrobe.selected(variant);
  const equip=async()=>{
    if(!allowed||isEquipped||saving)return;
    setSaving(true);setSaveError('');
    try {await wardrobe.save(variant,selected);}
    catch(cause){setSaveError(cause instanceof Error?cause.message:'Не удалось сохранить образ.');void wardrobe.refresh();}
    finally{setSaving(false);}
  };
  return createPortal(<dialog ref={dialog} className="mascot-wardrobe-dialog" data-theme={theme} aria-labelledby={titleId}
    onCancel={event=>{event.preventDefault();closeRef.current();}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
    <section className="mascot-wardrobe-shell">
      <header className="mascot-wardrobe-header"><div><span className="mascot-wardrobe-kicker">ГАРДЕРОБ · {variant==='planner'?'ПЛАНИК':'ЭКОНОМЫЧ'}</span><h2 id={titleId}>Аксессуары и скины</h2><p>Примеряйте любые образы и выбирайте свой стиль.</p></div><button type="button" className="mascot-wardrobe-close" onClick={close} aria-label="Закрыть гардероб"><X size={20}/></button></header>
      <div className="mascot-wardrobe-content">
        <div className="mascot-wardrobe-list-wrap" data-more-below={moreBelow}>
        <nav ref={list} onScroll={updateListFade} className="mascot-wardrobe-list" aria-label="Скины">
          <span className="mascot-wardrobe-list-label">СКИНЫ</span>
          {catalog.map(item=><button type="button" key={item.id} aria-pressed={item.id===selected} className={'mascot-wardrobe-option'+(item.id===selected?' is-selected':'')} onClick={()=>select(item.id)} disabled={saving}>
            <span className="mascot-wardrobe-option-title">{item.name}{item.id===wardrobe.selected(variant)?<Check size={14} aria-label="Выбран"/>:null}</span>
            <span className={'mascot-wardrobe-tier tier-'+item.rank}>{item.rank>wardrobe.rank?<LockKeyhole size={10}/>:null}{tier(item.rank)}</span>
          </button>)}
          {!catalog.length&&<p className="mascot-wardrobe-message">{wardrobe.error||'Загружаем образы…'}</p>}
        </nav>
        <span className="mascot-wardrobe-list-fade" aria-hidden="true"/>
        </div>
        <div className="mascot-wardrobe-preview">
          <div className="mascot-wardrobe-stage" aria-label={'Примерка: '+(skin?.name??'Классический')}>
            <div key={displayed} className={'mascot-wardrobe-character phase-'+phase}>
              <PlanikMascot key={replay} variant={variant} skinId={displayed} previewMode={previewMode}/>
            </div>
          </div>
          <div className="mascot-wardrobe-details"><span className={'mascot-wardrobe-tier tier-'+(skin?.rank??0)}>{tier(skin?.rank??0)}</span><h3>{skin?.name??'Классический'}</h3><p>{skin?.description??'Выберите образ из коллекции.'}</p></div>
          {specialModes.length>0&&<div className="mascot-wardrobe-animations" aria-label="Особые анимации">
            <span>Особые анимации:</span>
            <div>{specialModes.map(mode=>{
              return <button key={mode} type="button" aria-pressed={previewMode===mode} disabled={phase==='leaving'||phase==='entering'} onClick={()=>{setPreviewMode(mode);setReplay(v=>v+1);}}>{mode==='idle'?'Ожидание':mode==='hover'?'Наведение курсора':mode==='typing'?'Формирует ответ':'Думает'}</button>;
            })}</div>
          </div>}
          <div className="mascot-wardrobe-actions">
            <button type="button" className="mascot-wardrobe-apply" disabled={!allowed||isEquipped||saving||phase==='leaving'||phase==='entering'} onClick={()=>void equip()}>{saving?'Сохраняем…':!allowed&&skin?<><LockKeyhole size={15}/>Тариф «{tier(skin.rank)}»</>:isEquipped?<><Check size={16}/>Уже выбран</>:'Применить образ'}</button>
            <p role={saveError?'alert':undefined}>{saveError||(!allowed&&skin?'Примерка доступна всем. Для применения нужна подписка.':'Выбор сохраняется в вашем аккаунте.')}</p>
          </div>
        </div>
      </div>
    </section>
  </dialog>,document.body);
}
