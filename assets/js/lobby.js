/* ==========================================================================
   奶蛙冒险 · 大厅
   纯 Canvas 像素风场景：石墙、火把、浮尘、暗角。
   没有外部图片、字体和音频，全部用代码画。
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    title: '奶蛙冒险',
    subtitle: 'MILK FROG ADVENTURE',
  };

  var MONO = 'ui-monospace, "SFMono-Regular", Consolas, monospace';
  var SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d', { alpha: false });

  var W = 480;
  var H = 270;
  var BASE_H = 270;

  var bgCanvas = null;
  var vignetteCanvas = null;
  var dust = [];
  var seed = 20261107;
  var layout = {};

  var state = {
    t: 0,
    hover: false,
    starting: false,
    startAt: 0,
    startTimer: null,
    shakeAt: -9999
  };

  /* ---------- 工具 ---------- */

  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  function archPath(g, x, y, w, h) {
    var r = w / 2;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + r);
    g.arc(x + r, y + r, r, Math.PI, Math.PI * 2, false);
    g.lineTo(x + w, y + h);
    g.closePath();
  }

  function drawSpaced(text, cx, y, spacing) {
    var chars = Array.from(text);
    var widths = [];
    var total = 0;
    var i;

    for (i = 0; i < chars.length; i++) {
      widths[i] = ctx.measureText(chars[i]).width;
      total += widths[i];
    }
    total += spacing * (chars.length - 1);

    var x = cx - total / 2;
    for (i = 0; i < chars.length; i++) {
      ctx.fillText(chars[i], x, y);
      x += widths[i] + spacing;
    }
  }

  /* ---------- 尺寸与布局 ---------- */

  function computeLayout() {
    var cx = Math.round(W / 2);
    var floorY = Math.round(H * 0.7);

    layout = {
      cx: cx,
      floorY: floorY,
      kickerY: Math.round(H * 0.085),
      titleY: Math.round(H * 0.2),
      torchY: Math.round(H * 0.42),
      torchGap: Math.min(Math.round(W * 0.3), 172)
    };
  }

  function resize() {
    var vw = Math.max(1, window.innerWidth);
    var vh = Math.max(1, window.innerHeight);

    H = BASE_H;
    W = Math.round(H * (vw / vh));
    W = Math.max(360, Math.min(900, W));

    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    computeLayout();
    buildBackground();
    buildVignette();
    initDust();
  }

  /* ---------- 静态背景 ---------- */

  function buildBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W;
    bgCanvas.height = H;

    var g = bgCanvas.getContext('2d');
    seed = 20261107;

    var floorY = layout.floorY;
    g.fillStyle = '#0b0e14';
    g.fillRect(0, 0, W, H);

    // 石砖墙
    var bh = 16;
    var bw = 34;
    for (var row = 0; row * bh < floorY; row++) {
      var y = row * bh;
      var offset = row % 2 ? -bw / 2 : 0;
      for (var x = offset; x < W; x += bw) {
        var r = rand();
        var color = r < 0.06 ? '#1b2824' : r < 0.5 ? '#171c26' : r < 0.85 ? '#1a202b' : '#141922';
        g.fillStyle = color;
        g.fillRect(Math.round(x) + 1, y + 1, bw - 2, bh - 2);
        if (r > 0.72) {
          g.fillStyle = 'rgba(96,112,146,0.1)';
          g.fillRect(Math.round(x) + 1, y + 1, bw - 2, 1);
        }
      }
    }

    // 地面
    g.fillStyle = '#080b10';
    g.fillRect(0, floorY, W, H - floorY);
    var rowIndex = 0;
    for (var ty = floorY + 4; ty < H; ty += 20) {
      var off2 = rowIndex % 2 ? 14 : 0;
      for (var tx = -off2; tx < W; tx += 28) {
        var shade = rand();
        g.fillStyle = shade < 0.12 ? '#111722' : shade < 0.7 ? '#0c1017' : '#0e131b';
        g.fillRect(tx + 1, ty, 26, 18);
        if (shade > 0.9) {
          g.fillStyle = 'rgba(110,231,255,0.05)';
          g.fillRect(tx + 1, ty, 26, 1);
        }
      }
      rowIndex++;
    }

    // 墙脚
    g.fillStyle = '#202836';
    g.fillRect(0, floorY - 4, W, 4);
    g.fillStyle = '#2c3546';
    g.fillRect(0, floorY - 4, W, 1);

    // 两侧的柱基，制造纵深
    [[14, 1], [W - 30, -1]].forEach(function (item) {
      var baseX = item[0];
      g.fillStyle = '#141922';
      g.fillRect(baseX, floorY - 52, 16, 52);
      g.fillStyle = '#1b2230';
      g.fillRect(baseX + 1, floorY - 52, 14, 2);
      g.fillStyle = '#0d1119';
      g.fillRect(baseX + 3, floorY - 44, 10, 44);
    });
  }

  function buildVignette() {
    vignetteCanvas = document.createElement('canvas');
    vignetteCanvas.width = W;
    vignetteCanvas.height = H;

    var g = vignetteCanvas.getContext('2d');
    var grad = g.createRadialGradient(
      W / 2, H * 0.56, Math.min(W, H) * 0.24,
      W / 2, H * 0.56, Math.max(W, H) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.62, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0.74)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    var top = g.createLinearGradient(0, 0, 0, H * 0.25);
    top.addColorStop(0, 'rgba(0,0,0,0.5)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, H * 0.25);
  }

  function initDust() {
    seed = 9911;
    dust = [];
    var count = Math.max(14, Math.round(W / 22));
    for (var i = 0; i < count; i++) {
      dust.push({
        x: rand() * W,
        y: rand() * H,
        speed: 3 + rand() * 9,
        sway: rand() * Math.PI * 2,
        alpha: 0.1 + rand() * 0.28,
        size: rand() < 0.18 ? 2 : 1
      });
    }
  }

  /* ---------- 火把 ---------- */

  function drawTorch(x, y, t) {
    var flick = Math.sin(t * 9.1 + x * 0.11) * 1.6 + Math.sin(t * 15.3 + x * 0.05) * 0.9;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(x, y - 8, 2, x, y - 8, 58);
    glow.addColorStop(0, 'rgba(255,192,112,0.34)');
    glow.addColorStop(0.42, 'rgba(255,142,62,0.15)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 64, y - 72, 128, 128);
    ctx.restore();

    // 支架
    rect(x - 2, y, 4, 20, '#2a2118');
    rect(x - 8, y - 2, 16, 3, '#3b2d1e');
    rect(x - 5, y + 17, 10, 3, '#3b2d1e');

    // 火焰：从下到上四层像素块
    var fx = Math.round(x + flick * 0.4);
    rect(fx - 4, y - 11 + flick * 0.8, 8, 10, '#e8622a');
    rect(fx - 3, y - 15 + flick * 1.1, 6, 8, '#ff9a3c');
    rect(fx - 2, y - 18 + flick * 1.3, 4, 6, '#ffd27a');
    rect(fx - 1, y - 20 + flick * 1.5, 2, 3, '#fff3c9');
  }

  /* ---------- 浮尘 ---------- */

  function drawDust(t) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      var y = ((d.y - t * d.speed) % H + H) % H;
      var x = d.x + Math.sin(t * 0.6 + d.sway) * 6;
      ctx.fillStyle = 'rgba(178,204,236,' + d.alpha.toFixed(3) + ')';
      ctx.fillRect(Math.round(x), Math.round(y), d.size, d.size);
    }
  }

  /* ---------- 文字 ---------- */

  function drawTexts(t) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    var kickerSize = Math.max(7, Math.round(H * 0.029));
    ctx.font = '600 ' + kickerSize + 'px ' + MONO;
    ctx.fillStyle = 'rgba(110,231,255,0.5)';
    drawSpaced(CONFIG.subtitle, layout.cx, layout.kickerY, kickerSize * 0.42);

    var titleSize = Math.round(H * 0.095);
    ctx.font = '700 ' + titleSize + 'px ' + SANS;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    drawSpaced(CONFIG.title, layout.cx + 2, layout.titleY + 2, titleSize * 0.16);
    ctx.fillStyle = '#f2f7ff';
    drawSpaced(CONFIG.title, layout.cx, layout.titleY, titleSize * 0.16);
  }

  /* ---------- 开场闪光 ---------- */

  function drawStartFlash(now) {
    if (!state.starting) return;

    var p = Math.min(1, (now - state.startAt) / 760);
    var c = { x: W / 2, y: H / 2 };
    var maxR = Math.sqrt(W * W + H * H) * 1.15;
    var r = Math.max(4, p * maxR);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grad = ctx.createRadialGradient(c.x, c.y, r * 0.3, c.x, c.y, r);
    grad.addColorStop(0, 'rgba(232,252,255,' + (0.95 * p).toFixed(3) + ')');
    grad.addColorStop(0.65, 'rgba(150,232,255,' + (0.7 * p).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(110,231,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (p > 0.55) {
      ctx.fillStyle = 'rgba(240,253,255,' + (((p - 0.55) / 0.45) * 0.92).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- 主循环 ---------- */

  var lobbyActive = true;

  function frame(now) {
    if (!lobbyActive) {
      window.requestAnimationFrame(frame);
      return;
    }

    var t = now / 1000;
    state.t = t;

    ctx.drawImage(bgCanvas, 0, 0);
    drawTorch(layout.cx - layout.torchGap, layout.torchY, t);
    drawTorch(layout.cx + layout.torchGap, layout.torchY, t);
    drawDust(t);
    ctx.drawImage(vignetteCanvas, 0, 0);
    drawTexts(t);
    drawStartFlash(now);

    window.requestAnimationFrame(frame);
  }

  /* ---------- 交互 ---------- */

  function toScene(event) {
    var box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) / box.width * W,
      y: (event.clientY - box.top) / box.height * H
    };
  }

  function startGame(mode) {
    if (state.starting) return;
    var app = document.getElementById('app');
    if (app && app.hidden) return;

    state.starting = true;
    state.startAt = performance.now();
    state.startTimer = window.setTimeout(function () {
      if (window.Game && window.Game.enter) window.Game.enter(mode || 'campaign');
    }, 720);
  }

  function cancelStart() {
    if (!state.starting) return;
    if (state.startTimer) {
      window.clearTimeout(state.startTimer);
      state.startTimer = null;
    }
    state.starting = false;
  }

  function bind() {
    var rulesEl = document.getElementById('rules');
    var rulesList = document.getElementById('rules-list');

    function openRules() {
      if (!rulesEl || !rulesList) return;

      var list = (window.Game && window.Game.rules) ? window.Game.rules() : [];
      rulesList.innerHTML = '';

      for (var i = 0; i < list.length; i++) {
        var item = document.createElement('div');
        item.className = 'rule-item';

        var name = document.createElement('p');
        name.className = 'rule-name';
        name.textContent = list[i].name;

        var desc = document.createElement('p');
        desc.className = 'rule-desc';
        desc.textContent = list[i].desc;

        item.appendChild(name);
        item.appendChild(desc);
        rulesList.appendChild(item);
      }

      rulesEl.hidden = false;
    }

    function closeRules() {
      if (rulesEl) rulesEl.hidden = true;
    }

    var rulesBtn = document.getElementById('btn-rules');
    if (rulesBtn) rulesBtn.addEventListener('click', openRules);

    var rulesClose = document.getElementById('rules-close');
    if (rulesClose) rulesClose.addEventListener('click', closeRules);

    if (rulesEl) {
      rulesEl.addEventListener('click', function (event) {
        if (event.target === rulesEl) closeRules();
      });
    }

    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeRules();
    });
    var campaignBtn = document.getElementById('mode-campaign');
    if (campaignBtn) {
      campaignBtn.addEventListener('click', function () { startGame('campaign'); });
    }

    var endlessBtn = document.getElementById('mode-endless');
    if (endlessBtn) {
      endlessBtn.addEventListener('click', function () { startGame('endless'); });
    }

    var fullscreen = document.getElementById('btn-fullscreen');
    if (fullscreen) {
      fullscreen.addEventListener('click', function () {
        try {
          if (!document.fullscreenElement) {
            var request = document.documentElement.requestFullscreen();
            if (request && request.then) {
              request.then(function () {
                if (screen.orientation && screen.orientation.lock) {
                  screen.orientation.lock('landscape').catch(function () {});
                }
              }).catch(function () {});
            }
          } else {
            document.exitFullscreen();
          }
        } catch (error) {
          /* 部分浏览器不支持，忽略 */
        }
      });
    }

    var timer = null;
    function onResize() {
      window.clearTimeout(timer);
      timer = window.setTimeout(resize, 120);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
  }

  /* ---------- 对外接口 ---------- */

  window.Lobby = {
    hide: function () {
      lobbyActive = false;
    },
    show: function () {
      if (state.startTimer) {
        window.clearTimeout(state.startTimer);
        state.startTimer = null;
      }
      state.starting = false;

      var app = document.getElementById('app');
      var stage = document.getElementById('stage');
      if (app) app.hidden = false;
      if (stage) stage.hidden = true;

      lobbyActive = true;
      resize();
    }
  };

  /* ---------- 启动 ---------- */

  resize();
  bind();
  window.requestAnimationFrame(frame);
})();
