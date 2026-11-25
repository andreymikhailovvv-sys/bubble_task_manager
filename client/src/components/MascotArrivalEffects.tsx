/** Short, non-interactive entrance props. The actual character stays mounted. */
export function MascotArrivalEffects({skinId}:{skinId:string}) {
  if (!['northern','zoomer','pirate','wizard','ninja','space','banker'].includes(skinId)) return null;
  return <span className="mascot-arrival-effect" data-arrival-skin={skinId} aria-hidden="true">
    {skinId==='zoomer' ? <span className="mascot-arrival-phone"><i/><b/></span> :
     skinId==='pirate'||skinId==='banker' ? <span className="mascot-arrival-gold">{Array.from({length:9},(_,i)=><i key={i} style={{left:(i%5)*16+'%',bottom:Math.floor(i/5)*20+'%'}}/>)}</span> :
     skinId==='wizard'||skinId==='space' ? <span className="mascot-arrival-portal"><i/><b/></span> : null}
    {Array.from({length:12},(_,i)=><span key={i} className="mascot-arrival-particle" style={{
      left: (8+(i*37)%85)+'%', top:(10+(i*23)%78)+'%', animationDelay:(i%4)*.025+'s',
      transform:'rotate('+i*31+'deg)'
    }}/>)}
  </span>;
}
