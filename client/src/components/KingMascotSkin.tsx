import type { PlanikMode } from './PlanikMascot';
const gem=(x:number,y:number,r:number,color:string)=><g key={x+':'+y}><path d={`M${x} ${y-r}l${r} ${r} -${r} ${r} -${r} -${r}Z`} fill={color} stroke="#ffe1a0" strokeWidth="1.5"/><path d={`M${x} ${y-r+2}l-${r*.6} ${r*.6}`} stroke="#fff" strokeOpacity=".8"/></g>;
export function KingThrone({suffix}:{suffix:string}){
 const gold='url(#king-gold-'+suffix+')', velvet='url(#king-velvet-'+suffix+')';
 return <g pointerEvents="none">
 <defs><linearGradient id={'king-gold-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff0b5"/><stop offset=".33" stopColor="#e8b94f"/><stop offset=".68" stopColor="#9e5e16"/><stop offset="1" stopColor="#f9d47e"/></linearGradient><linearGradient id={'king-velvet-'+suffix} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#9f214c"/><stop offset=".5" stopColor="#661230"/><stop offset="1" stopColor="#340d26"/></linearGradient></defs>
 <path d="M111 258V116Q111 76 139 60L215 42L291 60Q319 76 319 116V258Z" fill={gold} stroke="#75420e" strokeWidth="3"/><path d="M126 250V118Q126 85 149 73L215 56L281 73Q304 85 304 118V250Z" fill={velvet} stroke="#e4ae4d" strokeWidth="3"/>
 {[145,177,209,241,273].map(x=><path key={x} d={`M${x} 92l25 42 -25 42 25 42`} stroke="#d97888" strokeOpacity=".25" fill="none" strokeWidth="2"/>)}
 <rect x="104" y="236" width="222" height="27" rx="12" fill={velvet} stroke="#e8b950" strokeWidth="3"/>
 {[105,325].map(x=><g key={x}><rect x={x-11} y="193" width="22" height="77" rx="7" fill={gold} stroke="#9e661f" strokeWidth="2"/><circle cx={x} cy="194" r="13" fill={gold} stroke="#925615" strokeWidth="2"/>{gem(x,194,5,'#a92147')}<path d={`M${x-8} 270v12h16v-12`} fill={gold} stroke="#9e661f" strokeWidth="2"/></g>)}
 <path d="M114 275h202l8 11H106Z" fill={gold} stroke="#996020" strokeWidth="2"/>
 </g>;
}
export function KingOutfit({suffix}:{suffix:string}){
 const gold='url(#king-gold-'+suffix+')', cloth='url(#king-velvet-'+suffix+')';
 return <g pointerEvents="none">
 <path d="M128 187Q146 203 164 211Q215 228 266 211Q284 203 302 187L318 250Q275 267 215 268Q155 267 112 250Z" fill={cloth} stroke="#682032" strokeWidth="3"/>
 <path d="M129 190Q151 212 181 220L172 263L119 250Z M301 190Q279 212 249 220L258 263L311 250Z" fill="#f7e3c9" stroke={gold} strokeWidth="3"/>
 {[132,146,160,270,284,298].map((x,i)=><path key={x} d={`M${x} ${229+i%2*10}l2 -4 2 4 -2 4Z`} fill="#5a4543"/>)}
 <path d="M175 223Q215 247 255 223L252 231Q215 253 178 231Z" fill={gold}/>
 {[[185,233],[200,241],[215,245],[230,241],[245,233],[182,253],[248,253]].map(([x,y],i)=>gem(x,y,5,['#f23e67','#3dc8ac','#78a9f8'][i%3]))}
 <g className="king-crown"><path d="M156 88L148 43L179 62L215 38L251 62L282 43L274 88Q215 105 156 88Z" fill={gold} stroke="#8a4e16" strokeWidth="3" strokeLinejoin="round"/>
 <path d="M158 77Q215 90 272 77L274 89Q215 105 156 89Z" fill="#f4cd74" stroke="#9a621f" strokeWidth="2"/>
 {[148,215,282].map((x,i)=><circle key={x} cx={x} cy={i===1?38:43} r="5" fill="#ffe7a4" stroke="#b57422" strokeWidth="2"/>)}
 {gem(215,63,12,'#d91d4e')}{gem(178,73,7,'#29ad92')}{gem(252,73,7,'#2f77ca')}{gem(193,87,4,'#ca2553')}{gem(237,87,4,'#ca2553')}
 </g></g>;
}
export function KingGesture({mode,suffix}:{mode:PlanikMode;suffix:string}){
 const thinking=mode==='thinking',greeting=mode==='hover'||mode==='showcase',x=thinking?215:91,gold='url(#king-gold-'+suffix+')';
 const arm=(d:string)=><><path d={d} fill="none" stroke="#681a38" strokeWidth="23" strokeLinecap="round"/><path d={d} pathLength="100" fill="none" stroke="#ad375c" strokeWidth="17" strokeLinecap="round" strokeDasharray="78 100"/></>;
 const hand=(cx:number,cy:number)=><ellipse cx={cx} cy={cy} rx="10" ry="8" fill="#f2ba72" stroke="#a36c31" strokeWidth="2"/>;
 return <g pointerEvents="none">
 <path d={`M${x} 126V268`} stroke="#87511d" strokeWidth="10" strokeLinecap="round"/><path d={`M${x} 126V268`} stroke={gold} strokeWidth="6" strokeLinecap="round"/>
 <path d={`M${x-14} 122L${x} 133L${x+14} 122L${x+10} 109H${x-10}Z`} fill={gold} stroke="#986022" strokeWidth="2"/>
 <g className="king-ruby"><path d={`M${x} 83L${x+16} 98L${x+11} 119H${x-11}L${x-16} 98Z`} fill="#c91642" stroke="#ffd781" strokeWidth="3"/><path d={`M${x} 85L${x-6} 99L${x} 116L${x+7} 99Z`} fill="#ff5472"/><path d={`M${x-12} 98H${x+12}`} stroke="#ff9bb0" strokeWidth="1.5"/></g>
 {thinking?<>{arm('M132 195Q143 224 208 191')}{hand(208,191)}{arm('M298 195Q283 232 221 212')}{hand(221,212)}</>:<>{arm('M132 195Q113 217 92 202')}{hand(92,202)}<g className={greeting?'king-rest-hand':undefined}>{arm('M298 195Q310 222 323 221')}{hand(323,221)}</g>{greeting&&<g className="king-greeting-arm">{arm('M298 195Q330 140 276 77')}{hand(276,77)}</g>}</>}
 </g>;
}
