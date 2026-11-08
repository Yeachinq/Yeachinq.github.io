/* ==========================================================================
   奶蛙冒险 · 声音
   全部用 Web Audio 现场合成，不加载任何音频文件。
   ========================================================================== */

(function () {
  var ctx = null;
  var master = null;
  var muted = false;
  var unlocked = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;   // 手机外放声音偏小，调大一些
      master.connect(ctx.destination);
    } catch (error) {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  }

  // 任何一次手势都尝试唤醒（iOS 切后台回来会重新挂起）
  function resumeIfNeeded() {
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    var c = ensure();
    if (!c || muted) return;

    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();

    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.06, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, lp) {
    var c = ensure();
    if (!c || muted) return;

    var len = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);

    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }

    var src = c.createBufferSource();
    src.buffer = buf;

    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp || 1200;

    var gain = c.createGain();
    gain.gain.value = vol || 0.08;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  var SOUNDS = {
    shoot: function () { tone(780, 0.07, 'square', 0.045, 320); },
    hit: function () { noise(0.05, 0.06, 2400); },
    kill: function () { tone(280, 0.16, 'sawtooth', 0.06, 70); noise(0.08, 0.05, 900); },
    parry: function () { tone(1500, 0.09, 'triangle', 0.07, 1200); tone(2200, 0.06, 'triangle', 0.05); },
    perfect: function () {
      tone(1500, 0.09, 'triangle', 0.08, 1200);
      tone(2400, 0.07, 'triangle', 0.06);
      tone(90, 0.18, 'sine', 0.09, 50);
    },
    deflect: function () { tone(1900, 0.06, 'square', 0.05, 1500); },
    dash: function () { noise(0.12, 0.05, 700); },
    shock: function () { tone(140, 0.34, 'sine', 0.11, 42); noise(0.18, 0.05, 600); },
    boom: function () { noise(0.32, 0.11, 380); tone(70, 0.28, 'sawtooth', 0.07, 35); },
    hurt: function () { tone(190, 0.24, 'sawtooth', 0.09, 60); },
    levelup: function () {
      tone(523, 0.12, 'triangle', 0.07);
      tone(659, 0.12, 'triangle', 0.07, null, 0.1);
      tone(784, 0.2, 'triangle', 0.08, null, 0.2);
    },
    pick: function () { tone(880, 0.08, 'triangle', 0.05); },
    boss: function () { tone(62, 0.7, 'sawtooth', 0.12, 44); noise(0.5, 0.06, 300); }
  };

  function play(name) {
    if (muted) return;

    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;

    var fn = SOUNDS[name];
    if (fn) fn();
  }

  /* ---------- BGM：normal-theme.mp3 循环播放 ---------- */

  var bgmAudio = null;
  var bgmWanted = false;
  var bgmVolume = loadVolume();

  function loadVolume() {
    try {
      var saved = window.localStorage.getItem('dungeon-bgm-volume2');
      var value = parseFloat(saved);
      if (isFinite(value) && value >= 0 && value <= 1) return value;
    } catch (error) {
      /* 隐私模式等读不到，用默认值 */
    }
    return 0.22;   // 默认背景音乐音量（音效是独立的一路，比这个响）
  }

  function saveVolume(value) {
    try {
      window.localStorage.setItem('dungeon-bgm-volume2', String(value));
    } catch (error) {
      /* 忽略 */
    }
  }

  function getMusicVolume() {
    return bgmVolume;
  }

  function setMusicVolume(value) {
    var v = Math.max(0, Math.min(1, Number(value) || 0));
    bgmVolume = v;
    if (bgmAudio) bgmAudio.volume = v;
    saveVolume(v);
    return v;
  }

  function ensureBgm() {
    if (bgmAudio) return bgmAudio;

    try {
      bgmAudio = new Audio('assets/audio/normal-theme.mp3');
      bgmAudio.loop = true;
      bgmAudio.preload = 'auto';
      bgmAudio.volume = bgmVolume;
    } catch (error) {
      bgmAudio = null;
    }

    return bgmAudio;
  }

  function startBgm() {
    if (muted) return;
    bgmWanted = true;

    var el = ensureBgm();
    if (!el) return;

    var p = el.play();
    if (p && p.catch) p.catch(function () { /* 等下次手势再试 */ });
  }

  function stopBgm() {
    bgmWanted = false;
    if (bgmAudio && !bgmAudio.paused) bgmAudio.pause();
  }

  /* ---------- Boss 击杀音效（奶龙大笑） ---------- */

  var bossAudio = null;

  function playBossLaugh() {
    if (muted) return;

    try {
      if (!bossAudio) {
        bossAudio = new Audio('assets/audio/boss-laugh.mp3');
        bossAudio.preload = 'auto';
        bossAudio.volume = 0.7;
      }

      // 连续击杀时从头再放
      if (!bossAudio.paused) bossAudio.currentTime = 0;

      var p = bossAudio.play();
      if (p && p.catch) p.catch(function () { /* 等下次手势再试 */ });
    } catch (error) {
      /* 浏览器不支持时忽略 */
    }
  }

  function stopBossLaugh() {
    if (bossAudio && !bossAudio.paused) bossAudio.pause();
  }

  /* ---------- 主角死亡音效 ---------- */

  var deathAudio = null;
  var deathBroken = false;

  // 浏览器放不了 ogg（比如 iOS Safari）时的兜底：现场合成一个下坠音
  function synthDeath() {
    tone(320, 0.55, 'sawtooth', 0.09, 55);
    tone(160, 0.7, 'triangle', 0.05, 40, 0.05);
    noise(0.45, 0.06, 520);
  }

  function playDeath() {
    if (muted) return;

    if (!deathAudio && !deathBroken) {
      try {
        deathAudio = new Audio('assets/audio/death.ogg');
        deathAudio.preload = 'auto';
        deathAudio.volume = 0.8;
        deathAudio.addEventListener('error', function () { deathBroken = true; });
      } catch (error) {
        deathBroken = true;
      }
    }

    if (deathAudio && !deathBroken) {
      try {
        deathAudio.currentTime = 0;
        var p = deathAudio.play();
        if (p && p.catch) p.catch(function () { synthDeath(); });
        return;
      } catch (error) {
        deathBroken = true;
      }
    }

    synthDeath();
  }

  /* ---------- Boss 出场音效 ---------- */

  var introAudio = null;

  function playBossIntro() {
    if (muted) return;

    try {
      if (!introAudio) {
        introAudio = new Audio('assets/audio/boss-intro.mp3');
        introAudio.preload = 'auto';
        introAudio.volume = 1.0;    // Boss 出场音乐拉满
      }

      if (!introAudio.paused) introAudio.currentTime = 0;

      var p = introAudio.play();
      if (p && p.catch) p.catch(function () { /* 等下次手势再试 */ });
    } catch (error) {
      /* 忽略 */
    }
  }

  function stopBossIntro() {
    if (introAudio && !introAudio.paused) introAudio.pause();
  }

  function stopDeath() {
    if (deathAudio && !deathAudio.paused) deathAudio.pause();
  }

  window.Sfx = {
    unlock: unlock,
    resume: resumeIfNeeded,
    play: play,
    startBgm: startBgm,
    stopBgm: stopBgm,
    playBossLaugh: playBossLaugh,
    playDeath: playDeath,
    playBossIntro: playBossIntro,
    getMusicVolume: getMusicVolume,
    setMusicVolume: setMusicVolume,
    isMuted: function () { return muted; },
    setMuted: function (value) {
      muted = !!value;
      if (muted) {
        stopBgm();
        stopBossLaugh();
        stopDeath();
        stopBossIntro();
      } else {
        startBgm();
      }
      return muted;
    },
    toggleMute: function () {
      return window.Sfx.setMuted(!muted);
    }
  };

  // 浏览器要求有用户手势才能出声
  function firstGesture() {
    unlock();
    if (!muted) startBgm();
  }

  // 切后台时暂停，回来后接着放
  if (document.addEventListener) document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (bgmAudio && !bgmAudio.paused) bgmAudio.pause();
    } else if (bgmWanted && !muted) {
      startBgm();
    }
  });

  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(function (name) {
    window.addEventListener(name, firstGesture, { once: true, passive: true });
  });

  // 之后每次手势都顺手确认一下没被挂起（切后台、锁屏回来很常见）
  ['pointerdown', 'touchend', 'click'].forEach(function (name) {
    window.addEventListener(name, function () {
      resumeIfNeeded();
      if (!muted && bgmWanted && bgmAudio && bgmAudio.paused) startBgm();
    }, { passive: true });
  });
})();
