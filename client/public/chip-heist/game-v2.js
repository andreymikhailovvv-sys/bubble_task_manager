/* CHIP HEIST 2.0. Standalone Canvas arcade; no dependencies or network access. */
'use strict';
const $ = (id) => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const overlay = $('overlay'), announcement = $('announcement'), missionCards = $('missionCards');
const btn = $('primaryButton'), pauseBtn = $('pauseButton'), soundBtn = $('soundButton');
const W = 960, H = 540, FLOOR = 450, TILE = 64, GRAVITY = 1450;
const keys = {left:false,right:false,up:false,down:false,fire:false};
const rand = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const dist = (a,b,c,d) => Math.hypot(a-c,b-d);
let mode='menu', stage=1, worldW=2250, worldH=H, camX=0,camY=0,tick=0,stageTime=0;
let score=0, record=0, chips=0, plans=0, timer=75, stageKills=0;
let pinky,brain,boss=null, enemies=[],items=[],shots=[],sparks=[],effects=[],machines=[],walls=[],exitTile=null;
let hintTime=0, tip='', screenShake=0, bossClock=0, firedPointer=false;
let aim={x:800,y:300,valid:false},audio=null,musicOn=false,beatClock=0,beatIndex=0;
let firstFrame=0, musicChord=0, wave=0;
const weapons = {
  auto: { label:'АВТОМАТ', interval:.11, speed:740, power:1, color:'#8df8da' },
  rpg: { label:'RPG', interval:.72, speed:420, power:5, color:'#ffc078' }
};
const saveKey='chip-heist-record-v2';
try { record=Math.max(0,Number(localStorage.getItem(saveKey))||0); } catch {}
$('highScore').textContent=record.toLocaleString('ru-RU');

