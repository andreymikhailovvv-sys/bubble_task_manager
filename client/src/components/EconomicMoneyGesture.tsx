import { useLayoutEffect, useRef } from 'react';
import { ShirtArm } from './ShirtMascotSkins';

export type FinancialMascotMode = 'income' | 'expense';
export const FINANCIAL_MASCOT_EVENT = 'economych-operation-recorded';
export function announceEconomicOperation(kind: unknown) {
  if (kind === 'INCOME' || kind === 'EXPENSE')
    window.dispatchEvent(new CustomEvent(FINANCIAL_MASCOT_EVENT, {detail:kind==='INCOME'?'income':'expense'}));
}
// Only fresh server replies or a successful manual approval may trigger
// the celebration; loading old history must never replay it.
const celebratedProposalIds = new Set<string>();
export function announceAppliedEconomicProposals(proposals?: ReadonlyArray<{id:string;status:string;entity:string;action:string;payload?: Record<string, unknown> | null}>) {
  for (const item of proposals ?? []) {
    if(item.status!=='APPLIED'||item.entity!=='operation'||item.action!=='create'||celebratedProposalIds.has(item.id))continue;
    if(item.payload?.kind!=='INCOME'&&item.payload?.kind!=='EXPENSE')continue;
    celebratedProposalIds.add(item.id);
    if(celebratedProposalIds.size>500)celebratedProposalIds.delete(celebratedProposalIds.values().next().value!);
    announceEconomicOperation(item.payload.kind);
  }
}
function Bill({x,y}:{x:number;y:number}) {
  return <g transform={`translate(${x} ${y})`}>
    <rect x="-17" y="-9" width="34" height="18" rx="2" fill="#73ba83" stroke="#275943" strokeWidth="1.5"/>
    <rect x="-13" y="-5" width="26" height="10" rx="2" fill="#b1d3a0"/>
    <circle r="5" fill="#6baf78" stroke="#275943"/><path d="M-11 0h4M7 0h4" stroke="#275943"/>
  </g>;
}
function Coin({x,y,i}:{x:number;y:number;i:number}){
  return i%4===3 ? <g transform={`translate(${x} ${y})`}><path d="M-9 -4L-4 -11H4L9 -4L0 9Z" fill={i%2?'#ea4872':'#46bdd7'} stroke="#ffe29a" strokeWidth="2"/><path d="M-9 -4H9M-4 -11L0 9L4 -11" fill="none" stroke="#fff" strokeOpacity=".55"/></g>
    : <g transform={`translate(${x} ${y})`}><ellipse rx="11" ry="8" fill="#e49a28" stroke="#8a5017" strokeWidth="2"/><ellipse rx="8" ry="5" fill="#ffda65" stroke="#fff0ae"/><path d="M-3 -3H3L-2 3H3" stroke="#c17a1d" fill="none"/></g>;
}
// Every banknote or coin uses the same animation clock as the corresponding
// throwing or gathering hand. A burst is released once per completed gesture.
const clamp=(x:number)=>Math.min(1,Math.max(0,x));
const ease=(x:number)=>{const p=clamp(x);return p*p*(3-2*p);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;

export function EconomicMoneyGesture({mode,skinId,suffix}:{mode:FinancialMascotMode;skinId:string;suffix:string}){
  const king=skinId==='king',banker=skinId==='banker',income=mode==='income';
  const ref=useRef<SVGGElement>(null);

  useLayoutEffect(()=>{
    const root=ref.current;
    if(!root)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const nodes=Array.from(root.querySelectorAll<SVGGElement>('[data-money]'));
    const arms=['left','right'].map(side=>({
      paths:Array.from(root.querySelectorAll<SVGPathElement>('[data-arm="'+side+'"],[data-arm="'+side+'-sleeve"]')),
      hand:root.querySelector<SVGGElement>('[data-hand="'+side+'"]')
    }));
    const moveHand=(i:number,x:number,y:number,cx:number,cy:number)=>{
      const d='M'+(i===0?132:298)+' 194Q'+cx+' '+cy+' '+x+' '+y;
      arms[i].paths.forEach(path=>path.setAttribute('d',d));
      arms[i].hand?.setAttribute('transform','translate('+x+' '+y+')');
    };
    let raf=0,started=performance.now();
    const draw=(elapsed:number)=>{
      const duration=king&&income?2.05:1.4;
      const t=(elapsed%duration)/duration;
      if(king&&income){
        // The coins are the pile itself, visible before the hands move.
        // Each coin keeps its identity while both hands sweep across the pile
        // and pull those same coins towards the king's lap.
        const approach=ease(t/.19),sweep=ease((t-.22)/.43);
        const hug=ease((t-.63)/.18),reset=ease((t-.88)/.11);
        const sweepX=mix(mix(mix(132,147,approach),204,sweep),195,hug);
        const sweepY=mix(mix(mix(243,270,approach),248,sweep),232,hug);
        const leftX=mix(sweepX,132,reset),leftY=mix(sweepY,243,reset);
        moveHand(0,leftX,leftY,128,245);
        moveHand(1,430-leftX,leftY,302,245);
        nodes.forEach((node,i)=>{
          const side=i%2===0?-1:1,slot=Math.floor(i/2);
          const col=slot%3,row=Math.floor(slot/3);
          // A wide, three-row pile rests on the floor in front of the throne.
          const pileX=215+side*(70-col*24+row*3);
          const pileY=268+row*7+(col%2)*3;
          const lapX=215+side*(10+col*3+row*3);
          const lapY=232+row*3;
          // The outside coins get scooped first, matching each hand's sweep.
          const gathered=ease((t-.23-col*.075-row*.015)/.41);
          const x=mix(pileX,lapX,gathered);
          const y=mix(pileY,lapY,gathered)-8*Math.sin(Math.PI*gathered);
          node.setAttribute('transform','translate('+x+' '+y+') rotate('+mix((col-1)*10,side*6,gathered)+')');
          // Fade only after all coins have been deposited, ready for a new loop.
          node.setAttribute('opacity',String(1-ease((t-.91)/.075)));
        });
        return;
      }

      if(income){
        // The right hand throws a *fan* of notes into the open wallet.
        // Each note takes a slightly different arc but shares this throw.
        const gather=ease(t/.18),throwing=ease((t-.20)/.32),back=ease((t-.69)/.28);
        const handX=mix(mix(264,253,gather),211,throwing);
        const handY=mix(mix(183,199,gather),233,throwing);
        moveHand(0,180,245,137,232);
        moveHand(1,mix(handX,264,back),mix(handY,183,back),277,216);
        nodes.forEach((node,i)=>{
          const release=.285+i*.008;
          const handAtRelease=ease((release-.20)/.32);
          const sx=mix(253,211,handAtRelease),sy=mix(199,233,handAtRelease);
          const p=clamp((t-release)/.39),flight=ease(p),fan=i-(nodes.length-1)/2;
          const targetX=218+fan*8,targetY=244+Math.abs(fan)*2;
          const x=mix(sx,targetX,flight)+fan*4*Math.sin(Math.PI*p);
          const y=mix(sy,targetY,flight)-20*Math.sin(Math.PI*p);
          node.setAttribute('transform','translate('+x+' '+y+') rotate('+(fan*13+110*p)+') scale('+mix(.95,.72,flight)+')');
          node.setAttribute('opacity',String(t<release||p>=1?0:1-ease((p-.76)/.24)));
        });
        return;
      }

      // King expense uses exactly the standard expense hand movement.
      // Only the material changes from banknotes to *gold* coins.
      const reach=ease(t/.24),flick=ease((t-.27)/.20),back=ease((t-.62)/.36);
      const handX=mix(mix(254,179,reach),249,flick);
      const handY=mix(mix(224,207,reach),150,flick);
      moveHand(0,173,237,135,230);
      moveHand(1,mix(handX,254,back),mix(handY,224,back),278,207);
      nodes.forEach((node,i)=>{
        const release=.34+i*.013;
        const swing=ease((release-.27)/.20);
        const sx=mix(179,249,swing),sy=mix(207,150,swing);
        const p=clamp((t-release)/.49),fan=i-(nodes.length-1)/2;
        const x=sx+(91+i*9)*p+fan*7*Math.sin(Math.PI*p);
        const y=sy-(90+Math.abs(fan)*17)*p+(118+Math.abs(fan)*13)*p*p;
        node.setAttribute('transform','translate('+x+' '+y+') rotate('+(p*(150+i*31)+fan*19)+')');
        node.setAttribute('opacity',String(t<release||p>=1?0:1-ease((p-.76)/.24)));
      });
    };
    const frame=(now:number)=>{draw((now-started)/1000);raf=requestAnimationFrame(frame);};
    const begin=()=>{
      cancelAnimationFrame(raf);
      started=performance.now();
      draw(0);
      if(!reduced.matches)raf=requestAnimationFrame(frame);
    };
    begin();
    reduced.addEventListener('change',begin);
    return()=>{cancelAnimationFrame(raf);reduced.removeEventListener('change',begin);};
  },[king,income,banker]);

  const arm=(side:'left'|'right')=><g>
    {banker
      ? <ShirtArm skin="banker" suffix={suffix} part={side} d="M132 194Q145 230 170 230"/>
      : <path data-arm={side} d="M132 194Q145 230 170 230" fill="none" stroke={king?'#9f214c':'#d69a49'} strokeWidth={king?22:18} strokeLinecap="round"/>}
    <g data-hand={side}><circle r="10" fill={king?'#f5c95f':'#f5d287'} stroke="#a46c32" strokeWidth="1.5"/><path d="M-4 -3l-2 5M0 -4l-1 6M4 -3v5" stroke="#a46c32" strokeWidth="1.3" strokeLinecap="round"/></g>
  </g>;

  return <g ref={ref} className="econ-money-gesture" pointerEvents="none">
    {income&&!king&&<g><rect x="176" y="227" width="83" height="47" rx="8" fill="#855029" stroke="#492f21" strokeWidth="2.5"/><path d="M176 237H259" stroke="#e5b66b" strokeWidth="3"/><rect x="233" y="242" width="30" height="15" rx="5" fill="#b6783f"/><circle cx="246" cy="249" r="4" fill="#f4cc76"/></g>}
    {!income&&<g transform="translate(173 220)">{[0,1,2,3,4].map(i=>king
      ? <Coin key={i} x={i*3} y={-i*3} i={0}/>
      : <Bill key={i} x={i*2} y={-i*3}/>)}</g>}
    {arm('left')}{arm('right')}
    {Array.from({length:king?(income?18:6):income?6:6},(_,i)=>
      <g key={i} data-money={i} opacity="0">{king?<Coin x={0} y={0} i={0}/>:<Bill x={0} y={0}/>}</g>)}
  </g>;
}
