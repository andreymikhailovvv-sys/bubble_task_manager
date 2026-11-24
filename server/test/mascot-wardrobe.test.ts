
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MASCOT_SKINS, effectiveMascotSkin, findMascotSkin } from '../src/config/mascot-skins.js';
import { wardrobeState } from '../src/services/mascot-wardrobe.service.js';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('only released skins are available; maestro is free and max inherits northern',()=>{
 assert.deepEqual(MASCOT_SKINS.map(s=>[s.variant,s.id,s.rank]),[['planner','classic',0],['planner','northern',2],['planner','maestro',0],['planner','zoomer',2],['planner','wizard',3],['economic','classic',0],['economic','banker',2]]);
 assert.equal(findMascotSkin('planner','aviator'),undefined);
 assert.equal(effectiveMascotSkin('planner','maestro',0),'maestro');
 assert.equal(effectiveMascotSkin('planner','northern',1),'classic');
 assert.equal(effectiveMascotSkin('planner','northern',2),'northern');
 assert.equal(effectiveMascotSkin('planner','wizard',2),'classic');
 assert.equal(effectiveMascotSkin('planner','wizard',3),'wizard');
 assert.equal(effectiveMascotSkin('economic','reserve',3),'classic');
 for(const [variant,id] of [['planner','zoomer'],['economic','banker']] as const){
  assert.equal(effectiveMascotSkin(variant,id,0),'classic');
  assert.equal(effectiveMascotSkin(variant,id,2),id);
  assert.equal(effectiveMascotSkin(variant,id,3),id);
 }
 assert.equal(findMascotSkin('economic','zoomer'),undefined);
 assert.equal(findMascotSkin('planner','banker'),undefined);
});
test('expired or downgraded user sees classic but stored preference remains untouched',()=>{
 const base={id:'u',subscriptionPlan:'max',subscriptionExpiresAt:new Date('2026-12-01'),plannerMascotSkin:'wizard',economicMascotSkin:'reserve'};
 const active=wardrobeState(base,new Date('2026-11-24'));
 assert.deepEqual(active.selected,{planner:'wizard',economic:'classic'});
 const expired=wardrobeState(base,new Date('2026-12-01'));
 assert.deepEqual(expired.selected,{planner:'classic',economic:'classic'});
 assert.equal(expired.catalog.length,7);
 assert.equal(base.plannerMascotSkin,'wizard');
 assert.equal(wardrobeState({...base,subscriptionPlan:'pro'},new Date('2026-11-24')).selected.economic,'classic');
});
test('each catalogue outfit has SVG art and the original rig stays in front of it',()=>{
 const art=read('../../client/src/components/MascotSkinArtwork.tsx');
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const modal=read('../../client/src/components/MascotWardrobe.tsx');
 const css=read('../../client/src/components/MascotWardrobe.css');
 assert.ok(art.includes("case 'maestro'"));
 const refined=read('../../client/src/components/RefinedMascotSkins.tsx');
 assert.match(refined,/skinId==='northern'/);
 assert.match(refined,/wizard-cape-back/);
 assert.ok(rig.indexOf('layer="rear"')<rig.indexOf('className="planik-body-surface"'));
 assert.ok(rig.indexOf('layer="front"')>rig.indexOf('className="planik-body-surface"'));
 assert.ok(rig.indexOf('<MascotSkinArtwork')<rig.indexOf('className="planik-notif-static"'));
 assert.match(rig,/planik-showcase-arm/);
 assert.match(modal,/skin\.rank<=wardrobe\.rank/);
 assert.match(modal,/element\.showModal\(\)/);
 assert.match(css,/wardrobe-leave/);
 assert.match(css,/wardrobe-enter/);
 assert.match(css,/prefers-reduced-motion/);
 const route=read('../src/routes/api.ts');
 assert.match(route,/put\('\/mascot-wardrobe', requireAuth, taskProposalSameOrigin/);
 const service=read('../src/services/mascot-wardrobe.service.ts');
 assert.match(service,/rank < skin.rank/);
 assert.match(service,/subscriptionExpiresAt:\{equals:user.subscriptionExpiresAt,gt:new Date\(\)\}/);
});

test('wardrobe hover is pointer-driven, and catalogue fade only indicates remaining scroll content',()=>{
 const modal=read('../../client/src/components/MascotWardrobe.tsx');
 const css=read('../../client/src/components/MascotWardrobe.css');
 assert.match(modal,/event\.detail>0\)event\.currentTarget\.blur\(\)/);
 assert.match(modal,/pointerover/);
 assert.match(modal,/scrollHeight-element\.clientHeight-element\.scrollTop>2/);
 assert.match(css,/scrollbar-width:none/);
 assert.match(css,/data-more-below="true"\] \.mascot-wardrobe-list-fade/);
 assert.doesNotMatch(css,/\.mascot-wardrobe-anchor:focus-within/);
});

test('approved skins override only their selected normal reactions and preview never equips',()=>{
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const modal=read('../../client/src/components/MascotWardrobe.tsx');
 const art=read('../../client/src/components/RefinedMascotSkins.tsx');
 assert.match(rig,/north && mode === 'hover' \? <NorthernHover/);
 assert.match(rig,/wizard && mode === 'hover' \? <WizardHover/);
 assert.match(rig,/wizard && mode === 'thinking' \? <WizardCards/);
 assert.match(modal,/previewMode=\{previewMode\}/);
 assert.match(modal,/setReplay\(v=>v\+1\)/);
 assert.match(art,/Math\.atan2\(dy,dx\)/);
 assert.match(art,/\[0,1,2,3\]/);
});

test('shirt outfits share the classic viewport and retain normal hover after the phone is hidden',()=>{
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const art=read('../../client/src/components/ShirtMascotSkins.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 const wardrobe=read('../../client/src/components/MascotWardrobe.css');
 assert.match(rig,/viewBox="35 32 345 275"/);
 assert.doesNotMatch(rig,/viewBox=\{refined/);
 assert.doesNotMatch(wardrobe,/aspect-ratio:394\/325/);
 assert.match(rig,/zoomer && \(mode==='idle'\|\|mode==='hover'\)/);
 assert.match(rig,/banker && mode==='typing' \? <BankerMoney/);
 assert.match(css,/zoomer-restore-hover 1\.3s steps\(1,end\) both/);
 assert.match(art,/className="zoomer-phone-back"/);
 assert.match(art,/className="shirt-collar"/);
 assert.ok(rig.indexOf('shirt-search-holding-arm')<rig.indexOf('<rect x="80" y="151"'));
 assert.match(rig,/shirtSkin \? null : north \? <><path d="M102 216/);
});
