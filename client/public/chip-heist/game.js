/* Chip Heist: isolated, dependency-free browser arcade. All artwork is drawn with Canvas. */
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const frameEl = document.getElementById('gameFrame');
const overlay = document.getElementById('overlay');
const overlayEyebrow = document.getElementById('overlayEyebrow');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const missionCards = document.getElementById('missionCards');
const overlayHint = document.getElementById('overlayHint');
const primaryButton = document.getElementById('primaryButton');
const highScoreEl = document.getElementById('highScore');
const pauseButton = document.getElementById('pauseButton');
const soundButton = document.getElementById('soundButton');
const soundLabel = document.getElementById('soundLabel');
const fullscreenButton = document.getElementById('fullscreenButton');
const announcement = document.getElementById('announcement');

const W = 960, H = 540, FLOOR = 445, GRAVITY = 1390;
const keys = { left: false, right: false, fire: false };
const random = (a, b) => a + Math.random() * (b - a);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
let mode = 'menu', stage = 1, cameraX = 0, worldW = 2200;
let score = 0, highScore = 0, time = 0, stageTime = 0, countdown = 68;
let chips = 0, plans = 0, particles = [], effects = [], projectiles = [], pickups = [], enemies = [];
let boss = null, bossAttack = 0, noticeTime = 0, notice = '', muted = true, audioContext = null;
let shake = 0, lastFrame = 0;
let player = makePlayer();

