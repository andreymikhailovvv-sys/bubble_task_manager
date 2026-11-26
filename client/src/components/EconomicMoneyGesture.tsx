import type { CSSProperties } from 'react';
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
export function EconomicMoneyGesture({mode,skinId,suffix}:{mode:FinancialMascotMode;skinId:string;suffix:string}){
  const king=skinId==='king',banker=skinId==='banker',income=mode==='income';
  const sleeve=king?'#9f214c':'#d69a49';
  const arm=(side:'left'|'right',d:string,x:number,y:number)=>
    <g className={`econ-money-arm econ-money-arm-${side}`}>
      {banker?<ShirtArm skin="banker" suffix={suffix} d={d} strokeWidth={18}/>:<path d={d} fill="none" stroke={sleeve} strokeWidth="18" strokeLinecap="round"/>}
      <circle cx={x} cy={y} r="10" fill={king?'#f5c95f':'#f5d287'} stroke="#a46c32" strokeWidth="1.5"/>
    </g>;
  return <g className={`econ-money-gesture econ-money-${mode} ${king?'econ-money-king':''}`} pointerEvents="none">
    {income&&!king&&<g><rect x="176" y="227" width="83" height="47" rx="8" fill="#855029" stroke="#492f21" strokeWidth="2.5"/><path d="M176 237H259" stroke="#e5b66b" strokeWidth="3"/><rect x="233" y="242" width="30" height="15" rx="5" fill="#b6783f"/><circle cx="246" cy="249" r="4" fill="#f4cc76"/></g>}
    {income&&king&&<g>{Array.from({length:12},(_,i)=><Coin key={i} x={173+(i%6)*17} y={248+Math.floor(i/6)*12} i={i}/>)}</g>}
    {!income&&!king&&<g transform="translate(174 227)">{[0,1,2,3].map(i=><Bill key={i} x={i*3} y={-i*3}/>)}</g>}
    {king?<>
      {arm('left',income?'M132 194Q115 241 170 250':'M132 195Q97 172 75 145',income?170:75,income?250:145)}
      {arm('right',income?'M298 194Q315 241 260 250':'M298 195Q333 172 355 145',income?260:355,income?250:145)}
    </>:<>
      {arm('left','M132 194Q122 228 174 227',174,227)}
      {arm('right',income?'M298 194Q269 214 215 224':'M298 194Q246 200 193 222',income?215:193,income?224:222)}
    </>}
    {Array.from({length:king?12:6},(_,i)=>{
      const direction=i%2===0?-1:1;
      const x=king?(income?215+direction*(105+(i%3)*14):215+direction*35):income?218:178;
      const y=income?(king?230:175):215;
      const dx=income?(king?215-x:0):(king?direction*(105+(i%3)*20):70+i*16);
      const dy=income?(king?28:70):-(35+(i%4)*28);
      return <g key={i} className="econ-money-particle" style={{'--money-dx':dx+'px','--money-dy':dy+'px','--money-delay':(i*.13)+'s','--money-turn':(direction*(35+i*13))+'deg'} as CSSProperties}>
        {king?<Coin x={x} y={y} i={i}/>:<Bill x={x} y={y}/>}
      </g>;
    })}
  </g>;
}