function newPinky() {
  return {x:72,y:FLOOR-66,w:38,h:66,vy:0,hp:6,maxHp:6,iframes:0,ground:true,face:1,run:0,
    weapon:'auto', ammo:{auto:55,rpg:0},fireCd:0,rocketUnlocked:false};
}
function newBrain() { return {x:25,y:FLOOR-47,w:35,h:47,face:1,throwCd:2.4,run:0}; }
function speak(value,secs=1.7) {
  tip=value;hintTime=secs;announcement.textContent=value;announcement.classList.add('visible');
}
function ding(freq,duration=.09,waveform='triangle',volume=.05) {
  if(!musicOn)return;
  try {
    if(!audio){const Cls=window.AudioContext||window.webkitAudioContext;if(!Cls)return;audio=new Cls();}
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const osc=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
    osc.type=waveform;osc.frequency.setValueAtTime(Math.max(40,freq),now);
    gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
    osc.connect(gain);gain.connect(audio.destination);osc.start(now);osc.stop(now+duration);
  } catch {}
}
function musicUpdate(dt) {
  if(!musicOn || mode!=='playing')return;
  const bpm=stage===2?150:stage===3?134:122;
  beatClock+=dt;
  const seconds=60/bpm/2;
  const melodies={
    1:[0,2,4,7,4,2,0,-1,0,2,5,7,5,2,4,-1],
    2:[0,4,7,9,7,4,2,-1,0,5,7,12,9,7,4,-1],
    3:[0,2,3,7,3,2,0,-1,5,7,10,7,5,3,2,-1],
    4:[0,1,4,7,6,4,1,-1,0,4,6,9,7,4,1,-1]
  };
  while(beatClock>=seconds){
    beatClock-=seconds;const n=melodies[stage][beatIndex%16];
    const base=stage===2?196:stage===4?174:220;
    if(n!==-1)ding(base*Math.pow(2,n/12),seconds*.77,stage===2?'square':'triangle',stage===2?.019:.016);
    if(beatIndex%2===0)ding(stage===2?98:74,.09,'triangle',.025);
    if(beatIndex%4===2)ding(230,.04,'sawtooth',.008);
    beatIndex++;
  }
}
function scoreUp(amount){score+=amount;if(score>record){record=score;$('highScore').textContent=record.toLocaleString('ru-RU');try{localStorage.setItem(saveKey,String(record));}catch{}}}
function burst(x,y,color,count=12) {
  for(let i=0;i<count;i++)sparks.push({x,y,vx:rand(-200,200),vy:rand(-250,45),life:rand(.2,.65),color,size:rand(2,6)});
  if(sparks.length>260)sparks.splice(0,sparks.length-260);
}
function isMaze(){return stage===3;}
function gridSolid(x,y) {
  if(x<0||y<0||x>=worldW||y>=worldH)return true;
  const c=Math.floor(x/TILE),r=Math.floor(y/TILE);
  return walls.some(w=>w.col===c&&w.row===r);
}
function canStand(x,y,w,h) {
  for(const [cx,cy] of [[x+5,y+5],[x+w-5,y+5],[x+5,y+h-5],[x+w-5,y+h-5]])if(gridSolid(cx,cy))return false;
  return true;
}
function makeMaze(){
  worldW=20*TILE;worldH=13*TILE;walls=[];machines=[];items=[];enemies=[];shots=[];
  const solid=new Set();
  for(let row=0;row<13;row++)for(let col=0;col<20;col++){
    if(row===0||row===12||col===0||col===19)solid.add(col+','+row);
  }
  for(const col of [5,10,15])for(let row=1;row<12;row++)
    if(!([2,6,10].includes(row)))solid.add(col+','+row);
  for(const row of [4,8])for(let col=1;col<19;col++)
    if(!([3,8,13,17].includes(col)))solid.add(col+','+row);
  walls=[...solid].map(s=>{const [col,row]=s.split(',').map(Number);return{col,row};});
  const positions=[[3,2],[8,6],[13,2],[17,10]];
  machines=positions.map(([col,row],id)=>({id,x:col*TILE+32,y:row*TILE+32,taken:false,amount:3}));
  items=[
    {x:2*TILE+32,y:6*TILE+32,type:'ammo',taken:false},
    {x:9*TILE+32,y:10*TILE+32,type:'rocket',taken:false},
    {x:17*TILE+32,y:6*TILE+32,type:'heart',taken:false}
  ];
  enemies=[[3,6],[8,2],[12,6],[17,2],[13,10],[18,9]].map(([col,row],i)=>enemy(col*TILE+13,row*TILE+13,'guard',i));
  exitTile={x:18*TILE+32,y:11*TILE+32};
  pinky.x=TILE+13;pinky.y=TILE+13;pinky.vy=0;
  brain.x=pinky.x+4;brain.y=pinky.y+36;cameraReset();
}
function enemy(x,y,type,i=0) {
  const hp=type==='tom'?8:type==='jerry'?5:3;
  return {x,y,w:type==='tom'?52:38,h:type==='tom'?76:type==='jerry'?46:37,
    type,hp,maxHp:hp,stun:0,face:-1,baseX:x,speed:type==='jerry'?123:type==='tom'?93:95+i*4,
    think:0,path:[],hit:0,phase:i*.73,alive:true};
}
function cameraReset(){camX=0;camY=0;}
function enterStage(number) {
  stage=number;stageTime=0;boss=null;bossClock=1.2;wave=0;beatClock=0;beatIndex=0;
  enemies=[];items=[];shots=[];sparks=[];effects=[];machines=[];walls=[];exitTile=null;
  worldH=H;pinky.x=76;pinky.y=FLOOR-pinky.h;pinky.vy=0;pinky.ground=true;pinky.iframes=1.2;
  brain.x=20;brain.y=FLOOR-brain.h;brain.throwCd=1.7;cameraReset();
  if(number===1) {
    worldW=2250;chips=0;plans=0;
    [[175,388,'chip'],[370,348,'chip'],[565,395,'chip'],[700,351,'plan'],
     [870,389,'chip'],[1100,340,'chip'],[1320,390,'chip'],[1510,345,'plan'],
     [1680,388,'chip'],[1830,346,'chip'],[1970,389,'chip'],[2160,350,'chip'],
     [420,405,'ammo'],[960,404,'heart'],[1440,404,'rpg'],[1860,404,'rocket']]
    .forEach(([x,y,type])=>items.push({x,y,type,taken:false}));
    enemies=[enemy(815,FLOOR-76,'tom'),enemy(1510,FLOOR-46,'jerry'),
      enemy(1830,FLOOR-76,'tom')];
    speak('УРОВЕНЬ 1 · ФАБРИКА TSMC',2.8);
  } else if(number===2){
    worldW=1380;
    boss={type:'heli',x:730,y:140,w:172,h:100,hp:24,maxHp:24,hit:0,phase:0};
    items=[{x:440,y:405,type:'ammo',taken:false},{x:1010,y:405,type:'rocket',taken:false},
      {x:1150,y:405,type:'heart',taken:false}];
    speak('УРОВЕНЬ 2 · ВЕРТОЛЁТ «РИСОВЫЙ АЛЛИГАТОР»',3);
  } else if(number===3) {
    makeMaze();speak('УРОВЕНЬ 3 · ЛАБИРИНТ ДАТА-ЦЕНТРА',3);
  } else {
    worldW=1480;timer=75;boss={type:'final',x:875,y:FLOOR-145,w:120,h:145,hp:30,maxHp:30,hit:0,phase:0};
    items=[{x:410,y:404,type:'ammo',taken:false},{x:670,y:405,type:'rocket',taken:false},
      {x:1240,y:405,type:'heart',taken:false}];
    speak('ФИНАЛ · ДО КРАСНОЙ КНОПКИ 75 СЕКУНД',3);
  }
}
function showResult(eyebrow,heading,description,label,action) {
  $('overlayEyebrow').textContent=eyebrow;$('overlayTitle').innerHTML=heading;
  $('overlayText').textContent=description;missionCards.hidden=true;
  $('overlayHint').textContent='A/D — бег · W/↑ — прыжок (лабиринт: вверх) · мышь — прицел/стрельба · 1/2 — оружие · E — действие · P — пауза';
  btn.innerHTML=label+' <span aria-hidden="true">→</span>';btn.onclick=action;overlay.hidden=false;
}
function start() {
  pinky=newPinky();brain=newBrain();score=0;tick=0;enterStage(1);mode='playing';
  overlay.hidden=true;pauseBtn.textContent='Ⅱ ПАУЗА';canvas.focus({preventScroll:true});
}
function pause() {
  if(mode==='playing'){
    mode='paused';pauseBtn.textContent='▶ ПРОДОЛЖИТЬ';
    showResult('СЕКРЕТНАЯ ПАУЗА','ОТДЫХ <em>ГЕРОЕВ</em>',
      'Мыши обсуждают мировое господство. Время остановлено.','ПРОДОЛЖИТЬ',resume);
  } else if(mode==='paused')resume();
}
function resume(){mode='playing';overlay.hidden=true;pauseBtn.textContent='Ⅱ ПАУЗА';canvas.focus({preventScroll:true});}
function lose(reason) {
  if(mode!=='playing')return;mode='lost';ding(115,.32,'sawtooth');
  showResult('МИССИЯ ПРОВАЛЕНА','ОПЕРАЦИЯ <em>СОРВАНА</em>',
    reason+' Очки: '+score.toLocaleString('ru-RU')+'. Рекорд: '+record.toLocaleString('ru-RU')+'.',
    'НАЧАТЬ ЗАНОВО',start);
}
function victory(){
  if(mode!=='playing')return;scoreUp(3500+Math.ceil(timer)*25+pinky.hp*180);mode='won';
  burst(pinky.x,pinky.y,'#a9ffe3',55);ding(900,.35);
  showResult('МИССИЯ ВЫПОЛНЕНА','МИР <em>СПАСЁН!</em>',
    'Пинки и Брейн вынесли чипы, пережили рисовую авиацию и остановили красную кнопку. Счёт: '+
    score.toLocaleString('ru-RU')+'. Рекорд: '+record.toLocaleString('ru-RU')+'.','СЫГРАТЬ ЕЩЁ',start);
}
function damage(amount=1) {
  if(mode!=='playing'||pinky.iframes>0)return;
  pinky.hp=Math.max(0,pinky.hp-amount);pinky.iframes=1.3;screenShake=7;
  if(!isMaze())pinky.vy=-260;burst(pinky.x+20,pinky.y+30,'#fc8598',15);ding(134,.18,'sawtooth');
  if(pinky.hp<=0)lose('Здоровье закончилось. Том уже пишет отчёт.');
}
function switchWeapon(next) {
  if(next==='rpg'&&!pinky.rocketUnlocked){speak('СНАЧАЛА ПОДБЕРИ RPG',1);return;}
  if(next) pinky.weapon=next;
  else pinky.weapon=pinky.weapon==='auto'&&pinky.rocketUnlocked?'rpg':'auto';
  speak('ОРУЖИЕ: '+weapons[pinky.weapon].label,1);
}
function actorCenter(){return{x:pinky.x+pinky.w/2,y:pinky.y+pinky.h/2};}
function getTarget() {
  const a=actorCenter();
  if(aim.valid)return{x:aim.x+camX,y:aim.y+camY};
  if(stage===2&&boss)return{x:boss.x+boss.w/2,y:boss.y+boss.h/2};
  if(stage===4&&boss&&boss.hp>0)return{x:boss.x+boss.w/2,y:boss.y+boss.h/2};
  const candidate=enemies.filter(e=>e.alive).sort((u,v)=>
    dist(u.x,u.y,a.x,a.y)-dist(v.x,v.y,a.x,a.y))[0];
  if(candidate)return{x:candidate.x+candidate.w/2,y:candidate.y+candidate.h/2};
  return{x:a.x+pinky.face*200,y:a.y};
}
function shoot() {
  if(mode!=='playing'||pinky.fireCd>0)return;
  const type=pinky.weapon,w=weapons[type];
  if(pinky.ammo[type]<=0){pinky.fireCd=.3;speak('БОЕПРИПАСЫ ЗАКОНЧИЛИСЬ · ИЩИ ЯЩИКИ',1);ding(160,.05);return;}
  const from=actorCenter(),target=getTarget(),dx=target.x-from.x,dy=target.y-from.y;
  const angle=Math.atan2(dy,dx),spread=type==='auto'?rand(-.038,.038):0;
  pinky.face=dx>=0?1:-1;pinky.fireCd=w.interval;pinky.ammo[type]--;
  shots.push({type:type==='auto'?'bullet':'rocket',team:'pinky',x:from.x,y:from.y,
    vx:Math.cos(angle+spread)*w.speed,vy:Math.sin(angle+spread)*w.speed,
    r:type==='auto'?4:10,life:type==='auto'?1.3:2.2,power:w.power,hit:false});
  effects.push({type:'muzzle',x:from.x,y:from.y,life:.09});
  ding(type==='rpg'?110:390,type==='rpg'?.23:.036,type==='rpg'?'sawtooth':'square',type==='rpg'?.045:.026);
}
function throwGrenade() {
  const o={x:brain.x+18,y:brain.y+15};
  const target=boss&&boss.hp>0?{x:boss.x+boss.w/2,y:boss.y+boss.h/2}:
    enemies.filter(e=>e.alive).sort((a,b)=>dist(a.x,a.y,o.x,o.y)-dist(b.x,b.y,o.x,o.y))[0];
  if(!target)return;
  const tx=target.x+(target.w||0)/2,ty=target.y+(target.h||0)/2;
  if(dist(o.x,o.y,tx,ty)>430)return;
  const len=Math.max(1,dist(o.x,o.y,tx,ty));
  shots.push({type:'grenade',team:'brain',x:o.x,y:o.y,vx:(tx-o.x)/len*320,vy:(ty-o.y)/len*320,
    r:9,life:1.28,power:3,hit:false});
  effects.push({type:'muzzle',x:o.x,y:o.y,life:.15});ding(280,.08,'triangle',.022);
}
function applyHit(target,amount) {
  if(!target||target.hp<=0)return;
  target.hp=Math.max(0,target.hp-amount);target.hit=.18;
  burst(target.x+target.w/2,target.y+target.h/2,'#9df6da',5);
  if(target.hp===0){
    scoreUp(target.type==='final'?1900:target.type==='heli'?1400:180);
    burst(target.x+target.w/2,target.y+target.h/2,'#ffc78c',35);
    if(target===boss){
      if(stage===2){speak('ВЕРТОЛЁТ СБИТ! ВПЕРЁД В ДАТА-ЦЕНТР',2);enterStage(3);}
      else speak('ЗАЩИТА СНЯТА! ДО ЧЕМОДАНЧИКА →',3);
    }else target.alive=false;
  }else scoreUp(18);
}
function explosion(x,y,r,power,enemyOnly=true) {
  effects.push({type:'blast',x,y,r:5,max:r,life:.32});
  burst(x,y,'#ffb978',18);screenShake=Math.max(screenShake,4);ding(100,.2,'sawtooth');
  if(boss&&boss.hp>0&&dist(x,y,boss.x+boss.w/2,boss.y+boss.h/2)<r+Math.min(boss.w,boss.h)/2)
    applyHit(boss,power);
  for(const e of enemies)if(e.alive&&dist(x,y,e.x+e.w/2,e.y+e.h/2)<r+e.w/2)applyHit(e,power);
  if(!enemyOnly&&dist(x,y,pinky.x+pinky.w/2,pinky.y+pinky.h/2)<r+12)damage();
}
function action() {
  if(mode!=='playing')return;
  if(stage===3) {
    const near=machines.find(m=>!m.taken&&dist(pinky.x+19,pinky.y+20,m.x,m.y)<85);
    if(near){
      near.taken=true;chips+=near.amount;scoreUp(550);burst(near.x,near.y,'#84fce2',20);
      speak('ИЗЪЯТО '+near.amount+' ЧИПА · МАШИНА '+(near.id+1),2);ding(810,.18);
      return;
    }
    if(machines.every(m=>m.taken)&&dist(pinky.x+19,pinky.y+20,exitTile.x,exitTile.y)<82) {
      scoreUp(900+pinky.hp*100);enterStage(4);return;
    }
    speak('ПОДОЙДИ К СТАНКУ И НАЖМИ E · ИЛИ ИЩИ ВЫХОД',1.2);
  } else if(stage===4) {
    if(boss.hp>0){speak('СНАЧАЛА ОТКЛЮЧИ ОХРАНУ ЧЕМОДАНЧИКА',1.3);return;}
    if(Math.abs(pinky.x+19-1250)<90)victory();
    else speak('ИДИ К КРАСНОМУ ЧЕМОДАНЧИКУ →',1.4);
  }
}
function collect(item) {
  if(item.taken)return;item.taken=true;burst(item.x,item.y,'#8effe1',10);
  if(item.type==='chip'){chips++;scoreUp(110);ding(830,.06);}
  if(item.type==='plan'){plans++;scoreUp(330);ding(1050,.13);}
  if(item.type==='heart'){pinky.hp=Math.min(pinky.maxHp,pinky.hp+2);scoreUp(60);ding(570,.17);}
  if(item.type==='ammo'){pinky.ammo.auto+=45;scoreUp(40);speak('+45 ПАТРОНОВ',1.3);ding(620,.1);}
  if(item.type==='rpg'){pinky.rocketUnlocked=true;pinky.ammo.rpg+=5;pinky.weapon='rpg';scoreUp(200);speak('RPG ПОДОБРАНА · КЛАВИШИ 1 / 2',2.4);ding(680,.2);}
  if(item.type==='rocket'){pinky.rocketUnlocked=true;pinky.ammo.rpg+=4;scoreUp(70);speak('+4 РАКЕТЫ',1.3);ding(680,.12);}
}
function updateCompanion(dt) {
  const desiredX=pinky.x-(stage===3?20:62)*pinky.face;
  const desiredY=stage===3?pinky.y+30:FLOOR-brain.h;
  const dx=desiredX-brain.x,dy=desiredY-brain.y;
  brain.x+=clamp(dx*6*dt,-185*dt,185*dt);
  brain.y+=clamp(dy*7*dt,-160*dt,160*dt);
  brain.face=pinky.face;brain.run+=dt*Math.abs(dx)*.08;
  if(isMaze()){
    if(!canStand(brain.x,brain.y,brain.w,brain.h)){brain.x=pinky.x-22;brain.y=pinky.y+24;}
  }
  brain.throwCd-=dt;
  if(brain.throwCd<=0){
    brain.throwCd=2.55+rand(0,.5);throwGrenade();
  }
}
function movePinky(dt){
  const dir=Number(keys.right)-Number(keys.left),vert=Number(keys.down)-Number(keys.up);
  if(dir)pinky.face=dir;
  if(isMaze()){
    const len=Math.hypot(dir,vert)||1,speed=232;
    const nx=pinky.x+dir/len*speed*dt,ny=pinky.y+vert/len*speed*dt;
    if(canStand(nx,pinky.y,pinky.w,pinky.h))pinky.x=nx;
    if(canStand(pinky.x,ny,pinky.w,pinky.h))pinky.y=ny;
    pinky.run+=Math.hypot(dir,vert)*dt*12;
    camX+=(clamp(pinky.x-445,0,worldW-W)-camX)*Math.min(1,9*dt);
    camY+=(clamp(pinky.y-245,0,worldH-H)-camY)*Math.min(1,9*dt);
  } else {
    pinky.x=clamp(pinky.x+dir*270*dt,5,worldW-pinky.w-5);
    pinky.run+=Math.abs(dir)*dt*14;
    pinky.vy+=GRAVITY*dt;pinky.y+=pinky.vy*dt;
    if(pinky.y>=FLOOR-pinky.h){pinky.y=FLOOR-pinky.h;pinky.vy=0;pinky.ground=true;}else pinky.ground=false;
    camX+=(clamp(pinky.x-265,0,worldW-W)-camX)*Math.min(1,8*dt);
  }
}
function pathFor(e){
  const cols=20,rows=13,from=[Math.floor((e.x+19)/TILE),Math.floor((e.y+18)/TILE)];
  const to=[Math.floor((pinky.x+19)/TILE),Math.floor((pinky.y+30)/TILE)];
  const key=(c,r)=>r*cols+c,seen=new Set([key(...from)]),queue=[[...from,[]]];
  while(queue.length){
    const [c,r,path]=queue.shift();
    if(c===to[0]&&r===to[1])return path;
    for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nc=c+dc,nr=r+dr,k=key(nc,nr);
      if(nc<0||nr<0||nc>=cols||nr>=rows||seen.has(k)||walls.some(w=>w.col===nc&&w.row===nr))continue;
      seen.add(k);queue.push([nc,nr,[...path,{x:nc*TILE+13,y:nr*TILE+13}]]);
    }
  }return [];
}
function updateEnemies(dt){
  for(const e of enemies){
    if(!e.alive)continue;
    e.stun=Math.max(0,e.stun-dt);e.hit=Math.max(0,e.hit-dt);
    if(e.stun>0)continue;
    if(isMaze()){
      e.think-=dt;if(e.think<=0){e.think=.55+rand(0,.25);e.path=pathFor(e);}
      const next=e.path[0];
      if(next){
        const dx=next.x-e.x,dy=next.y-e.y,d=Math.hypot(dx,dy);
        if(d<6)e.path.shift();
        else {e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;}
        e.face=dx>=0?1:-1;
      }
      if(dist(e.x+19,e.y+19,pinky.x+19,pinky.y+27)<38)damage();
    }else{
      const delta=pinky.x-e.x;
      if(Math.abs(delta)<540){
        e.face=Math.sign(delta)||1;e.x=clamp(e.x+e.face*e.speed*dt,180,worldW-90);
      }
      if(Math.abs(e.x+e.w/2-pinky.x-pinky.w/2)<(e.w+pinky.w)*.35 &&
         pinky.y<e.y+e.h-8&&pinky.y+pinky.h>e.y+9)damage();
    }
  }
}
function enemyAttack(dt){
  if(stage===2&&boss&&boss.hp>0){
    boss.phase+=dt;boss.x=725+Math.sin(boss.phase*1.08)*145;boss.y=139+Math.cos(boss.phase*1.93)*32;
    boss.hit=Math.max(0,boss.hit-dt);bossClock-=dt;
    if(bossClock<=0){
      bossClock=Math.max(.62,1.52-(boss.maxHp-boss.hp)*.018);
      const sx=boss.x+88,sy=boss.y+79;
      shots.push({type:'rice',team:'enemy',x:sx,y:sy,vx:(pinky.x-sx)*.15,vy:78,r:15,life:3.5,power:1});
      ding(200,.065);
    }
  }
  if(stage===4&&boss){
    boss.phase+=dt;boss.x=895+Math.sin(boss.phase*1.4)*30;
    boss.hit=Math.max(0,boss.hit-dt);
    if(boss.hp>0){
      timer-=dt;if(timer<=0){timer=0;lose('Красная кнопка нажата. Конец истории.');return;}
      bossClock-=dt;
      if(bossClock<=0){
        bossClock=1.35;
        const sx=boss.x+20;
        shots.push({type:'medvedev',team:'enemy',x:sx,y:FLOOR-41,vx:-270,vy:0,r:20,life:5.4,power:1});
      }
    }
    else timer-=dt;
    if(timer<=0){timer=0;lose('Таймер истёк до обезвреживания чемоданчика.');}
  }
}
function updateShots(dt){
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
    if(s.type==='rice')s.vy+=370*dt;
    let hit=false;
    if(s.team==='enemy'){
      if(dist(s.x,s.y,pinky.x+19,pinky.y+31)<s.r+20){
        damage();burst(s.x,s.y,'#ffecc5',11);shots.splice(i,1);continue;
      }
      if(s.type==='rice'&&s.y>FLOOR-15){
        explosion(s.x,FLOOR-5,45,0,false);shots.splice(i,1);continue;
      }
    } else {
      if(boss&&boss.hp>0&&s.x>boss.x-9&&s.x<boss.x+boss.w+9&&s.y>boss.y-10&&s.y<boss.y+boss.h+9){
        if(s.type==='rocket'||s.type==='grenade')explosion(s.x,s.y,s.type==='rocket'?110:85,s.power);
        else applyHit(boss,s.power);
        hit=true;
      }
      if(!hit)for(const e of enemies){
        if(!e.alive)continue;
        if(s.x>=e.x-7&&s.x<=e.x+e.w+7&&s.y>=e.y-7&&s.y<=e.y+e.h+7){
          if(s.type==='rocket'||s.type==='grenade')explosion(s.x,s.y,s.type==='rocket'?100:70,s.power);
          else applyHit(e,s.power);
          hit=true;break;
        }
      }
      if(!hit&&isMaze()&&gridSolid(s.x,s.y)){
        if(s.type==='rocket'||s.type==='grenade')explosion(s.x,s.y,77,s.power);
        hit=true;
      }
    }
    if(hit||s.life<=0||s.x<-80||s.x>worldW+80||s.y>worldH+80||s.y<-80)shots.splice(i,1);
  }
}
function update(dt) {
  if(mode!=='playing')return;
  tick+=dt;stageTime+=dt;musicUpdate(dt);
  if(hintTime>0){hintTime-=dt;if(hintTime<=0)announcement.classList.remove('visible');}
  pinky.iframes=Math.max(0,pinky.iframes-dt);pinky.fireCd=Math.max(0,pinky.fireCd-dt);
  screenShake=Math.max(0,screenShake-dt*24);
  movePinky(dt);updateCompanion(dt);
  if(keys.fire)shoot();
  if(stage===1&&pinky.x>2170){
    if(chips>=6&&plans>=1){scoreUp(1000+pinky.hp*100);enterStage(2);}
    else{pinky.x=2169;if(hintTime<=0)speak('НУЖНО 6 ЧИПОВ И 1 ЧЕРТЁЖ: '+chips+'/6, '+plans+'/1',1.6);}
  }
  for(const item of items)if(!item.taken){
    const near=dist(pinky.x+19,pinky.y+34,item.x,item.y);
    if(near<(isMaze()?35:40))collect(item);
  }
  updateEnemies(dt);enemyAttack(dt);updateShots(dt);
  for(let i=sparks.length-1;i>=0;i--){
    const p=sparks[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;p.life-=dt;
    if(p.life<=0)sparks.splice(i,1);
  }
  for(let i=effects.length-1;i>=0;i--){
    effects[i].life-=dt;if(effects[i].life<=0)effects.splice(i,1);
  }
}

/* Draw every sprite as scalable vector primitives: no CDN, image downloads or sprite sheets. */
function box(x,y,w,h,color,outline=null,rad=5,lw=1){
  ctx.beginPath();ctx.roundRect(x,y,Math.max(0,w),Math.max(0,h),Math.max(0,Math.min(rad,w/2,h/2)));
  if(color){ctx.fillStyle=color;ctx.fill();}
  if(outline){ctx.strokeStyle=outline;ctx.lineWidth=lw;ctx.stroke();}
}
function disk(x,y,r,color,stroke=null,lw=1){
  ctx.beginPath();ctx.arc(x,y,Math.max(0,r),0,Math.PI*2);
  if(color){ctx.fillStyle=color;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}
}
function stroke(x,y,x2,y2,color,width=2){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
}
function label(value,x,y,size=14,color='#f6f7ff',align='left',weight=800){
  ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;
  ctx.font=weight+' '+size+'px system-ui, sans-serif';ctx.fillText(value,x,y);
}
function shadow(x,y,w=42){
  ctx.fillStyle='#00000040';ctx.beginPath();ctx.ellipse(x,y,w/2,7,0,0,2*Math.PI);ctx.fill();
}
function gameSky(){
  const grad=ctx.createLinearGradient(0,0,0,H);
  const tops={1:'#12345b',2:'#182140',3:'#101b2c',4:'#20152d'};
  const bottoms={1:'#28718a',2:'#ae7972',3:'#163749',4:'#855c69'};
  grad.addColorStop(0,tops[stage]);grad.addColorStop(1,bottoms[stage]);
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
  if(stage===3)return;
  const drift=camX*.17;
  if(stage===1){
    for(let i=0;i<16;i++){
      const x=i*96-(drift%96);
      box(x,140+(i%3)*21,81,320,'#1d5266');
      for(let row=0;row<5;row++)box(x+11,170+row*44,54,21,'#62bbbf21');
    }
    stroke(0,390,W,390,'#8ee9e52e',3);
  }else{
    disk(767-drift*.13,138,stage===2?66:42,stage===2?'#ffc0a657':'#fcf4ed43');
    for(let i=0;i<19;i++){
      const x=i*75-(drift%75),height=95+(i*53)%145;
      box(x,FLOOR-height,64,height,2,stage===2?'#30344f':'#4a344d');
      for(let row=0;row<height-20;row+=18)
        for(let col=0;col<55;col+=18)
          box(x+9+col,FLOOR-height+11+row,7,8,i%3===0?'#f2b57d5c':'#9cabbe36');
    }
  }
}
function landscape(){
  box(0,FLOOR,worldW,H-FLOOR,stage===1?'#253c48':stage===2?'#343748':'#302c45');
  box(0,FLOOR,worldW,5,stage===1?'#73e3cb':'#efa786');
  for(let x=0;x<worldW;x+=72){
    box(x+8,FLOOR+24,42,2,'#d7eff51f');disk(x+14,FLOOR+60,2,'#bbc5d950');
  }
  if(stage===1) {
    for(let x=280;x<worldW;x+=310){
      box(x-9,135,18,FLOOR-135,'#4a8090a1');
      box(x-15,125,30,24,'#97c8cf');
      disk(x,141,6,'#aff9de');
      box(x-95,260,183,65,'#173c50','#377587',5,2);
      for(let i=0;i<6;i++)box(x-82+i*27,270,18,43,i%2?'#2a6977':'#1f5368');
    }
    box(95,142,360,83,'#103449e0','#65edcc',12,2);
    label('TSMC  ·  TAIWAN FAB',275,175,29,'#b1fbe6','center',960);
    label('MOUSE SECURITY STATUS: CRITICAL',275,206,12,'#91c9d2','center');
    box(2155,305,92,FLOOR-305,'#26475a','#a6ffde',8,3);
    box(2175,330,52,95,'#3a756b','#a0f9d7',5,2);
    label('ВЫХОД →',2193,293,16,'#b5ffe6','center');
  }else if(stage===2){
    box(160,268,348,67,'#253046','#668da1',10,2);
    label('ESCAPE ROOFTOP  ·  TSMC',334,297,23,'#c9eaf4','center',930);
    label('БОЙСЯ РИСА. БЕРЕГИ ПАТРОНЫ.',334,325,12,'#9bc1ce','center');
    for(let x=230;x<1330;x+=270){
      box(x,350,20,100,'#30435b');box(x-17,344,54,12,'#6c8197');
    }
  }else{
    for(let x=410;x<worldW;x+=330){
      box(x,182,83,FLOOR-182,'#603d56','#bf7c87',5,2);
      ctx.fillStyle='#93506a';ctx.beginPath();ctx.moveTo(x-12,183);ctx.lineTo(x+41,107);ctx.lineTo(x+96,183);ctx.fill();
      stroke(x+41,107,x+41,69,'#c4bdc7',3);box(x+40,69,34,20,'#c43d57');
    }
    box(1150,244,230,50,'#492c44','#df9b9f',9,2);
    label('КРАСНАЯ КНОПКА →',1265,269,18,'#ffe2d2','center');
    box(1216,FLOOR-61,70,61,boss&&boss.hp<=0?'#235b60':'#532c40','#f1d7a1',9,3);
    box(1228,FLOOR-50,47,37,'#e2d7ce');
    disk(1250,FLOOR-32,13,'#fc515c','#ffd8ce',2);
    label('E',1250,FLOOR-81,23,'#aeffe6','center',1000);
    label('ЧЕМОДАНЧИК',1250,FLOOR+24,12,'#ffdeb6','center');
  }
}
function limb(x1,y1,x2,y2,col,w){stroke(x1,y1,x2,y2,col,w);disk(x2,y2,w*.55,col);}
function drawPinky(x,y,scale=1,top=false){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  const bob=top?0:Math.sin(pinky.run)*1.9;
  if(!top){
    // Tail, long lanky body, feet, arm gestures, large pink ears and red nose.
    ctx.strokeStyle='#f4b6be';ctx.lineWidth=4;ctx.beginPath();
    ctx.moveTo(-5,49);ctx.bezierCurveTo(-37,42,-46,65,-66,51);ctx.bezierCurveTo(-77,40,-57,29,-48,43);ctx.stroke();
    limb(-7,37,-12+bob,61,'#e4e4e4',7);limb(8,36,13-bob,59,'#e4e4e4',7);
    limb(-10,18,-25,39,'#efefec',6);limb(10,18,23,42,'#efefec',6);
    box(-11,11,21,38,'#f2f0ed','#d1c9cd',11,1.4);
    disk(-20,-6,18,'#f2eeec','#aaa2a8',1);
    disk(19,-14,21,'#f2eeec','#aaa2a8',1);
    disk(-20,-5,12,'#f3a7b2');disk(19,-13,14,'#f3a7b2');
    ctx.save();ctx.translate(0,0);ctx.rotate(-.08);
    ctx.fillStyle='#f3f1ed';ctx.beginPath();ctx.ellipse(0,-2,18,24,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    disk(-5,-8,7,'#e7f7fa');disk(7,-9,7,'#e7f7fa');
    disk(-3,-8,3.1,'#303844');disk(9,-9,3.1,'#303844');
    ctx.fillStyle='#f3f1ed';ctx.beginPath();ctx.ellipse(12,6,17,10,-.15,0,2*Math.PI);ctx.fill();
    disk(24,2,7.7,'#ee465a','#ff9ca4',1.1);
    stroke(5,17,16,20,'#a2515d',2.2);
    lineWhiskers();
  }else{
    // Overhead silhouette: ears flank the nose; face indicates direction.
    disk(-17,-13,18,'#f3eee9');disk(17,-13,18,'#f3eee9');
    disk(-17,-13,13,'#f0a7b7');disk(17,-13,13,'#f0a7b7');
    box(-13,-9,26,39,'#f3eeea','#cbbbc4',12);
    disk(0,0,15,'#f3eee9');disk(0,9,5,'#e84e63');
    disk(-6,0,2,'#353744');disk(6,0,2,'#353744');
    limb(-13,12,-20,28,'#eee6e5',6);limb(13,12,20,27,'#eee6e5',6);
  }
  ctx.restore();
}
function lineWhiskers(){
  stroke(14,8,34,13,'#fff4f1',1);stroke(14,13,35,19,'#fff4f1',1);
  stroke(-7,11,-27,18,'#fff4f1',1);
}
function drawBrain(x,y,scale=1,top=false){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  if(!top){
    stroke(-9,38,-35,54,'#efb6c4',3);
    limb(-8,33,-14,45,'#eee7e4',5);limb(10,34,18,46,'#eee7e4',5);
    box(-16,13,32,29,'#efece8','#aaa0a6',12);
    limb(-13,19,-24,31,'#eee8e5',5);limb(15,20,23,30,'#eee8e5',5);
    disk(-24,-14,21,'#ecebe7');disk(26,-17,23,'#ecebe7');
    disk(-24,-14,14,'#eca5b4');disk(26,-17,16,'#eca5b4');
    ctx.fillStyle='#eceae8';ctx.beginPath();ctx.ellipse(0,-7,37,27,0,0,2*Math.PI);ctx.fill();
    disk(-13,-12,8,'#fff');disk(12,-12,8,'#fff');
    disk(-10,-10,3.8,'#262635');disk(9,-10,3.8,'#262635');
    stroke(-25,-23,-4,-17,'#695764',4);stroke(2,-16,26,-24,'#695764',4);
    ctx.fillStyle='#eceae8';ctx.beginPath();ctx.ellipse(0,2,16,11,0,0,2*Math.PI);ctx.fill();
    disk(1,-1,7,'#f4a5b8');stroke(-10,11,12,9,'#64545d',2);
    label('!',32,-36,13,'#ffbb92','center');
  }else{
    disk(-18,-14,21,'#efeeeb');disk(18,-14,21,'#efeeeb');
    disk(-18,-14,14,'#e9a3af');disk(18,-14,14,'#e9a3af');
    box(-16,-8,32,34,'#eae9e7','#aaa2a8',12);
    disk(0,1,19,'#edece8');disk(-8,-3,3,'#35323c');disk(8,-3,3,'#35323c');
    disk(0,7,5,'#e89fb5');stroke(-10,16,11,16,'#61525d',2);
  }
  ctx.restore();
}
function drawTom(e){
  ctx.save();ctx.translate(e.x+e.w/2,e.y);
  if(e.face>0)ctx.scale(-1,1);
  if(e.hit>0)ctx.globalAlpha=.55;
  box(-23,39,46,37,'#b18155','#ead1a1',11,2);
  for(let i=-1;i<=1;i++)stroke(i*13,42,i*13+5,53,'#f6deab',2);
  box(-27,68,21,9,'#303440');box(7,68,21,9,'#303440');
  ctx.fillStyle='#8195ac';ctx.beginPath();ctx.moveTo(-25,7);ctx.lineTo(-22,-11);ctx.lineTo(-8,1);
  ctx.lineTo(9,1);ctx.lineTo(22,-12);ctx.lineTo(25,9);ctx.fill();
  disk(0,24,27,'#8195ac');disk(-10,10,9,'#b9c6d6');disk(12,10,9,'#b9c6d6');
  disk(-9,18,5,'#fff');disk(9,18,5,'#fff');disk(-8,18,2,'#283044');disk(10,18,2,'#283044');
  box(-10,29,20,11,'#f7e1cc');disk(0,27,5,'#e98d9b');
  box(-27,-11,54,19,'#d83b43','#ed7778',4,1);box(-34,5,68,6,'#a82433');
  label('MAGA',0,-2,10,'#fff4e8','center',1000);
  disk(0,53,6,'#efd08e');label('★',0,53,11,'#9f6e41','center');
  ctx.restore();
}
function drawJerry(e){
  ctx.save();ctx.translate(e.x+19,e.y);if(e.face>0)ctx.scale(-1,1);
  stroke(9,38,34,30,'#a67c58',4);
  disk(-17,7,13,'#ab7b58');disk(18,7,14,'#ab7b58');
  disk(-17,7,8,'#eaa694');disk(18,7,9,'#eaa694');
  disk(0,22,18,'#aa7752');disk(-5,18,5,'#fff');disk(8,18,5,'#fff');
  disk(-4,18,2,'#26323e');disk(9,18,2,'#26323e');disk(2,26,4,'#f29a9f');
  box(-14,32,27,11,'#c34b53');
  ctx.restore();
}
function drawGuard(e){
  ctx.save();ctx.translate(e.x+19,e.y+18);
  if(e.hit>0)ctx.globalAlpha=.55;
  box(-17,-10,34,34,'#354e69','#87a4bb',11,2);
  box(-17,-20,34,18,'#c3daef','#728ca4',5,1.5);
  box(-22,-20,44,8,'#416579');box(-20,3,40,11,'#1e3144');
  disk(0,-6,9,'#debca8');
  disk(-5,-8,2,'#222c41');disk(5,-8,2,'#222c41');
  box(-10,20,8,8,'#142235');box(2,20,8,8,'#142235');
  ctx.restore();
}
function drawKa52(){
  if(!boss)return;
  const x=boss.x,y=boss.y;
  ctx.save();ctx.translate(x,y);if(boss.hit>0)ctx.globalAlpha=.54;
  // A cartoon coaxial-rotor attack helicopter: fictional livery, Ka-52-like fuselage.
  stroke(74,14,74,-12,'#cadbd6',6);
  stroke(-48,-13,191,-13,'#d0ddd8',6);
  stroke(-20,-26,164,-26,'#a0b6b7',4);
  stroke(-6,54,-86,73,'#667b73',24);
  box(-94,44,24,7,'#e3c17a');
  box(0,31,171,69,'#567367','#d3b18b',33,3);
  box(119,38,46,40,'#4f98a3','#b4e4d6',18,3);
  box(11,42,91,43,'#435e56','#99b4a3',19,2);
  box(42,48,40,25,'#7c9c86','#e6d3a9',7,1.2);
  box(42,91,92,12,'#41554c');
  box(11,80,38,10,'#aab9a1');
  stroke(51,107,37,124,'#bdc8b5',5);stroke(134,101,146,124,'#bdc8b5',5);
  stroke(20,126,171,126,'#c8d9c0',6);
  box(135,67,55,7,'#2d4140');box(170,72,7,18,'#1f2c2f');
  label('CN-52',92,88,14,'#f7e8bd','center',1000);
  disk(16,63,12,'#d95c5c');label('★',16,63,16,'#ffdc93','center');
  // Two cartoon occupants poking out of the windows.
  disk(55,54,11,'#e5bfa8');disk(87,54,10,'#e4b79e');
  box(46,41,17,6,'#334750');box(79,42,17,6,'#334750');
  disk(52,54,2,'#2f3a3a');disk(84,54,2,'#2f3a3a');
  ctx.restore();
  const lines=[
    'НЕТ! ЭТО НАШИ СХЕМЫ!',
    'МЫ ХОТИМ ЗАХВАТИТЬ ТАЙВАНЬ!',
    'ОТДАЙТЕ РИС И МИКРОЧИПЫ!',
    'ПАРТИЯ ТРЕБУЕТ СВОИ ПРОЦЕССОРЫ!'
  ];
  const speech=lines[Math.floor(stageTime/3.5)%lines.length];
  const bx=clamp(x+70,100,worldW-220),by=y-87;
  box(bx-30,by,Math.max(226,speech.length*7.3),43,'#fff7df','#f2bc81',12,2);
  ctx.fillStyle='#fff7df';ctx.beginPath();ctx.moveTo(bx+15,by+42);ctx.lineTo(bx+34,by+57);ctx.lineTo(bx+40,by+42);ctx.fill();
  label(speech,bx-18,by+22,11,'#803c3c','left',930);
  label('БОСС · РИСОВЫЙ АЛЛИГАТОР',x+80,y-50,15,'#ffe7be','center',900);
}
function drawPutin(){
  if(!boss)return;
  const x=boss.x,y=boss.y;
  ctx.save();ctx.translate(x,y);
  if(boss.hit>0)ctx.globalAlpha=.52;
  box(2,57,119,87,'#263e60','#8790a6',45,3);
  box(6,125,37,19,'#192338');box(82,125,35,19,'#192338');
  disk(63,33,40,'#efc2a7','#aa847a',1);
  ctx.fillStyle='#99756b';ctx.beginPath();ctx.ellipse(63,5,31,10,0,Math.PI,Math.PI*2);ctx.fill();
  disk(48,30,3.4,'#263240');disk(80,30,3.4,'#263240');
  stroke(51,51,77,51,'#875d61',2);
  box(56,56,15,67,'#bb3f51');box(5,74,20,45,'#293b53');box(103,74,17,44,'#293b53');
  ctx.restore();
  label('БОСС · ПУТИН',x+62,y-30,14,'#ffe7cd','center');
  if(boss.hp===0)label('ОХРАНА ОТКЛЮЧЕНА',x+62,y-52,12,'#a1ffe4','center');
}
function drawMiniMedvedev(s){
  // The thrown mini-boss caricature follows the supplied reference: blue suit and black shirt.
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.sin(tick*12)*.24);
  box(-12,-5,24,28,'#2159ae','#7db0ee',6,1.4);
  box(-5,-5,10,24,'#121b29');
  disk(0,-17,12,'#e4b8a3');
  ctx.fillStyle='#725b51';ctx.beginPath();ctx.ellipse(0,-23,10,4,0,Math.PI,2*Math.PI);ctx.fill();
  disk(-4,-17,1.7,'#303747');disk(5,-17,1.7,'#303747');
  stroke(-4,-10,5,-10,'#875c5b',1);
  stroke(-12,2,-20,13,'#e6b7a0',5);stroke(12,2,20,13,'#e6b7a0',5);
  box(-10,22,7,8,'#273049');box(4,22,7,8,'#273049');
  ctx.restore();
}
function renderPickup(item) {
  const float=Math.sin(tick*4.6+item.x*.04)*5;
  ctx.save();ctx.translate(item.x,item.y+float);
  if(item.type==='chip'){
    ctx.shadowColor='#72ffe7';ctx.shadowBlur=15;
    box(-13,-13,26,26,'#56efce','#d8ffef',4,2);
    box(-7,-7,14,14,'#18545d');for(let i=-9;i<=9;i+=9){
      box(i-2,-18,4,6,'#d5fff5');box(i-2,12,4,6,'#d5fff5');
    }
  }else if(item.type==='plan'){
    box(-15,-18,30,36,'#f8dd94','#fff3c3',4,2);
    for(let i=0;i<3;i++)stroke(-9,-8+i*9,9,-8+i*9,'#9f7145',2);
    label('⌘',0,12,15,'#9d693b','center');
  }else if(item.type==='heart'){
    disk(0,0,16,'#f77d98');label('+',0,0,25,'#fff','center',900);
  }else {
    box(-20,-17,40,33,item.type==='ammo'?'#4b7b66':'#86684c','#ffe4ad',6,2);
    label(item.type==='ammo'?'AMMO':item.type==='rpg'?'RPG':'RKT',0,0,11,'#fff9d6','center',950);
    box(-13,13,26,5,'#d9ba80');
  }
  ctx.restore();
}
function drawMaze(){
  box(0,0,worldW,worldH,'#142d3b');
  for(let row=0;row<13;row++)for(let col=0;col<20;col++){
    const x=col*TILE,y=row*TILE;
    box(x,y,TILE,TILE,(row+col)%2?'#1a3b46':'#1c404b');
    box(x+2,y+2,TILE-4,TILE-4,null,'#52778624',2,1);
    if((row*11+col*13)%8===0){
      disk(x+15,y+17,2,'#49b8be');disk(x+49,y+48,2,'#49b8be');
    }
  }
  for(const w of walls){
    const x=w.col*TILE,y=w.row*TILE;
    box(x+2,y+2,TILE-4,TILE-4,'#304f61','#638da0',8,2);
    box(x+10,y+8,TILE-20,TILE-21,'#3a5e72');
    box(x+13,y+13,TILE-26,7,'#6d9da599');
    for(let i=0;i<3;i++)box(x+14+i*12,y+32,7,7,i===1?'#60dbc3':'#8ba3ac');
  }
  for(const machine of machines){
    const {x,y}=machine;
    box(x-26,y-25,52,50,machine.taken?'#31524b':'#28526b',machine.taken?'#78948c':'#88dddc',8,2);
    box(x-21,y-19,42,25,machine.taken?'#385c51':'#184457');
    if(!machine.taken){
      disk(x-12,y-5,5,'#5ff1da');box(x-2,y-10,18,10,'#62b4c1');
      label('E',x,y-40,18,'#c3ffea','center',1000);
    }else label('✓',x,y-4,24,'#a5ffe4','center',1000);
    box(x-20,y+13,40,5,machine.taken?'#527368':'#dda66f');
    label('FAB-'+(machine.id+1),x,y+39,11,'#a8dce4','center');
  }
  if(exitTile){
    disk(exitTile.x,exitTile.y,28,machines.every(m=>m.taken)?'#2d8d7c':'#405366','#dbf9e0',3);
    label('⇥',exitTile.x,exitTile.y,30,'#ddfff3','center');
    label('ВЫХОД',exitTile.x,exitTile.y+42,12,'#c8fff0','center');
  }
  for(const e of enemies)if(e.alive)drawGuard(e);
}
function drawShots(){
  for(const shot of shots){
    if(shot.type==='bullet'){
      stroke(shot.x-shot.vx*.018,shot.y-shot.vy*.018,shot.x,shot.y,'#b4ffdb',4);
      disk(shot.x,shot.y,3,'#f9fff7');
    }else if(shot.type==='rocket'){
      ctx.save();ctx.translate(shot.x,shot.y);ctx.rotate(Math.atan2(shot.vy,shot.vx));
      box(-12,-5,25,10,'#e0d8b7','#fff0bf',4,1);
      ctx.fillStyle='#f6a56c';ctx.beginPath();ctx.moveTo(-13,-4);ctx.lineTo(-25,0);ctx.lineTo(-13,4);ctx.fill();
      ctx.restore();
    }else if(shot.type==='grenade'){
      disk(shot.x,shot.y,9,'#4c8e73','#b2e5c4',2);box(shot.x-3,shot.y-13,7,6,'#d8c69a');
    }else if(shot.type==='rice'){
      // Rice bowl, not a bomb.
      ctx.save();ctx.translate(shot.x,shot.y);
      disk(0,-5,15,'#fff7dc');disk(-7,-8,3,'#fbfdf1');disk(5,-10,3,'#fbfdf1');
      ctx.fillStyle='#df5e5a';ctx.beginPath();ctx.moveTo(-17,-2);ctx.lineTo(17,-2);
      ctx.lineTo(11,15);ctx.lineTo(-11,15);ctx.fill();
      stroke(-17,-2,17,-2,'#ffe5bf',3);
      label('米',0,7,11,'#ffe6cf','center');
      ctx.restore();
    }else if(shot.type==='medvedev')drawMiniMedvedev(shot);
  }
}
function drawFX(){
  for(const fx of effects){
    if(fx.type==='blast'){
      const p=1-fx.life/.32;
      disk(fx.x,fx.y,fx.max*p,'#ffc67b20','#ffd28e',Math.max(1,5*(1-p)));
    }else if(fx.type==='muzzle'){
      disk(fx.x,fx.y,8+fx.life*65,'#f2ffd4bb');
    }
  }
  for(const p of sparks){
    ctx.globalAlpha=clamp(p.life*2.1,0,1);box(p.x,p.y,p.size,p.size,p.color);
  }
  ctx.globalAlpha=1;
}
function drawActor(){
  if(pinky.iframes>0&&Math.floor(tick*15)%2===0)ctx.globalAlpha=.42;
  if(isMaze()){
    shadow(pinky.x+19,pinky.y+52,42);
    drawPinky(pinky.x+19,pinky.y+26,.66,true);
  }else{
    shadow(pinky.x+19,FLOOR,50);
    ctx.save();if(pinky.face<0){ctx.translate(pinky.x+38,0);ctx.scale(-1,1);ctx.translate(-pinky.x,0);}
    drawPinky(pinky.x+19,pinky.y+17,.84,false);
    const from=actorCenter(),target=getTarget();
    const gunAngle=Math.atan2(target.y-from.y,target.x-from.x);
    ctx.save();ctx.translate(pinky.x+18,pinky.y+35);
    if(pinky.face<0)ctx.scale(-1,1);
    const angle=pinky.face<0?Math.PI-gunAngle:gunAngle;
    ctx.rotate(clamp(angle,-.9,.9));
    box(0,-6,pinky.weapon==='rpg'?45:34,pinky.weapon==='rpg'?13:10,
      pinky.weapon==='rpg'?'#687a63':'#323e4b','#d6cda6',3,1.5);
    box(9,5,8,13,'#3e4146');box(20,-10,6,5,'#afac8e');
    ctx.restore();ctx.restore();
  }
  ctx.globalAlpha=1;
}
function drawCompanion(){
  if(isMaze()){
    shadow(brain.x+18,brain.y+48,38);drawBrain(brain.x+18,brain.y+21,.62,true);
  }else{
    shadow(brain.x+18,FLOOR,40);
    ctx.save();if(brain.face<0){ctx.translate(brain.x+35,0);ctx.scale(-1,1);ctx.translate(-brain.x,0);}
    drawBrain(brain.x+18,brain.y+18,.68);ctx.restore();
  }
}
function hud(){
  box(12,12,936,70,'#091628e3','#55838d80',11,1.5);
  label('CHIP HEIST 2.0',28,32,15,'#8effdc','left',1000);
  label('УРОВЕНЬ '+stage+'/4',28,62,11,'#9eb6c9');
  for(let i=0;i<6;i++)label(i<pinky.hp?'♥':'♡',171+i*25,47,23,i<pinky.hp?'#fb8499':'#60778b');
  label('СЧЁТ',333,32,10,'#9cb0c1');label(score.toLocaleString('ru-RU'),333,58,18,'#ffe29e','left',950);
  box(492,24,210,49,'#193046','#53718c',8,1);
  label(weapons[pinky.weapon].label,501,38,12,'#cbfbe7');
  label('ПАТРОНЫ '+pinky.ammo[pinky.weapon],501,60,13,pinky.ammo[pinky.weapon]?'#ffdda0':'#ff8c92');
  if(stage===1){
    label('ЧИПЫ '+chips+'/6',740,32,15,chips>=6?'#8effd9':'#d8e9f2');
    label('ЧЕРТЕЖИ '+plans+'/1',740,60,12,plans?'#8effd9':'#c8d8e6');
  }else if(stage===3){
    label('СТАНКИ '+machines.filter(m=>m.taken).length+'/4',739,32,14,'#b7edda');
    label('ЧИПЫ '+chips,739,59,13,'#ffe3a6');
  }else {
    label('БОСС',722,31,10,'#acc4d6');
    box(719,45,stage===4?115:205,15,'#263041');
    box(720,46,(stage===4?113:203)*Math.max(0,boss.hp)/boss.maxHp,13,
      stage===2?'#f0b779':'#f07c93');
    if(stage===4)label(Math.ceil(timer)+' С',842,58,22,timer<15?'#ff768b':'#ffdb9c','left',1000);
  }
  const tipByStage=[
    '',
    'СОБЕРИ 6 ЧИПОВ И 1 ЧЕРТЁЖ · НАЙДИ ВЫХОД →',
    'МЫШЬ: ПРИЦЕЛ И ОГОНЬ · УКЛОНЯЙСЯ ОТ РИСА',
    'WASD: ХОДЬБА ПО КАРТЕ · E: ИЗЪЯТЬ ЧИПЫ ИЗ СТАНКА',
    boss&&boss.hp===0?'ЗАЩИТА СНЯТА · БЕГИ К ЧЕМОДАНЧИКУ И НАЖМИ E':'ОСТАНОВИ БОССА ДО КОНЦА ТАЙМЕРА'
  ];
  box(13,H-35,stage===3?515:500,24,'#0e2137d6');
  label(tipByStage[stage],23,H-23,11,'#d5f9ed');
  if(stage===3){
    // Directional hint to exit, without revealing the labyrinth solution.
    label('МАШИН: '+machines.filter(m=>m.taken).length+'/4',760,H-23,13,'#caffee');
  }
  if(aim.valid&&mode==='playing'){
    stroke(aim.x-12,aim.y,aim.x-4,aim.y,'#9dfce4',2);
    stroke(aim.x+4,aim.y,aim.x+12,aim.y,'#9dfce4',2);
    stroke(aim.x,aim.y-12,aim.x,aim.y-4,'#9dfce4',2);
    stroke(aim.x,aim.y+4,aim.x,aim.y+12,'#9dfce4',2);
    disk(aim.x,aim.y,2,'#f8ffec');
  }
}
function render(){
  ctx.save();ctx.clearRect(0,0,W,H);
  if(screenShake&&mode==='playing')ctx.translate(rand(-screenShake,screenShake),rand(-screenShake,screenShake));
  gameSky();
  ctx.save();ctx.translate(-camX,-camY);
  if(isMaze())drawMaze();else landscape();
  if(stage===2)drawKa52();
  if(stage===4)drawPutin();
  if(stage===1)for(const e of enemies)if(e.alive){
    if(e.type==='tom')drawTom(e);else drawJerry(e);
  }
  for(const item of items)if(!item.taken)renderPickup(item);
  drawCompanion();drawShots();drawActor();drawFX();
  ctx.restore();hud();ctx.restore();
}
function loop(now){
  const dt=firstFrame?Math.min((now-firstFrame)/1000,.033):.016;firstFrame=now;
  update(dt);render();requestAnimationFrame(loop);
}
function keypress(event,isDown){
  const c=event.code;
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyE','KeyF','KeyQ','Digit1','Digit2','KeyP','Escape','Enter'].includes(c))
    event.preventDefault();
  if(c==='ArrowLeft'||c==='KeyA')keys.left=isDown;
  if(c==='ArrowRight'||c==='KeyD')keys.right=isDown;
  if(c==='ArrowUp'||c==='KeyW'){
    if(isMaze())keys.up=isDown;
    else if(isDown&&!event.repeat&&pinky&&pinky.ground&&mode==='playing'){
      pinky.vy=-585;pinky.ground=false;ding(400,.08);
    }
  }
  if(c==='ArrowDown'||c==='KeyS')keys.down=isDown;
  if(c==='Space'||c==='KeyJ')keys.fire=isDown;
  if(!isDown||event.repeat)return;
  if(c==='Digit1')switchWeapon('auto');
  if(c==='Digit2')switchWeapon('rpg');
  if(c==='KeyQ')switchWeapon();
  if(c==='KeyE'||c==='KeyF')action();
  if(c==='KeyP'||c==='Escape')pause();
  if(c==='Enter'&&mode==='menu')start();
}
document.addEventListener('keydown',e=>keypress(e,true));
document.addEventListener('keyup',e=>keypress(e,false));
function pointerPosition(event){
  const bounds=canvas.getBoundingClientRect();
  const px=(event.clientX-bounds.left)/bounds.width*W;
  const py=(event.clientY-bounds.top)/bounds.height*H;
  aim.x=clamp(px,0,W);aim.y=clamp(py,0,H);aim.valid=true;
}
canvas.addEventListener('pointermove',e=>{if(e.pointerType!=='touch'||firedPointer)pointerPosition(e);});
canvas.addEventListener('pointerdown',e=>{
  e.preventDefault();pointerPosition(e);keys.fire=true;firedPointer=true;
  if(canvas.setPointerCapture)canvas.setPointerCapture(e.pointerId);
  shoot();
});
canvas.addEventListener('pointerup',()=>{keys.fire=false;firedPointer=false;});
canvas.addEventListener('pointercancel',()=>{keys.fire=false;firedPointer=false;});
canvas.addEventListener('pointerleave',()=>{if(!firedPointer)aim.valid=false;});
window.addEventListener('blur',()=>{
  Object.keys(keys).forEach(k=>keys[k]=false);
  if(mode==='playing')pause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='playing')pause();});
