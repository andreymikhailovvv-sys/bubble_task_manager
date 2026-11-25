/** Short, non-interactive entrance props. The actual character stays mounted. */
export function MascotArrivalEffects({skinId}:{skinId:string}) {
  if (!['northern','zoomer','pirate','wizard','ninja','space','banker'].includes(skinId)) return null;
  return <span className="mascot-arrival-effect" data-arrival-skin={skinId} aria-hidden="true">
    {skinId==='zoomer' ? <span className="mascot-arrival-phone"><i/><b/></span> :
     skinId==='pirate'||skinId==='banker' ? <span className="mascot-money-cloud">
       {Array.from({length:18},(_,i)=>{const a=i*2.39996;return <span key={i} className={'mascot-money-piece '+(i%3===0?'is-note':'is-coin')} style={{left:(50+Math.cos(a)*12)+'%',top:(55+Math.sin(a)*12)+'%','--money-x':Math.cos(a)*(25+i%4*10)+'px','--money-y':Math.sin(a)*(20+i%5*8)+'px','--money-r':((i*47)%140-70)+'deg',animationDelay:(i%4)*.025+'s'} as import('react').CSSProperties}>{i%3===0?'₽':''}</span>})}
     </span> :
     skinId==='wizard'||skinId==='space' ? <span className="mascot-arrival-portal"><i/><b/></span> : null}
    {skinId!=='pirate' && skinId!=='banker' && Array.from({length:12},(_,i)=><span key={i} className="mascot-arrival-particle" style={{
      left: (8+(i*37)%85)+'%', top:(10+(i*23)%78)+'%', animationDelay:(i%4)*.025+'s',
      transform:'rotate('+i*31+'deg)'
    }}/>)}
  </span>;
}