function makePlayer() {
  return { x: 72, y: FLOOR - 55, w: 46, h: 55, vy: 0, onGround: true, hp: 5, invul: 0, fireCd: 0, facing: 1, jumpQueued: false, run: 0 };
}
function readRecord() {
  try { return Math.max(0, Number(localStorage.getItem('chip-heist-record-v1')) || 0); }
  catch { return 0; }
}
highScore = readRecord();
highScoreEl.textContent = highScore.toLocaleString('ru-RU');
function persistRecord() {
  if (score <= highScore) return;
  highScore = score;
  highScoreEl.textContent = highScore.toLocaleString('ru-RU');
  try { localStorage.setItem('chip-heist-record-v1', String(highScore)); } catch { /* storage may be blocked */ }
}
function addScore(amount) { score += amount; persistRecord(); }
function announce(text, seconds = 2) {
  notice = text;
  noticeTime = seconds;
  announcement.textContent = text;
  announcement.classList.add('visible');
}
function beep(freq = 440, duration = .08, type = 'sine') {
  if (muted) return;
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(.055, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    osc.connect(gain); gain.connect(audioContext.destination);
    osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch { /* sound is optional */ }
}
function pop(x, y, color, number = 12) {
  for (let i = 0; i < number; i++) particles.push({
    x, y, vx: random(-180, 180), vy: random(-230, -35), life: random(.22, .65),
    total: .65, color, size: random(2, 6)
  });
  if (particles.length > 250) particles.splice(0, particles.length - 250);
}
function enterStage(next) {
  stage = next; stageTime = 0; cameraX = 0; shake = 0;
  projectiles = []; enemies = []; pickups = []; particles = []; effects = [];
  player.x = 72; player.y = FLOOR - player.h; player.vy = 0;
  player.onGround = true; player.invul = 1.1; player.fireCd = 0;
  if (next === 1) {
    worldW = 2200; chips = 0; plans = 0;
    const data = [
      [180, 386, 'chip'], [350, 332, 'chip'], [510, 385, 'chip'],
      [670, 380, 'plan'], [840, 329, 'chip'], [1030, 384, 'chip'],
      [1190, 330, 'chip'], [1370, 384, 'chip'], [1510, 328, 'plan'],
      [1680, 382, 'chip'], [1860, 334, 'chip'], [1970, 385, 'chip'],
      [1260, 385, 'heart']
    ];
    pickups = data.map((d, i) => ({ x: d[0], y: d[1], type: d[2], taken: false, seed: i }));
    enemies = [
      { x: 785, baseX: 785, y: FLOOR - 78, w: 56, h: 78, type: 'tom', speed: 112, stunned: 0, facing: -1 },
      { x: 1515, baseX: 1515, y: FLOOR - 44, w: 42, h: 44, type: 'jerry', speed: 158, stunned: 0, facing: -1 }
    ];
    boss = null;
    announce('ЭТАП 1 · ПОБЕГ ИЗ TSMC', 2.6);
  } else if (next === 2) {
    worldW = 1300;
    boss = { x: 735, y: 149, hp: 12, maxHp: 12, hit: 0, phase: 0, type: 'heli' };
    bossAttack = 1.3;
    announce('ЭТАП 2 · КИТАЙСКИЙ ВЕРТОЛЁТ', 3);
  } else {
    worldW = 1380; countdown = 68;
    boss = { x: 785, y: FLOOR - 137, hp: 10, maxHp: 10, hit: 0, phase: 0, type: 'final' };
    bossAttack = 1.4;
    announce('ФИНАЛ · НЕ ДАЙ НАЖАТЬ КНОПКУ', 3.2);
  }
}
function startNewGame() {
  score = 0; time = 0; player = makePlayer();
  Object.keys(keys).forEach((k) => { keys[k] = false; });
  enterStage(1);
  mode = 'playing'; overlay.hidden = true;
  pauseButton.textContent = 'Ⅱ ПАУЗА';
  canvas.focus({ preventScroll: true });
}
function displayOverlay(eyebrow, title, description, cta, callback) {
  overlayEyebrow.textContent = eyebrow;
  overlayTitle.innerHTML = title;
  overlayText.textContent = description;
  missionCards.hidden = true;
  overlayHint.textContent = 'A / D — движение · W / ↑ — прыжок · ПРОБЕЛ / J — ЭМИ · E — действие · P — пауза';
  primaryButton.innerHTML = cta + ' <span aria-hidden="true">→</span>';
  primaryButton.onclick = callback;
  overlay.hidden = false;
}
function pause() {
  if (mode === 'playing') {
    mode = 'paused';
    pauseButton.textContent = '▶ ПРОДОЛЖИТЬ';
    displayOverlay('ПЕРЕРЫВ НА ЗАХВАТ МИРА', 'ПАУЗА', 'Чипы никуда не денутся. Вероятно.', 'ПРОДОЛЖИТЬ', resume);
  } else if (mode === 'paused') resume();
}
function resume() {
  if (mode !== 'paused') return;
  mode = 'playing'; overlay.hidden = true;
  pauseButton.textContent = 'Ⅱ ПАУЗА';
  canvas.focus({ preventScroll: true });
}
function lose(reason) {
  if (mode !== 'playing') return;
  mode = 'lost'; persistRecord(); beep(150, .35, 'sawtooth');
  pauseButton.textContent = 'Ⅱ ПАУЗА';
  displayOverlay('МИССИЯ ПРОВАЛЕНА', 'ОПЕРАЦИЯ <em>СОРВАНА</em>',
    reason + ' Результат: ' + score.toLocaleString('ru-RU') + ' очков. Рекорд: ' + highScore.toLocaleString('ru-RU') + '.',
    'ПОПРОБОВАТЬ СНОВА', startNewGame);
}
function win() {
  if (mode !== 'playing') return;
  addScore(3000 + Math.ceil(countdown) * 20 + player.hp * 200);
  mode = 'won'; pop(1100, 280, '#8cfbdd', 65); beep(920, .26, 'triangle');
  displayOverlay('МИССИЯ ВЫПОЛНЕНА', 'МИР <em>СПАСЁН!</em>',
    'Пинки и Брейн вынесли чипы, перехитрили преследователей и заблокировали чемоданчик. Итог: ' +
    score.toLocaleString('ru-RU') + ' очков. Рекорд: ' + highScore.toLocaleString('ru-RU') + '.',
    'СЫГРАТЬ ЕЩЁ', startNewGame);
}
function hurt(amount = 1) {
  if (mode !== 'playing' || player.invul > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invul = 1.45; shake = 10;
  player.vy = -245; player.y -= 5;
  pop(player.x + 24, player.y + 26, '#ff7e8f', 15); beep(140, .18, 'sawtooth');
  if (player.hp <= 0) lose('Герои попались. Том и Джерри уже составляют протокол.');
}
function jump() {
  if (mode !== 'playing') return;
  player.jumpQueued = true;
}
function tryDefuse() {
  if (mode !== 'playing' || stage !== 3) return;
  if (boss.hp > 0) {
    announce('СНАЧАЛА ОТКЛЮЧИ ОХРАНУ ЧЕМОДАНЧИКА!', 1.4);
    return;
  }
  if (Math.abs(player.x + 23 - 1110) < 96) win();
  else announce('ПОДОЙДИ К ЧЕМОДАНЧИКУ И НАЖМИ E', 1.3);
}
function pulse() {
  if (player.fireCd > 0 || mode !== 'playing') return;
  player.fireCd = .32; beep(620, .07, 'square');
  const ox = player.x + 24 + player.facing * 14, oy = player.y + 29;
  effects.push({ x: ox, y: oy, r: 3, life: .26, type: 'pulse' });
  if (stage === 1) {
    enemies.forEach((e) => {
      const dx = e.x + e.w / 2 - ox, dy = e.y + e.h / 2 - oy;
      if (Math.abs(dx) < 138 && Math.abs(dy) < 88 && e.stunned <= 0) {
        e.stunned = 2.4; addScore(90);
        pop(e.x + e.w / 2, e.y + 10, '#8bfbe7', 9);
      }
    });
  } else if (stage === 2 && boss.hp > 0) {
    const bx = boss.x + 62, by = boss.y + 38;
    if (Math.abs(bx - ox) < 230) {
      boss.hp -= 1; boss.hit = .2; addScore(110);
      effects.push({ x: bx, y: by, x2: ox, y2: oy, life: .13, type: 'beam' });
      pop(bx, by, '#a5f9e8', 8); beep(840, .075);
      if (boss.hp <= 0) {
        addScore(1250); pop(bx, by, '#ffc36c', 40);
        enterStage(3);
      }
    } else if (player.fireCd === .32) {
      announce('ПОДБЕРИСЬ ПОБЛИЖЕ К ВЕРТОЛЁТУ', .85);
    }
  } else if (stage === 3 && boss.hp > 0) {
    const bx = boss.x + 62, by = boss.y + 70;
    if (Math.abs(bx - ox) < 185) {
      boss.hp -= 1; boss.hit = .24; addScore(130);
      effects.push({ x: bx, y: by, x2: ox, y2: oy, life: .13, type: 'beam' });
      pop(bx, by, '#d0ffed', 9);
      if (boss.hp <= 0) {
        addScore(1700); announce('ЗАЩИТА СНЯТА! БЕГИ К ЧЕМОДАНЧИКУ →', 3);
        pop(bx, by, '#ffcc7b', 36);
      }
    }
  }
}
function update(dt) {
  if (mode !== 'playing') return;
  time += dt; stageTime += dt;
  player.invul = Math.max(0, player.invul - dt);
  player.fireCd = Math.max(0, player.fireCd - dt);
  shake = Math.max(0, shake - 26 * dt);
  if (noticeTime > 0) {
    noticeTime -= dt;
    if (noticeTime <= 0) announcement.classList.remove('visible');
  }
  if (keys.fire) pulse();
  const horizontal = Number(keys.right) - Number(keys.left);
  if (horizontal) player.facing = horizontal;
  player.x = clamp(player.x + horizontal * 262 * dt, 6, worldW - player.w - 8);
  player.run += Math.abs(horizontal) * dt * 13;
  if (player.jumpQueued && player.onGround) {
    player.vy = -548; player.onGround = false; beep(390, .085, 'triangle');
  }
  player.jumpQueued = false;
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  if (player.y >= FLOOR - player.h) {
    player.y = FLOOR - player.h; player.vy = 0; player.onGround = true;
  } else player.onGround = false;
  cameraX += (clamp(player.x - 280, 0, worldW - W) - cameraX) * Math.min(1, 8 * dt);

  if (stage === 1) {
    for (const item of pickups) {
      if (item.taken) continue;
      const centerY = player.y + 28;
      if (Math.abs(player.x + 23 - item.x) < 33 && Math.abs(centerY - item.y) < 41) {
        item.taken = true;
        if (item.type === 'chip') { chips++; addScore(100); beep(880, .07); }
        else if (item.type === 'plan') { plans++; addScore(300); beep(1080, .13); }
        else { player.hp = Math.min(5, player.hp + 1); addScore(50); beep(730, .16); }
        pop(item.x, item.y, item.type === 'plan' ? '#ffe499' : '#7afae0');
      }
    }
    for (const e of enemies) {
      e.stunned = Math.max(0, e.stunned - dt);
      if (e.stunned <= 0 && Math.abs(e.x - player.x) < 540) {
        e.facing = Math.sign(player.x - e.x) || 1;
        e.x = clamp(e.x + e.facing * e.speed * dt, 200, 2040);
      }
      const dx = Math.abs(e.x + e.w / 2 - player.x - player.w / 2);
      const overlapY = player.y < e.y + e.h - 12 && player.y + player.h > e.y + 13;
      if (dx < (e.w + player.w) * .40 && overlapY && e.stunned <= 0) hurt();
    }
    if (player.x > 2080) {
      if (chips >= 6 && plans >= 1) {
        addScore(900 + player.hp * 100);
        enterStage(2);
      } else {
        player.x = 2078;
        if (noticeTime < .1) announce('НУЖНО 6 ЧИПОВ И 1 ЧЕРТЁЖ · СЕЙЧАС ' + chips + '/6 И ' + plans + '/1', 1.8);
      }
    }
  } else if (stage === 2) {
    boss.phase += dt;
    boss.x = 690 + Math.sin(boss.phase * 1.15) * 165;
    boss.y = 130 + Math.sin(boss.phase * 2.1) * 30;
    boss.hit = Math.max(0, boss.hit - dt);
    bossAttack -= dt;
    if (bossAttack <= 0) {
      bossAttack = Math.max(.68, 1.65 - (boss.maxHp - boss.hp) * .045);
      projectiles.push({ type: 'bomb', x: boss.x + 65, y: boss.y + 70, vx: (player.x + 23 - boss.x - 65) * .13, vy: 90, radius: 14 });
      beep(175, .1, 'triangle');
    }
  } else if (stage === 3) {
    countdown -= dt;
    if (countdown <= 0) { countdown = 0; lose('Красная кнопка всё-таки нажата. Даже Пинки считает, что это было лишним.'); return; }
    if (boss.hp > 0) {
      boss.phase += dt;
      boss.x = 780 + Math.sin(boss.phase * 1.3) * 26;
      boss.hit = Math.max(0, boss.hit - dt);
      bossAttack -= dt;
      if (bossAttack <= 0) {
        bossAttack = 1.3;
        projectiles.push({ type: 'paper', x: boss.x + 18, y: FLOOR - 37, vx: -280, vy: 0, radius: 16 });
      }
    }
    if (boss.hp === 0 && Math.abs(player.x + 23 - 1110) < 85 && noticeTime < .1) {
      announce('НАЖМИ E, ЧТОБЫ ОБЕЗВРЕДИТЬ ЧЕМОДАНЧИК!', 1.4);
    }
  }

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'bomb') p.vy += 370 * dt;
    const collision = Math.abs(player.x + 23 - p.x) < p.radius + 16 &&
      Math.abs(player.y + 27 - p.y) < p.radius + 25;
    if (collision) { hurt(); pop(p.x, p.y, '#f2ae69', 9); projectiles.splice(i, 1); continue; }
    if (p.type === 'bomb' && p.y >= FLOOR - 10) {
      if (Math.abs(player.x + 23 - p.x) < 52 && player.y + player.h > FLOOR - 65) hurt();
      pop(p.x, FLOOR - 8, '#e9a367', 14); shake = Math.max(shake, 3);
      projectiles.splice(i, 1); continue;
    }
    if (p.x < -40 || p.x > worldW + 40 || p.y > H + 40) projectiles.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 330 * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt; if (e.type === 'pulse') e.r += dt * 620;
    if (e.life <= 0) effects.splice(i, 1);
  }
}
function rr(x, y, w, h, r, fill, stroke = null, line = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function text(t, x, y, size = 16, color = '#fff', align = 'left', weight = 800) {
  ctx.font = weight + ' ' + size + 'px system-ui, sans-serif';
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y);
}
function line(x1, y1, x2, y2, color, width = 2) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function circle(x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function sky() {
  let gradient = ctx.createLinearGradient(0, 0, 0, H);
  if (stage === 1) { gradient.addColorStop(0, '#102a4d'); gradient.addColorStop(.6, '#15415b'); gradient.addColorStop(1, '#102d39'); }
  else if (stage === 2) { gradient.addColorStop(0, '#101936'); gradient.addColorStop(.66, '#60456b'); gradient.addColorStop(1, '#bd7969'); }
  else { gradient.addColorStop(0, '#10182e'); gradient.addColorStop(.7, '#312b48'); gradient.addColorStop(1, '#4f3449'); }
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  const shift = cameraX * .18;
  if (stage === 1) {
    for (let i = 0; i < 20; i++) {
      const x = i * 105 - (shift % 105);
      rr(x, 150 + (i % 3) * 16, 81, 278, 3, '#173b51');
      for (let j = 0; j < 5; j++) rr(x + 12, 183 + j * 39, 17, 19, 2, '#20576b');
    }
    ctx.fillStyle = '#123d49'; ctx.beginPath(); ctx.moveTo(0, 405);
    for (let i = 0; i < 20; i++) ctx.lineTo(i * 65, 340 + Math.sin(i * 1.7) * 36);
    ctx.lineTo(W, 445); ctx.fill();
  } else {
    circle(760 - shift * .12, 140, stage === 2 ? 64 : 47, stage === 2 ? '#f6aa9270' : '#d7dbee45');
    for (let i = 0; i < 24; i++) {
      const x = i * 75 - (shift % 75);
      const h = 110 + ((i * 59) % 125);
      rr(x, FLOOR - h, 66, h, 2, stage === 2 ? '#293250' : '#212b42');
      for (let y = FLOOR - h + 12; y < FLOOR - 12; y += 19)
        for (let xx = x + 12; xx < x + 61; xx += 20)
          rr(xx, y, 7, 8, 1, i % 3 === 0 ? '#e4a8786c' : '#819fbd43');
    }
    if (stage === 3) {
      for (let i = 0; i < 22; i++) circle((i * 83 + time * 11) % W, (i * 43 + time * 17) % FLOOR, 2, '#e8f5ff85');
    }
  }
}
function ground() {
  ctx.fillStyle = stage === 1 ? '#243a46' : stage === 2 ? '#343850' : '#303448';
  ctx.fillRect(0, FLOOR, worldW, H - FLOOR);
  ctx.fillStyle = stage === 1 ? '#54d4c3' : '#e5a974';
  ctx.fillRect(0, FLOOR, worldW, 5);
  for (let x = 0; x < worldW; x += 76) {
    rr(x + 9, FLOOR + 22, 48, 2, 1, '#ffffff13');
    circle(x + 12, FLOOR + 57, 3, '#a7b7cc45');
  }
}
function stageProps() {
  if (stage === 1) {
    for (let x = 250; x < 2150; x += 320) {
      line(x, 85, x, FLOOR - 7, '#6495a64a', 5);
      rr(x - 14, 87, 28, 42, 4, '#8ebace');
      circle(x, 115, 7, '#b1fff0');
      rr(x - 90, 246, 195, 78, 5, '#132b3b', '#33697c', 3);
      for (let i = 0; i < 7; i++) rr(x - 77 + i * 26, 264, 15, 43, 3, i % 2 ? '#244d59' : '#3c7280');
    }
    rr(90, 156, 310, 62, 12, '#112b3bdd', '#57cbbb', 2);
    text('TSMC', 245, 187, 31, '#a5ffe5', 'center', 950);
    text('TAIWAN FAB · SECTOR 07', 245, 210, 10, '#91b4c1', 'center');
    rr(2054, 305, 130, 140, 8, '#1b3540', '#7cf4d7', 3);
    rr(2083, 327, 72, 95, 5, chips >= 6 && plans >= 1 ? '#326e61' : '#374758', '#a6ead3', 2);
    text('ВЫХОД', 2117, 296, 16, '#e6f7f3', 'center');
    text('→', 2118, 373, 44, '#caffee', 'center');
    rr(1375, 129, 305, 38, 4, '#642b36', '#d56c70');
    text('TOM + JERRY · SECURITY', 1528, 148, 16, '#ffe3c4', 'center');
  } else if (stage === 2) {
    rr(120, 250, 305, 70, 7, '#1c273d', '#6681a3', 2);
    text('ROOFTOP ESCAPE', 272, 284, 24, '#b7deed', 'center', 900);
    text('ЭМИ В РАДИУСЕ 230 М', 272, 308, 11, '#7b9cb8', 'center');
    for (let x = 140; x < 1250; x += 250) {
      rr(x, 355, 18, 91, 3, '#27364e');
      rr(x - 10, 345, 38, 12, 3, '#56677a');
    }
  } else {
    rr(80, 210, 290, 83, 9, '#26263e', '#ab7278', 2);
    text('КРЕМЛЬ · ПОСЛЕДНИЙ УРОВЕНЬ', 225, 244, 17, '#ffd6c7', 'center');
    text('НЕЛЬЗЯ ДОПУСТИТЬ НАЖАТИЯ КНОПКИ', 225, 272, 10, '#d9a9a1', 'center');
    for (let x = 420; x < 1300; x += 330) {
      rr(x, 155, 84, 290, 6, '#50374d', '#986475', 2);
      ctx.fillStyle = '#94546e'; ctx.beginPath(); ctx.moveTo(x - 12, 155); ctx.lineTo(x + 42, 90); ctx.lineTo(x + 96, 155); ctx.fill();
      line(x + 40, 95, x + 40, 52, '#b8a3ad', 3);
      rr(x + 40, 53, 38, 23, 2, '#c44b54');
    }
    rr(1088, FLOOR - 51, 58, 50, 7, boss && boss.hp <= 0 ? '#2b8072' : '#4b333b', '#efd69d', 2);
    rr(1098, FLOOR - 41, 38, 26, 4, '#c8d2d4');
    circle(1117, FLOOR - 27, 11, '#ef454e');
    rr(1096, FLOOR - 63, 43, 10, 4, '#b9afa6', '#eee2cb', 2);
    text('E', 1117, FLOOR - 88, 21, '#a9ffe2', 'center', 1000);
    text('ЯДЕРНЫЙ ЧЕМОДАНЧИК', 1117, FLOOR + 25, 11, '#ffe1aa', 'center');
  }
}
function drawChip(x, y, type, seed) {
  const bounce = Math.sin(time * 4.5 + seed) * 5;
  ctx.save(); ctx.translate(x, y + bounce);
  if (type === 'chip') {
    ctx.shadowBlur = 18; ctx.shadowColor = '#6cf9d8';
    rr(-14, -13, 28, 26, 4, '#3af0cb', '#b2ffe6', 2);
    rr(-8, -7, 16, 14, 2, '#126b71'); circle(0, 0, 4, '#e1fff2');
    for (let i = -9; i <= 9; i += 9) {
      rr(i - 2, -18, 4, 6, 1, '#d5fff2'); rr(i - 2, 12, 4, 6, 1, '#d5fff2');
    }
  } else if (type === 'plan') {
    ctx.shadowBlur = 17; ctx.shadowColor = '#ffd484';
    rr(-15, -18, 30, 36, 4, '#f6d28b', '#fff2c0', 2);
    for (let i = 0; i < 3; i++) line(-9, -9 + i * 8, 9, -9 + i * 8, '#8f6542', 2);
    text('⌘', 0, 10, 15, '#8e613f', 'center');
  } else {
    ctx.shadowBlur = 14; ctx.shadowColor = '#fb8c9b';
    circle(0, 0, 16, '#fa7894'); text('+', 0, -1, 26, '#fff', 'center', 900);
  }
  ctx.restore();
}
function mouseCharacter(x, y, scale, pink, tall = false) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const fur = pink ? '#ecaac0' : '#e8e5dd';
  const ears = pink ? '#ff739c' : '#ef8da6';
  ctx.strokeStyle = '#9d8c99'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(7, 43); ctx.quadraticCurveTo(-29, 34, -27, 57); ctx.stroke();
  rr(-11, 31, 22, tall ? 38 : 27, 9, pink ? '#f4b0c7' : '#e4e0d6', '#b4a6a5');
  circle(-16, 14, tall ? 13 : 17, fur); circle(17, 12, tall ? 14 : 17, fur);
  circle(-16, 14, tall ? 8 : 11, ears); circle(17, 12, tall ? 8 : 11, ears);
  ctx.save(); ctx.scale(tall ? .68 : 1.13, 1);
  circle(0, 20, tall ? 19 : 22, fur);
  ctx.restore();
  circle(-7, 17, 5, '#fff'); circle(7, 17, 5, '#fff');
  circle(-6, 17, 2.5, '#242b3a'); circle(8, 17, 2.5, '#242b3a');
  circle(1, 27, 5, pink ? '#fa6392' : '#fa7895');
  line(-3, 33, 8, 34, '#5c6270', 1.3);
  line(-10, 28, -26, 25, '#fafafa', 1); line(10, 29, 26, 27, '#fafafa', 1);
  if (pink) { circle(1, 7, 3, '#f7bdd0'); line(0, 44, 0, 55, '#e16e9e', 4); }
  else { rr(-9, 36, 18, 10, 2, '#192743'); line(-2, 40, 8, 40, '#8dbdd9', 2); }
  ctx.restore();
}
function drawPlayer() {
  const bob = player.onGround ? Math.sin(player.run) * (Math.abs(Number(keys.right) - Number(keys.left)) ? 2 : 0) : -2;
  ctx.save();
  if (player.invul > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = .35;
  ctx.translate(player.x + 23, player.y - 9 + bob);
  if (player.facing < 0) ctx.scale(-1, 1);
  // Pinky rides behind Brain, while Brain carries the stolen chip backpack.
  rr(-19, 39, 39, 26, 8, '#17394b', '#7cdbcd', 2);
  rr(-23, 44, 12, 18, 2, '#74f7dc');
  mouseCharacter(-19, -12, .57, true, true);
  mouseCharacter(11, -18, .81, false);
  rr(-9, 53, 13, 10, 3, '#282e48'); rr(16, 53, 12, 10, 3, '#282e48');
  ctx.restore();
  if (player.invul > 0) {
    ctx.strokeStyle = '#91fff280'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(player.x + 22, player.y + 26, 31, 43, 0, 0, 2 * Math.PI); ctx.stroke();
  }
}
function drawTom(e) {
  const x = e.x, y = e.y;
  ctx.save();
  if (e.stunned > 0) ctx.globalAlpha = .55;
  ctx.translate(x + 28, y);
  if (e.facing > 0) ctx.scale(-1, 1);
  // Blue-grey cat, conspicuously red campaign hat and cowboy shirt.
  rr(-21, 39, 42, 39, 12, '#a77d56', '#d5ac72', 2);
  for (let i = 0; i < 3; i++) line(-16 + i * 13, 43, -11 + i * 13, 53, '#f3cd88', 2);
  rr(-27, 69, 20, 9, 3, '#333a43'); rr(8, 69, 20, 9, 3, '#333a43');
  ctx.fillStyle = '#8197ae'; ctx.beginPath(); ctx.moveTo(-24, 12); ctx.lineTo(-23, -8); ctx.lineTo(-7, 2);
  ctx.lineTo(9, 2); ctx.lineTo(23, -8); ctx.lineTo(24, 12); ctx.fill();
  circle(0, 22, 27, '#8197ae'); circle(-12, 12, 10, '#9eb2c7'); circle(13, 12, 10, '#9eb2c7');
  circle(-10, 13, 4, '#fff'); circle(10, 13, 4, '#fff');
  circle(-9, 13, 2, '#242936'); circle(11, 13, 2, '#242936');
  rr(-9, 25, 18, 11, 5, '#f4dbc3'); circle(0, 24, 5, '#f29ca0');
  rr(-26, -10, 52, 18, 5, '#d93d48', '#f06e6f', 1);
  rr(-32, 4, 61, 6, 2, '#af2936');
  text('MAGA', 0, -1, 10, '#fff8f3', 'center', 950);
  circle(5, 53, 5, '#eddb9e'); text('★', 5, 53, 9, '#754f37', 'center');
  ctx.restore();
  if (e.stunned > 0) text('✦ ✦', x + 28, y - 17, 15, '#a8fff2', 'center');
}
function drawJerry(e) {
  ctx.save();
  if (e.stunned > 0) ctx.globalAlpha = .55;
  ctx.translate(e.x + 20, e.y + 2);
  if (e.facing > 0) ctx.scale(-1, 1);
  line(8, 35, 30, 29, '#be8c62', 4);
  circle(-15, 7, 13, '#9d704c'); circle(15, 5, 13, '#9d704c');
  circle(-15, 7, 8, '#e3a28b'); circle(15, 5, 8, '#e3a28b');
  circle(0, 18, 17, '#a87954'); circle(-6, 17, 3, '#fff'); circle(8, 17, 3, '#fff');
  circle(-5, 17, 1.5, '#111'); circle(9, 17, 1.5, '#111');
  circle(2, 25, 4, '#e7a1a0');
  rr(-11, 31, 20, 12, 5, '#af7650'); rr(-11, 32, 24, 6, 2, '#c74953');
  ctx.restore();
  if (e.stunned > 0) text('✦ ✦', e.x + 20, e.y - 16, 15, '#a8fff2', 'center');
}
function drawHeli() {
  const x = boss.x, y = boss.y;
  ctx.save(); ctx.translate(x, y);
  if (boss.hit > 0) ctx.globalAlpha = .55;
  // Rotor and cockpit of the fictional cartoon helicopter boss.
  line(-47, 11, 187, 11, '#c4d5cd', 6);
  rr(53, -5, 7, 20, 2, '#c9e0d8'); line(-9, -8, 123, -8, '#d8e5d9', 5);
  line(8, 15, -57, 59, '#c95b53', 15); rr(-82, 39, 30, 6, 2, '#e7c074');
  rr(5, 13, 126, 67, 31, '#a93945', '#f1af82', 4);
  rr(84, 21, 43, 44, 13, '#558c99', '#b3e1d5', 3);
  rr(29, 27, 37, 35, 4, '#7d2937');
  text('CN-01', 47, 46, 13, '#fce2ad', 'center', 1000);
  text('★', 17, 45, 23, '#ffc46d', 'center');
  line(17, 79, 31, 99, '#cbd9d8', 5); line(105, 78, 116, 99, '#cbd9d8', 5);
  line(7, 99, 133, 99, '#cbd9d8', 6);
  ctx.restore();
  text('БОСС · ВЕРТОЛЁТ', x + 67, y - 42, 13, '#ffe3cb', 'center');
}
function drawFinalBoss() {
  const x = boss.x, y = boss.y;
  ctx.save(); ctx.translate(x, y);
  if (boss.hit > 0) ctx.globalAlpha = .55;
  // Broad cartoon caricature, deliberately non-photorealistic.
  rr(6, 55, 109, 82, 38, '#28384c', '#768296', 3);
  rr(19, 121, 33, 16, 4, '#171c27'); rr(70, 121, 34, 16, 4, '#171c27');
  circle(63, 34, 37, '#e2b9a1');
  ctx.fillStyle = '#8d6a5e'; ctx.beginPath(); ctx.ellipse(63, 6, 26, 8, 0, Math.PI, 2*Math.PI); ctx.fill();
  circle(49, 30, 3, '#1e2731'); circle(74, 30, 3, '#1e2731');
  line(53, 52, 72, 51, '#825c59', 2);
  rr(55, 57, 15, 65, 5, '#bc454b');
  ctx.fillStyle = '#b23d46'; ctx.beginPath(); ctx.moveTo(62, 125); ctx.lineTo(52, 104); ctx.lineTo(73, 104); ctx.fill();
  rr(0, 73, 23, 43, 12, '#24334b'); rr(103, 73, 19, 43, 11, '#24334b');
  ctx.restore();
  text('БОСС · ПУТИН', x + 61, y - 23, 15, '#ffe3d0', 'center');
  if (boss.hp <= 0) text('ОГЛУШЁН', x + 61, y - 42, 13, '#8cfce1', 'center');
}
function drawProjectiles() {
  for (const p of projectiles) {
    if (p.type === 'bomb') {
      circle(p.x, p.y, 14, '#282e39'); circle(p.x - 4, p.y - 4, 5, '#aebdd0');
      line(p.x + 8, p.y - 10, p.x + 13, p.y - 18, '#f9d28b', 3);
      circle(p.x + 13, p.y - 18, 4, '#f6b76b');
      if (p.y > FLOOR - 120) {
        ctx.fillStyle = '#fc946644'; ctx.beginPath(); ctx.ellipse(p.x, FLOOR - 4, 33, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-time * 7);
      rr(-16, -11, 32, 22, 2, '#f7ead2', '#bba78c', 2);
      line(-10, -4, 10, -4, '#c76d79', 2); line(-10, 3, 9, 3, '#b5a48e', 2);
      ctx.restore();
    }
  }
}
function drawEffects() {
  for (const e of effects) {
    if (e.type === 'pulse') {
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, 2 * Math.PI);
      ctx.strokeStyle = '#86f6e8' + Math.floor(clamp(e.life / .26, 0, 1) * 200).toString(16).padStart(2, '0');
      ctx.lineWidth = 6; ctx.stroke();
    } else if (e.type === 'beam') {
      line(e.x, e.y, e.x2, e.y2, '#9cfff3', 5);
      line(e.x, e.y, e.x2, e.y2, '#ffffff', 2);
    }
  }
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.total * 1.6, 0, 1);
    rr(p.x, p.y, p.size, p.size, 1, p.color);
  }
  ctx.globalAlpha = 1;
}
function drawHUD() {
  rr(15, 15, 930, 68, 12, '#071324cc', '#58758665');
  text('CHIP HEIST', 31, 35, 16, '#9bffe1', 'left', 1000);
  text('ЭТАП ' + stage + '/3', 31, 60, 11, '#92aac0');
  for (let i = 0; i < 5; i++) {
    text(i < player.hp ? '♥' : '♡', 165 + i * 27, 46, 25, i < player.hp ? '#fc829d' : '#61738a');
  }
  text('СЧЁТ', 358, 34, 10, '#8da8c0');
  text(score.toLocaleString('ru-RU'), 358, 57, 20, '#ffe197', 'left', 950);
  if (stage === 1) {
    text('ЧИПЫ ' + chips + '/6', 566, 37, 14, chips >= 6 ? '#87ffda' : '#d7e7f3');
    text('ЧЕРТЕЖИ ' + plans + '/1', 566, 60, 12, plans >= 1 ? '#87ffda' : '#d7e7f3');
  } else {
    text('БОСС', 565, 31, 11, '#b3c7d8');
    rr(565, 46, 178, 14, 5, '#293246');
    rr(566, 47, 176 * Math.max(0, boss.hp) / boss.maxHp, 12, 4, stage === 2 ? '#f2af74' : '#ed728a');
    text(boss.hp + '/' + boss.maxHp, 752, 53, 11, '#e5ecf2');
  }
  if (stage === 3) {
    text('ДО НАЖАТИЯ', 814, 32, 10, '#ffb8b7');
    text(Math.ceil(countdown) + ' СЕК', 814, 57, 19, countdown < 16 ? '#ff6c80' : '#f7d48c', 'left', 950);
  } else {
    text('ВРЕМЯ', 830, 34, 10, '#8da8c0');
    text(Math.floor(stageTime) + 'с', 830, 57, 20, '#e7f1fa', 'left', 950);
  }
  if (stage === 1) {
    rr(18, H - 37, 460, 24, 7, '#0d2332be');
    text('СОБЕРИ 6 ЧИПОВ + 1 ЧЕРТЁЖ И ДОБЕГИ ДО ВЫХОДА →', 29, H - 25, 11, '#d9f5ee');
  } else if (stage === 2) {
    rr(18, H - 37, 405, 24, 7, '#0d2332be');
    text('ПОДОЙДИ БЛИЖЕ И БЕЙ ВЕРТОЛЁТ ЭМИ (J / ПРОБЕЛ)', 29, H - 25, 11, '#d9f5ee');
  } else {
    rr(18, H - 37, 465, 24, 7, '#0d2332be');
    text(boss.hp > 0 ? 'СНИМИ ЗАЩИТУ ЭМИ, ЗАТЕМ ИЩИ ЧЕМОДАНЧИК' : 'БЕГИ К ЧЕМОДАНЧИКУ И НАЖМИ E', 29, H - 25, 11, '#d9f5ee');
  }
}
function render() {
  ctx.save(); ctx.clearRect(0, 0, W, H);
  if (shake > 0 && mode === 'playing') ctx.translate(random(-shake, shake), random(-shake, shake));
  sky();
  ctx.save(); ctx.translate(-cameraX, 0);
  ground(); stageProps();
  if (stage === 1) {
    for (const item of pickups) if (!item.taken) drawChip(item.x, item.y, item.type, item.seed);
    for (const e of enemies) e.type === 'tom' ? drawTom(e) : drawJerry(e);
  } else if (stage === 2) drawHeli();
  else drawFinalBoss();
  drawProjectiles(); drawPlayer(); drawEffects();
  ctx.restore();
  drawHUD();
  ctx.restore();
}
function loop(now) {
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .033) : .016;
  lastFrame = now;
  update(dt); render();
  requestAnimationFrame(loop);
}
function handleKey(event, down) {
  const code = event.code;
  if (['ArrowLeft','ArrowRight','ArrowUp','Space','KeyW','KeyA','KeyD','KeyJ','KeyE','KeyP','Escape'].includes(code))
    event.preventDefault();
  if (code === 'ArrowLeft' || code === 'KeyA') keys.left = down;
  if (code === 'ArrowRight' || code === 'KeyD') keys.right = down;
  if (code === 'Space' || code === 'KeyJ') keys.fire = down;
  if (down && !event.repeat) {
    if (code === 'ArrowUp' || code === 'KeyW') jump();
    if (code === 'KeyE') tryDefuse();
    if (code === 'KeyP' || code === 'Escape') pause();
    if (code === 'Enter' && mode === 'menu') startNewGame();
  }
}
document.addEventListener('keydown', (event) => handleKey(event, true));
document.addEventListener('keyup', (event) => handleKey(event, false));
window.addEventListener('blur', () => {
  Object.keys(keys).forEach((k) => { keys[k] = false; });
  if (mode === 'playing') pause();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pause(); });
document.querySelectorAll('.touch-key').forEach((button) => {
  const hold = button.dataset.hold, press = button.dataset.press;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (hold) keys[hold] = true;
    if (press === 'jump') jump();
    if (press === 'use') tryDefuse();
    button.classList.add('is-held');
  });
  const release = () => { if (hold) keys[hold] = false; button.classList.remove('is-held'); };
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});
pauseButton.addEventListener('click', pause);
soundButton.addEventListener('click', () => {
  muted = !muted; soundLabel.textContent = muted ? 'ВЫКЛ' : 'ВКЛ';
  soundButton.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
  beep(600, .1);
});
fullscreenButton.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else {
    const target = window.matchMedia('(pointer: coarse)').matches ? document.querySelector('main') : frameEl;
    if (target && target.requestFullscreen) target.requestFullscreen().catch(() => {});
  }
});
primaryButton.onclick = startNewGame;
enterStage(1);
announcement.classList.remove('visible');
requestAnimationFrame(loop);
