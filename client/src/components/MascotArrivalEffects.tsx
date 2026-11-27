import type { CSSProperties } from 'react';
/** The front and rear clouds surround the silhouette; late particles outlive the reveal. */
export function MascotArrivalEffects({skinId,layer='front'}:{skinId:string;layer?:'front'|'rear'}) {
  const money=skinId==='pirate'||skinId==='banker'||skinId==='king';
  if (!['northern','zoomer','pirate','wizard','ninja','space','banker','king'].includes(skinId)||(!money&&layer==='rear')) return null;
  return <span className={'mascot-arrival-effect mascot-arrival-'+layer} data-arrival-skin={skinId} aria-hidden="true">
    {money ? <span className="mascot-money-cloud">
      {Array.from({length:layer==='front'?22:18},(_,i)=>{
        const j=i+(layer==='rear'?22:0), a=j*2.39996, radius=0.28+((j*7)%17)/24;
        const late=j%5===0||j%7===0;
        return <span key={j} className={'mascot-money-piece '+(skinId==='banker'?'is-note':'is-coin')} style={{
          left:(51+Math.cos(a)*radius*46)+'%', top:(51+Math.sin(a)*radius*48)+'%',
          '--money-x':Math.cos(a)*(25+j%5*10)+'px','--money-y':(Math.sin(a)*30+35)+'px',
          '--money-r':((j*47)%220-110)+'deg',
          animationDelay:(late?0.33+(j%4)*.095:(j%6)*.025)+'s',
          animationDuration:(late?0.88+(j%3)*.06:0.63+(j%4)*.06)+'s'
        } as CSSProperties}>{skinId==='banker'?'₽':'✦'}</span>;
      })}
    </span> : skinId==='zoomer' ? <span className="mascot-arrival-phone"><i/><b/></span> :
      skinId==='wizard'||skinId==='space' ? <span className="mascot-arrival-portal"><i/><b/></span> : null}
    {!money && Array.from({length:12},(_,i)=><span key={i} className="mascot-arrival-particle" style={{
      left:(8+(i*37)%85)+'%', top:(10+(i*23)%78)+'%', animationDelay:(i%4)*.025+'s', transform:'rotate('+i*31+'deg)'
    }}/>)}
  </span>;
}