document.querySelectorAll('.touch-key').forEach(element=>{
  const hold=element.dataset.hold,press=element.dataset.press;
  element.addEventListener('pointerdown',e=>{
    e.preventDefault();if(element.setPointerCapture)element.setPointerCapture(e.pointerId);
    if(hold)keys[hold]=true;
    if(hold==='up'&&!isMaze()&&pinky&&pinky.ground&&mode==='playing'){pinky.vy=-585;pinky.ground=false;}
    if(press==='use')action();
    if(press==='swap')switchWeapon();
    element.classList.add('is-held');
  });
  const release=()=>{if(hold)keys[hold]=false;element.classList.remove('is-held');};
  element.addEventListener('pointerup',release);
  element.addEventListener('pointercancel',release);
  element.addEventListener('lostpointercapture',release);
});
pauseBtn.addEventListener('click',pause);
soundBtn.addEventListener('click',()=>{
  musicOn=!musicOn;$('soundLabel').textContent=musicOn?'ВКЛ':'ВЫКЛ';
  soundBtn.setAttribute('aria-label',musicOn?'Выключить звук':'Включить звук');
  ding(590,.08);
});
$('fullscreenButton').addEventListener('click',()=>{
  if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return;}
  const target=window.matchMedia('(pointer:coarse)').matches?document.querySelector('main'):$('gameFrame');
  if(target&&target.requestFullscreen)target.requestFullscreen().catch(()=>{});
});
btn.onclick=start;
pinky=newPinky();brain=newBrain();enterStage(1);
announcement.classList.remove('visible');
requestAnimationFrame(loop);
