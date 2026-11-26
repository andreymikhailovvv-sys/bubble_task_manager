import { useLayoutEffect, useRef } from 'react';
import { ShirtArm } from './ShirtMascotSkins';

export type FinancialMascotMode = 'income' | 'expense';
export const FINANCIAL_MASCOT_EVENT = 'economych-operation-recorded';
export function announceEconomicOperation(kind: unknown) {
  if (kind === 'INCOME' || kind === 'EXPENSE')
    window.dispatchEvent(new CustomEvent(FINANCIAL_MASCOT_EVENT, {detail:kind==='INCOME'?'income':'expense'}));
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
// One clock drives the hand, the release and the trajectory. No independent
// repeating particle timers: every bill/coin belongs to one deliberate gesture.
const clamp=(x:number)=>Math.min(1,Math.max(0,x));
const ease=(x:number)=>{const p=clamp(x);return p*p*(3-2*p);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
export function EconomicMoneyGesture({mode,skinId,suffix}:{mode:FinancialMascotMode;skinId:string;suffix:string}){
  const king=skinId==='king',banker=skinId==='banker',income=mode==='income';
  const ref=useRef<SVGGElement>(null);
  useLayoutEffect(()=>{
    const root=ref.current;if(!root)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf=0,started=performance.now();
    const nodes=Array.from(root.querySelectorAll<SVGGElement>('[data-money]'));
    const arms=['left','right'].map(side=>({
      paths:Array.from(root.querySelectorAll<SVGPathElement>('[data-arm="'+side+'"],[data-arm="'+side+'-sleeve"]')),
      hand:root.querySelector<SVGGElement>('[data-hand="'+side+'"]')
    }));
    const hand=(i:number,x:number,y:number,cx:number,cy:number)=>{
      const d='M'+(i===0?132:298)+' 194Q'+cx+' '+cy+' '+x+' '+y;
      arms[i].paths.forEach(path=>path.setAttribute('d',d));
      arms[i].hand?.setAttribute('transform','translate('+x+' '+y+')');
    };
    const draw=(elapsed:number)=>{
      const duration=king?2.05:1.35,t=(elapsed%duration)/duration;
      if(king&&income){
        // Both hands reach around the outside of an actual pile, then rake it
        // inward and upward towards the lap. The accumulated pile stays put.
        const reach=ease(t/.25),sweep=ease((t-.28)/.38),reset=ease((t-.76)/.24);
        const x=mix(mix(172,115,reach),194,sweep),y=mix(mix(229,273,reach),238,sweep);
        hand(0,mix(x,172,reset),mix(y,229,reset),116,249);
        hand(1,430-mix(x,172,reset),mix(y,229,reset),314,249);
        nodes.forEach((node,i)=>{
          const side=i%2===0?-1:1, col=Math.floor(i/2)%6,row=Math.floor(i/12);
          const fromX=215+side*(25+col*14),fromY=268-row*10+(col%3)*3;
          const p=ease((t-.30-(col*.018))/.34);
          const toX=215+side*(10+col*5),toY=242-row*8+(col%3)*3;
          node.setAttribute('transform','translate('+mix(fromX,toX,p)+' '+mix(fromY,toY,p)+') rotate('+mix((i%5-2)*13,0,p)+')');
          node.setAttribute('opacity',String(1-ease((t-.88)/.12)));
        });
        return;
      }
      if(king){
        const gather=ease(t/.24),throwing=ease((t-.26)/.19),returning=ease((t-.60)/.40);
        const x=mix(mix(158,197,gather),82,throwing),y=mix(mix(231,218,gather),124,throwing);
        hand(0,mix(x,158,returning),mix(y,231,returning),112,183);
        hand(1,430-mix(x,158,returning),mix(y,231,returning),318,183);
        nodes.forEach((node,i)=>{
          const side=i%2===0?-1:1,j=Math.floor(i/2);
          const release=.35+j*.008,p=clamp((t-release)/.49);
          // Release at the hand during its outward swing, then ballistic arc.
          const swing=ease((release-.26)/.19);
          const startX=215+side*(215-mix(197,82,swing)),startY=mix(218,124,swing);
          const x=startX+side*(42+j*7)*p;
          const y=startY-(105+j*8)*p+125*p*p;
          node.setAttribute('transform','translate('+x+' '+y+') rotate('+(side*p*(140+j*31))+')');
          node.setAttribute('opacity',String(t<release||p>=1?0:1-ease((p-.70)/.30)));
        });
        return;
      }
      if(income){
        const p=ease((t-.12)/.55),back=ease((t-.72)/.28);
        hand(0,180,245,137,232);
        hand(1,mix(mix(262,215,p),262,back),mix(mix(186,235,p),186,back),280,215);
        nodes.forEach((node,i)=>{
          node.setAttribute('transform','translate('+mix(259,215,p)+' '+mix(178,235,p)+') rotate('+mix(-14,0,p)+') scale('+mix(1,.72,p)+')');
          node.setAttribute('opacity',String(i===0&&t<.68?1-ease((t-.55)/.13):0));
        });return;
      }
      // Left hand holds the stack. Right hand reaches to its top, flicks one
      // note away, then returns. Only one note is emitted per flick.
      const reach=ease(t/.24),flick=ease((t-.27)/.18),back=ease((t-.55)/.45);
      const x=mix(mix(254,179,reach),247,flick),y=mix(mix(224,207,reach),151,flick);
      hand(0,173,237,135,230);
      hand(1,mix(x,254,back),mix(y,224,back),278,207);
      nodes.forEach((node,i)=>{
        const release=.39,p=clamp((t-release)/.56),s=ease((release-.27)/.18);
        const sx=mix(179,247,s),sy=mix(207,151,s);
        node.setAttribute('transform','translate('+(sx+103*p)+' '+(sy-105*p+126*p*p)+') rotate('+(p*165)+')');
        node.setAttribute('opacity',String(i===0&&t>=release&&p<1?1-ease((p-.75)/.25):0));
      });
    };
    const frame=(now:number)=>{draw((now-started)/1000);raf=requestAnimationFrame(frame);};
    const begin=()=>{cancelAnimationFrame(raf);started=performance.now();draw(reduced.matches?(king?1:.6):0);if(!reduced.matches)raf=requestAnimationFrame(frame);};
    begin();reduced.addEventListener('change',begin);
    return()=>{cancelAnimationFrame(raf);reduced.removeEventListener('change',begin);};
  },[king,income,banker]);
  const arm=(side:'left'|'right')=><g>
    {banker?<ShirtArm skin="banker" suffix={suffix} part={side} d="M132 194Q145 230 170 230"/>:<path data-arm={side} d="M132 194Q145 230 170 230" fill="none" stroke={king?'#9f214c':'#d69a49'} strokeWidth={king?22:18} strokeLinecap="round"/>}
    <g data-hand={side}><circle r="10" fill={king?'#f5c95f':'#f5d287'} stroke="#a46c32" strokeWidth="1.5"/><path d="M-4 -3l-2 5M0 -4l-1 6M4 -3v5" stroke="#a46c32" strokeWidth="1.3" strokeLinecap="round"/></g>
  </g>;
  return <g ref={ref} className="econ-money-gesture" pointerEvents="none">
    {income&&!king&&<g><rect x="176" y="227" width="83" height="47" rx="8" fill="#855029" stroke="#492f21" strokeWidth="2.5"/><path d="M176 237H259" stroke="#e5b66b" strokeWidth="3"/><rect x="233" y="242" width="30" height="15" rx="5" fill="#b6783f"/><circle cx="246" cy="249" r="4" fill="#f4cc76"/></g>}
    {king&&income&&<g>{Array.from({length:18},(_,i)=><Coin key={i} x={178+(i%9)*9} y={254-Math.floor(i/9)*9} i={i}/>)}</g>}
    {!income&&!king&&<g transform="translate(173 220)">{[0,1,2,3,4].map(i=><Bill key={i} x={i*2} y={-i*3}/>)}</g>}
    {king&&!income&&<g>{Array.from({length:8},(_,i)=><Coin key={i} x={188+(i%4)*16} y={237-Math.floor(i/4)*9} i={i%3}/>)}</g>}
    {arm('left')}{arm('right')}
    {Array.from({length:king?(income?24:12):1},(_,i)=><g key={i} data-money={i} opacity="0">{king?<Coin x={0} y={0} i={income?i:i%3}/>:<Bill x={0} y={0}/>}</g>)}
  </g>;
}
