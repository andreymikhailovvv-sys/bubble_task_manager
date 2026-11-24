import { useEffect, useRef } from 'react';
import type { SVGProps } from 'react';

const starPoints=(x:number,y:number,r:number,points=5)=>Array.from({length:points*2},(_,i)=>{
 const a=i*Math.PI/points-Math.PI/2,k=i%2?r*.43:r;
 return (x+Math.cos(a)*k)+','+(y+Math.sin(a)*k);
}).join(' ');
const Star=({x,y,r=5,fill='#e7ca8d',points=4}:{x:number;y:number;r?:number;fill?:string;points?:number})=><polygon points={starPoints(x,y,r,points)} fill={fill}/>;
const Moon=({x,y,r}:{x:number;y:number;r:number})=><path d={`M${x+r*.45} ${y-r}A${r} ${r} 0 1 0 ${x+r*.68} ${y+r*.8}A${r*.8} ${r*.8} 0 0 1 ${x+r*.45} ${y-r}Z`} fill="#f4dcac"/>;
const url=(id:string,suffix:string)=>'url(#'+id+'-'+suffix+')';
const scarf='M134 182Q151 175 169 183Q216 207 276 183Q295 173 306 190L311 216Q301 242 216 250Q143 246 123 219L125 195Z';
const tail='M261 204Q296 200 300 229Q295 263 280 287L251 278Q267 252 261 222Z';
const cap='M142 106Q132 65 163 44Q185 28 216 34Q252 29 278 60Q292 82 286 106Z';
export function RefinedSkin({skinId,suffix,layer}:{skinId:string;suffix:string;layer:'rear'|'front'}){
 const n=skinId==='northern';
 const fabric=url('north-knit',suffix), knit=url('north-texture',suffix), mitten=url('north-mitten',suffix);
 const hat=url('wizard-hat',suffix), metal=url('wizard-metal',suffix), cape=url('wizard-cape',suffix), collar=url('wizard-collar',suffix);
 if(layer==='rear')return <g className="planik-skin-artwork" pointerEvents="none">
 <defs>
 <linearGradient id={'north-knit-'+suffix} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#a4ded3"/><stop offset=".32" stopColor="#65b8b0"/><stop offset=".7" stopColor="#378784"/><stop offset="1" stopColor="#22565e"/></linearGradient>
 <linearGradient id={'north-mitten-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ecf3e9"/><stop offset=".6" stopColor="#b5d9cf"/><stop offset="1" stopColor="#679c98"/></linearGradient>
 <pattern id={'north-texture-'+suffix} width="10" height="12" patternUnits="userSpaceOnUse"><path d="M2-1Q0 3 5 6Q10 3 8-1M2 5Q0 9 5 12Q10 9 8 5" fill="none" stroke="#d8f5ec" strokeWidth="1.4" strokeOpacity=".28"/></pattern>
 <radialGradient id={'north-breath-'+suffix}><stop stopColor="#efffff" stopOpacity=".88"/><stop offset=".6" stopColor="#c9e9e7" stopOpacity=".55"/><stop offset="1" stopColor="#c9e9e7" stopOpacity="0"/></radialGradient>
 <linearGradient id={'wizard-hat-'+suffix} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#8584b6"/><stop offset=".38" stopColor="#55577f"/><stop offset=".8" stopColor="#303253"/><stop offset="1" stopColor="#23243d"/></linearGradient>
 <linearGradient id={'wizard-cape-'+suffix} x1="0" y1="0" x2=".2" y2="1"><stop stopColor="#7769aa"/><stop offset=".45" stopColor="#514681"/><stop offset="1" stopColor="#322c52"/></linearGradient>
 <linearGradient id={'wizard-collar-'+suffix} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#9d8ccf"/><stop offset=".5" stopColor="#685a9c"/><stop offset="1" stopColor="#453967"/></linearGradient>
 <linearGradient id={'wizard-lining-'+suffix} x1="0" y1="0" x2=".9" y2="1"><stop stopColor="#615176"/><stop offset=".45" stopColor="#413552"/><stop offset="1" stopColor="#28243a"/></linearGradient>
 <linearGradient id={'wizard-metal-'+suffix}><stop stopColor="#9f7647"/><stop offset=".26" stopColor="#efd6a0"/><stop offset=".52" stopColor="#fff0c6"/><stop offset="1" stopColor="#ae804e"/></linearGradient>
 <radialGradient id={'wizard-crystal-'+suffix} cx=".32" cy=".25" r=".9"><stop stopColor="#f2ffff"/><stop offset=".15" stopColor="#b4edf8"/><stop offset=".45" stopColor="#8299e3"/><stop offset=".73" stopColor="#55568f"/><stop offset="1" stopColor="#d3daf7"/></radialGradient>
 <radialGradient id={'wizard-aura-'+suffix}><stop stopColor="#9bbaff" stopOpacity=".7"/><stop offset=".65" stopColor="#a98ce7" stopOpacity=".2"/><stop offset="1" stopColor="#a98ce7" stopOpacity="0"/></radialGradient>
 </defs>
 {!n&&<><g className="wizard-cape-back"><path d="M132 199Q118 211 106 239L91 272Q115 290 156 286Q215 267 274 286Q315 290 339 272L324 239Q312 211 298 199Z" fill={url('wizard-lining',suffix)} stroke="#2b263f" strokeWidth="2.3"/><path d="M107 240Q110 258 101 272Q127 286 154 280M323 240Q320 258 329 272Q303 286 276 280" stroke="#9a84b4" strokeOpacity=".35" fill="none" strokeWidth="2"/><path d="M94 272Q121 289 156 283Q215 265 274 283Q309 289 336 272" fill="none" stroke={metal} strokeWidth="3"/></g><ellipse cx="215" cy="89" rx="111" ry="18" fill="#252541" stroke="#a28568" strokeWidth="2"/></>}
 </g>;
 return <g className="planik-skin-artwork" pointerEvents="none">
 {n?<><g className="north-tail"><path d={tail} fill={fabric} stroke="#235d5f" strokeWidth="2.4"/><path d={tail} fill={knit}/><path d="M266 231Q279 241 279 264" fill="none" stroke="#ccebe0" strokeOpacity=".38" strokeWidth="3"/><path d="M256 276l-3 10m10-8-3 10m11-8-3 10m11-8-3 9" stroke="#a0d9cb" strokeWidth="3" strokeLinecap="round"/></g>
 <path d={scarf} fill={fabric} stroke="#26595e" strokeWidth="2.5"/><path d={scarf} fill={knit}/><path d="M127 200Q211 240 307 200M125 218Q211 254 308 218" fill="none" stroke="#245d63" strokeOpacity=".65" strokeWidth="6"/><path d="M133 194Q211 230 301 195M139 220Q211 246 295 222" fill="none" stroke="#c1e8dd" strokeOpacity=".55" strokeWidth="2"/>
 <g><path d={cap} fill={fabric} stroke="#26585e" strokeWidth="2.6"/><path d={cap} fill={knit}/><path d="M160 65Q183 46 215 42Q249 46 270 65" fill="none" stroke="#c2e9df" strokeOpacity=".38" strokeWidth="2"/><circle cx="215" cy="27" r="15" fill={mitten} stroke="#719c96" strokeWidth="1.3"/><path d="M207 16l-4-4m15 2 2-5m7 10 5-4m-2 12 6 2m-16-2 1 6" stroke="#fff" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round"/><rect x="138" y="92" width="154" height="28" rx="13" fill={fabric} stroke="#285b60" strokeWidth="2"/><path d={Array.from({length:15},(_,i)=>'M'+(149+i*9)+' 98v16').join('')} stroke="#d6f2e7" strokeOpacity=".3" strokeWidth="2.6"/><rect x="259" y="99" width="22" height="13" rx="3" fill="#dac4a5" stroke="#b89f82" transform="rotate(-4 270 105)"/><path d="M264 104l5 4 5-4" fill="none" stroke="#887261" strokeWidth="1.5"/></g>
 </>:<>
 <path d="M125 196Q135 195 143 207C158 231 184 243 215 244C246 243 272 231 287 207Q295 195 305 196Q311 222 326 242L338 263Q303 274 270 259Q237 245 215 235Q193 245 160 259Q127 274 92 263L104 242Q119 222 125 196Z" fill={cape} stroke="#3b3159" strokeWidth="2"/>
 <path d="M95 262Q129 273 160 257Q192 243 215 233Q238 243 270 257Q301 273 335 262" fill="none" stroke="#332849" strokeWidth="5.5" strokeLinecap="round"/><path d="M95 263Q129 274 160 258Q192 244 215 234Q238 244 270 258Q301 274 335 263" fill="none" stroke={metal} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round"/>
 <path d="M128 215Q121 240 107 255M302 215Q309 240 323 255M149 229Q158 246 179 249M281 229Q272 246 251 249" fill="none" stroke="#b6a4d7" strokeOpacity=".23" strokeWidth="3" strokeLinecap="round"/>
 <path d="M125 195Q132 192 139 204C155 229 181 240 215 241C249 240 275 229 291 204Q298 192 305 195L307 204C292 236 260 253 215 254C170 253 138 236 123 204Z" fill={collar} stroke="#493b71" strokeWidth="1.8"/><path d="M129 199C145 230 180 246 215 247C250 246 285 230 301 199" fill="none" stroke="#cab6e7" strokeOpacity=".43" strokeWidth="1.7" strokeLinecap="round"/>
 <circle cx="215" cy="246" r="13" fill="#21192d" opacity=".28"/><circle cx="215" cy="244" r="12" fill={metal} stroke="#f4d89a" strokeWidth="1.8"/><circle cx="215" cy="244" r="8.8" fill="#ad8045" stroke="#ffe0a1" strokeWidth="1.1"/><Star x={215} y={244} r={7.3} fill="#ffe8ad" points={5}/>
 <g><path d="M147 85Q160 63 178 45Q193 28 214 19Q232 10 259 13Q243 24 238 39Q235 55 250 70L270 85Q218 99 147 85Z" fill={hat} stroke="#282943" strokeWidth="2.6"/><path d="M172 69Q186 45 213 29Q230 19 250 17" fill="none" stroke="#b3acd3" strokeOpacity=".35" strokeWidth="3" strokeLinecap="round"/><path d="M239 38Q219 50 223 70" fill="none" stroke="#2e2d4e" strokeOpacity=".6" strokeWidth="3" strokeLinecap="round"/><path d="M150 78Q211 89 265 77L272 91Q215 105 142 91Z" fill="#292b44" stroke={metal} strokeWidth="1.7"/><path d="M105 88Q118 76 151 79Q203 89 271 79Q307 73 325 87Q331 94 309 100Q270 112 215 105Q158 112 122 100Q102 95 105 88Z" fill={hat} stroke="#34304c" strokeWidth="2.4"/><path d="M111 92Q147 109 215 101Q280 109 320 91" fill="none" stroke={metal} strokeWidth="2.7"/><path d="M125 86Q154 88 179 91M252 91Q285 84 310 86" stroke="#c3bad9" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" fill="none"/><path d="M199 83L207 73L218 80L217 94L205 96Z" fill={metal} stroke="#e5d09d" strokeWidth="1.2"/><path d="M205 83l5-5 4 7-5 7Z" fill="#849fcb"/><Moon x={208} y={56} r={9}/><Star x={188} y={67} r={3}/><Star x={232} y={62} r={4}/><Star x={223} y={36} r={3}/><path d="M257 16q2 7 1 16" stroke={metal} strokeWidth="1.2" fill="none"/><Star x={258} y={34}/></g>
 </>}
 </g>;
}
export function Mitten({x,y,dx,dy,right=false,suffix,scale=1}:{x:number;y:number;dx:number;dy:number;right?:boolean;suffix:string;scale?:number}){
 const angle=Math.atan2(dy,dx)*180/Math.PI+90;
 return <g className="north-mitten" transform={`translate(${x} ${y}) rotate(${angle}) scale(${right?-scale:scale} ${scale})`}><path d="M-7 8Q-12 4-11-3L-10-9Q-8-15-2-13Q5-13 7-8L8-4Q13-8 15-3Q15 0 10 5L7 12Z" fill={url('north-mitten',suffix)} stroke="#315b61" strokeWidth="1.5"/><path d="M-9 2Q-4 7 8 4M-8-7q5-3 9-1" fill="none" stroke="#d6f1e7" strokeOpacity=".65" strokeWidth="1.5" strokeLinecap="round"/><rect x="-8" y="8" width="16" height="7" rx="2.5" fill="#327e7d" stroke="#275e62"/><path d="M-5 10v3m4-3v3m4-3v3" stroke="#a6ded2" strokeWidth="1.1"/></g>;
}
const Arm=(props:SVGProps<SVGPathElement>)=><path fill="none" stroke="#9290d8" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" {...props}/>;
export function NorthernHover({suffix}:{suffix:string}){
 return <g className="north-warm" pointerEvents="none"><g className="north-rub-left"><Arm d="M130 196Q148 220 204 229" stroke="#418d89" strokeWidth="20"/><Mitten x={204} y={229} dx={56} dy={9} suffix={suffix} scale={1.2}/></g><g className="north-rub-right"><Arm d="M300 196Q282 220 225 219" stroke="#418d89" strokeWidth="20"/><Mitten x={225} y={219} dx={-57} dy={-1} right suffix={suffix} scale={1.2}/></g><ellipse cx="215" cy="185" rx="4" ry="2.4" fill="#c7dfed" opacity=".9"/>{[0,1,2].map(i=><ellipse key={i} className="north-vapor" cx="215" cy="185" rx={5+i*.6} ry="3.5" fill={url('north-breath',suffix)} style={{animationDelay:(i*.25)+'s'}}/>)}</g>;
}
export function WizardHover({suffix}:{suffix:string}){
 return <g className="wizard-hover" pointerEvents="none"><g className="wizard-magic-left"><Arm d="M130 195Q135 230 161 238Q169 241 179 233"/></g><g className="wizard-magic-right"><Arm d="M300 195Q295 230 269 238Q261 241 251 233"/></g><g transform="translate(215 207)"><g className="wizard-orb"><circle className="wizard-orb-glow" r="60" fill={url('wizard-aura',suffix)}/><ellipse rx="51" ry="18" transform="rotate(-22)" fill="none" stroke="#c1b0f3" strokeOpacity=".4" strokeWidth="1.3"/><circle r="33" fill={url('wizard-crystal',suffix)} stroke="#e0dcf7" strokeWidth="1.6"/><path d="M-23-12Q-21-25-7-27" fill="none" stroke="#fff" strokeWidth="3.3" strokeLinecap="round" opacity=".8"/><ellipse cy="4" rx="26" ry="11" transform="rotate(-36)" stroke="#d7efff" strokeWidth="1.4" fill="none" opacity=".75"/><g className="wizard-orbit"><Star x={0} y={-22} fill="#fff4d5"/><Star x={18} y={6} r={4} fill="#e5e5ff"/><Star x={-16} y={10} r={3} fill="#fff"/><path d="M-17 9Q-3-13 18 5" fill="none" stroke="#ece0ff" opacity=".65"/></g><Star x={-48} y={-21} fill="#c6e8ff"/><Star x={40} y={-33} r={6} fill="#e9ccff"/><Star x={48} y={12} r={3} fill="#fff0b8"/></g></g></g>;
}
function Card({kind=0,back=false}:{kind?:number;back?:boolean}){
 return <><rect x="-23" y="-33" width="46" height="66" rx="5" fill={back?'#25294d':['#413348','#293d63','#41335d','#23505a'][kind]} stroke="#ebd09b" strokeWidth="1.6"/><rect x="-19" y="-29" width="38" height="58" rx="3" fill="none" stroke="#d0ac76" strokeWidth=".8"/><path d="M-15-27l4 4m26-4-4 4m-26 50 4-4m26 4-4-4" stroke="#e6c88d" fill="none"/>{back?<><circle r="12" fill="none" stroke="#a38fc8"/><Star x={0} y={0} r={15}/></>:<>{kind===0?<><circle r="9" fill="#edcc84"/>{Array.from({length:12},(_,i)=><path key={i} d="M0-12v-6" stroke="#e6c27c" strokeWidth="1.6" strokeLinecap="round" transform={'rotate('+i*30+')'}/>)}<circle r="4" fill="#c4854c"/></>:kind===1?<><Moon x={0} y={0} r={13}/><Star x={11} y={-13} r={3}/><Star x={-11} y={11} r={2.5}/></>:kind===2?<><Star x={0} y={0} r={16}/><Star x={-12} y={-15} r={3}/><Star x={12} y={13} r={3}/><circle r="20" fill="none" stroke="#ad94c0" strokeDasharray="1 5"/></>:<><circle r="15" fill="none" stroke="#e9c887"/><circle r="10" fill="none" stroke="#b5d1dc"/><Star x={0} y={0} r={20}/><circle r="3" fill="#9de3de"/></>}<path d="M-9 23h18" stroke="#e8cc94"/><text y="-21" textAnchor="middle" fill="#f7dfa4" fontSize="6" fontFamily="serif">{['XIX','XVIII','XVII','IV'][kind]}</text></>}</>;
}
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export function WizardCards(){
 const root=useRef<SVGGElement>(null);
 useEffect(()=>{
  const node=root.current;if(!node)return;
  const get=(name:string)=>node.querySelector<SVGElement>('[data-part="'+name+'"]')!;
  const la=get('la'),ra=get('ra'),left=get('left'),right=get('right'),aura=get('aura');
  const riffles=Array.from({length:10},(_,i)=>get('riffle'+i));
  const cards=Array.from({length:4},(_,i)=>({el:get('deal'+i),back:get('back'+i),face:get('face'+i)}));
  let frame=0;const start=performance.now();
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const draw=(t:number)=>{
   let lx=192,rx=238,ly=244,ry=244,lr=-12,rr=12;
   if(t<.65){const p=ease(t/.65);lx=mix(208,168,p);rx=mix(222,262,p);lr=mix(0,-28,p);rr=mix(0,28,p);}
   else if(t<2.05){const p=ease((t-.65)/1.4);lx=mix(168,190,p);rx=mix(262,240,p);lr=mix(-28,-12,p);rr=mix(28,12,p);ly-=Math.sin(p*Math.PI)*8;ry-=Math.sin(p*Math.PI)*8;}
   else if(t<2.65){const p=ease((t-2.05)/.6);lx=mix(190,209,p);rx=mix(240,221,p);lr=mix(-12,0,p);rr=mix(12,0,p);}
   else if(t<4.15){const p=ease((t-2.65)/1.5);lx=mix(209,164,p);rx=mix(221,266,p);ly=mix(244,257,p);ry=ly;lr=mix(0,-12,p);rr=mix(0,12,p);}
   else if(t<7.15){lx=164;rx=266;ly=257+Math.sin(t*2)*2;ry=257-Math.sin(t*2)*2;}
   else {const p=ease((t-7.15)/1.3);lx=mix(164,208,p);rx=mix(266,222,p);ly=mix(257,244,p);ry=ly;}
   la.setAttribute('d',`M130 199Q139 229 ${lx-9} ${ly+12}Q${lx-4} ${ly+18} ${lx+2} ${ly+10}`);
   ra.setAttribute('d',`M300 199Q291 229 ${rx+9} ${ry+12}Q${rx+4} ${ry+18} ${rx-2} ${ry+10}`);
   left.setAttribute('transform',`translate(${lx} ${ly}) rotate(${lr})`);right.setAttribute('transform',`translate(${rx} ${ry}) rotate(${rr})`);
   riffles.forEach((el,i)=>{const p=clamp((t-(.72+i*.096))/.66),from=i%2?262:168;el.setAttribute('opacity',p>0&&p<1?'1':'0');el.setAttribute('transform',`translate(${mix(from,215,ease(p))} ${244-Math.sin(p*Math.PI)*(22+i%3*5)}) rotate(${mix(i%2?30:-30,0,p)}) scale(1 ${Math.max(.18,Math.abs(Math.cos(p*Math.PI)))})`);});
   aura.setAttribute('opacity',String(ease((t-3.2)/1)*ease((8.05-t)/.7)));
   cards.forEach((c,i)=>{const begin=2.75+i*.29,p=ease((t-begin)/.83),out=ease((t-(7.15+i*.13))/.85),visible=t>=begin&&out<1;
    const x=mix(mix(215,[113,181,249,317][i],p),215,out),y=mix(mix(245,[230,220,220,230][i],p),245,out)-Math.sin(p*Math.PI)*25+Math.sin(t*2.5+i*.7)*2*p*(1-out);
    const flip=clamp((p-.42)/.48),sx=Math.max(.055,Math.abs(Math.cos(flip*Math.PI))),scale=mix(.64,1.06,p)*(1-.36*out);
    c.el.setAttribute('opacity',visible?String(1-out*.8):'0');c.el.setAttribute('transform',`translate(${x} ${y}) rotate(${[-11,-4,4,11][i]*p*(1-out)}) scale(${scale*sx} ${scale})`);
    c.back.setAttribute('opacity',flip<.5?'1':'0');c.face.setAttribute('opacity',flip>=.5?'1':'0');
   });
  };
  const tick=(now:number)=>{if(reduced.matches){draw(5.5);return;}draw(((now-start)/1000)%8.8);frame=requestAnimationFrame(tick);};
  const restart=()=>{cancelAnimationFrame(frame);if(reduced.matches)draw(5.5);else frame=requestAnimationFrame(tick);};
  restart();reduced.addEventListener('change',restart);
  return()=>{cancelAnimationFrame(frame);reduced.removeEventListener('change',restart);};
 },[]);
 return <g ref={root} className="wizard-deck" pointerEvents="none"><Arm data-part="la"/><Arm data-part="ra"/>{['left','right'].map((side,j)=><g key={side} data-part={side}>{Array.from({length:5},(_,i)=><g key={i} transform={`translate(${(j?-1:1)*i*.9} ${-i*1.5}) rotate(${(j?-1:1)*i*1.2}) scale(.62)`}><Card back/></g>)}</g>)}{Array.from({length:10},(_,i)=><g key={i} data-part={'riffle'+i} opacity="0"><g transform="scale(.61)"><Card back/></g></g>)}<g data-part="aura" opacity="0"><path d="M93 213Q215 163 337 213M106 265Q215 289 324 265" stroke="#d5b6f7" strokeOpacity=".35" fill="none" strokeDasharray="3 5"/><Star x={100} y={191} r={4}/><Star x={330} y={190}/><Star x={215} y={185} r={4}/></g>{[0,1,2,3].map(i=><g key={i} data-part={'deal'+i} opacity="0"><g data-part={'back'+i}><Card kind={i} back/></g><g data-part={'face'+i} opacity="0"><Card kind={i}/></g></g>)}</g>;
}
