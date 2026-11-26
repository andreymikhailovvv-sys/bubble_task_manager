
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MASCOT_SKINS, effectiveMascotSkin, findMascotSkin } from '../src/config/mascot-skins.js';
import { wardrobeState } from '../src/services/mascot-wardrobe.service.js';
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
test('only released skins are available; maestro is free and max inherits northern',()=>{
 assert.deepEqual(MASCOT_SKINS.map(s=>[s.variant,s.id,s.rank]),[['planner','classic',0],['planner','cat',0],['planner','northern',2],['planner','maestro',0],['planner','zoomer',2],['planner','pirate',2],['planner','wizard',3],['planner','ninja',3],['planner','space',3],['economic','classic',0],['economic','cat',0],['economic','king',3],['economic','banker',2]]);
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
 assert.equal(expired.catalog.length,13);
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
 assert.match(rig,/banker && mode==='income' \? <BankerMoney/);
 assert.match(css,/zoomer-restore-hover 1\.3s steps\(1,end\) both/);
 assert.match(art,/className="zoomer-phone-back"/);
 assert.match(art,/className="shirt-collar"/);
 assert.ok(rig.indexOf('shirt-search-holding-arm')<rig.indexOf('<rect x="80" y="151"'));
 assert.match(rig,/shirtSkin \? null : north \? <><path d="M102 216/);
});

test('adventure skins respect tiers, keep the covered eye hidden outside hover and reuse the original body',()=>{
 for(const [id,rank] of [['pirate',2],['ninja',3],['space',3]] as const){
  assert.equal(effectiveMascotSkin('planner',id,rank-1),'classic');
  assert.equal(effectiveMascotSkin('planner',id,rank),id);
  assert.equal(findMascotSkin('economic',id),undefined);
 }
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 const art=read('../../client/src/components/AdventureMascotSkins.tsx');
 assert.match(rig,/viewBox="35 32 345 275"/);
 assert.match(rig,/pirate && mode==='thinking' \? <PirateMap/);
 assert.match(rig,/space && mode==='thinking' \? <SpaceSignal/);
 assert.match(css,/\[data-skin=pirate\] \.planik-eye-right\{visibility:hidden\}/);
 assert.match(css,/ninja-scan 2\.1s ease-in-out infinite/);
 assert.match(art,/className="ninja-notebook-scene"/);
 assert.match(art,/className="ninja-chopsticks-arm"/);
 assert.doesNotMatch(art,/className="ninja-bomb"/);
 assert.match(css,/space-weightless 7s ease-in-out infinite/);
 assert.match(art,/className="pirate-eye-patch"/);
 assert.match(art,/className="ninja-ready"/);
});

test('both cat outfits are free even after expiration and preserve independent selections',()=>{
 for(const variant of ['planner','economic'] as const){
  assert.equal(findMascotSkin(variant,'cat')?.rank,0);
  for(const rank of [0,1,2,3])assert.equal(effectiveMascotSkin(variant,'cat',rank),'cat');
 }
 const base={id:'u',subscriptionPlan:'pro',subscriptionExpiresAt:new Date('2026-11-01'),plannerMascotSkin:'cat',economicMascotSkin:'cat'};
 assert.deepEqual(wardrobeState(base,new Date('2026-11-24')).selected,{planner:'cat',economic:'cat'});
 assert.deepEqual(wardrobeState({...base,economicMascotSkin:'classic'},new Date('2026-11-24')).selected,{planner:'cat',economic:'classic'});
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const art=read('../../client/src/components/CatMascotEars.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 const modal=read('../../client/src/components/MascotWardrobe.tsx');
 assert.ok(rig.includes('<CatMascotEars suffix={gradientSuffix} variant={variant}/>'));
 assert.ok(rig.indexOf('<CatMascotEars')<rig.indexOf('className="planik-body-surface"'));
 assert.match(rig,/viewBox="35 32 345 275"/);
 assert.match(art,/className="cat-ear-left"/);
 assert.match(art,/className="cat-ear-right"/);
 assert.match(art,/translate\(430 0\) scale\(-1 1\)/);
 assert.match(css,/\[data-skin="cat"\]\[data-mode="thinking"\] \.cat-ear-left\{animation:cat-ear-left-think 2\.8s/);
 assert.match(css,/\[data-skin="cat"\]\[data-mode="thinking"\] \.cat-ear-right\{animation:cat-ear-right-think 3\.5s ease-in-out -\.9s/);
 assert.match(modal,/: \['idle','thinking'\]/);
});

test('managed desktop mascots retain selected skin and switch to modal or embedded chat anchors',()=>{
 const app=read('../../client/src/App.tsx');
 const econ=read('../../client/src/EconomicApp.tsx');
 const frame=read('../../client/src/components/QuickAiLauncherFrame.tsx');
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const wardrobe=read('../../client/src/components/MascotWardrobe.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 const econCss=read('../../client/src/EconomicApp.css');
 assert.ok(app.includes('modalMascot={mascotSurface.modal}'));
 assert.ok(app.includes('embeddedChatTarget={hasGeneralAiPane ? fullscreenChatTarget : null}'));
 assert.ok(app.includes('showPlanik={false}'));
 assert.ok(frame.includes('--mascot-chat-bottom'));
 assert.ok(econ.includes('arrivalKey={mascotSurface.arrivalKey}'));
 assert.ok(rig.includes("skinOverride ?? identity?.skinId ?? 'classic'"));
 assert.ok(rig.includes("banker && mode==='hover' && <BankerMoney"));
 assert.ok(!rig.includes("banker && mode==='idle' && <BankerMoney"));
 assert.ok(wardrobe.includes('.sort((a,b)=>a.rank-b.rank)'));
 for (const animation of ['snow','phone','gold','portal','smoke','beam']) assert.ok(css.includes('@keyframes mascot-'+animation+'-enter'),animation);
 assert.ok(econCss.includes('.econ-root.econ-dialog-layer{background:transparent!important}'));
});

test('split timeline, modal rails and money cloud keep their explicit surface rules',()=>{
 const css=read('../../client/src/styles.css');
 const mascot=read('../../client/src/components/PlanikMascot.css');
 const art=read('../../client/src/components/MascotArrivalEffects.tsx');
 const frame=read('../../client/src/components/QuickAiLauncherFrame.tsx');
 const app=read('../../client/src/App.tsx');
 assert.ok(css.includes('.timeline-canvas-inner>*{margin:0!important}'));
 assert.ok(mascot.includes('mascot-money-cloud'));
 assert.ok(art.includes('mascot-money-piece'));
 assert.ok(frame.includes('data-quick-hover={hovered}'));
 assert.ok(app.includes('hideToggle={Boolean((focusedTask && !embeddedFocusActive) || isFocusModeOpen)}'));
});

test('royal Economic outfit requires Maximum and renders its three poses',()=>{
 assert.equal(findMascotSkin('planner','king'),undefined);
 for(const rank of [0,1,2]) assert.equal(effectiveMascotSkin('economic','king',rank),'classic');
 assert.equal(effectiveMascotSkin('economic','king',3),'king');
 const base={id:'u',subscriptionPlan:'max',subscriptionExpiresAt:new Date('2026-12-01'),plannerMascotSkin:'classic',economicMascotSkin:'king'};
 assert.equal(wardrobeState(base,new Date('2026-11-25')).selected.economic,'king');
 assert.equal(wardrobeState({...base,subscriptionPlan:'pro'},new Date('2026-11-25')).selected.economic,'classic');
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const art=read('../../client/src/components/KingMascotSkin.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 for(const name of ['KingThrone','KingOutfit','KingGesture']) assert.ok(rig.includes(name));
 assert.ok(art.includes("mode==='thinking'"));
 assert.ok(css.includes('king-tip-crown'));
 assert.ok(css.includes('king-ruby-glow'));
});
test('money arrivals use front and rear clouds with different materials and delayed particles',()=>{
 const rig=read('../../client/src/components/PlanikMascot.tsx');
 const art=read('../../client/src/components/MascotArrivalEffects.tsx');
 const css=read('../../client/src/components/PlanikMascot.css');
 assert.ok(rig.includes('layer="rear"'));
 assert.ok(art.includes("skinId==='pirate'?'is-coin':'is-note'"));
 assert.ok(art.includes('animationDelay:'));
 assert.ok(art.includes('animationDuration:'));
 assert.ok(css.includes('mascot-money-drift'));
 assert.ok(css.includes('mascot-cloud-reveal'));
});

test('thinking is available in wardrobe previews for both modules and every outfit',()=>{
 const modal=read('../../client/src/components/MascotWardrobe.tsx');
 assert.match(modal,/variant==='economic'\s*\? \['idle','hover','thinking','income','expense'\]/);
 assert.match(modal,/\? \['idle','hover','thinking'\]\s*: \['idle','thinking'\]/);
 assert.match(modal,/onClick=\{\(\)=>\{setPreviewMode\(mode\);setReplay\(v=>v\+1\);training\?\.onAnimation\(\);\}\}/);
 assert.match(modal,/previewMode=\{previewMode\}/);
});
