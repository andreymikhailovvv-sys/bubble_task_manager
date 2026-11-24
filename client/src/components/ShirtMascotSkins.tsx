import { useLayoutEffect, useRef } from 'react';
import type { SVGProps } from 'react';

type ShirtSkin='zoomer'|'banker';
const hairOutline='M124 128Q119 115 122 99L119 86L125 74L122 65L134 59L133 51L147 47L153 38L167 41L177 33L188 38L202 31L213 36L225 30L235 37L249 35L257 43L271 40L278 49L292 49L295 60L305 64L302 75L312 84Q310 99 309 117L301 128L298 111L288 98L278 110L271 97L258 108L251 94L240 102L231 91L220 105L212 93L203 111L193 95L182 108L176 96L164 113L156 101L146 119L139 108L131 128Z';
const strokes=['M130 85Q137 68 143 67','M137 100Q144 78 156 70','M148 66Q160 54 169 54','M154 79Q169 68 175 55','M160 98Q172 76 184 66','M176 90Q188 71 191 58','M188 56Q200 41 212 43','M195 91Q205 80 209 65','M209 99Q219 76 221 61','M220 79Q231 65 236 51','M235 97Q247 82 250 61','M248 89Q263 74 264 58','M263 98Q278 81 281 71','M282 89Q296 78 296 70','M294 111Q301 98 301 87','M149 47Q159 43 169 45','M207 38Q218 42 228 38','M247 42Q259 45 269 50','M180 111Q180 103 185 96','M239 110Q242 101 247 97'];
const url=(name:string,suffix:string)=>'url(#'+name+'-'+suffix+')';
const armColor=(skin:ShirtSkin)=>skin==='banker'?'#e2a35f':'#9792d7';
const shirtColor=(skin:ShirtSkin)=>skin==='banker'?'#eef1f3':'#91c3c0';
export function ShirtOutfit({skin,suffix}:{skin:ShirtSkin;suffix:string}){
 const bank=skin==='banker',edge=bank?'#a2aeb9':'#4c7f83',fabric=url('shirt-fabric',suffix),collar=bank?'#f9fcff':'#b9dedb';
 return <g className="planik-skin-artwork shirt-outfit" pointerEvents="none">
 <defs>
 <linearGradient id={'shirt-fabric-'+suffix} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={bank?'#fff':'#cce8e5'}/><stop offset=".45" stopColor={shirtColor(skin)}/><stop offset="1" stopColor={bank?'#c8d1db':'#548e93'}/></linearGradient>
 <linearGradient id={'shirt-hair-'+suffix} x1=".2" y1="0" x2=".8" y2="1"><stop stopColor="#f4e4c2"/><stop offset=".38" stopColor="#e4cca0"/><stop offset=".76" stopColor="#c4a77e"/><stop offset="1" stopColor="#ac8d64"/></linearGradient>
 <linearGradient id={'shirt-tie-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f06b73"/><stop offset=".55" stopColor="#c9394b"/><stop offset="1" stopColor="#8f2039"/></linearGradient>
 <linearGradient id={'shirt-phone-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b6c5d3"/><stop offset=".45" stopColor="#879bad"/><stop offset="1" stopColor="#61768e"/></linearGradient>
 <linearGradient id={'shirt-case-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#926549"/><stop offset=".55" stopColor="#694432"/><stop offset="1" stopColor="#38271f"/></linearGradient>
 <clipPath id={'shirt-torso-'+suffix}><rect x="122" y="76" width="186" height="174" rx="65"/></clipPath>
 <clipPath id={'shirt-hairclip-'+suffix}><path d={hairOutline}/></clipPath>
 </defs>
 <g clipPath={url('shirt-torso',suffix)}>
 {/* Continuous yoke beneath the collar: both folded points share the top seam of the shirt. */}
 <path className="shirt-body" d="M119 181Q137 186 159 199Q183 211 215 217Q247 211 271 199Q293 186 311 181L317 220Q304 266 215 267Q126 266 113 220Z" fill={fabric} stroke={edge} strokeWidth="1.7"/>
 <path d="M132 207Q138 239 165 249M298 207Q292 239 265 249" fill="none" stroke={edge} strokeOpacity=".45" strokeWidth="2.5"/>
 <path d="M215 218V259" stroke={edge} strokeOpacity=".7" strokeWidth="1.5"/>
 <g className="shirt-collar" fill={collar} stroke={edge} strokeWidth="1.2" strokeLinejoin="round"><path d="M159 199Q183 211 215 217L200 232L174 222Z"/><path d="M271 199Q247 211 215 217L230 232L256 222Z"/></g>
 {bank?<><path d="M208 219L222 219L224 227L219 231L227 251L215 261L203 251L211 231L206 227Z" fill={url('shirt-tie',suffix)} stroke="#9c233d" strokeWidth="1.2"/><path d="M211 232L208 249" stroke="#f9a0a1" opacity=".55" strokeWidth="2" fill="none"/></>:<><path d="M207 229h16" stroke="#557e82" strokeWidth="1.5"/><circle cx="215" cy="237" r="2" fill="#ecf5f1"/><circle cx="215" cy="248" r="2" fill="#ecf5f1"/><path d="M257 229l19-4v13q-9 6-18 1Z" fill="#76a9aa" stroke="#508488" strokeWidth="1.1"/></>}
 </g>
 {bank?<g><g fill="#c6e4ed" fillOpacity=".07" stroke="#2c2d35" strokeWidth="4" strokeLinejoin="round"><rect x="163" y="140" width="51" height="43" rx="13"/><rect x="216" y="140" width="51" height="43" rx="13"/><path d="M213 154Q215 152 217 154M163 150L150 143M267 150L280 143" fill="none" strokeLinecap="round"/></g><path d="M169 149Q173 144 184 144M222 149Q226 144 237 144" stroke="#e9e5dc" strokeWidth="1.8" strokeOpacity=".75" strokeLinecap="round" fill="none"/></g>:<g className="zoomer-hair">
 <path d="M124 128Q116 108 123 84Q130 54 153 46Q179 29 213 34Q257 29 290 48Q312 64 311 96L309 124L299 137L289 111L141 106L132 138Z" fill="#9e7f58" stroke="#806a50" strokeWidth="1.8"/>
 <path d={hairOutline} fill={url('shirt-hair',suffix)} stroke="#9a805e" strokeWidth="1.6" strokeLinejoin="round"/>
 <g clipPath={url('shirt-hairclip',suffix)} fill="none" strokeLinecap="round">
 <path d="M124 114Q131 78 161 66Q170 59 168 44M145 110Q150 83 177 72L191 42M164 104Q183 67 211 43M187 104Q207 77 225 50M207 105Q230 79 241 44M232 103Q257 73 263 47M255 106Q278 83 283 56M280 111Q295 94 296 73" stroke="#ae9066" strokeWidth="9" strokeOpacity=".58"/>
 <path d="M130 99Q135 69 154 58Q161 51 159 42M145 90Q158 72 173 54M157 107Q166 86 184 73Q194 63 197 43M177 94Q188 65 208 53M191 109Q207 89 211 74Q214 57 229 45M217 98Q237 73 238 56M233 107Q246 90 250 71Q255 57 269 51M256 99Q272 82 278 61M279 102Q298 81 290 67" stroke="#f1dcb1" strokeWidth="7" strokeOpacity=".85"/>
 {strokes.map((d,i)=><path key={i} d={d} stroke={['#fff3d7','#e9cfa3','#f9e7c3'][i%3]} strokeWidth={i%3===0?2.7:1.9} opacity=".85"/>)}
 </g><path d="M130 109L131 129M139 111L139 119M301 111L300 126" stroke="#d1b58c" strokeWidth="2" strokeLinecap="round" fill="none"/></g>}
 </g>;
}
export function ShirtArm({skin,suffix,d,part,strokeWidth=17,...props}:SVGProps<SVGPathElement>&{skin:ShirtSkin;suffix:string;part?:string}){
 return <g className="shirt-arm"><path {...props} data-arm={part} d={d} stroke={armColor(skin)} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none"/><path data-arm={part?part+'-sleeve':undefined} d={d} pathLength="100" stroke={url('shirt-fabric',suffix)} strokeWidth="25" strokeDasharray="29 100" strokeLinecap="round" fill="none"/></g>;
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a:number,b:number,p:number)=>a+(b-a)*p;
function useScene(draw:(node:SVGGElement,t:number)=>void,reducedTime=0,duration=Infinity){
 const ref=useRef<SVGGElement>(null);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  let raf=0,start=performance.now();const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const frame=(now:number)=>{const t=(now-start)/1000;draw(node,Math.min(t,duration));if(t<duration)raf=requestAnimationFrame(frame);};
  const begin=()=>{cancelAnimationFrame(raf);start=performance.now();draw(node,reduced.matches?reducedTime:0);if(!reduced.matches)raf=requestAnimationFrame(frame);};
  begin();reduced.addEventListener('change',begin);
  return()=>{cancelAnimationFrame(raf);reduced.removeEventListener('change',begin);};
 },[draw,reducedTime,duration]);
 return ref;
}
const attr=(node:SVGGElement,part:string,key:string,value:string|number)=>node.querySelector('[data-part="'+part+'"]')?.setAttribute(key,String(value));
const setArm=(node:SVGGElement,part:string,d:string)=>{node.querySelector('[data-arm="'+part+'"]')?.setAttribute('d',d);node.querySelector('[data-arm="'+part+'-sleeve"]')?.setAttribute('d',d);};
const left=(node:SVGGElement,x:number,y:number,cx=146,cy=224)=>setArm(node,'left',`M132 196Q${cx} ${cy} ${x} ${y}`);
const right=(node:SVGGElement,x:number,y:number,cx=284,cy=224)=>setArm(node,'right',`M298 196Q${cx} ${cy} ${x} ${y}`);
function Phone({suffix}:{suffix:string}){
 return <g className="zoomer-phone-back"><rect x="-20" y="-36" width="40" height="72" rx="8" fill="#333b47" stroke="#9da9b7" strokeWidth="1.8"/><rect x="-17.5" y="-33.5" width="35" height="67" rx="6" fill={url('shirt-phone',suffix)}/><rect x="-14" y="-30" width="23" height="25" rx="6" fill="#798b9e" stroke="#c0c9d5"/>{[[-7.8,-23],[3,-13]].map(([x,y])=><g key={x}><circle cx={x} cy={y} r="5.5" fill="#131c2c" stroke="#4f5e71" strokeWidth="1.3"/><circle cx={x} cy={y} r="3" fill="#35475f"/><circle cx={x-1} cy={y-1.4} r="1.35" fill="#c5ddfc" opacity=".8"/></g>)}<circle cx="3" cy="-24" r="2.3" fill="#f8edc5"/><path d="M0-1l4 5-4 5-4-5Z" fill="#d9e3ea" opacity=".5"/><path d="M19-15v14M19 3v8" stroke="#a5b1c3" strokeWidth="2" strokeLinecap="round"/></g>;
}
function phoneIdle(node:SVGGElement,t:number){
 const sway=Math.sin(t*2)*2,tap=Math.sin(t*8)*3;
 attr(node,'phone','transform',`translate(${202+sway} 224) rotate(-10)`);
 left(node,186+sway,245);right(node,220+sway,219+tap);
 attr(node,'finger','transform',`translate(${221+sway} ${219+tap})`);
}
function phoneHide(node:SVGGElement,t:number){
 const p=ease(t/.95),x=mix(202,310,p),y=mix(224,227,p);
 attr(node,'phone','transform',`translate(${x} ${y}) rotate(${mix(-10,78,p)}) scale(${mix(1,.82,p)})`);
 attr(node,'phone','opacity',1-ease((p-.8)/.2));attr(node,'finger','opacity',0);
 left(node,mix(186,152,p),mix(245,232,p));right(node,mix(220,306,p),mix(219,229,p),mix(284,320,p),mix(224,219,p));
 if(t>.95){const q=ease((t-.95)/.35);right(node,mix(306,254,q),mix(229,225,q),mix(320,283,q),mix(219,218,q));left(node,mix(152,170,q),mix(232,224,q),141,219);}
}
export function ZoomerPhone({suffix,hide}:{suffix:string;hide:boolean}){
 const ref=useScene(hide?phoneHide:phoneIdle,hide?1.3:0,hide?1.3:Infinity);
 return <g className={hide?'zoomer-phone-hide':'zoomer-phone-idle'} ref={ref} pointerEvents="none"><ShirtArm skin="zoomer" suffix={suffix} part="left" d="M132 196Q146 224 186 245"/><ShirtArm skin="zoomer" suffix={suffix} part="right" d="M298 196Q284 224 220 219"/><path data-part="finger" d="M0 0l-6 3" stroke={armColor('zoomer')} strokeWidth="8" strokeLinecap="round"/><g data-part="phone" transform="translate(202 224) rotate(-10)"><Phone suffix={suffix}/><path d="M-19 13q8 2 9 9" stroke={armColor('zoomer')} strokeWidth="10" fill="none" strokeLinecap="round"/></g></g>;
}
function Bill({w=48}:{w?:number}){
 return <g><rect x={-w/2} y="-12" width={w} height="24" rx="2.5" fill="#a4cba9" stroke="#48785a" strokeWidth="1.3"/><rect x={-w/2+4} y="-8" width={w-8} height="16" rx="2" fill="none" stroke="#639375" strokeWidth=".8"/><ellipse rx="7" ry="8" fill="#c7dfbe" stroke="#719b76"/><text y="3.5" fontSize="9" fontWeight="bold" textAnchor="middle" fill="#477e5a">$</text><path d={`M${-w/2+6} -5h5m-5 10h5M${w/2-11} -5h5m-5 10h5`} stroke="#638970" strokeWidth="1.5"/></g>;
}
function Stack({count=5}:{count?:number}){return <>{Array.from({length:count},(_,i)=><g key={i} transform={'translate(0 '+(-i*2.2)+')'}><Bill/></g>)}</>;}
function countBills(node:SVGGElement,t:number){
 const i=Math.floor(t/1.1)%6,phase=(t%1.1)/1.1,p=ease((phase-.14)/.65);
 const x=mix(173,260,p),y=mix(229+i*2,244-i*1.5,p)-Math.sin(p*Math.PI)*23;
 left(node,162,244);right(node,x+13,y+8,278,213);
 attr(node,'moving','transform',`translate(${x} ${y}) rotate(${mix(-12,9,p)}) scale(1 ${Math.max(.25,Math.abs(Math.cos(p*Math.PI)))})`);
 attr(node,'moving','opacity',phase>.9||phase<.14?0:1);attr(node,'grip','opacity',phase>.9?1:0);
 for(let j=0;j<6;j++){attr(node,'pile'+j,'opacity',j<i+(phase>.9?1:0)?1:0);attr(node,'source'+j,'opacity',j<6-i-(phase>.14?1:0)?1:0);}
}
function packBills(node:SVGGElement,t:number){
 const u=t%6,p=ease((u-.35)/1.5),close=ease((u-2.3)/.55),lift=ease((u-3.2)/.8),bx=mix(170,215,p),by=mix(188,241,p);
 attr(node,'bundle','transform',`translate(${bx} ${by}) rotate(${mix(-9,0,p)}) scale(${1-ease((u-1.8)/.35)*.6})`);
 attr(node,'bundle','opacity',1-ease((u-1.8)/.35));attr(node,'inside','opacity',ease((u-1.8)/.35)*(1-close));
 attr(node,'lid','transform',`translate(0 ${33*close}) translate(0 226) scale(1 ${Math.max(.04,1-close)}) translate(0 -226)`);
 attr(node,'lid','opacity',1-close);attr(node,'closed','opacity',close);attr(node,'case','transform',`translate(0 ${-lift*12})`);
 left(node,mix(bx-20,175,close),mix(by+7,253-lift*12,close));right(node,mix(273,235,p),mix(241,226,p)-lift*12);
}
export function BankerMoney({suffix,packing=false}:{suffix:string;packing?:boolean}){
 const ref=useScene(packing?packBills:countBills,packing?4:1.8);
 const arm=(part:string,d:string)=><ShirtArm skin="banker" suffix={suffix} part={part} d={d}/>;
 return <g className={packing?'banker-packing':'banker-counting'} ref={ref} pointerEvents="none">
 {packing?<><g data-part="case" className="banker-briefcase"><path d="M193 226v-7q0-9 9-9h26q9 0 9 9v7" stroke="#64412f" strokeWidth="8" fill="none" strokeLinecap="round"/><rect x="145" y="226" width="140" height="56" rx="8" fill={url('shirt-case',suffix)} stroke="#39291f" strokeWidth="2.5"/><path d="M151 248L279 248L270 274H160Z" fill="#b38a69" opacity=".45"/><path d="M149 247H281" stroke="#473025" strokeWidth="2"/><g data-part="inside" transform="translate(215 243) scale(1.75 .55)" opacity="0"><Stack count={4}/></g><g data-part="lid"><path d="M147 226L283 226L271 193L159 193Z" fill={url('shirt-case',suffix)} stroke="#493125" strokeWidth="2.1"/><path d="M165 199h100" stroke="#b38a6a" strokeOpacity=".65" strokeWidth="1.6"/><path d="M171 199v22M259 199v22" stroke="#3f2b22" strokeWidth="3.5"/></g><g data-part="closed" opacity="0"><path d="M145 226H285V245Q215 266 145 245Z" fill={url('shirt-case',suffix)} stroke="#39291f" strokeWidth="2.3"/><rect x="204" y="245" width="22" height="12" rx="3" fill="#e9c68b" stroke="#906a39"/><path d="M215 248v5" stroke="#77562f" strokeWidth="2"/></g></g>{arm('left','M132 196Q146 224 150 195')}{arm('right','M298 196Q284 224 273 241')}<g data-part="bundle" transform="translate(170 188)"><Stack/><rect x="-5" y="-23" width="10" height="35" fill="#ebdfbb" stroke="#b7a578" strokeWidth=".8"/></g></>:<>{arm('left','M132 196Q146 224 162 244')}{arm('right','M298 196Q278 213 186 237')}<g transform="translate(173 239) rotate(-12)">{Array.from({length:6},(_,i)=><g key={i} data-part={'source'+i} transform={'translate(0 '+(-i*2.2)+')'}><Bill/></g>)}</g><g transform="translate(260 248) rotate(9)">{Array.from({length:6},(_,i)=><g key={i} data-part={'pile'+i} opacity="0" transform={'translate(0 '+(-i*2)+')'}><Bill w={45}/></g>)}</g><g data-part="moving" opacity="0"><Bill/></g><path d="M151 244l14-5" stroke={armColor('banker')} strokeWidth="12" strokeLinecap="round"/><path data-part="grip" d="M269 253l-11-4" stroke={armColor('banker')} strokeWidth="12" strokeLinecap="round" opacity="0"/></>}
 </g>;
}
