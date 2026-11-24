/** Approved cat prototype; behind the body, with the original antenna kept. */
export function CatMascotEars({suffix,variant}:{suffix:string;variant:'planner'|'economic'}){
 const bank=variant==='economic';
 const earId='cat-ear-'+suffix,innerId='cat-inner-'+suffix;
 const inner=bank?['#f9d5b0','#cc886b']:['#d9b9e3','#9c7eb7'];
 const ear=<>
  <path d="M135 113C129 100 124 70 124 43Q124 30 136 37C156 49 178 66 192 89L185 108Z" fill={'url(#'+earId+')'} stroke={'url(#planik-rim-'+suffix+')'} strokeWidth="3.5" strokeLinejoin="round"/>
  <path d="M139 88Q132 66 135 48Q158 61 177 88L169 99Z" fill={'url(#'+innerId+')'} stroke={inner[1]} strokeWidth="1.2" strokeLinejoin="round"/>
  <path d="M130 45Q130 65 136 76" fill="none" stroke={bank?'#fff0c6':'#d5f4fa'} strokeOpacity=".47" strokeWidth="2" strokeLinecap="round"/>
 </>;
 return <g className="cat-mascot-ears" pointerEvents="none" aria-hidden="true">
  <defs>
   <linearGradient id={earId} x1="0" y1="0" x2=".5" y2="1">
    <stop className="planik-body-stop-start" stopColor="#5e5ca3"/>
    <stop className="planik-body-stop-mid" offset="1" stopColor="#373965"/>
   </linearGradient>
   <linearGradient id={innerId} x1="0" y1="0" x2=".7" y2="1">
    <stop stopColor={inner[0]}/><stop offset="1" stopColor={inner[1]}/>
   </linearGradient>
  </defs>
  <g className="cat-ear-left">{ear}</g>
  <g className="cat-ear-right"><g transform="translate(430 0) scale(-1 1)">{ear}</g></g>
 </g>;
}
