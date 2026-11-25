/** Short, non-interactive entrance props. The actual character stays mounted. */
export function MascotArrivalEffects({skinId}:{skinId:string}) {
  if (!['northern','zoomer','pirate','wizard','ninja','space','banker'].includes(skinId)) return null;
  return <span className="mascot-arrival-effect" data-arrival-skin={skinId} aria-hidden="true">
    {skinId==='zoomer' ? <span className="mascot-arrival-phone"><i/><b/></span> :
     skinId==='pirate'||skinId==='banker' ? <svg className="mascot-arrival-gold" viewBox="0 0 160 90" aria-hidden="true">
       <path d="M4 81Q14 66 31 61Q37 46 57 43Q67 23 87 35Q108 29 119 53Q146 58 156 81Z" fill="#b87524" stroke="#875019" strokeWidth="1.5"/>
       {Array.from({length:56},(_,i)=>{const row=Math.floor(i/14),col=i%14,x=12+col*10+(row%2)*4,y=81-row*11;const height=46- Math.abs(x-80)*.47;if(row*11>height)return null;return <g key={i} transform={`translate(${x} ${y}) rotate(${(i*17)%39-19})`}><ellipse rx="9" ry="4.8" cy="2.4" fill="#a76518"/><ellipse rx="9" ry="4.8" fill={i%3===0?'#ffe59b':'#f7c85d'} stroke="#d48e26" strokeWidth="1"/><ellipse rx="5.7" ry="2.7" fill="none" stroke="#fff1ab" strokeWidth=".8"/></g>})}
       <g fill="#f7d172" stroke="#ad6a1b" strokeWidth="1.2"><path d="m32 65 17-8 13 6-17 9z"/><path d="m104 54 16-8 13 6-17 9z"/><path d="m65 76 19-9 13 6-19 9z"/></g>
       {Array.from({length:19},(_,i)=><g key={'fly'+i} className="mascot-gold-flying" style={{'--coin-x':((i%2?1:-1)*(20+i*3))+'px','--coin-y':(-28-(i*13)%60)+'px','--coin-turn':((i%2?1:-1)*(170+i*29))+'deg',animationDelay:(.11+(i%5)*.014)+'s'} as import('react').CSSProperties}><ellipse cx={66+(i*11)%29} cy={65-(i*7)%21} rx="6.5" ry="4" fill="#ffdb72" stroke="#a96c1c" strokeWidth="1.1"/><path d={`M${63+(i*11)%29} ${64-(i*7)%21}h6`} stroke="#fff2b3" strokeWidth="1"/></g>)}
     </svg> :
     skinId==='wizard'||skinId==='space' ? <span className="mascot-arrival-portal"><i/><b/></span> : null}
    {skinId!=='pirate' && skinId!=='banker' && Array.from({length:12},(_,i)=><span key={i} className="mascot-arrival-particle" style={{
      left: (8+(i*37)%85)+'%', top:(10+(i*23)%78)+'%', animationDelay:(i%4)*.025+'s',
      transform:'rotate('+i*31+'deg)'
    }}/>)}
  </span>;
}
