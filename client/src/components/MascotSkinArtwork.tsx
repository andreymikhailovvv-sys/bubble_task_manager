
import type { ReactNode } from 'react';

// Hand-drawn SVG overlays in the original mascot's viewBox. Headgear stays
// above the face, collars below it, and both are painted before the moving arms.
const palettes: Record<string, [string,string,string,string]> = {
  aviator:['#b97c50','#523327','#e8c47d','#f7e9cf'],
  northern:['#65c6bd','#14655f','#a9e3d3','#e7fff3'],
  maestro:['#c36283','#70233d','#efc98b','#ffdfd5'],
  diplomat:['#596577','#202a3a','#cbd5df','#f4eee1'],
  orbit:['#e9f5fb','#687c9e','#9be8ef','#ffffff'],
  samurai:['#b64b54','#46243b','#eac477','#ffdcb5'],
  racer:['#e65159','#8b2338','#f3d183','#fff4df'],
  wizard:['#7771cb','#31254f','#ffd887','#e8ddff'],
  treasurer:['#67b89e','#235d52','#f6cc80','#f4e9d1'],
  broker:['#59748d','#233749','#f1c582','#e7eef2'],
  reserve:['#ffe19b','#ad681c','#fff0c7','#fff8e6']
};
export const isScarfSkin = (id:string) => id === 'northern' || id === 'maestro';
export function MascotSkinArtwork({skinId,suffix}:{skinId:string;suffix:string}) {
  const palette=palettes[skinId];
  if (!palette) return null;
  const [light,dark,trim,glint]=palette;
  const grad='wardrobe-fabric-'+suffix;
  const metal='wardrobe-metal-'+suffix;
  const fabric='url(#'+grad+')', shine='url(#'+metal+')';
  const line={stroke:dark,strokeWidth:2.8,strokeLinejoin:'round' as const};
  let head:ReactNode=null, collar:ReactNode=null;
  const seams=<path d="M178 231Q215 247 253 231" stroke={glint} strokeOpacity=".34" strokeWidth="2.5" fill="none" strokeLinecap="round"/>;
  const bow=<g {...line}><path d="M213 229L192 217Q185 215 185 228V239Q185 245 192 241L213 232Z" fill={fabric}/><path d="M217 229L238 217Q245 215 245 228V239Q245 245 238 241L217 232Z" fill={fabric}/><rect x="208" y="222" width="14" height="16" rx="5" fill={shine}/></g>;
  switch(skinId) {
    case 'aviator':
      head=<g {...line}><path d="M160 95Q151 61 182 48Q215 30 252 48Q279 59 277 97L264 111L252 88H180L172 110Z" fill={fabric}/><path d="M186 48Q210 35 240 48M165 75Q180 65 194 65M241 65Q263 66 273 79" stroke={glint} strokeOpacity=".55" fill="none" strokeDasharray="3 4"/><path d="M164 81H266" stroke={trim} strokeWidth="8" strokeLinecap="round"/>{[191,239].map(x=><g key={x}><rect x={x-18} y="64" width="36" height="27" rx="11" fill={shine}/><rect x={x-13} y="69" width="26" height="17" rx="7" fill="#24485d"/><path d={'M'+(x-9)+' 77l9 -5'} stroke="#d9faff" strokeWidth="3" strokeLinecap="round"/></g>)}<path d="M209 76H221" stroke={trim} strokeWidth="6"/></g>;
      collar=<g {...line}><path d="M158 215Q215 231 270 215L264 238Q215 253 166 238Z" fill={fabric}/><path d="M245 232L267 236L255 260L236 252Z" fill={fabric}/>{seams}<path d="M247 254l9 4" stroke={trim}/></g>;break;
    case 'northern':
      head=<g {...line}><path d="M158 91Q156 43 215 41Q274 43 273 91Z" fill={fabric}/><circle cx="215" cy="36" r="11" fill={shine}/>{[178,190,203,215,227,240,252].map(x=><path key={x} d={'M'+x+' 51q-7 18 -4 32'} fill="none" stroke={glint} strokeOpacity=".35" strokeWidth="3"/>)}<rect x="153" y="83" width="125" height="20" rx="9" fill={fabric}/><path d="M163 90H268M163 96H268" stroke={glint} strokeOpacity=".6" strokeDasharray="3 5"/></g>;
      collar=<g {...line}><path d="M154 214Q215 229 276 214L273 236Q215 251 157 236Z" fill={fabric}/><path d="M246 231Q261 229 268 237L263 272L243 269Z" fill={fabric}/><path d="M245 268l-2 6m7-5l-2 7m7-6l-2 7m7-7l-1 7" stroke={trim} strokeWidth="3"/><path d="M165 224Q213 239 266 224M164 231Q214 245 263 231" stroke={glint} strokeOpacity=".5" fill="none" strokeDasharray="4 4"/></g>;break;
    case 'maestro':
      head=<g {...line}><path d="M159 91Q147 70 168 54Q198 33 242 48Q281 59 276 86Q251 100 208 94Z" fill={fabric}/><path d="M162 87Q219 101 275 85L272 98Q215 109 161 99Z" fill={dark}/><path d="M184 59Q214 45 249 57" fill="none" stroke={glint} strokeOpacity=".5" strokeWidth="3.5" strokeLinecap="round"/><path d="M215 48l-4-10" stroke={dark} strokeWidth="5" strokeLinecap="round"/></g>;
      collar=<g {...line}><path d="M170 214Q216 232 260 214L253 235L216 250L178 235Z" fill={fabric}/><path d="M215 229L201 245L215 254L229 244Z" fill={fabric}/><circle cx="215" cy="231" r="7" fill={shine}/><path d="M212 228l6 5" stroke={glint}/></g>;break;
    case 'diplomat':
      head=<g {...line}><path d="M171 88L183 47Q197 37 213 50Q234 36 248 49L261 88Z" fill={fabric}/><path d="M174 73Q215 83 257 72L261 88H171Z" fill="#161e2a"/><path d="M152 87Q216 78 281 88Q293 96 273 103Q215 112 158 103Q140 97 152 87Z" fill={fabric}/><path d="M160 92Q215 85 269 93" stroke={trim} strokeOpacity=".6" fill="none"/><path d="M248 78l8-13" stroke={trim} strokeWidth="4" strokeLinecap="round"/></g>;
      collar=<g {...line}><path d="M157 213L202 222L215 248L228 222L273 213L259 241Q215 260 171 241Z" fill={fabric}/><path d="M196 217L215 245L234 217L215 229Z" fill="#f2ede4"/><path d="M166 216L202 224L189 238L214 249M264 216L228 224L241 238L216 249" stroke={trim} fill="none"/>{bow}</g>;break;
    case 'orbit':
      head=<g {...line}><path d="M153 99Q143 51 185 36Q215 24 245 36Q286 52 277 99L263 112L255 99Q266 66 242 55Q214 42 188 55Q164 66 175 99L168 112Z" fill={fabric}/><path d="M162 79Q169 43 211 41Q252 42 269 76" fill="none" stroke={glint} strokeWidth="4" strokeLinecap="round"/><rect x="157" y="82" width="16" height="23" rx="6" fill={dark}/><rect x="257" y="82" width="16" height="23" rx="6" fill={dark}/><path d="M186 51L191 61M239 51L234 61" stroke={trim} strokeWidth="4" strokeLinecap="round"/></g>;
      collar=<g {...line}><path d="M153 215Q214 231 277 215L273 240Q216 258 157 240Z" fill={fabric}/><path d="M164 226Q215 244 266 226" stroke={trim} strokeWidth="4" fill="none"/><rect x="205" y="229" width="20" height="12" rx="5" fill={dark}/><circle cx="212" cy="235" r="2.5" fill={glint}/><circle cx="220" cy="235" r="2.5" fill={trim}/></g>;break;
    case 'samurai':
      head=<g {...line}><path d="M157 93Q154 42 215 39Q276 42 273 93L268 104H162Z" fill={fabric}/><path d="M166 90L151 109L173 116L183 94M264 90L279 109L257 116L247 94" fill={fabric}/><path d="M176 60Q215 43 254 60M162 83Q215 66 268 83M155 102Q215 87 275 102" stroke={trim} fill="none" strokeWidth="3"/><path d="M215 77Q191 65 184 38Q202 51 215 56Q228 51 246 38Q239 65 215 77Z" fill={shine}/><circle cx="215" cy="70" r="9" fill={dark} stroke={trim} strokeWidth="3"/></g>;
      collar=<g {...line}><path d="M155 215L215 234L275 215L268 239L215 256L162 239Z" fill={fabric}/><path d="M161 222L215 242L269 222M170 236L215 252L260 236" stroke={trim} strokeWidth="3" fill="none" strokeDasharray="5 4"/><circle cx="215" cy="239" r="7" fill={shine}/></g>;break;
    case 'racer':
      head=<g {...line}><path d="M155 95Q147 44 215 36Q283 44 275 95L260 108L250 87Q215 75 180 87L170 108Z" fill={fabric}/><path d="M202 38L219 37L226 81L208 80Z" fill="#fff2d6"/><path d="M219 37L225 37L231 81L226 81Z" fill="#e6b43e"/><path d="M162 84Q215 70 268 84L263 97Q215 86 167 97Z" fill="#293044"/><path d="M177 59Q186 48 198 46" fill="none" stroke={glint} strokeOpacity=".7" strokeWidth="4" strokeLinecap="round"/></g>;
      collar=<g {...line}><path d="M155 216Q215 233 275 216L270 239Q215 255 160 239Z" fill={fabric}/><path d="M163 227Q215 243 267 227" fill="none" stroke={glint} strokeWidth="3.5" strokeDasharray="8 5"/><rect x="205" y="226" width="21" height="16" rx="4" fill={dark} stroke={trim}/><path d="M211 234l4 3 6-6" stroke={glint} fill="none" strokeWidth="2.5"/></g>;break;
    case 'wizard':
      head=<g {...line}><path d="M174 89Q188 64 209 48Q226 32 254 35Q230 47 232 59L253 90Z" fill={fabric}/><path d="M179 81Q215 94 250 80L257 92Q214 104 173 92Z" fill={dark}/><ellipse cx="215" cy="96" rx="72" ry="13" fill={fabric}/><path d="M150 95Q215 89 280 95" stroke={glint} strokeOpacity=".5" fill="none"/><path d="M215 57l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z" fill={shine} stroke={trim} strokeWidth="1.3"/><circle cx="198" cy="78" r="2.5" fill={trim}/><circle cx="236" cy="77" r="2" fill={trim}/></g>;
      collar=<g {...line}><path d="M157 215L215 234L273 215L267 239Q215 259 163 239Z" fill={fabric}/><path d="M168 224Q215 246 262 224" stroke={trim} fill="none" strokeDasharray="3 5"/><path d="M215 229l5 8-5 8-5-8Z" fill={shine}/></g>;break;
    case 'treasurer':
      head=<g {...line}><path d="M162 87Q158 52 215 47Q272 52 268 87Z" fill={fabric}/><path d="M152 86Q213 77 273 85L285 101Q260 111 213 102L155 102Z" fill={fabric}/><path d="M161 91Q223 84 275 96" stroke={trim} strokeWidth="3" fill="none"/><rect x="204" y="68" width="22" height="14" rx="5" fill={shine}/><path d="M210 72h10m-5 0v6" stroke={dark} strokeWidth="2"/></g>;
      collar=<g {...line}><path d="M162 214L215 231L268 214L260 239L215 251L170 239Z" fill="#ede7d7"/><path d="M209 230H221L225 246L215 254L205 246Z" fill={fabric}/><path d="M163 215L204 233L188 240L171 238M267 215L226 233L242 240L259 238" fill={dark}/><path d="M215 235v11" stroke={trim}/></g>;break;
    case 'broker':
      head=<g {...line}><path d="M172 86Q166 44 215 44Q264 44 258 86Z" fill={fabric}/><path d="M175 72Q215 82 255 72L258 85H172Z" fill={dark}/><ellipse cx="215" cy="94" rx="69" ry="13" fill={fabric}/><path d="M154 94Q215 85 276 94" stroke={trim} strokeWidth="2" fill="none"/><path d="M185 61Q195 48 213 48" stroke={glint} strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" fill="none"/></g>;
      collar=<g {...line}><path d="M159 216L215 231L271 216L260 241L215 255L170 241Z" fill={fabric}/><path d="M202 221L215 231L228 221L215 245Z" fill={glint}/><path d="M208 232H222L224 246L215 254L206 246Z" fill={dark}/><path d="M208 240l14-5m-13 12l14-5" stroke={trim} strokeWidth="2"/><path d="M167 221l23 20m-16-23l23 23m66-20l-23 20m16-23l-23 23" stroke={glint} strokeOpacity=".35" fill="none"/></g>;break;
    case 'reserve':
      head=<g {...line}><path d="M158 97L153 58L179 76L191 42L215 70L239 42L251 76L277 58L272 97Z" fill={shine}/><rect x="158" y="91" width="114" height="14" rx="6" fill={fabric}/><path d="M166 97H264" stroke={glint} strokeWidth="3" strokeLinecap="round"/>{[153,191,239,277].map((x,i)=><circle key={x} cx={x} cy={i===1||i===2?42:58} r="5" fill={shine}/>)}<path d="M215 71l10 11-10 11-10-11Z" fill="#a64b68" stroke="#fff1d0" strokeWidth="3"/><circle cx="179" cy="85" r="4" fill="#3a9c96"/><circle cx="251" cy="85" r="4" fill="#3a9c96"/></g>;
      collar=<g {...line}><path d="M156 215Q215 234 274 215L265 239Q215 256 165 239Z" fill="#6b384e" stroke={trim}/><path d="M166 223Q215 243 264 223" stroke={trim} strokeWidth="4" fill="none"/><circle cx="215" cy="236" r="13" fill={shine}/><path d="M215 228v16m-5-12h10m-10 5h10" fill="none" stroke={dark} strokeWidth="2.5" strokeLinecap="round"/></g>;break;
  }
  return <g className="planik-skin-artwork" aria-hidden="true">
    <defs><linearGradient id={grad} x1="0" y1="0" x2=".75" y2="1"><stop stopColor={light}/><stop offset="1" stopColor={dark}/></linearGradient><linearGradient id={metal} x1="0" y1="0" x2="1" y2="1"><stop stopColor={glint}/><stop offset=".48" stopColor={trim}/><stop offset="1" stopColor={light}/></linearGradient></defs>
    <g className="planik-skin-head">{head}</g><g className="planik-skin-collar">{collar}</g>
  </g>;
}
