/* ==========================================================================
   Gravity Shift — 중력 반전 러너
   GitHub Game Off 2026 · 테마 "SHIFT"
   --------------------------------------------------------------------------
   규칙: 화면을 탭하면 중력이 뒤집혀요. 바닥과 천장을 오가며
   가시(삼각형)와 공중 바를 피하고, 별을 먹으면 보너스 점수!
   --------------------------------------------------------------------------
   파일 안내
   · CFG      : 난이도 숫자들이 모여 있어요. 여기를 고치면 밸런스가 바뀝니다.
   · COLORS   : 게임 그림에 쓰는 색.
   · 위젯 연동: 자비스 앱 위젯에서 실행되면 pickle.widget 으로 기록을 저장하고
                자비스가 'flip'(중력 뒤집기)·'restart' 명령을 보낼 수 있어요.
   ========================================================================== */
(function () {
  'use strict';

  // ───────────────────────── 설정 (튜닝 포인트) ─────────────────────────
  var CFG = {
    gravity:       3.2,   // 중력 가속 (화면 높이/초²) — 클수록 빨리 떨어져요
    maxFall:       1.25,  // 최대 낙하 속도 (화면 높이/초)
    speedBase:     0.70,  // 장애물 스크롤 속도 (화면 높이/초)
    speedRamp:     1 / 50, // 매초 속도 증가율
    speedMax:      1.40,  // 최대 스크롤 속도 (후반 0.3초 미만 간격 방지)
    playerX:       0.24,  // 플레이어 x 위치 (화면 폭 비율)
    playerSize:    0.055, // 플레이어 크기 (화면 높이 비율)
    hitScale:      0.70,  // 충돌 판정 배율 — 1보다 작으면 더 관대해요
    gapMin:        0.60,  // 장애물 사이 최소 간격 (화면 높이 비율)
    gapMax:        1.00,  // 장애물 사이 최대 간격
    gapShrink:     0.60,  // 시간이 지날수록 간격이 최대 이 배율까지 줄어요
    pxPerPoint:    40,    // 이 만큼 이동할 때마다 1점
    starPoints:    5,     // 별 1개 보너스
    starChance:    0.35,  // 장애물 사이에 별이 나올 확률
    restartLockMs: 500    // 게임 오버 직후 입력 잠금 (실수로 바로 재시작되는 것 방지)
  };

  // 게임 그림에 쓰는 색 (화면 UI 색은 style.css의 토큰 사용)
  var COLORS = {
    skyTop: '#0b0e1c', skyBottom: '#182038',
    floorGlow: '#22d3ee',
    player: '#ffd166', playerDark: '#f4a259',
    obstacle: '#ff6b6b', obstacleDark: '#c9485f',
    star: '#ffe6a1',
    text: '#f5f7ff'
  };

  // ───────────────────── 위젯 연동 (앱에서 실행될 때) ─────────────────────
  var widget = (window.pickle && window.pickle.widget) ? window.pickle.widget : null;

  // ───────────────────────── 기록 불러오기 ─────────────────────────
  var store = { best: 0, last: 0, games: 0 };
  try {
    var rawBest = localStorage.getItem('gravity-shift-best');
    if (rawBest) store.best = parseInt(rawBest, 10) || 0;
  } catch (e) { /* 위젯 안에서는 localStorage를 못 써요 */ }
  if (widget && widget.state) {
    store.best  = widget.state.best  || store.best;
    store.last  = widget.state.last  || 0;
    store.games = widget.state.games || 0;
  }

  function saveRecord() {
    try { localStorage.setItem('gravity-shift-best', String(store.best)); } catch (e) {}
    if (widget) {
      widget.save({
        best: store.best, last: store.last, games: store.games,
        metrics: {
          high_score: store.best,
          last_score: store.last,
          games_played: store.games
        }
      }).catch(function () { /* 저장 충돌 시 onstate가 최신 상태를 알려줘요 */ });
    }
  }

  // ───────────────────────── 화면 요소 ─────────────────────────
  var stage  = document.getElementById('stage');
  var canvas = document.getElementById('game');
  var ctx    = canvas.getContext('2d');
  var screens = {
    title: document.getElementById('screen-title'),
    over:  document.getElementById('screen-over'),
    pause: document.getElementById('screen-pause')
  };
  var el = {
    titleBest: document.getElementById('title-best'),
    overScore: document.getElementById('over-score'),
    overBest:  document.getElementById('over-best'),
    overNew:   document.getElementById('over-new')
  };

  // ───────────────────────── 실행 상태 ─────────────────────────
  var W = 0, H = 0, DPR = 1, fontStack = 'sans-serif';
  var state = 'title';          // title | playing | paused | over
  var time = 0;                 // 이번 판 경과 시간(초)
  var speed = 0;                // 현재 스크롤 속도(px/초)
  var score = 0;
  var newBest = false;
  var overAt = 0;
  var lastSignalAt = -999999;
  var shake = 0, flash = 0;

  var player = { y: 0, vy: 0, dir: 1 };   // dir: 1=아래로, -1=위로
  var obstacles = [];           // {kind:'spike'|'bar', ...}
  var stars = [];               // {x, yF, r, phase}
  var particles = [];           // {x, y, vx, vy, life, maxLife, r, color}
  var trail = [];               // 플레이어 잔상
  var bgStars = [];             // 배경 별 (시차 스크롤)
  var distSinceSpawn = 0, nextGap = 0;

  function playerSize() {
    return Math.max(16, Math.min(40, H * CFG.playerSize));
  }

  // ───────────────────────── 소리 (WebAudio, 파일 없음) ─────────────────────────
  var AC = null;
  function ensureAudio() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (AC && AC.state === 'suspended') AC.resume();
  }
  function blip(freq, dur, type, vol) {
    if (!AC) return;
    try {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + dur);
    } catch (e) {}
  }

  // ───────────────────────── 크기 조절 ─────────────────────────
  function resize() {
    var oldH = H;
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    if (W < 1 || H < 1) return;
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (oldH > 0 && H !== oldH) player.y = player.y * H / oldH;
    fontStack = getComputedStyle(document.body).fontFamily || 'sans-serif';
    makeBgStars();
  }

  function makeBgStars() {
    bgStars = [];
    var n = Math.round(W * H / 9000);
    for (var i = 0; i < n; i++) {
      bgStars.push({
        x: Math.random(), y: Math.random(),
        z: 0.35 + Math.random() * 0.65,   // 깊이 (멀수록 느리게)
        r: 0.5 + Math.random() * 1.4
      });
    }
  }

  // ───────────────────────── 게임 흐름 ─────────────────────────
  function showScreen(name) {
    screens.title.classList.toggle('hidden', name !== 'title');
    screens.over.classList.toggle('hidden', name !== 'over');
    screens.pause.classList.toggle('hidden', name !== 'pause');
  }

  function refreshTitle() {
    el.titleBest.textContent = '최고 기록 ' + store.best + '점';
  }

  function startGame() {
    state = 'playing';
    time = 0; score = 0; newBest = false;
    player.y = H / 2; player.vy = 0; player.dir = 1;
    obstacles.length = 0; stars.length = 0; particles.length = 0; trail.length = 0;
    distSinceSpawn = 0;
    nextGap = H * CFG.gapMax * 1.3;   // 첫 장애물 전까지는 여유를 줘요
    shake = 0; flash = 0;
    showScreen(null);
    blip(560, 0.08, 'square', 0.05);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    showScreen('pause');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    showScreen(null);
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    shake = 1; flash = 1;
    var s = Math.floor(score);
    store.last = s;
    store.games += 1;
    newBest = s > store.best;
    if (newBest) store.best = s;
    saveRecord();

    el.overScore.textContent = '이번 점수 ' + s + '점';
    el.overBest.textContent = '최고 기록 ' + store.best + '점';
    el.overNew.classList.toggle('hidden', !newBest);
    setTimeout(function () { if (state === 'over') showScreen('over'); }, 450);

    if (widget && performance.now() - lastSignalAt > 3000) {
      lastSignalAt = performance.now();
      widget.signal(newBest
        ? '새 최고 기록! ' + s + '점으로 게임 오버였어요.'
        : s + '점으로 게임 오버, 최고 기록은 ' + store.best + '점이에요.');
    }
    blip(120, 0.3, 'sawtooth', 0.07);
    blip(60, 0.4, 'triangle', 0.05);
  }

  function flip() {
    player.dir *= -1;
    var px = W * CFG.playerX, size = playerSize();
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2;
      particles.push({
        x: px, y: player.y,
        vx: Math.cos(a) * size * 3, vy: Math.sin(a) * size * 3,
        life: 0.35, maxLife: 0.35, r: size * 0.10 + Math.random() * size * 0.08,
        color: COLORS.player
      });
    }
    blip(300 + Math.random() * 60, 0.07, 'square', 0.045);
  }

  // ───────────────────────── 스폰 ─────────────────────────
  function spawnObstacle() {
    var size = playerSize();
    if (time > 14 && Math.random() < 0.24) {
      // 공중 바: 바로 위나 아래에 딱 붙어서 통과해야 해요
      var bh = H * (0.20 + Math.random() * 0.14);
      obstacles.push({
        kind: 'bar',
        x: W + size * 2, w: size * 0.9,
        top: H * 0.5 - bh / 2, bottom: H * 0.5 + bh / 2,
        passed: false
      });
    } else {
      var n = 1 + (Math.random() < 0.35 ? 1 : 0) + (Math.random() < 0.12 ? 1 : 0);
      obstacles.push({
        kind: 'spike',
        x: W + size * 2, w: size * 1.5 * n, h: size * 1.5,
        side: Math.random() < 0.5 ? 'floor' : 'ceil',
        n: n, passed: false
      });
    }
    if (Math.random() < CFG.starChance) {
      stars.push({
        x: W + size * 2 + nextGap * 0.55,
        yF: 0.20 + Math.random() * 0.60,
        r: size * 0.55,
        phase: Math.random() * Math.PI * 2
      });
    }
    var shrink = 1 - Math.min(0.30, time * CFG.gapShrink / 90);
    nextGap = H * (CFG.gapMin + Math.random() * (CFG.gapMax - CFG.gapMin)) * shrink;
    distSinceSpawn = 0;
  }

  // ───────────────────────── 업데이트 ─────────────────────────
  function rectHit(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function update(dt) {
    shake = Math.max(0, shake - dt * 2.2);
    flash = Math.max(0, flash - dt * 2.4);
    updateParticles(dt);

    if (state === 'title') { time += dt; return; }
    if (state !== 'playing') return;

    time += dt;
    speed = Math.min(H * CFG.speedMax, H * CFG.speedBase * (1 + time * CFG.speedRamp));

    // 중력 + 낙하
    player.vy += H * CFG.gravity * player.dir * dt;
    var mf = H * CFG.maxFall;
    if (player.vy >  mf) player.vy =  mf;
    if (player.vy < -mf) player.vy = -mf;
    player.y += player.vy * dt;

    var half = playerSize() * CFG.hitScale / 2;
    // 바닥·천장에 닿으면 미끄러지듯 붙어 있어요 (죽지 않아요)
    if (player.y + half > H) { player.y = H - half; if (player.dir > 0) player.vy = 0; }
    if (player.y - half < 0) { player.y = half;     if (player.dir < 0) player.vy = 0; }

    // 잔상
    trail.push({ y: player.y });
    if (trail.length > 10) trail.shift();

    // 스폰
    distSinceSpawn += speed * dt;
    if (distSinceSpawn >= nextGap) spawnObstacle();

    // 장애물 이동 · 통과 점수 · 충돌
    var px = W * CFG.playerX, py = player.y, size = playerSize();
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.x -= speed * dt;
      if (o.x + o.w < -40) { obstacles.splice(i, 1); continue; }

      if (!o.passed && o.x + o.w < px - half) { o.passed = true; score += 1; }

      var hit = false;
      if (o.kind === 'spike') {
        var hh = o.h * 0.72;                       // 뾰족한 끝은 살짝 관대하게
        var oy = (o.side === 'floor') ? H - hh : 0;
        hit = rectHit(px - half, py - half, half * 2, half * 2,
                      o.x + o.w * 0.18, oy, o.w * 0.64, hh);
      } else {
        var m = size * 0.08;
        hit = rectHit(px - half, py - half, half * 2, half * 2,
                      o.x + m, o.top + m, o.w - 2 * m, (o.bottom - o.top) - 2 * m);
      }
      if (hit) { gameOver(); return; }
    }

    // 별
    for (var j = stars.length - 1; j >= 0; j--) {
      var st = stars[j];
      st.x -= speed * dt;
      if (st.x < -40) { stars.splice(j, 1); continue; }
      var sy = st.yF * H;
      var dx = px - st.x, dy = py - sy;
      if (dx * dx + dy * dy < (st.r + half) * (st.r + half)) {
        score += CFG.starPoints;
        for (var k = 0; k < 10; k++) {
          var a2 = Math.random() * Math.PI * 2;
          particles.push({
            x: st.x, y: sy,
            vx: Math.cos(a2) * size * 4, vy: Math.sin(a2) * size * 4,
            life: 0.4, maxLife: 0.4, r: size * 0.09,
            color: COLORS.star
          });
        }
        stars.splice(j, 1);
        blip(880, 0.12, 'sine', 0.05);
      }
    }

    // 거리 점수
    score += speed * dt / CFG.pxPerPoint;
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  }

  // ───────────────────────── 그리기 ─────────────────────────
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    // 배경 그라데이션
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, COLORS.skyTop);
    bg.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 배경 별 (시차 스크롤)
    ctx.fillStyle = 'rgba(245,247,255,0.8)';
    for (var i = 0; i < bgStars.length; i++) {
      var b = bgStars[i];
      var bx = ((b.x - time * b.z * 0.03) % 1 + 1) % 1;
      ctx.globalAlpha = 0.25 + b.z * 0.5;
      ctx.beginPath();
      ctx.arc(bx * W, b.y * H, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 화면 흔들림 (게임 오버 순간)
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
    }

    drawPickups();
    drawObstacles();
    drawPlayer();
    drawParticles();

    ctx.restore();

    // 바닥·천장 라인
    ctx.fillStyle = COLORS.floorGlow;
    ctx.fillRect(0, 0, W, 3);
    ctx.fillRect(0, H - 3, W, 3);
    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.fillRect(0, 3, W, 14);
    ctx.fillRect(0, H - 17, W, 14);

    // 점수판
    if (state === 'playing' || state === 'paused' || state === 'over') {
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'center';
      ctx.font = '800 ' + Math.round(Math.max(18, H * 0.045)) + 'px ' + fontStack;
      ctx.fillText(String(Math.floor(score)), W / 2, Math.max(30, H * 0.07));
      ctx.textAlign = 'right';
      ctx.font = '600 ' + Math.round(Math.max(11, H * 0.022)) + 'px ' + fontStack;
      ctx.globalAlpha = 0.6;
      ctx.fillText('최고 ' + store.best, W - 12, Math.max(24, H * 0.045));
      ctx.globalAlpha = 1;
    }

    // 피격 플래시
    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,80,80,' + (flash * 0.30) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawObstacles() {
    var size = playerSize();
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.kind === 'spike') {
        var sw = o.w / o.n;
        for (var s = 0; s < o.n; s++) {
          var x0 = o.x + s * sw;
          ctx.beginPath();
          if (o.side === 'floor') {
            ctx.moveTo(x0, H);
            ctx.lineTo(x0 + sw / 2, H - o.h);
            ctx.lineTo(x0 + sw, H);
          } else {
            ctx.moveTo(x0, 0);
            ctx.lineTo(x0 + sw / 2, o.h);
            ctx.lineTo(x0 + sw, 0);
          }
          ctx.closePath();
          var gr = ctx.createLinearGradient(x0, 0, x0 + sw, 0);
          gr.addColorStop(0, COLORS.obstacleDark);
          gr.addColorStop(0.5, COLORS.obstacle);
          gr.addColorStop(1, COLORS.obstacleDark);
          ctx.fillStyle = gr;
          ctx.fill();
        }
      } else { // 공중 바
        ctx.fillStyle = COLORS.obstacleDark;
        rr(o.x, o.top, o.w, o.bottom - o.top, size * 0.16);
        ctx.fill();
        ctx.fillStyle = COLORS.obstacle;
        rr(o.x + o.w * 0.18, o.top, o.w * 0.64, o.bottom - o.top, size * 0.12);
        ctx.fill();
      }
    }
  }

  function drawPickups() {
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i];
      var sy = st.yF * H + Math.sin(time * 3 + st.phase) * H * 0.012;
      ctx.save();
      ctx.translate(st.x, sy);
      ctx.rotate(time * 1.5 + st.phase);
      ctx.fillStyle = COLORS.star;
      ctx.shadowColor = COLORS.star;
      ctx.shadowBlur = st.r * 1.4;
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var ang = k * Math.PI / 5 - Math.PI / 2;
        var rad = (k % 2 === 0) ? st.r : st.r * 0.45;
        ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlayer() {
    var size = playerSize();
    var px = W * CFG.playerX;

    // 잔상
    for (var i = 0; i < trail.length; i++) {
      ctx.globalAlpha = (i / trail.length) * 0.16;
      ctx.fillStyle = COLORS.player;
      ctx.beginPath();
      ctx.arc(px, trail[i].y, size * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 몸통 (낙하 방향으로 살짝 늘어나요)
    var y = (state === 'title')
      ? H * 0.17 + Math.sin(time * 2.4) * H * 0.02   // 시작 카드 위쪽에서 둥실 (클로드 수정)
      : player.y;
    ctx.save();
    ctx.translate(px, y);
    var stretch = Math.min(0.20, Math.abs(player.vy) / (H * CFG.maxFall)) * 0.35;
    ctx.scale(1 - stretch * 0.6, 1 + stretch);
    rr(-size / 2, -size / 2, size, size, size * 0.34);
    ctx.fillStyle = COLORS.player;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.strokeStyle = COLORS.playerDark;
    ctx.stroke();

    // 눈 (중력 방향을 바라봐요)
    var look = player.dir * size * 0.07;
    ctx.fillStyle = '#22252e';
    ctx.beginPath();
    ctx.arc(-size * 0.14, look - size * 0.02, size * 0.075, 0, Math.PI * 2);
    ctx.arc( size * 0.14, look - size * 0.02, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-size * 0.11, look - size * 0.05, size * 0.025, 0, Math.PI * 2);
    ctx.arc( size * 0.17, look - size * 0.05, size * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ───────────────────────── 입력 ─────────────────────────
  function primary() {
    ensureAudio();
    if (state === 'title')  { startGame(); return; }
    if (state === 'paused') { resumeGame(); return; }
    if (state === 'playing') { flip(); return; }
    if (state === 'over' && performance.now() - overAt > CFG.restartLockMs) startGame();
  }

  // 포인터(손가락·마우스) 입력 — 스크롤·더블탭 확대 방지
  stage.addEventListener('pointerdown', function (e) {
    if (e.button && e.button > 0) return;
    e.preventDefault();
    primary();
  }, { passive: false });

  stage.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) {
    if (e.target && e.target.closest && e.target.closest('#stage')) e.preventDefault();
  });

  // 키보드 입력 (스페이스·Shift·위 방향키) — 꾹 누르기 반복은 무시
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' ||
        e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Enter') {
      e.preventDefault();
      primary();
    }
  });

  // 버튼: 터치·마우스는 위 pointerdown이 처리하고, 키보드 접근성용 click만 받아요
  ['btn-start', 'btn-restart', 'btn-resume'].forEach(function (id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', function (e) { if (e.detail === 0) primary(); });
  });

  // 화면을 벗어나면 자동 일시정지
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pauseGame();
  });

  // ───────────────────────── 위젯 명령 (자비스용) ─────────────────────────
  if (widget) {
    widget.oncommand = function (line) {
      var word = line.trim().split(/\s+/)[0];
      if (word === 'restart') { startGame(); return '새 판을 시작했어요.'; }
      if (word === 'flip') {
        if (state !== 'playing') throw new Error('게임이 진행 중이 아니에요. 먼저 restart로 판을 시작해 주세요.');
        flip();
        return '중력을 뒤집었어요.';
      }
      throw new Error('알 수 없는 명령이에요: ' + word);
    };
    widget.onstate = function (data) {
      if (data && typeof data.best === 'number' && data.best > store.best) {
        store.best = data.best;
        refreshTitle();
      }
    };
  }

  // ───────────────────────── 메인 루프 ─────────────────────────
  var lastTime = performance.now();
  function loop(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.033);  // 프레임 끊김 방지
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ───────────────────────── 시작 ─────────────────────────
  window.addEventListener('resize', resize);
  resize();
  refreshTitle();
  showScreen('title');
  requestAnimationFrame(loop);

  // 디버깅·테스트용 손잡이 (게임 플레이에는 필요 없어요)
  window.GravityShift = {
    get state() { return state; },
    get score() { return Math.floor(score); },
    get best()  { return store.best; },
    get dir()   { return player.dir; },
    primary: primary,
    start: startGame
  };
})();
