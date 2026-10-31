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
    if(s.team==='enemy'){
      if(dist(s.x,s.y,pinky.x+19,pinky.y+31)<s.r+20){
        damage();burst(s.x,s.y,'#ffecc5',11);shots.splice(i,1);continue;
      }
      if(s.type==='rice'&&s.y>FLOOR-15){
        explosion(s.x,FLOOR-5,45,0,false);shots.splice(i,1);continue;
      }
    } else {
      let hit=false;
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
