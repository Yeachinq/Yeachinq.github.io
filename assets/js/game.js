/* ==========================================================================
   奶蛙冒险 · 第一层
   房间式地牢：每个房间是独立的正方形石室，互不连通，
   走到墙上的门口就进入相邻房间。
   ========================================================================== */
(function () {
  'use strict';

  var BASE_H = 208;
  var TS = 14;
  var ROOM_TILES = 14;
  var ROOM_PX = TS * ROOM_TILES;
  var WALL_H = 6;
  var DOOR_A = 6;
  var DOOR_B = 7;

  var FLOOR = 1;
  var WALL = 2;

  var FIRE_INTERVAL = 0.5;
  var MAX_FIRE_RATE_STACK = 6;   // 快速装填最多 6 张（0.5 → 0.266 秒）
  var MAX_SPREAD_STACK = 4;      // 散弹最多 4 张（1 → 9 发）
  var MAX_BULLET_SPEED_STACK = 8; // 高速弹最多 8 张（200 → 440 px/s，伤害 ×1.64）
  var MAX_CRIT_RATE_STACK = 13;   // 暴击率 5% + 13×7.5% ≈ 100%
  var MAX_SAVING_STACK = 4;       // 节能 4 张后冲刺/震荡都到下限
  var BULLET_SPEED = 200;
  var BULLET_LIFE = 0.85;
  var BULLET_DAMAGE = 15;

  var ENEMY_HP = 50;
  var ENEMY_DAMAGE = 14;
  // 主角速度 70，小怪取 30% = 21
  var ENEMY_SPEED = 21;
  var ENEMY_SIGHT = 130;
  var ENEMY_RANGE = 26;
  var PLAYER_INVULN = 0.8;
  var WAVES_PER_ROOM = 3;

  var DASH_COST = 15;
  var DASH_TIME = 0.16;
  var DASH_DIST = 46;
  var DASH_CD = 0.35;
  var DASH_STUN = 0.3;
  var DASH_SHIELD_STUN = 1.0;   // 冲刺撞盾兵：晕 1 秒
  var SHOCK_COST = 60;
  var SHOCK_RADIUS = 80;
  var SHOCK_DAMAGE = 20;
  var SHOCK_KNOCK = 18;
  var SHOCK_STUN = 1.3;
  var EP_REGEN = 8;

  var PARRY_WINDOW = 0.3;
  var PARRY_CD = 1.2;
  var PARRY_STUN = 0.6;
  var PARRY_KNOCK = 14;
  var PARRY_RADIUS = 20;                 // 弧光半径：箭碰到这个范围就被弹开
  var PARRY_HALF = Math.PI / 6;          // 左右各 30°，总共 60°
  var PARRY_COS = Math.cos(PARRY_HALF);

  var ARROW_SPEED = BULLET_SPEED * 0.6;   // 120，手枪子弹的 60%
  var ARROW_DAMAGE = 15;
  var ARROW_LIFE = 1.8;
  var ARCHER_HP = 80;
  var ARCHER_DRAW = 0.4;
  var ARCHER_CYCLE = 2;
  var ARCHER_KEEP = 64;
  var ARCHER_SPEED_IDLE = 21;   // 主角 30%
  var ARCHER_SPEED_DRAW = 14;   // 主角 20%

  var BOMBER_HP = 70;
  var BOMBER_SPEED = 49;              // 主角 70%
  var BOMBER_FUSE_SPEED = BOMBER_SPEED * 0.3;   // 蓄力时仍有 30% 速度
  var BOMBER_TRIGGER = 30;      // 进这个距离开始点火
  var BOMBER_ESCAPE = 70;       // 跑出这个距离取消引信
  var BOMBER_FUSE = 1.3;
  var BOMBER_RADIUS = 45;
  var BOMBER_DAMAGE = 35;

  var DIRS = {
    n: { key: 'n', dx: 0, dy: -1, opp: 's' },
    s: { key: 's', dx: 0, dy: 1, opp: 'n' },
    w: { key: 'w', dx: -1, dy: 0, opp: 'e' },
    e: { key: 'e', dx: 1, dy: 0, opp: 'w' }
  };
  var DIR_LIST = [DIRS.n, DIRS.s, DIRS.w, DIRS.e];

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d', { alpha: false });
  var heroCanvas = document.getElementById('hero');
  var heroCtx = heroCanvas ? heroCanvas.getContext('2d') : null;
  var heroScale = 1;
  var shakeDX = 0;
  var shakeDY = 0;

  var W = 336;
  var H = BASE_H;

  var rooms = [];
  var roomMap = {};
  var current = null;
  var player = { x: 0, y: 0, dir: 0, faceX: 1, faceY: 0, moving: false, walk: 0 };

  var originX = 0;
  var originY = 0;
  var flash = 0;
  var time = 0;

  var keys = {};
  var stick = {
    active: false,
    id: null,
    visible: false,
    baseX: 60,
    baseY: 152,
    x: 0,
    y: 0
  };
  var STICK_R = 27;
  var STICK_GRAB = 44;
  var STICK_MAX = 21;

  var outsideCanvas = null;
  var lightCanvas = null;

  var bullets = [];
  var arrows = [];
  var spawnMarks = [];
  var booms = [];
  var meteors = [];
  var impacts = [];
  var particles = [];
  var floaters = [];
  var shake = 0;
  var hitStop = 0;
  var invuln = 0;
  var damageFlash = 0;
  var dead = false;
  var shownEnemies = -1;
  var fireHeld = false;
  var fireCooldown = 0;
  var muzzleTimer = 0;
  var muzzleX = 0;
  var muzzleY = 0;

  var hudFloor = document.getElementById('hud-floor');
  var hudRule = document.getElementById('hud-rule');
  var hudTime = document.getElementById('hud-time');
  var victoryEl = document.getElementById('victory');
  var victoryTime = document.getElementById('victory-time');

  function updateRuleHud() {
    if (!hudRule) return;

    if (!floorRule) {
      hudRule.hidden = true;
      hudRule.textContent = '';
      return;
    }

    hudRule.hidden = false;
    hudRule.textContent = floorRule.name + ' · ' + floorRule.desc;
  }
  var nextBtn = document.getElementById('next-floor');
  var deathEl = document.getElementById('death');
  var deathNote = document.getElementById('death-note');
  var deathHome = document.getElementById('death-home');
  var attackBtn = document.getElementById('attack');
  var dashBtn = document.getElementById('btn-dash');
  var shockBtn = document.getElementById('btn-shock');
  var parryBtn = document.getElementById('btn-parry');
  var hpFill = document.getElementById('hp-fill');
  var hpVal = document.getElementById('hp-val');
  var defBadge = document.getElementById('hp-def');
  var epFill = document.getElementById('ep-fill');
  var epVal = document.getElementById('ep-val');
  var stats = { hp: 100, hpMax: 100, ep: 100, epMax: 100, defense: 0 };
  var nearStairs = false;
  var stairReady = false;
  var floor = 1;
  var hpScale = 1;
  var dmgScale = 1;
  var xpScale = 1;
  var floorRule = null;
  var mode = 'campaign';
  var MAX_FLOORS = 15;
  var runTime = 0;
  var won = false;
  var lastTimeShown = -1;

  /* ---------- 经验与升级 ---------- */
  var XP_PER_KILL = {
    melee: 5, archer: 8, bomber: 7,
    shield: 10, charger: 9, splitter: 6, spawnling: 2, turret: 8,
    brute: 25, blinker: 18, caster: 20, boss: 150
  };

  var SHIELD_HP = 120;
  var SHIELD_DAMAGE = 12;
  var SHIELD_SPEED = 21;
  var SHIELD_REDUCE = 0.4;   // 正面只吃 40% 子弹伤害（减伤 60%）

  var CHARGER_HP = 55;
  var CHARGER_DAMAGE = 20;
  var CHARGER_SPEED = 21;
  var CHARGER_DASH_SPEED = 320;
  var CHARGER_TRIGGER = 95;
  var CHARGER_WINDUP = 0.65;
  var CHARGER_DASH_TIME = 0.3;

  var SPLITTER_HP = 45;
  var SPLITTER_DAMAGE = 8;
  var SPLITTER_SPEED = 35;

  var SPAWNLING_HP = 15;
  var SPAWNLING_DAMAGE = 6;
  var SPAWNLING_SPEED = 62;

  var TURRET_HP = 90;
  var TURRET_BOLT_DAMAGE = 10;
  var TURRET_BOLT_SPEED = 100;
  var TURRET_FIRE = 2.2;
  var TURRET_RANGE = 165;

  // 精英怪种
  var BRUTE_HP = 260;
  var BRUTE_DAMAGE = 20;
  var BRUTE_SPEED = 16;
  var BRUTE_SLAM_RANGE = 50;
  var BRUTE_SLAM_RADIUS = 58;
  var BRUTE_WINDUP = 0.6;
  var BRUTE_CD = 2.2;

  var BLINKER_HP = 90;
  var BLINKER_DAMAGE = 12;
  var BLINKER_SPEED = 42;
  var BLINKER_CD = 2.6;
  var BLINKER_RANGE = 34;
  var BLINKER_GAP = 30;

  var CASTER_HP = 110;
  var CASTER_DAMAGE = 8;
  var CASTER_SPEED = 18;
  var CASTER_KEEP = 84;
  var CASTER_CD = 2.2;

  // Boss
  var BOSS_HP = 5175;   // 4500 × 1.15
  var BOSS_SPEED = 13;

  // 三种 Boss：近战压迫 / 弹幕远程 / 最终形态
  var BOSS_TYPES = [
    {
      id: 'brute',
      name: '裂地者',
      aura: 'rgba(255,90,70,',
      hpMul: 1.0, dmgMul: 1.0,
      cd1: 2.0, cd2: 1.2,
      speed: 15, chargeSpeed: 235,
      slamRadius: 96,
      skills: ['slam', 'charge', 'slam', 'summon']
    },
    {
      id: 'caster',
      name: '咏夜者',
      aura: 'rgba(170,120,255,',
      hpMul: 0.82, dmgMul: 1.25,
      cd1: 1.9, cd2: 1.05,
      speed: 11, chargeSpeed: 195,
      slamRadius: 72,
      skills: ['ring', 'meteor', 'ring', 'summon']
    },
    {
      id: 'final',
      name: '终焉之面',
      aura: 'rgba(255,200,90,',
      hpMul: 1.0, dmgMul: 1.0,
      cd1: 2.1, cd2: 1.3,
      speed: 13, chargeSpeed: 200,
      slamRadius: 84,
      skills: ['slam', 'ring', 'summon', 'charge', 'meteor'],
      fury: 0.67
    }
  ];

  function bossTypeFor(n) {
    return BOSS_TYPES[Math.floor((n - 1) / 5) % BOSS_TYPES.length];
  }
  var BOSS_TOUCH_DAMAGE = 16;
  var BOSS_SLAM_RADIUS = 72;
  var BOSS_SLAM_DAMAGE = 26;
  var BOSS_BOLT_DAMAGE = 10;
  var BOSS_BOLT_SPEED = 95;
  var XP_CLEAR_BONUS = 10;
  var xp = 0;
  var level = 1;
  var xpNext = 35;
  var pendingLevels = 0;
  var upgrades = {
    damage: 0, fireRate: 0, speed: 0, pierce: 0,
    critRate: 0, critDamage: 0, bulletSpeed: 0, lifesteal: 0, regen: 0,
    xpGain: 0, invuln: 0, spread: 0, hp: 0, glass: 0,
    ep: 0, epRegen: 0, saving: 0, dashPower: 0, shockPower: 0, bounce: 0
  };
  var regenAcc = 0;

  var dashT = 0;
  var dashCD = 0;
  var dashDX = 0;
  var dashDY = 0;
  var dashHits = [];
  var epDelay = 0;
  var epShown = 100;
  var dashReady = true;
  var shockReady = true;
  var parryReady = true;
  var parryT = 0;
  var parryWindow = 0.3;
  var parryDX = 0;
  var parryDY = 0;
  var parryCD = 0;
  var parryFlash = 0;
  var shocks = [];

  function recalcMaxHp() {
    // 玻璃大炮的百分比只削减「基础血量」，加生命值卡片带来的部分不打折
    var base = 100 * Math.pow(0.75, upgrades.glass) + 45 * upgrades.hp;
    stats.hpMax = Math.max(20, Math.round(base));
    stats.hp = Math.min(stats.hp, stats.hpMax);
  }

  function bulletDamage() {
    var base = BULLET_DAMAGE + upgrades.damage + 30 * upgrades.glass;
    // 高速弹附带伤害加成（累加：每张 +8%，8 张 = +64%）
    base *= 1 + 0.08 * Math.min(upgrades.bulletSpeed, MAX_BULLET_SPEED_STACK);
    return Math.round(base);
  }

  function recalcMaxEp() {
    stats.epMax = 100 + 18 * upgrades.ep;
    stats.ep = Math.min(stats.ep, stats.epMax);
  }

  // 技能数值（受卡片影响）
  function dashCost() {
    return Math.max(10, Math.round(DASH_COST * Math.pow(0.82, upgrades.saving)));
  }

  function shockCost() {
    return Math.max(30, Math.round(SHOCK_COST * Math.pow(0.82, upgrades.saving)));
  }

  // 冲刺撞击伤害 = 当前武器伤害 × 45%
  function dashDamage() {
    return Math.round(bulletDamage() * 0.45);
  }

  // 大招（震荡波）伤害 = 当前武器伤害 × 160%，再叠「强化震荡」的固定加成
  function shockDamage() {
    return Math.round(bulletDamage() * 1.6) + 7 * upgrades.shockPower;
  }

  function epRegenRate() {
    return EP_REGEN * (1 + 0.18 * upgrades.epRegen);
  }

  var cardsEl = document.getElementById('cards');
  var cardsRow = document.getElementById('cards-row');
  var xpLevelEl = document.getElementById('xp-level');
  var xpFill = document.getElementById('xp-fill');
  var xpVal = document.getElementById('xp-val');
  var menuEl = document.getElementById('menu');
  var btnMenu = document.getElementById('btn-menu');
  var paused = false;

  /* ---------- 工具 ---------- */

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function hash(c, r, salt) {
    var h = c * 374761393 + r * 668265263 + (salt || 0) * 1442695041;
    h = (h ^ (h >> 13)) * 1274126177;
    return (h ^ (h >> 16)) >>> 0;
  }

  /* ---------- 房间生成 ---------- */

  function addRoom(gx, gy) {
    var room = {
      gx: gx,
      gy: gy,
      visited: false,
      doors: { n: false, s: false, w: false, e: false },
      torches: [],
      props: [],
      stairs: false,
      tiles: null
    };
    rooms.push(room);
    roomMap[gx + ',' + gy] = room;
    return room;
  }

  function buildTiles(doors) {
    var tiles = [];
    for (var r = 0; r < ROOM_TILES; r++) {
      tiles[r] = [];
      for (var c = 0; c < ROOM_TILES; c++) {
        var edge = r === 0 || r === ROOM_TILES - 1 || c === 0 || c === ROOM_TILES - 1;
        tiles[r][c] = edge ? WALL : FLOOR;
      }
    }
    if (doors.n) {
      tiles[0][DOOR_A] = FLOOR;
      tiles[0][DOOR_B] = FLOOR;
    }
    if (doors.s) {
      tiles[ROOM_TILES - 1][DOOR_A] = FLOOR;
      tiles[ROOM_TILES - 1][DOOR_B] = FLOOR;
    }
    if (doors.w) {
      tiles[DOOR_A][0] = FLOOR;
      tiles[DOOR_B][0] = FLOOR;
    }
    if (doors.e) {
      tiles[DOOR_A][ROOM_TILES - 1] = FLOOR;
      tiles[DOOR_B][ROOM_TILES - 1] = FLOOR;
    }
    return tiles;
  }

  function generate() {
    rooms = [];
    roomMap = {};
    spawnMarks.length = 0;
    booms.length = 0;
    meteors.length = 0;

    // 每层敌人强化：血量 +30%、伤害 +15%（复利，第 1 层为基准）
    hpScale = Math.pow(1.30, Math.max(0, floor - 1));
    dmgScale = Math.pow(1.15, Math.max(0, floor - 1));
    xpScale = 1;   // 经验不随层数变化（每层给的一样）

    // 每层规则：从第 1 层起，每层都随机一条
    floorRule = FLOOR_RULES[Math.floor(Math.random() * FLOOR_RULES.length)];
    updateRuleHud();

    addRoom(0, 0);

    var guard = 0;
    while (rooms.length < 7 && guard++ < 400) {
      var base = rooms[Math.floor(Math.random() * rooms.length)];
      var order = DIR_LIST.slice().sort(function () {
        return Math.random() - 0.5;
      });

      for (var i = 0; i < order.length; i++) {
        var d = order[i];
        var nx = base.gx + d.dx;
        var ny = base.gy + d.dy;
        if (roomMap[nx + ',' + ny]) continue;
        if (Math.abs(nx) > 2 || Math.abs(ny) > 2) continue;
        addRoom(nx, ny);
        break;
      }
    }

    // 门：两个房间相邻就互相开门
    for (var r = 0; r < rooms.length; r++) {
      var room = rooms[r];
      for (var k = 0; k < DIR_LIST.length; k++) {
        var dir = DIR_LIST[k];
        if (roomMap[(room.gx + dir.dx) + ',' + (room.gy + dir.dy)]) {
          room.doors[dir.key] = true;
        }
      }
      room.tiles = buildTiles(room.doors);
    }

    // 最远的房间放楼梯（先定下来，后面的障碍和刷怪都要用到）
    var farthest = rooms[0];
    var best = -1;
    for (var m = 0; m < rooms.length; m++) {
      var dist = Math.abs(rooms[m].gx - rooms[0].gx) + Math.abs(rooms[m].gy - rooms[0].gy);
      if (dist > best) {
        best = dist;
        farthest = rooms[m];
      }
    }
    farthest.stairs = true;

    // 出生房和楼梯房不放障碍物
    for (r = 0; r < rooms.length; r++) {
      var rm = rooms[r];
      if (rm !== rooms[0] && !rm.stairs) addObstacles(rm);
      decorate(rm);
    }

    for (var s = 0; s < rooms.length; s++) {
      spawnEnemies(rooms[s]);
    }

    // 每 5 层：楼梯房变成 Boss 房
    if (floor % 5 === 0) spawnBoss(farthest);

    current = rooms[0];
    current.visited = true;
    player.x = (ROOM_TILES / 2) * TS;
    player.y = (ROOM_TILES / 2) * TS;
  }

  // Boss：血厚、技能轮换、半血进入二阶段
  function spawnBoss(room) {
    // Boss 用更平缓的独立曲线，避免后期血量爆炸、一场打三分钟
    var cfg = bossTypeFor(floor);
    var hp = Math.max(1, Math.round(BOSS_HP * Math.pow(1.16, Math.max(0, floor - 1)) * cfg.hpMul));

    var boss = {
      kind: 'boss',
      cfg: cfg,
      x: (ROOM_TILES / 2) * TS,
      y: (ROOM_TILES / 2) * TS + 20,
      elite: null,
      boss: true,
      hp: hp,
      maxHp: hp,
      state: 'idle',
      cd: 1.6,
      timer: 0,
      next: 0,
      dashX: 0,
      dashY: 0,
      hurt: 0,
      spawnT: 1.2,
      dead: false,
      bob: 0,
      wanderX: 0,
      wanderY: 0,
      wanderT: 0,
      restT: 0,
      stun: 0,
      touchT: 0
    };

    room.enemies.push(boss);
    room.boss = boss;
    room.waveMax = 0;
  }

  function addObstacles(room) {
    room.obstacles = [];
    room.obstacleMode = null;

    // 有些房间干脆不放障碍
    if (Math.random() < 0.45) return;

    var modes = ['lr', 'ud', 'rot'];
    var mode = modes[Math.floor(Math.random() * modes.length)];
    var budget = 3 + Math.floor(Math.random() * 6);   // 整间最多 3~8 格
    var total = 0;

    for (var attempt = 0; attempt < 40 && total < budget; attempt++) {
      var size = Math.random() < 0.3 ? 2 : 1;
      // 贴着中央十字外沿放：第 4、5 行/列，镜像后落在 8、9，不会贴到墙边
      var c = 4 + Math.floor(Math.random() * 2);
      var r = 4 + Math.floor(Math.random() * 2);
      var cells = mirrorCells(c, r, size, mode);
      if (total + cells.length > budget) continue;

      var ok = true;
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        // 只允许放在中央附近的环带（4~9），既不贴墙也不压中央十字
        var inside = cell.c >= 4 && cell.c <= ROOM_TILES - 5 &&
          cell.r >= 4 && cell.r <= ROOM_TILES - 5;
        // 中央十字（第 6、7 行/列）永远留空：出生点、楼梯、四扇门都靠它
        var inCross = cell.c === 6 || cell.c === 7 || cell.r === 6 || cell.r === 7;
        if (!inside || inCross || room.tiles[cell.r][cell.c] !== FLOOR) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (i = 0; i < cells.length; i++) {
        room.tiles[cells[i].r][cells[i].c] = WALL;
        room.obstacles.push(cells[i]);
      }
      total += cells.length;
    }

    if (room.obstacles.length) room.obstacleMode = mode;
  }

  // 按对称方式把一块障碍复制到镜像位置
  function mirrorCells(c, r, size, mode) {
    var out = [];
    var seen = {};

    function push(col, row) {
      var key = col + ',' + row;
      if (seen[key]) return;
      seen[key] = true;
      out.push({ c: col, r: row });
    }

    for (var dy = 0; dy < size; dy++) {
      for (var dx = 0; dx < size; dx++) {
        var cc = c + dx;
        var rr = r + dy;
        push(cc, rr);
        if (mode === 'lr' || mode === 'rot') push(ROOM_TILES - 1 - cc, rr);
        if (mode === 'ud' || mode === 'rot') push(cc, ROOM_TILES - 1 - rr);
        if (mode === 'rot') push(ROOM_TILES - 1 - cc, ROOM_TILES - 1 - rr);
      }
    }
    return out;
  }

  function decorate(room) {
    room.torches = [];
    room.props = [];

    var sides = ['n', 's', 'w', 'e'];
    var inner = (ROOM_TILES - 1) * TS;
    var center = (ROOM_TILES - 1) / 2;

    for (var s = 0; s < sides.length; s++) {
      var side = sides[s];
      // 有门就贴着门两侧，没门就对称放在墙中段
      var offset = room.doors[side] ? 1.5 : 3.5;
      var slots = [Math.round(center - offset), Math.round(center + offset)];

      for (var i = 0; i < slots.length; i++) {
        var slot = slots[i];
        if (slot < 1 || slot > ROOM_TILES - 2) continue;

        var x;
        var y;
        if (side === 'n') {
          x = (slot + 0.5) * TS;
          y = TS;
        } else if (side === 's') {
          x = (slot + 0.5) * TS;
          y = inner;
        } else if (side === 'w') {
          x = TS;
          y = (slot + 0.5) * TS;
        } else {
          x = inner;
          y = (slot + 0.5) * TS;
        }

        room.torches.push({ x: x, y: y, side: side, slot: slot });
      }
    }

    for (var r = 2; r < ROOM_TILES - 2; r++) {
      for (var c = 1; c < ROOM_TILES - 1; c++) {
        if (room.tiles[r][c] !== FLOOR) continue;
        if (Math.random() > 0.07) continue;
        if (room.props.length >= 14) break;
        room.props.push({
          x: (c + 0.5) * TS,
          y: (r + 0.6) * TS,
          kind: ['rock', 'bone', 'moss', 'crack'][Math.floor(Math.random() * 4)]
        });
      }
    }
  }

  /* ---------- 碰撞 ---------- */

  function solidAt(px, py) {
    var c = Math.floor(px / TS);
    var r = Math.floor(py / TS);
    if (c < 0 || r < 0 || c >= ROOM_TILES || r >= ROOM_TILES) return true;
    return current.tiles[r][c] !== FLOOR;
  }

  function blocked(px, py) {
    var half = 4;
    var top = py - 7;
    return solidAt(px - half, top) || solidAt(px + half, top) ||
      solidAt(px - half, py) || solidAt(px + half, py) ||
      solidAt(px - half, py - 3) || solidAt(px + half, py - 3);
  }

  function moveAxis(dx, dy) {
    var nx = player.x + dx;
    var ny = player.y + dy;
    if (!blocked(nx, ny)) {
      player.x = nx;
      player.y = ny;
      return true;
    }
    return false;
  }

  /* ---------- 房间切换 ---------- */

  function doorAt(c, r) {
    if (r === 0 && (c === DOOR_A || c === DOOR_B)) return 'n';
    if (r === ROOM_TILES - 1 && (c === DOOR_A || c === DOOR_B)) return 's';
    if (c === 0 && (r === DOOR_A || r === DOOR_B)) return 'w';
    if (c === ROOM_TILES - 1 && (r === DOOR_A || r === DOOR_B)) return 'e';
    return null;
  }

  function enterRoom(dirKey) {
    var dir = DIRS[dirKey];
    if (!dir) return;
    var next = roomMap[(current.gx + dir.dx) + ',' + (current.gy + dir.dy)];
    if (!next) return;

    current = next;
    current.visited = true;

    // 从对面那扇门进来
    if (dir.opp === 'n') {
      player.x = (DOOR_A + 1) * TS;
      player.y = 1.5 * TS;
    } else if (dir.opp === 's') {
      player.x = (DOOR_A + 1) * TS;
      player.y = (ROOM_TILES - 2 + 0.5) * TS;
    } else if (dir.opp === 'w') {
      player.x = 1.5 * TS;
      player.y = (DOOR_A + 1) * TS;
    } else {
      player.x = (ROOM_TILES - 2 + 0.5) * TS;
      player.y = (DOOR_A + 1) * TS;
    }

    flash = 1;
    bullets.length = 0;

    // 第一次进 Boss 房：放一次 Boss 音乐（不再插入特写，地图直接加载）
    if (next.boss && !next.bossIntroShown) {
      next.bossIntroShown = true;
      if (window.Sfx && window.Sfx.playBossIntro) window.Sfx.playBossIntro();
    }
    arrows.length = 0;
    spawnMarks.length = 0;
    booms.length = 0;
    meteors.length = 0;
    impacts.length = 0;
    fireCooldown = 0;
    shownEnemies = -1;
    setStairButton(false);
  }

  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function floorName(n) {
    return '第' + (CN_NUM[n - 1] || n) + '层';
  }

  function updateFloorLabel() {
    if (hudFloor) {
      hudFloor.textContent = mode === 'campaign'
        ? floorName(floor) + ' / ' + MAX_FLOORS
        : floorName(floor);
    }
    if (nextBtn) nextBtn.textContent = '下到' + floorName(floor + 1);
  }

  function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateTimeHud() {
    if (!hudTime) return;
    var now = Math.floor(runTime);
    if (now === lastTimeShown) return;
    lastTimeShown = now;
    hudTime.textContent = formatTime(runTime);
  }

  // 防御力：每升 2 级 +1 点（等级 1 时为 0）
  function refreshDefense() {
    var next = Math.floor(Math.max(0, level - 1) / 2);
    if (next === stats.defense) return;
    stats.defense = next;
    updateStats();
  }

  function updateStats() {
    if (hpFill) hpFill.style.width = (Math.max(0, Math.min(1, stats.hp / stats.hpMax)) * 100) + '%';
    if (hpVal) hpVal.textContent = Math.ceil(stats.hp) + '/' + stats.hpMax;
    if (epFill) epFill.style.width = (Math.max(0, Math.min(1, stats.ep / stats.epMax)) * 100) + '%';
    if (epVal) epVal.textContent = Math.ceil(stats.ep) + '/' + stats.epMax;

    if (defBadge) {
      if (stats.defense > 0) {
        defBadge.hidden = false;
        defBadge.textContent = 'DEF ' + stats.defense;
      } else {
        defBadge.hidden = true;
      }
    }

    updateSkillButtons();
  }

  // 还没清空的刷怪房数量
  function unclearedRooms() {
    var count = 0;

    for (var i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      if (room.waveMax <= 0) continue;

      if (!room.started || room.wave < room.waveMax) {
        count++;
        continue;
      }
      for (var k = 0; k < room.enemies.length; k++) {
        if (!room.enemies[k].dead) {
          count++;
          break;
        }
      }
    }
    return count;
  }

  // 所有会刷怪的房间是否都已清空
  function roomsCleared() {
    if (spawnMarks.length > 0) return false;

    for (var i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      if (room.waveMax <= 0) continue;
      if (!room.started || room.wave < room.waveMax) return false;
      for (var k = 0; k < room.enemies.length; k++) {
        if (!room.enemies[k].dead) return false;
      }
    }
    return true;
  }

  /* ---------- 经验与升级 ---------- */

  function xpNeeded(lv) {
    return Math.round(35 + (lv - 1) * 14);
  }

  function updateXpHud() {
    if (xpLevelEl) xpLevelEl.textContent = 'Lv.' + level;
    if (xpVal) xpVal.textContent = xp + '/' + xpNext;
    if (xpFill) xpFill.style.width = Math.max(0, Math.min(100, xp / xpNext * 100)) + '%';
  }

  // ---------- 每层规则 ----------
  var FLOOR_RULES = [
    { id: 'bloodmoon', name: '血月', desc: '敌人死亡会爆炸', enemyBoom: true },
    { id: 'frenzy', name: '狂躁', desc: '敌人移速 +40%、血量 -30%', speedMul: 1.4, hpMul: 0.7 },
    { id: 'heavy', name: '重力', desc: '敌人血量 +30%、移速 -20%', hpMul: 1.3, speedMul: 0.8 },
    { id: 'surge', name: '涌动', desc: '冲刺不消耗 EP', freeDash: true },
    { id: 'hunt', name: '狩猎', desc: '精英出现率翻倍、经验 +30%', eliteMul: 2, xpMul: 1.3 },
    { id: 'bounty', name: '丰饶', desc: '经验 +50%、敌人血量 +20%', xpMul: 1.5, hpMul: 1.2 },
    { id: 'echo', name: '回响', desc: '盾反窗口 +50%、完美盾反伤害翻倍', parryWindow: 1.5, parryPerfect: 2 },
    { id: 'venom', name: '淬毒', desc: '敌人伤害 +30%、经验 +40%', enemyDmgMul: 1.3, xpMul: 1.4 },
    { id: 'swarm', name: '蜂群', desc: '每波敌人 +2、敌人血量 -15%', waveBonus: 2, hpMul: 0.85 },
    { id: 'gloom', name: '幽暗', desc: '光照范围 -40%、敌人血量 -20%', lightMul: 0.6, hpMul: 0.8 },
    { id: 'silence', name: '静默', desc: '无法使用震荡波、经验 +60%', noShock: true, xpMul: 1.6 }
  ];

  function ruleValue(key, fallback) {
    if (floorRule && floorRule[key] !== undefined) return floorRule[key];
    return fallback;
  }

  function killXp(kind) {
    return Math.max(1, Math.round((XP_PER_KILL[kind] || 5) * xpScale * ruleValue('xpMul', 1)));
  }

  function awardXP(amount) {
    if (dead || amount <= 0) return;

    amount = Math.max(1, Math.round(amount * (1 + 0.20 * upgrades.xpGain)));

    xp += amount;
    while (xp >= xpNext) {
      xp -= xpNext;
      level += 1;
      refreshDefense();
      xpNext = xpNeeded(level);
      pendingLevels += 1;
      sfx('levelup');
    }

    updateXpHud();
    if (pendingLevels > 0) openCards();
  }

  var CARD_POOL = [
    {
      id: 'damage',
      name: '强化弹头',
      desc: '子弹伤害 +9',
      apply: function () { upgrades.damage += 9; }
    },
    {
      id: 'rate',
      name: '快速装填',
      desc: '射击间隔 -10%（最多 6 张）',
      cap: function () { return upgrades.fireRate >= MAX_FIRE_RATE_STACK; },
      apply: function () { upgrades.fireRate += 1; }
    },
    {
      id: 'speed',
      name: '轻快步伐',
      desc: '移动速度 +10%',
      apply: function () { upgrades.speed += 1; }
    },
    {
      id: 'hp',
      name: '强健体魄',
      desc: '最大生命 +45，并回复 45',
      apply: function () {
        upgrades.hp += 1;
        recalcMaxHp();
        stats.hp = Math.min(stats.hpMax, stats.hp + 45);
      }
    },
    {
      id: 'pierce',
      name: '穿甲弹',
      desc: '子弹可多穿透 1 个敌人',
      apply: function () { upgrades.pierce += 1; }
    },
    {
      id: 'heal',
      name: '急救包',
      desc: '立即回复 70 生命',
      apply: function () {
        stats.hp = Math.min(stats.hpMax, stats.hp + 70);
      }
    },
    {
      id: 'critRate',
      name: '暴击率',
      cap: function () { return upgrades.critRate >= MAX_CRIT_RATE_STACK; },
      desc: '暴击率 +7.5%（基础 5%，最多 13 张）',
      apply: function () { upgrades.critRate += 1; }
    },
    {
      id: 'critDamage',
      name: '暴击伤害',
      desc: '暴击伤害 +10%（基础 10%）',
      apply: function () { upgrades.critDamage += 1; }
    },
    {
      id: 'bulletSpeed',
      name: '高速弹',
      cap: function () { return upgrades.bulletSpeed >= MAX_BULLET_SPEED_STACK; },
      desc: '子弹速度 +15%，伤害 +8%（累加，最多 8 张）',
      apply: function () { upgrades.bulletSpeed += 1; }
    },
    {
      id: 'lifesteal',
      name: '吸血弹',
      desc: '每次命中回复 1 点生命',
      apply: function () { upgrades.lifesteal += 1; }
    },
    {
      id: 'xpGain',
      name: '老练',
      desc: '获得经验 +20%',
      apply: function () { upgrades.xpGain += 1; }
    },
    {
      id: 'invuln',
      name: '不屈',
      desc: '受伤后的无敌时间 +0.3 秒',
      apply: function () { upgrades.invuln += 1; }
    },
    {
      id: 'spread',
      name: '散弹',
      desc: '每次多射 2 发，向两侧散开（最多 4 张 = 9 发）',
      cap: function () { return upgrades.spread >= MAX_SPREAD_STACK; },
      apply: function () { upgrades.spread += 1; }
    },
    {
      id: 'glass',
      name: '玻璃大炮',
      desc: '伤害 +30，生命上限 -25%',
      apply: function () {
        upgrades.glass += 1;
        recalcMaxHp();
      }
    },
    {
      id: 'epMax',
      name: '能量扩容',
      desc: 'EP 上限 +18，并回复 18',
      apply: function () {
        upgrades.ep += 1;
        recalcMaxEp();
        stats.ep = Math.min(stats.epMax, stats.ep + 18);
      }
    },
    {
      id: 'epRegen',
      name: '快速充能',
      desc: 'EP 回复速度 +18%',
      apply: function () { upgrades.epRegen += 1; }
    },
    {
      id: 'saving',
      name: '节能',
      cap: function () { return upgrades.saving >= MAX_SAVING_STACK; },
      desc: '冲刺与震荡的消耗 -18%（最多 4 张）',
      apply: function () { upgrades.saving += 1; }
    },
    {
      id: 'shockPower',
      name: '强化震荡',
      desc: '震荡伤害 +7',
      apply: function () { upgrades.shockPower += 1; }
    },

    {
      id: 'bounce',
      name: '子弹反弹',
      desc: '子弹撞墙后可反弹 1 次',
      apply: function () { upgrades.bounce += 1; }
    },
    {
      id: 'reroll',
      name: '重抽',
      desc: '放弃本次三选一，重新抽 3 张',
      apply: function () { }
    }
  ];

  function openCards() {
    if (dead || !cardsEl) return;

    paused = true;
    cardsEl.hidden = false;
    renderCards();
  }

  function renderCards() {
    if (!cardsRow) return;

    // 已经叠满的卡不再出现在选项里
    var pool = CARD_POOL.filter(function (card) {
      return !card.cap || !card.cap();
    });
    var picks = [];

    while (picks.length < 3 && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }

    cardsRow.innerHTML = picks.map(function (card) {
      return '<button class="card-option" type="button" data-card="' + card.id + '">' +
        '<span class="card-name">' + card.name + '</span>' +
        '<span class="card-desc">' + card.desc + '</span>' +
        '</button>';
    }).join('');
  }

  function pickCard(id) {
    // 重抽：不消耗这次升级，直接换三张新卡
    if (id === 'reroll') {
      renderCards();
      return;
    }

    for (var i = 0; i < CARD_POOL.length; i++) {
      if (CARD_POOL[i].id !== id) continue;
      CARD_POOL[i].apply();
      sfx('pick');
      updateStats();

      pendingLevels = Math.max(0, pendingLevels - 1);
      if (pendingLevels > 0) {
        renderCards();
      } else if (cardsEl) {
        cardsEl.hidden = true;
        paused = false;
      }
      return;
    }
  }

  function setStairButton(show, ready) {
    nearStairs = show;
    stairReady = !!ready;

    if (!nextBtn) return;
    nextBtn.hidden = !show;
    if (!show) return;

    nextBtn.disabled = !stairReady;
    nextBtn.classList.toggle('is-locked', !stairReady);
    nextBtn.textContent = stairReady ? ('下到' + floorName(floor + 1)) : '还有房间未清理';
  }

  function goNextFloor() {
    if (!roomsCleared()) return;
    if (mode === 'campaign' && floor >= MAX_FLOORS) return;

    floor += 1;
    generate();
    bullets.length = 0;
    arrows.length = 0;
    impacts.length = 0;
    fireCooldown = 0;
    flash = 1;
    setStairButton(false);
    updateFloorLabel();
  }

  /* ---------- 射击 ---------- */

  function nearestEnemy() {
    if (!current || !current.enemies) return null;

    var best = null;
    var bestDist = Infinity;
    var fromY = player.y - 8;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      var dx = e.x - player.x;
      var dy = (e.y - 5) - fromY;
      var d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  function sfx(name) {
    if (window.Sfx && window.Sfx.play) window.Sfx.play(name);
  }

  function shoot() {
    if (paused || fireCooldown > 0) return;

    var originX = player.x;
    var originY = player.y - 12;   // 从肚子/胸口打出去，不从裆部
    var dx;
    var dy;

    // 有怪就朝最近的一只打（只定方向，不追踪）
    var target = nearestEnemy();
    if (target) {
      dx = target.x - originX;
      dy = (target.y - 5) - originY;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) {
        dx = 0;
        dy = -1;
      } else {
        dx /= len;
        dy /= len;
      }
    } else {
      dx = player.dir === 1 ? -1 : player.dir === 2 ? 1 : 0;
      dy = player.dir === 0 ? 1 : player.dir === 3 ? -1 : 0;
    }

    var ox = originX + dx * 7;
    var oy = originY + dy * 7;

    var speed = BULLET_SPEED * (1 + 0.15 * Math.min(upgrades.bulletSpeed, MAX_BULLET_SPEED_STACK));
    var baseAngle = Math.atan2(dy, dx);
    var count = 1 + 2 * Math.min(upgrades.spread, MAX_SPREAD_STACK);
    var step = 10 * Math.PI / 180;

    for (var k = 0; k < count; k++) {
      var angle = baseAngle + (k - (count - 1) / 2) * step;
      bullets.push({
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: BULLET_LIFE,
        pierce: upgrades.pierce,
        bounce: upgrades.bounce,
        hits: []
      });
    }

    fireCooldown = FIRE_INTERVAL * Math.pow(0.90, Math.min(upgrades.fireRate, MAX_FIRE_RATE_STACK));
    muzzleTimer = 0.06;
    muzzleX = ox;
    muzzleY = oy;
  }

  function updateBullets(dt) {
    var i;

    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
      var prevX = b.x;
      var prevY = b.y;

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (hitEnemy(b)) {
        impacts.push({ x: b.x, y: b.y, life: 0.14 });

        if (b.pierce > 0) {
          // 穿透：继续飞，但同一个目标不会再打第二次
          b.pierce -= 1;
          continue;
        }

        bullets.splice(i, 1);
        continue;
      }

      if (b.life <= 0) {
        impacts.push({ x: b.x, y: b.y, life: 0.14 });
        bullets.splice(i, 1);
        continue;
      }

      if (solidAt(b.x, b.y)) {
        // 子弹反弹：撞墙弹一次（按撞到的轴决定翻哪个速度分量）
        if (b.bounce > 0) {
          b.bounce -= 1;

          var hitX = solidAt(b.x, prevY);
          var hitY = solidAt(prevX, b.y);

          if (hitX && !hitY) {
            b.vx = -b.vx;
          } else if (hitY && !hitX) {
            b.vy = -b.vy;
          } else {
            b.vx = -b.vx;
            b.vy = -b.vy;
          }

          b.x = prevX + b.vx * dt;
          b.y = prevY + b.vy * dt;

          if (solidAt(b.x, b.y)) {
            b.x = prevX;
            b.y = prevY;
          }
          impacts.push({ x: b.x, y: b.y, life: 0.12 });
          continue;
        }

        impacts.push({ x: b.x, y: b.y, life: 0.14 });
        bullets.splice(i, 1);
      }
    }

    for (i = impacts.length - 1; i >= 0; i--) {
      impacts[i].life -= dt;
      if (impacts[i].life <= 0) impacts.splice(i, 1);
    }
  }

  function spawnEnemies(room) {
    room.enemies = [];
    room.wave = 0;
    room.waveMax = 0;
    room.waveTimer = 0;
    room.started = false;
    room.startTimer = 0;

    if (room === rooms[0]) return;   // 起始房间不放怪
    if (room.stairs) return;         // 有楼梯的房间不放怪

    // 进房先锁门，0.5 秒后才开始刷第一波
    room.waveMax = WAVES_PER_ROOM;
    room.startTimer = 0.5;
  }

  // 每 3 层，每波数量上下限各 +1（封顶 10 只）
  function waveBonus() {
    return Math.min(6, Math.floor((floor - 1) / 3));
  }

  // 第 3 层起混入新怪
  function pickKind() {
    var roll = Math.random();

    if (floor < 3) {
      return roll < 0.45 ? 'melee' : roll < 0.8 ? 'archer' : 'bomber';
    }

    // 8% 概率刷出精英怪种
    if (Math.random() < 0.08 * ruleValue('eliteMul', 1)) {
      var eliteRoll = Math.random();
      return eliteRoll < 0.34 ? 'brute' : eliteRoll < 0.67 ? 'blinker' : 'caster';
    }

    if (roll < 0.24) return 'melee';
    if (roll < 0.44) return 'archer';
    if (roll < 0.58) return 'bomber';
    if (roll < 0.7) return 'charger';
    if (roll < 0.82) return 'splitter';
    if (roll < 0.92) return 'shield';
    return 'turret';
  }

  // 统一的死亡处理：粒子、经验、分裂怪的裂变、爆裂精英的自爆
  function killEnemy(e) {
    if (!e || e.dead) return;
    e.dead = true;
    sfx('kill');
    burst(e.x, e.y - 5, 9);
    awardXP(killXp(e.kind) * (e.elite ? 2 : 1));

    if (e.kind === 'boss' && mode === 'campaign' && floor >= MAX_FLOORS) triggerVictory();

    if (e.kind === 'boss') {
      booms.push({ x: e.x, y: e.y - 2, t: 0, dur: 0.6 });
      shake = Math.max(shake, 1.2);
      sfx('boom');

      // Boss 专属击杀音效
      if (window.Sfx && window.Sfx.playBossLaugh) window.Sfx.playBossLaugh();
    }

    if (e.elite === 'volatile' || ruleValue('enemyBoom', false)) {
      booms.push({ x: e.x, y: e.y - 2, t: 0, dur: e.elite === 'volatile' ? 0.3 : 0.24 });
      shake = Math.max(shake, e.elite === 'volatile' ? 0.6 : 0.35);

      var dx = player.x - e.x;
      var dy = (player.y - 5) - e.y;
      var boomR = e.elite === 'volatile' ? 40 : 42;
      var boomDmg = e.elite === 'volatile' ? 18 : 12;

      if (Math.sqrt(dx * dx + dy * dy) <= boomR && hasLineOfSight(e)) {
        hurtPlayer(Math.round(boomDmg * dmgScale), { type: 'explode', source: e });
      }
    }

    if (e.kind === 'splitter' && current) {
      pushEnemy(current, e.x - 9, e.y, 'spawnling');
      pushEnemy(current, e.x + 9, e.y, 'spawnling');
    }
  }

  function waveSize() {
    var extra = ruleValue('waveBonus', 0);
    var low = Math.min(10, 2 + waveBonus() + extra);
    var high = Math.min(10, 4 + waveBonus() + extra);
    if (high < low) high = low;
    return low + Math.floor(Math.random() * (high - low + 1));
  }

  function pushEnemy(room, x, y, kind) {
    var base;
    if (kind === 'archer') base = ARCHER_HP;
    else if (kind === 'bomber') base = BOMBER_HP;
    else if (kind === 'shield') base = SHIELD_HP;
    else if (kind === 'charger') base = CHARGER_HP;
    else if (kind === 'splitter') base = SPLITTER_HP;
    else if (kind === 'spawnling') base = SPAWNLING_HP;
    else if (kind === 'turret') base = TURRET_HP;
    else if (kind === 'brute') base = BRUTE_HP;
    else if (kind === 'blinker') base = BLINKER_HP;
    else if (kind === 'caster') base = CASTER_HP;
    else base = ENEMY_HP;

    var hp = Math.max(1, Math.round(base * hpScale * ruleValue('hpMul', 1)));

    // 精英词缀（第 2 层起，炮台和小分裂体不参与）
    var elite = null;
    if (floor >= 2 && kind !== 'turret' && kind !== 'spawnling' &&
      Math.random() < 0.15 * ruleValue('eliteMul', 1)) {
      var roll = Math.random();
      elite = roll < 0.34 ? 'frenzy' : roll < 0.67 ? 'armor' : 'volatile';
    }

    // 精英怪种本身就算精英（金色光环 + 双倍经验）
    if (kind === 'brute' || kind === 'blinker' || kind === 'caster') elite = 'boss';

    if (elite === 'armor') hp = Math.round(hp * 1.5);

    room.enemies.push({
      kind: kind,
      x: x,
      y: y,
      elite: elite,
      hp: hp,
      maxHp: hp,
      state: 'idle',
      cd: 1 + Math.random() * 1.2,
      timer: 0,
      hurt: 0,
      spawnT: 0.3,
      dead: false,
      bob: Math.random() * 6,
      wanderX: 0,
      wanderY: 0,
      wanderT: 0,
      restT: 0.2 + Math.random() * 0.6
    });
  }

  function fillWave(room, count, delayed) {
    var entries = [];
    if (room.doors.n) entries.push({ x: (DOOR_A + 1) * TS, y: 1.5 * TS });
    if (room.doors.s) entries.push({ x: (DOOR_A + 1) * TS, y: (ROOM_TILES - 2 + 0.5) * TS });
    if (room.doors.w) entries.push({ x: 1.5 * TS, y: (DOOR_A + 1) * TS });
    if (room.doors.e) entries.push({ x: (ROOM_TILES - 2 + 0.5) * TS, y: (DOOR_A + 1) * TS });

    var center = (ROOM_TILES / 2) * TS;
    var tries = 0;
    var added = 0;

    while (added < count && tries++ < 120) {
      var c = 1 + Math.floor(Math.random() * (ROOM_TILES - 2));
      var r = 1 + Math.floor(Math.random() * (ROOM_TILES - 2));
      if (room.tiles[r][c] !== FLOOR) continue;

      var x = (c + 0.5) * TS;
      var y = (r + 0.5) * TS;

      // 别贴着中央（出生点/楼梯），也别堵在门口
      if (Math.abs(x - center) < 40 && Math.abs(y - center) < 40) continue;
      // 后续波次不能在玩家脸上刷
      if (Math.abs(x - player.x) < 56 && Math.abs(y - player.y) < 56) continue;

      var tooClose = false;
      for (var i = 0; i < entries.length; i++) {
        if (Math.abs(x - entries[i].x) < 44 && Math.abs(y - entries[i].y) < 44) tooClose = true;
      }
      if (tooClose) continue;

      // 别和同类叠在一起
      var crowded = false;
      for (var k = 0; k < room.enemies.length; k++) {
        if (Math.abs(x - room.enemies[k].x) < 14 && Math.abs(y - room.enemies[k].y) < 14) crowded = true;
      }
      for (k = 0; k < spawnMarks.length; k++) {
        if (Math.abs(x - spawnMarks[k].x) < 14 && Math.abs(y - spawnMarks[k].y) < 14) crowded = true;
      }
      if (crowded) continue;

      var kind = pickKind();

      if (delayed) {
        spawnMarks.push({ x: x, y: y, kind: kind, t: 0, dur: 0.55 });
      } else {
        pushEnemy(room, x, y, kind);
      }
      added++;
    }
  }

  /* ---------- 敌人行为 ---------- */

  function hasEnemies() {
    if (spawnMarks.length > 0) return true;
    if (!current || !current.enemies) return false;
    for (var i = 0; i < current.enemies.length; i++) {
      if (!current.enemies[i].dead) return true;
    }
    // 这场战斗还没打完（含还没开始刷的第一波），门也得锁着
    return current.waveMax > 0 && current.wave < current.waveMax;
  }

  function updateSpawnMarks(dt) {
    if (!current) return;

    for (var i = spawnMarks.length - 1; i >= 0; i--) {
      var m = spawnMarks[i];
      m.t += dt;
      if (m.t >= m.dur) {
        pushEnemy(current, m.x, m.y, m.kind);
        burst(m.x, m.y - 5, 6);
        spawnMarks.splice(i, 1);
      }
    }
  }

  function updateWaves(dt) {
    if (!current || !current.enemies) return;
    if (current.waveMax <= 0) return;

    // 刚进门：门已锁，等 0.5 秒再开打
    if (!current.started) {
      current.startTimer -= dt;
      if (current.startTimer <= 0) {
        current.started = true;
        current.wave = 1;
        fillWave(current, waveSize(), true);
      }
      return;
    }

    if (spawnMarks.length > 0) {
      current.waveTimer = 0;
      return;
    }

    var alive = false;
    for (var i = 0; i < current.enemies.length; i++) {
      if (!current.enemies[i].dead) {
        alive = true;
        break;
      }
    }

    if (alive) {
      current.waveTimer = 0;
      return;
    }

    if (current.wave >= current.waveMax) {
      // 整间房打完的经验奖励，只给一次
      if (!current.clearBonus) {
        current.clearBonus = true;
        awardXP(XP_CLEAR_BONUS);
      }
      return;
    }

    if (current.waveTimer > 0) {
      current.waveTimer -= dt;
      if (current.waveTimer <= 0) {
        current.waveTimer = 0;
        current.wave += 1;
        fillWave(current, waveSize(), true);
      }
      return;
    }

    current.waveTimer = 1;   // 清空后停 1 秒再刷新一波
  }

  function enemyBlocked(x, y) {
    var half = 4;
    return solidAt(x - half, y) || solidAt(x + half, y) ||
      solidAt(x, y) || solidAt(x, y - 6);
  }

  function moveEnemy(e, dx, dy) {
    if (dx && !enemyBlocked(e.x + dx, e.y)) e.x += dx;
    if (dy && !enemyBlocked(e.x, e.y + dy)) e.y += dy;
  }

  function updateEnemies(dt) {
    if (!current || !current.enemies) return;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      if (e.hurt > 0) e.hurt -= dt;

      // 被盾反打出的硬直
      if (e.stun > 0) {
        e.stun -= dt;
        continue;
      }

      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }

      if (e.kind === 'archer') updateArcher(e, dt);
      else if (e.kind === 'bomber') updateBomber(e, dt);
      else if (e.kind === 'charger') updateCharger(e, dt);
      else if (e.kind === 'turret') updateTurret(e, dt);
      else if (e.kind === 'brute') updateBrute(e, dt);
      else if (e.kind === 'blinker') updateBlinker(e, dt);
      else if (e.kind === 'caster') updateCaster(e, dt);
      else if (e.kind === 'boss') updateBoss(e, dt);
      else updateMelee(e, dt);
    }
  }

  // Boss：四招轮换（震地 / 弹幕环 / 召唤 / 冲锋），半血进入二阶段
  function updateBoss(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 5) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var phase2 = e.hp <= e.maxHp * 0.5;

    if (e.touchT > 0) e.touchT -= dt;

    if (e.state === 'charge') {
      e.timer -= dt;
      var chargeSp = (e.cfg && e.cfg.chargeSpeed) || 200;
      moveEnemy(e, e.dashX * chargeSp * dt, e.dashY * chargeSp * dt);

      if (dist < 22 && e.touchT <= 0) {
        e.touchT = 0.6;
        hurtPlayer(Math.round(BOSS_TOUCH_DAMAGE * dmgScale), { type: 'melee', source: e });
      }

      if (e.timer <= 0) {
        e.state = 'idle';
        var cfgC = e.cfg || { cd1: 1.6, cd2: 1.1 };
        e.cd = (phase2 ? cfgC.cd2 : cfgC.cd1) * 0.75;
        if (phase2 && cfgC.fury) e.cd *= cfgC.fury;
      }
      return;
    }

    if (e.state === 'cast') {
      e.timer -= dt;
      if (e.timer > 0) return;

      if (e.pending === 'slam') {
        booms.push({ x: e.x, y: e.y - 2, t: 0, dur: 0.35 });
        shake = Math.max(shake, 0.9);
        sfx('boom');

        var slamR = (e.cfg && e.cfg.slamRadius) || BOSS_SLAM_RADIUS;
        if (dist <= slamR && hasLineOfSight(e)) {
          hurtPlayer(Math.round(BOSS_SLAM_DAMAGE * (e.cfg ? e.cfg.dmgMul : 1) * dmgScale), { type: 'explode', source: e });
        }
      } else if (e.pending === 'ring') {
        var count = phase2 ? 14 : 10;
        var dmg = Math.round(BOSS_BOLT_DAMAGE * (e.cfg ? e.cfg.dmgMul : 1) * dmgScale);
        var start = Math.random() * Math.PI * 2;

        for (var k = 0; k < count; k++) {
          var ang = start + (Math.PI * 2 / count) * k;
          arrows.push({
            x: e.x,
            y: e.y - 6,
            vx: Math.cos(ang) * BOSS_BOLT_SPEED,
            vy: Math.sin(ang) * BOSS_BOLT_SPEED,
            life: 3,
            dmg: dmg,
            bolt: true
          });
        }
        sfx('deflect');
      } else if (e.pending === 'meteor') {
        castMeteors(e, phase2);
      } else if (e.pending === 'summon') {
        pushEnemy(current, e.x - 16, e.y + 6, 'spawnling');
        pushEnemy(current, e.x + 16, e.y + 6, 'spawnling');
        burst(e.x, e.y - 4, 10);
        sfx('pick');
      } else if (e.pending === 'charge') {
        e.state = 'charge';
        e.timer = 0.45;
        e.dashX = dx / dist;
        e.dashY = dy / dist;
        sfx('dash');
        return;
      }

      e.state = 'idle';
      var cfgCd = e.cfg || { cd1: 2.1, cd2: 1.3 };
      e.cd = (phase2 ? cfgCd.cd2 : cfgCd.cd1) * (0.9 + Math.random() * 0.25);
      if (phase2 && cfgCd.fury) e.cd *= cfgCd.fury;   // 最终形态二阶段狂暴
      return;
    }

    if (e.cd > 0) e.cd -= dt;

    // 缓慢逼近，顺手撞人
    if (dist > 30) {
      var sp = (e.cfg ? e.cfg.speed : BOSS_SPEED) * (phase2 ? 1.3 : 1);
      moveEnemy(e, dx / dist * sp * dt, dy / dist * sp * dt);
    }

    if (dist < 20 && e.touchT <= 0) {
      e.touchT = 0.8;
      hurtPlayer(Math.round(BOSS_TOUCH_DAMAGE * (e.cfg ? e.cfg.dmgMul : 1) * dmgScale), { type: 'melee', source: e });
    }

    if (e.cd <= 0) {
      var order = (e.cfg && e.cfg.skills) || ['slam', 'ring', 'summon', 'charge', 'meteor'];
      e.pending = order[e.next % order.length];
      e.next += 1;

      e.state = 'cast';
      e.timer = e.pending === 'charge' ? 0.55 : 0.6;
    }
  }

  // 裂地者：慢速逼近，贴近后蓄力震地（范围伤害）
  function updateBrute(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 5) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.cd > 0) e.cd -= dt;

    if (e.state === 'slam') {
      e.timer -= dt;
      if (e.timer <= 0) {
        booms.push({ x: e.x, y: e.y - 2, t: 0, dur: 0.3, color: 'brute' });
        shake = Math.max(shake, 0.7);

        var pdx = player.x - e.x;
        var pdy = (player.y - 5) - (e.y - 5);
        if (Math.sqrt(pdx * pdx + pdy * pdy) <= BRUTE_SLAM_RADIUS && hasLineOfSight(e)) {
          hurtPlayer(Math.round(BRUTE_DAMAGE * dmgScale), { type: 'melee', source: e });
        }

        e.state = 'idle';
        e.cd = BRUTE_CD;
      }
      return;
    }

    if (dist > BRUTE_SLAM_RANGE) {
      e.state = 'chase';
      moveEnemy(e, dx / dist * BRUTE_SPEED * eliteSpeed(e) * dt, dy / dist * BRUTE_SPEED * eliteSpeed(e) * dt);
    } else if (e.cd <= 0) {
      e.state = 'slam';
      e.timer = BRUTE_WINDUP;
    }
  }

  // 影卫：离得远就瞬移到身边，然后快速出手
  function updateBlinker(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 5) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.cd > 0) e.cd -= dt;

    if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        if (dist <= BLINKER_RANGE) {
          hurtPlayer(Math.round(BLINKER_DAMAGE * dmgScale), { type: 'melee', source: e });
        }
        e.state = 'recover';
        e.timer = 0.6;
      }
      return;
    }

    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'idle';
      return;
    }

    if (e.cd <= 0 && dist > BLINKER_RANGE) {
      // 瞬移到主角身边一个空位
      e.cd = BLINKER_CD;
      for (var i = 0; i < 10; i++) {
        var a = Math.random() * Math.PI * 2;
        var bx = player.x + Math.cos(a) * BLINKER_GAP;
        var by = player.y + Math.sin(a) * BLINKER_GAP;
        if (solidAt(bx, by) || solidAt(bx, by - 6)) continue;
        burst(e.x, e.y - 5, 5);
        e.x = bx;
        e.y = by;
        burst(e.x, e.y - 5, 5);
        e.state = 'windup';
        e.timer = 0.28;
        return;
      }
    }

    if (dist > BLINKER_RANGE) {
      e.state = 'chase';
      moveEnemy(e, dx / dist * BLINKER_SPEED * eliteSpeed(e) * dt, dy / dist * BLINKER_SPEED * eliteSpeed(e) * dt);
    } else if (e.cd <= 0.6) {
      e.state = 'windup';
      e.timer = 0.28;
    }
  }

  // 咒术师：保持距离，三连射
  function updateCaster(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.cd > 0) e.cd -= dt;

    if (dist < CASTER_KEEP && dist > 0.1) {
      moveEnemy(e, -dx / dist * CASTER_SPEED * eliteSpeed(e) * dt, -dy / dist * CASTER_SPEED * eliteSpeed(e) * dt);
    }

    if (e.cd > 0 || !hasLineOfSight(e)) return;

    e.cd = CASTER_CD;

    var base = Math.atan2(dy, dx);
    var dmg = Math.round(CASTER_DAMAGE * dmgScale);

    for (var k = -1; k <= 1; k++) {
      var ang = base + k * (18 * Math.PI / 180);
      arrows.push({
        x: e.x,
        y: e.y - 5,
        vx: Math.cos(ang) * 110,
        vy: Math.sin(ang) * 110,
        life: 2.2,
        dmg: dmg,
        bolt: true
      });
    }
  }

  function updateCharger(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 5) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'dash';
        e.timer = CHARGER_DASH_TIME;
        e.dashX = dx / dist;
        e.dashY = dy / dist;
      }
      return;
    }

    if (e.state === 'dash') {
      e.timer -= dt;
      moveEnemy(e, e.dashX * CHARGER_DASH_SPEED * dt, e.dashY * CHARGER_DASH_SPEED * dt);

      if (Math.abs(player.x - e.x) < 14 && Math.abs(player.y - e.y) < 16) {
        hurtPlayer(Math.round(CHARGER_DAMAGE * dmgScale), { type: 'melee', source: e });
        e.state = 'recover';
        e.timer = 0.7;
        return;
      }

      if (e.timer <= 0) {
        e.state = 'recover';
        e.timer = 0.7;
      }
      return;
    }

    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'idle';
      return;
    }

    if (dist < CHARGER_TRIGGER) {
      e.state = 'windup';
      e.timer = CHARGER_WINDUP;
    } else {
      e.state = 'walk';
      moveEnemy(e, dx / dist * CHARGER_SPEED * eliteSpeed(e) * dt, dy / dist * CHARGER_SPEED * eliteSpeed(e) * dt);
    }
  }

  function updateTurret(e, dt) {
    if (e.cd > 0) e.cd -= dt;

    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    if (Math.sqrt(dx * dx + dy * dy) > TURRET_RANGE) return;
    if (e.cd > 0) return;

    e.cd = TURRET_FIRE;

    var dmg = Math.round(TURRET_BOLT_DAMAGE * dmgScale);
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (var i = 0; i < dirs.length; i++) {
      arrows.push({
        x: e.x,
        y: e.y - 5,
        vx: dirs[i][0] * TURRET_BOLT_SPEED,
        vy: dirs[i][1] * TURRET_BOLT_SPEED,
        life: 2.4,
        dmg: dmg,
        bolt: true
      });
    }
  }

  function updateArcher(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (e.cd > 0) e.cd -= dt;

    var speed = (e.state === 'draw' ? ARCHER_SPEED_DRAW : ARCHER_SPEED_IDLE) * eliteSpeed(e);

    if (dist < ARCHER_KEEP && dist > 0.1) {
      // 太近就后退，不再游走
      moveEnemy(e, -dx / dist * speed * dt, -dy / dist * speed * dt);
      e.wanderT = 0;
      e.restT = 0;
    } else if (e.wanderT > 0) {
      e.wanderT -= dt;
      var bx = e.x;
      var by = e.y;
      moveEnemy(e, e.wanderX * speed * dt, e.wanderY * speed * dt);
      if (Math.abs(e.x - bx) < 0.01 && Math.abs(e.y - by) < 0.01) {
        e.wanderT = 0;   // 撞墙了，下一帧换方向
      }
      if (e.wanderT <= 0) e.restT = 0.3 + Math.random() * 0.6;
    } else if (e.restT > 0) {
      e.restT -= dt;
    } else {
      var angle = Math.random() * Math.PI * 2;
      e.wanderX = Math.cos(angle);
      e.wanderY = Math.sin(angle);
      e.wanderT = 0.4 + Math.random() * 0.9;
    }

    if (e.state === 'draw') {
      e.timer -= dt;
      if (e.timer <= 0) {
        fireArrow(e);
        e.cd = ARCHER_CYCLE - ARCHER_DRAW;
        e.state = 'idle';
      }
      return;
    }

    if (e.cd <= 0 && hasLineOfSight(e)) {
      e.state = 'draw';
      e.timer = ARCHER_DRAW;
    }
  }

  function updateBomber(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (e.state === 'fuse') {
      e.timer -= dt;

      // 玩家跑远就熄火
      if (dist > BOMBER_ESCAPE) {
        e.state = 'chase';
        e.timer = 0;
        return;
      }

      if (e.timer <= 0) {
        explode(e);
        return;
      }

      // 蓄力时不完全停下，用 30% 速度继续慢慢逼近
      if (dist > 0.1) {
        var fuseSp = BOMBER_FUSE_SPEED * eliteSpeed(e);
        moveEnemy(e, dx / dist * fuseSp * dt, dy / dist * fuseSp * dt);
      }
      return;
    }

    if (dist > BOMBER_TRIGGER && dist > 0.1) {
      e.state = 'chase';
      var chaseSp = BOMBER_SPEED * eliteSpeed(e);
      moveEnemy(e, dx / dist * chaseSp * dt, dy / dist * chaseSp * dt);
    } else {
      e.state = 'fuse';
      e.timer = BOMBER_FUSE;
    }
  }

  function explode(e) {
    e.dead = true;
    sfx('boom');
    burst(e.x, e.y - 5, 16);
    booms.push({ x: e.x, y: e.y - 2, t: 0, dur: 0.35 });
    shake = Math.max(shake, 0.8);

    var dx = player.x - e.x;
    var dy = (player.y - 5) - e.y;
    if (Math.sqrt(dx * dx + dy * dy) <= BOMBER_RADIUS && hasLineOfSight(e)) {
      hurtPlayer(Math.round(BOMBER_DAMAGE * dmgScale), { type: 'explode', source: e });
    }
  }

  /* ---------- Boss 技能：落雷 ---------- */

  var METEOR_RADIUS = 34;
  var METEOR_DAMAGE = 22;
  var METEOR_DELAY = 0.62;      // 每颗从出现到落下的时间
  var METEOR_STAGGER = 0.34;    // 两颗之间的间隔

  function castMeteors(e, phase2) {
    var count = phase2 ? 4 : 3;

    for (var i = 0; i < count; i++) {
      meteors.push({
        x: player.x + (Math.random() * 10 - 5),
        y: player.y + (Math.random() * 10 - 5),
        t: -i * METEOR_STAGGER,
        dur: METEOR_DELAY,
        dmg: Math.round(METEOR_DAMAGE * dmgScale),
        source: e
      });
    }

    sfx('deflect');
  }

  function updateMeteors(dt) {
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.t += dt;
      if (m.t < m.dur) continue;

      meteors.splice(i, 1);
      booms.push({ x: m.x, y: m.y, t: 0, dur: 0.3 });
      burst(m.x, m.y, 8);
      shake = Math.max(shake, 0.55);
      sfx('boom');

      var dx = player.x - m.x;
      var dy = (player.y - 5) - m.y;
      if (Math.sqrt(dx * dx + dy * dy) <= METEOR_RADIUS) {
        hurtPlayer(m.dmg, { type: 'explode', source: m.source });
      }
    }
  }

  function drawMeteors(ox, oy) {
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      if (m.t < 0) continue;

      var p = Math.max(0, Math.min(1, m.t / m.dur));

      // 落点圈：越接近落地越实
      ctx.strokeStyle = 'rgba(255,150,60,' + (0.35 + p * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ox + m.x, oy + m.y, METEOR_RADIUS, METEOR_RADIUS * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 内圈填充
      ctx.fillStyle = 'rgba(255,120,40,' + (0.08 + p * 0.22).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(ox + m.x, oy + m.y, METEOR_RADIUS * p, METEOR_RADIUS * 0.5 * p, 0, 0, Math.PI * 2);
      ctx.fill();

      // 从天而降的火球
      var dropY = oy + m.y - (1 - p) * 90;
      ctx.fillStyle = 'rgba(255,230,170,' + (0.5 + p * 0.5).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(ox + m.x, dropY, 2 + p * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateBooms(dt) {
    for (var i = booms.length - 1; i >= 0; i--) {
      booms[i].t += dt;
      if (booms[i].t >= booms[i].dur) booms.splice(i, 1);
    }
  }

  function hasLineOfSight(e) {
    var x0 = e.x;
    var y0 = e.y - 5;
    var x1 = player.x;
    var y1 = player.y - 8;
    var dx = x1 - x0;
    var dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    var steps = Math.max(2, Math.floor(len / 6));

    for (var i = 1; i < steps; i++) {
      if (solidAt(x0 + dx * (i / steps), y0 + dy * (i / steps))) return false;
    }
    return true;
  }

  function fireArrow(e) {
    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    var len = Math.sqrt(dx * dx + dy * dy) || 1;

    arrows.push({
      x: e.x,
      y: e.y - 5,
      vx: dx / len * ARROW_SPEED,
      vy: dy / len * ARROW_SPEED,
      life: ARROW_LIFE,
      dmg: Math.round(ARROW_DAMAGE * dmgScale)
    });
  }

  function updateArrows(dt) {
    for (var i = arrows.length - 1; i >= 0; i--) {
      var a = arrows[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;

      // 被盾反弹回来的箭，转而伤害敌人
      if (a.reflected) {
        if (arrowHitsEnemy(a)) {
          impacts.push({ x: a.x, y: a.y, life: 0.14 });
          arrows.splice(i, 1);
          continue;
        }
      } else {
        // 盾反光效：箭一碰到弧光就弹回去，不必等它打到身上
        if (parryT > 0) {
          var adx = a.x - player.x;
          var ady = a.y - (player.y - 8);
          var adist = Math.sqrt(adx * adx + ady * ady);

          if (adist <= PARRY_RADIUS + 4 && inConeDir(-a.vx, -a.vy)) {
            a.reflected = true;
            redirectArrow(a);
            parrySuccess(null);
            continue;
          }
        }

        var hitPlayer = a.x > player.x - 6 && a.x < player.x + 6 &&
          a.y > player.y - 15 && a.y < player.y + 2;

        if (hitPlayer) {
          var res = hurtPlayer(a.dmg || Math.round(ARROW_DAMAGE * dmgScale), { type: 'arrow', arrow: a });

          if (res === 'parried') {
            a.reflected = true;
            redirectArrow(a);
            continue;
          }

          impacts.push({ x: a.x, y: a.y, life: 0.14 });
          arrows.splice(i, 1);
          continue;
        }
      }

      if (a.life <= 0 || solidAt(a.x, a.y)) {
        impacts.push({ x: a.x, y: a.y, life: 0.14 });
        arrows.splice(i, 1);
      }
    }
  }

  function arrowHitsEnemy(a) {
    if (!current || !current.enemies) return false;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      if (Math.abs(a.x - e.x) > 8 || Math.abs(a.y - (e.y - 5)) > 9) continue;

      e.hp -= a.dmg || ARROW_DAMAGE;
      e.hurt = 0.12;
      if (e.hp <= 0) killEnemy(e);
      return true;
    }
    return false;
  }

  function redirectArrow(a) {
    // 原路返回：方向完全反过来，不追任何目标
    a.vx = -a.vx;
    a.vy = -a.vy;
    a.life = Math.max(a.life, 0.8);
  }

  // 精英 / 本层规则对速度的影响
  function eliteSpeed(e) {
    return (e.elite === 'frenzy' ? 1.3 : 1) * ruleValue('speedMul', 1);
  }

  function meleeStats(kind) {
    if (kind === 'shield') return { speed: SHIELD_SPEED, damage: SHIELD_DAMAGE };
    if (kind === 'splitter') return { speed: SPLITTER_SPEED, damage: SPLITTER_DAMAGE };
    if (kind === 'spawnling') return { speed: SPAWNLING_SPEED, damage: SPAWNLING_DAMAGE };
    return { speed: ENEMY_SPEED, damage: ENEMY_DAMAGE };
  }

  function updateMelee(e, dt) {
    var st = meleeStats(e.kind);
    var dx = player.x - e.x;
    var dy = player.y - e.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        if (dist < ENEMY_RANGE * 1.6) hurtPlayer(Math.round(st.damage * dmgScale), { type: 'melee', source: e });
        e.state = 'recover';
        e.timer = 0.55;
      }
      return;
    }

    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'idle';
      return;
    }

    if (dist > ENEMY_SIGHT) {
      e.state = 'idle';
      return;
    }

    e.state = 'chase';
    if (dist > ENEMY_RANGE) {
      var sp = st.speed * eliteSpeed(e);
      moveEnemy(e, dx / dist * sp * dt, dy / dist * sp * dt);
    } else {
      e.state = 'windup';
      e.timer = 0.65;
    }
  }

  /* ---------- 技能：冲刺 / 震荡波 ---------- */

  function inputVector() {
    var ix = 0;
    var iy = 0;

    if (keys.a || keys.arrowleft) ix -= 1;
    if (keys.d || keys.arrowright) ix += 1;
    if (keys.w || keys.arrowup) iy -= 1;
    if (keys.s || keys.arrowdown) iy += 1;

    if (stick.active) {
      ix += stick.x;
      iy += stick.y;
    }

    return { x: ix, y: iy };
  }

  function doDash() {
    if (dead || paused || dashCD > 0 || dashT > 0) return;

    var free = !!ruleValue('freeDash', false);
    if (!free && stats.ep < dashCost()) return;

    sfx('dash');

    if (!free) {
      stats.ep -= dashCost();
      epDelay = 0.5;
    }
    dashCD = DASH_CD;

    var v = inputVector();
    var l = Math.sqrt(v.x * v.x + v.y * v.y);

    if (l < 0.15) {
      dashDX = player.dir === 1 ? -1 : player.dir === 2 ? 1 : 0;
      dashDY = player.dir === 0 ? 1 : player.dir === 3 ? -1 : 0;
    } else {
      dashDX = v.x / l;
      dashDY = v.y / l;
    }

    dashT = DASH_TIME;
    dashHits.length = 0;
    invuln = Math.max(invuln, DASH_TIME + 0.08);
    burst(player.x, player.y - 4, 5);
    updateStats();
  }

  // 冲刺撞到的敌人：每次冲刺每只只吃一次
  // 盾兵被技能打晕的时间更长（+50%）
  // shieldBonus：盾兵单独的眩晕时长（传了就优先用它，不再乘 1.5）
  function stunFor(e, base, shieldBonus) {
    if (e.kind === 'shield') return shieldBonus !== undefined ? shieldBonus : base * 1.5;
    return base;
  }

  function dashHitCheck() {
    if (!current || !current.enemies) return;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      if (dashHits.indexOf(e) >= 0) continue;

      var dx = e.x - player.x;
      var dy = (e.y - 5) - (player.y - 8);
      if (Math.abs(dx) > 10 || Math.abs(dy) > 12) continue;

      dashHits.push(e);

      e.hp -= dashDamage();
      addFloater(e, dashDamage(), '#8cf0ff');
      shake = Math.max(shake, 0.25);
      e.hurt = 0.15;
      e.stun = Math.max(e.stun || 0, stunFor(e, DASH_STUN, DASH_SHIELD_STUN));
      if (e.kind !== 'boss') {
        e.state = 'idle';
        e.timer = 0;
      }

      // 轻轻推开，避免冲刺卡在怪物身上（Boss 推不动）
      if (e.kind !== 'boss') {
        var l = Math.sqrt(dx * dx + dy * dy) || 1;
        moveEnemy(e, dx / l * 6, dy / l * 6);
      }

      if (e.hp <= 0) killEnemy(e);
    }
  }

  function doShock() {
    if (dead || paused || ruleValue('noShock', false)) return;
    if (stats.ep < shockCost()) return;

    sfx('shock');
    stats.ep -= shockCost();
    epDelay = 0.6;
    updateStats();
    shocks.push({ x: player.x, y: player.y - 6, t: 0, dur: 0.45 });

    if (!current || !current.enemies) return;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;

      var dx = e.x - player.x;
      var dy = (e.y - 5) - (player.y - 8);
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > SHOCK_RADIUS || !hasLineOfSight(e)) continue;

      e.hp -= shockDamage();
      addFloater(e, shockDamage(), '#b8f4ff');
      e.hurt = 0.15;

      // 震荡眩晕：不打断更久的硬直
      e.stun = Math.max(e.stun || 0, stunFor(e, SHOCK_STUN));
      e.state = 'idle';
      e.timer = 0;

      if (dist > 0.1 && e.kind !== 'boss') moveEnemy(e, dx / dist * SHOCK_KNOCK, dy / dist * SHOCK_KNOCK);

      if (e.hp <= 0) killEnemy(e);
    }
  }

  function updateShocks(dt) {
    for (var i = shocks.length - 1; i >= 0; i--) {
      shocks[i].t += dt;
      if (shocks[i].t >= shocks[i].dur) shocks.splice(i, 1);
    }
  }

  function updateSkillButtons() {
    var canDash = stats.ep >= dashCost();
    var canShock = !ruleValue('noShock', false) && stats.ep >= shockCost();
    var canParry = parryCD <= 0 && parryT <= 0;

    if (dashBtn && canDash !== dashReady) {
      dashReady = canDash;
      dashBtn.classList.toggle('is-empty', !canDash);
    }
    if (shockBtn && canShock !== shockReady) {
      shockReady = canShock;
      shockBtn.classList.toggle('is-empty', !canShock);
    }
    if (parryBtn && canParry !== parryReady) {
      parryReady = canParry;
      parryBtn.classList.toggle('is-empty', !canParry);
    }
  }

  function doParry() {
    if (dead || paused || parryCD > 0 || parryT > 0) return;

    // 锁定启用瞬间的朝向：光效和判定都用这个方向，中途转身不会跟着变
    var face = facingDirection();
    parryDX = face.x;
    parryDY = face.y;

    parryWindow = PARRY_WINDOW * ruleValue('parryWindow', 1);
    parryT = parryWindow;
    parryCD = PARRY_CD;
  }

  // 角色当前朝向：用移动向量记录，斜着走就是斜的方向
  function facingDirection() {
    var fx = player.faceX;
    var fy = player.faceY;
    var l = Math.sqrt(fx * fx + fy * fy) || 1;

    return { x: fx / l, y: fy / l };
  }

  // 盾反锁定方向（没有锁定时退回当前朝向）
  function parryFacing() {
    if (parryDX === 0 && parryDY === 0) return facingDirection();
    return { x: parryDX, y: parryDY };
  }

  // 某个方向是否落在盾反的 60° 扇形里
  function inConeDir(dx, dy) {
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < 0.001) return true;

    var d = parryFacing();
    return (dx * d.x + dy * d.y) / l >= PARRY_COS;
  }

  // 某个坐标点是否落在扇形里
  function inParryCone(x, y) {
    return inConeDir(x - player.x, y - (player.y - 8));
  }

  function parrySuccess(info) {
    // 窗口刚开就挡到 = 完美盾反
    var perfect = parryT > parryWindow * 0.6;

    sfx(perfect ? 'perfect' : 'parry');
    parryFlash = 0.35;
    burst(player.x, player.y - 8, perfect ? 12 : 6);

    if (info && info.source) {
      // 近战 / 爆炸：让出手的怪硬直，并往后退一个身位
      var e = info.source;
      e.stun = PARRY_STUN;
      e.state = 'idle';
      e.timer = 0;

      var dx = e.x - player.x;
      var dy = e.y - player.y;
      var l = Math.sqrt(dx * dx + dy * dy) || 1;
      if (e.kind !== 'boss') moveEnemy(e, dx / l * PARRY_KNOCK, dy / l * PARRY_KNOCK);

      if (perfect) {
        var counter = Math.round(30 * ruleValue('parryPerfect', 1));
        addFloater(e, counter, '#8cf0ff');
        e.hp -= counter;
        e.hurt = 0.2;
        shake = Math.max(shake, 0.5);
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  function hurtPlayer(amount, info) {
    if (dead) return 'ignored';

    if (parryT > 0) {
      var blocked = true;
      var known = false;

      if (info && info.source) {
        // 近战 / 爆炸：用怪物所在位置判断
        blocked = inParryCone(info.source.x, info.source.y - 5);
        known = true;
      } else if (info && info.arrow) {
        // 箭：用飞行方向的反向判断它从哪个方向来
        blocked = inConeDir(-info.arrow.vx, -info.arrow.vy);
        known = true;
      }

      // 只有来自前方 60° 扇形的攻击才能挡下
      if (!known || blocked) {
        parrySuccess(info);
        return 'parried';
      }
    }

    if (invuln > 0) return 'ignored';

    // 本层规则：敌人伤害倍率
    amount = Math.max(1, Math.round(amount * ruleValue('enemyDmgMul', 1)));

    // 防御：直接减掉固定值，最少扣 1 点
    if (stats.defense > 0) amount = Math.max(1, amount - stats.defense);

    stats.hp = Math.max(0, stats.hp - amount);
    addFloaterAt(player.x, player.y - 24, amount, '#ff5a5a');
    sfx('hurt');
    shake = Math.max(shake, 1);
    hitStop = Math.max(hitStop, 0.05);
    invuln = PLAYER_INVULN + 0.3 * upgrades.invuln;
    damageFlash = 0.3;
    updateStats();

    if (stats.hp <= 0) playerDied();
    return 'hit';
  }

  function playerDied() {
    dead = true;
    paused = true;
    if (deathNote) deathNote.textContent = '倒在第 ' + floor + ' 层';
    if (deathEl) deathEl.hidden = false;

    // 死亡音效
    if (window.Sfx && window.Sfx.playDeath) window.Sfx.playDeath();
  }

  function resetRun() {
    floor = 1;
    runTime = 0;
    won = false;
    lastTimeShown = -1;
    if (victoryEl) victoryEl.hidden = true;
    player.faceX = 1;
    player.faceY = 0;
    player.dir = 2;
    stats.hpMax = 100;
    stats.hp = 100;
    stats.epMax = 100;
    stats.ep = 100;
    xp = 0;
    level = 1;
    stats.defense = 0;
    refreshDefense();
    xpNext = xpNeeded(1);
    pendingLevels = 0;
    upgrades = {
      damage: 0, fireRate: 0, speed: 0, pierce: 0,
      critRate: 0, critDamage: 0, bulletSpeed: 0, lifesteal: 0, regen: 0,
      xpGain: 0, invuln: 0, spread: 0, hp: 0, glass: 0,
      ep: 0, epRegen: 0, saving: 0, dashPower: 0, shockPower: 0, bounce: 0
    };
    regenAcc = 0;
    dashT = 0;
    dashCD = 0;
    dashHits.length = 0;
    parryT = 0;
    parryDX = 0;
    parryDY = 0;
    parryCD = 0;
    parryFlash = 0;
    epDelay = 0;
    epShown = 100;
    shocks.length = 0;
    if (cardsEl) cardsEl.hidden = true;
    dead = false;
    paused = false;
    invuln = 0;
    damageFlash = 0;
    fireCooldown = 0;
    shownEnemies = -1;
    bullets.length = 0;
    arrows.length = 0;
    impacts.length = 0;
    particles.length = 0;
    floaters.length = 0;
    shake = 0;
    hitStop = 0;
    spawnMarks.length = 0;
    booms.length = 0;
    meteors.length = 0;
    if (deathEl) deathEl.hidden = true;

    generate();
    updateFloorLabel();
    updateStats();
    updateEnemyHud();
    updateXpHud();
  }

  function triggerVictory() {
    if (won) return;
    won = true;
    paused = true;
    if (victoryEl) victoryEl.hidden = false;
    if (victoryTime) victoryTime.textContent = '用时 ' + formatTime(runTime);
    sfx('levelup');
  }

  function updateEnemyHud() {
    // 左上角不再显示敌人数，这里只保留清点逻辑给内部使用
  }

  /* ---------- 粒子 ---------- */

  // 伤害飘字：每次命中单独冒一个（带一点随机偏移，避免完全重叠）
  function addFloaterAt(x, y, value, color) {
    floaters.push({
      x: x + (Math.random() * 6 - 3),
      y: y,
      text: String(value),
      color: color,
      life: 0.6,
      vy: -28 - Math.random() * 8
    });
  }

  function addFloater(target, value, color) {
    if (!target) return;
    addFloaterAt(target.x, target.y - 14, value, color);
  }

  function updateFloaters(dt) {
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  function drawFloaters(ox, oy) {
    if (!floaters.length) return;

    ctx.font = 'bold 8px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var p = Math.max(0, Math.min(1, f.life / 0.6));

      ctx.globalAlpha = Math.min(1, p * 1.8);
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillText(f.text, ox + f.x + 0.7, oy + f.y + 0.7);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, ox + f.x, oy + f.y);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function burst(x, y, count) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 20 + Math.random() * 60;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.3 + Math.random() * 0.3
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.93;
      p.vy *= 0.93;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // 子弹是否打在盾卫的正面盾牌上
  function isShieldFront(e, bullet) {
    var fx = player.x - e.x;
    var fy = (player.y - 8) - (e.y - 5);
    var fl = Math.sqrt(fx * fx + fy * fy) || 1;

    var bl = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy) || 1;
    var dot = (fx / fl) * (bullet.vx / bl) + (fy / fl) * (bullet.vy / bl);

    return dot < -0.25;
  }

  function hitEnemy(bullet) {
    if (!current || !current.enemies) return false;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      if (bullet.hits && bullet.hits.indexOf(e) >= 0) continue;
      if (Math.abs(bullet.x - e.x) > 8 || Math.abs(bullet.y - (e.y - 5)) > 9) continue;

      if (bullet.hits) bullet.hits.push(e);

      // 暴击：基础 5% 概率，暴击伤害 = 基础伤害 +10%（每张暴伤卡再 +10%）
      var dmg = bulletDamage();
      var critChance = Math.min(1, 0.05 + 0.075 * upgrades.critRate);
      var crit = Math.random() < critChance;
      if (crit) dmg = Math.round(dmg * (1 + 0.10 * (1 + upgrades.critDamage)));

      // 盾卫：正面来的子弹只吃 40% 伤害（侧面、背后照常）
      // 盾兵正面减伤；但被眩晕时盾牌放下，减伤失效
      if (e.kind === 'shield' && !(e.stun > 0) && isShieldFront(e, bullet)) {
        dmg = Math.max(1, Math.round(dmg * SHIELD_REDUCE));
        impacts.push({ x: bullet.x, y: bullet.y, life: 0.12 });
      }

      e.hp -= dmg;
      e.hurt = 0.12;
      sfx('hit');
      addFloater(e, dmg, crit ? '#ffcf4a' : '#ffffff');
      if (crit) {
        hitStop = Math.max(hitStop, 0.04);
      }
      // 普通怪会被打断去追人；Boss 不打断，否则一直挨打就永远放不出技能
      if (e.kind !== 'boss') {
        e.state = 'chase';
        e.timer = 0;
      }

      // 吸血
      if (upgrades.lifesteal > 0 && stats.hp < stats.hpMax) {
        stats.hp = Math.min(stats.hpMax, stats.hp + upgrades.lifesteal);
        updateStats();
      }

      // 轻微击退（Boss 太重，打不动）
      if (e.kind !== 'boss') {
        var len = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy) || 1;
        moveEnemy(e, bullet.vx / len * 5, bullet.vy / len * 5);
      }

      if (e.hp <= 0) {
        if (crit) burst(e.x, e.y - 5, 7);
        killEnemy(e);
      }
      return true;
    }
    return false;
  }

  /* ---------- 更新 ---------- */

  function update(dt) {
    if (!won) runTime += dt;
    updateTimeHud();
    time += dt;
    if (flash > 0) flash = Math.max(0, flash - dt * 4.5);

    // 再生：每秒回一点
    if (upgrades.regen > 0 && !dead && stats.hp < stats.hpMax) {
      regenAcc += dt;
      while (regenAcc >= 1) {
        regenAcc -= 1;
        stats.hp = Math.min(stats.hpMax, stats.hp + upgrades.regen);
        updateStats();
      }
    } else {
      regenAcc = 0;
    }

    var ix = 0;
    var iy = 0;
    if (keys.a || keys.arrowleft) ix -= 1;
    if (keys.d || keys.arrowright) ix += 1;
    if (keys.w || keys.arrowup) iy -= 1;
    if (keys.s || keys.arrowdown) iy += 1;

    if (stick.active) {
      ix += stick.x;
      iy += stick.y;
    }

    var len = Math.sqrt(ix * ix + iy * iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }

    if (dashT > 0) {
      // 冲刺中：按固定距离高速位移，忽略普通移动输入
      dashT -= dt;
      var dashStep = (DASH_DIST / DASH_TIME) * dt;
      moveAxis(dashDX * dashStep, 0);
      moveAxis(0, dashDY * dashStep);
      dashHitCheck();

      player.moving = true;
      player.walk += dt * 22;
      player.faceX = dashDX;
      player.faceY = dashDY;
      if (Math.abs(dashDX) > Math.abs(dashDY)) player.dir = dashDX > 0 ? 2 : 1;
      else player.dir = dashDY > 0 ? 0 : 3;
    } else {
      player.moving = len > 0.12;

      // 朝向跟着实际输入走（含着摇杆的斜向），轻推也算
      if (len > 0.05) {
        var fl = Math.sqrt(ix * ix + iy * iy) || 1;
        player.faceX = ix / fl;
        player.faceY = iy / fl;
      }

      if (player.moving) {
        player.walk += dt * 9;

        if (Math.abs(ix) > Math.abs(iy)) player.dir = ix > 0 ? 2 : 1;
        else player.dir = iy > 0 ? 0 : 3;
      } else {
        player.walk *= 0.6;
      }

      var speed = 70 * Math.pow(1.10, upgrades.speed);
      if (ix) moveAxis(ix * speed * dt, 0);
      if (iy) moveAxis(0, iy * speed * dt);
    }

    if (dashCD > 0) dashCD -= dt;
    if (parryT > 0) parryT -= dt;
    if (parryCD > 0) parryCD -= dt;
    if (parryFlash > 0) parryFlash -= dt;

    // 能量自动回复（刚消耗完有短暂延迟）
    if (epDelay > 0) {
      epDelay -= dt;
    } else if (stats.ep < stats.epMax) {
      stats.ep = Math.min(stats.epMax, stats.ep + epRegenRate() * dt);
      if (Math.floor(stats.ep) !== epShown) {
        epShown = Math.floor(stats.ep);
        updateStats();
      }
    }

    updateSkillButtons();

    if (fireCooldown > 0) fireCooldown -= dt;
    if (muzzleTimer > 0) muzzleTimer -= dt;
    if (invuln > 0) invuln -= dt;
    if (damageFlash > 0) damageFlash -= dt;
    if (fireHeld) shoot();

    // 盾反成功后的减速时间：敌人和敌方弹道变慢，玩家不受影响
    updateBullets(dt);
    updateArrows(dt);
    updateSpawnMarks(dt);
    updateBooms(dt);
    updateMeteors(dt);
    updateShocks(dt);
    updateEnemies(dt);
    updateWaves(dt);
    updateParticles(dt);
    updateFloaters(dt);
    if (shake > 0) shake = Math.max(0, shake - dt * 4);
    updateEnemyHud();

    var c = Math.floor(player.x / TS);
    var r = Math.floor(player.y / TS);
    var door = doorAt(c, r);
    if (door && current.doors[door] && !hasEnemies()) enterRoom(door);

    var onStair = false;
    if (current.stairs) {
      var sx = (ROOM_TILES / 2 - 1) * TS;
      var sy = (ROOM_TILES / 2 - 1) * TS;
      onStair = player.x > sx - 2 && player.x < sx + TS * 2 + 2 &&
        player.y > sy - 2 && player.y < sy + TS * 2 + 2;
    }
    var ready = onStair ? roomsCleared() : false;
    if (onStair !== nearStairs || ready !== stairReady) setStairButton(onStair, ready);
  }

  /* ---------- 绘制：地面与墙 ---------- */

  function drawFloor(c, r, x, y) {
    var h = hash(c, r, current.gx * 31 + current.gy * 17);
    var palette = ['#121821', '#141b25', '#10161f'];
    ctx.fillStyle = palette[h % 3];
    ctx.fillRect(x, y, TS, TS);

    if (h % 19 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 3, y + 6, 6, 1);
    }
    if (h % 31 === 0) {
      ctx.fillStyle = 'rgba(110,231,255,0.05)';
      ctx.fillRect(x + 8, y + 9, 3, 1);
    }
    if (r > 0 && current.tiles[r - 1][c] === WALL) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y + WALL_H, TS, 3);
    }
  }

  function drawWall(c, r, x, y) {
    ctx.fillStyle = '#2a3243';
    ctx.fillRect(x, y, TS, TS);

    ctx.fillStyle = '#3c4659';
    ctx.fillRect(x, y, TS, 2);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x, y + 7, TS, 1);
    ctx.fillRect(x + 7, y + 2, 1, 5);

    var below = r + 1 < ROOM_TILES ? current.tiles[r + 1][c] : 0;
    if (below !== WALL) {
      ctx.fillStyle = '#191f2b';
      ctx.fillRect(x, y + TS, TS, WALL_H);
      ctx.fillStyle = '#0c1017';
      ctx.fillRect(x, y + TS + WALL_H - 1, TS, 1);
      ctx.fillStyle = 'rgba(60,70,89,0.35)';
      ctx.fillRect(x, y + TS, TS, 1);
    }
  }

  function drawDoorway(c, r, dir, x, y, locked) {
    ctx.fillStyle = '#04060a';
    ctx.fillRect(x, y, TS, TS);

    var glow = 0.5 + 0.5 * Math.sin(time * 2 + c + r);
    ctx.fillStyle = 'rgba(110,231,255,' + (0.05 + glow * 0.05).toFixed(3) + ')';
    ctx.fillRect(x, y, TS, TS);

    ctx.fillStyle = '#39435a';
    if (dir === 'n' || dir === 's') {
      ctx.fillRect(x, dir === 'n' ? y : y + TS - 2, TS, 2);
      ctx.fillRect(x, y, 1, TS);
      ctx.fillRect(x + TS - 1, y, 1, TS);
    } else {
      ctx.fillRect(dir === 'w' ? x : x + TS - 2, y, 2, TS);
      ctx.fillRect(x, y, TS, 1);
      ctx.fillRect(x, y + TS - 1, TS, 1);
    }

    // 还有敌人时，门口落下铁栅栏
    if (locked) {
      ctx.fillStyle = 'rgba(6, 10, 14, 0.5)';
      ctx.fillRect(x, y, TS, TS);

      ctx.fillStyle = '#8a5a33';
      for (var b = 3; b < TS; b += 4) {
        if (dir === 'n' || dir === 's') ctx.fillRect(x + b, y + 1, 1, TS - 2);
        else ctx.fillRect(x + 1, y + b, TS - 2, 1);
      }

      ctx.fillStyle = '#c08a4e';
      if (dir === 'n' || dir === 's') ctx.fillRect(x + 2, y + Math.floor(TS / 2), TS - 4, 1);
      else ctx.fillRect(x + Math.floor(TS / 2), y + 2, 1, TS - 4);
    }
  }

  function drawTorch(t, x, y) {
    var flick = Math.sin(time * 9 + t.x * 0.07) * 1.2;

    ctx.fillStyle = '#3b2d1e';
    ctx.fillRect(x - 1, y - 5, 2, 5);
    ctx.fillRect(x - 3, y - 6, 6, 1);

    ctx.fillStyle = '#e8622a';
    ctx.fillRect(x - 2, y - 10 + flick, 4, 4);
    ctx.fillStyle = '#ffb454';
    ctx.fillRect(x - 1, y - 12 + flick, 2, 3);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillRect(x - 1, y - 13 + flick, 1, 2);
  }

  function drawProp(prop, x, y) {
    if (prop.kind === 'rock') {
      ctx.fillStyle = '#2b3344';
      ctx.fillRect(x - 3, y - 3, 6, 3);
      ctx.fillStyle = '#3a4356';
      ctx.fillRect(x - 3, y - 3, 6, 1);
    } else if (prop.kind === 'bone') {
      ctx.fillStyle = '#8f8b7d';
      ctx.fillRect(x - 3, y - 1, 6, 1);
      ctx.fillRect(x - 4, y - 2, 1, 1);
      ctx.fillRect(x + 3, y - 2, 1, 1);
    } else if (prop.kind === 'moss') {
      ctx.fillStyle = 'rgba(52,110,80,0.5)';
      ctx.fillRect(x - 4, y - 2, 8, 2);
      ctx.fillRect(x - 2, y - 3, 4, 1);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 4, y - 1, 8, 1);
      ctx.fillRect(x, y - 3, 1, 3);
    }
  }

  function drawStairs(x, y) {
    var pulse = 0.5 + 0.5 * Math.sin(time * 2.2);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(x + TS, y + TS, 2, x + TS, y + TS, 38);
    glow.addColorStop(0, 'rgba(110,231,255,' + (0.1 + pulse * 0.08).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(110,231,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 24, y - 24, 76, 76);
    ctx.restore();

    ctx.fillStyle = '#070a10';
    ctx.fillRect(x, y, TS * 2, TS * 2);

    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#2a3243' : '#212936';
      ctx.fillRect(x + 2 + i * 2, y + 2 + i * 4, TS * 2 - 4 - i * 4, 4);
    }

    ctx.fillStyle = 'rgba(110,231,255,0.45)';
    ctx.fillRect(x, y, TS * 2, 1);
  }

  function drawSpawnMarks(ox, oy) {
    for (var i = 0; i < spawnMarks.length; i++) {
      var m = spawnMarks[i];
      var p = Math.min(1, m.t / m.dur);
      var x = ox + m.x;
      var y = oy + m.y;
      var r = 5 + p * 9;

      ctx.fillStyle = 'rgba(120,30,40,' + (0.18 + p * 0.25).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.8, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,110,110,' + (0.2 + p * 0.55).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (var k = 0; k < 3; k++) {
        var angle = m.t * 5 + k * 2.1;
        var px = x + Math.cos(angle) * 6;
        var py = y - 1 - ((m.t * 30 + k * 7) % 20);
        ctx.fillStyle = 'rgba(255,150,140,0.55)';
        ctx.fillRect(Math.round(px), Math.round(py), 1, 2);
      }
    }
  }

  function drawEnemy(e, x, y) {
    var archer = e.kind === 'archer';
    var bob = Math.sin(time * 5 + e.bob) * 1;
    var wob = !archer && e.state === 'windup' ? Math.round(Math.sin(time * 45)) : 0;
    var hurt = e.hurt > 0;

    var spawnT = e.spawnT || 0;
    var spawnP = spawnT > 0 ? 1 - spawnT / 0.3 : 1;   // 0 → 1
    var rise = (1 - spawnP) * 11;                     // 从地下升起
    var alpha = spawnT > 0 ? 0.2 + spawnP * 0.8 : 1;

    // Boss 立绘更大，影子也放大
    var shadowR = e.kind === 'boss' ? 10 : 6;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y, shadowR, shadowR * 0.37, 0, 0, Math.PI * 2);
    ctx.fill();

    if (spawnT > 0) {
      // 地面破口 + 尘土
      ctx.fillStyle = 'rgba(0,0,0,' + (0.5 * (1 - spawnP)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + spawnP * 4, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(150,130,120,' + (0.35 * (1 - spawnP)).toFixed(3) + ')';
      for (var d = 0; d < 4; d++) {
        var dx2 = (d - 1.5) * 5;
        ctx.fillRect(Math.round(x + dx2), Math.round(y - 1 - spawnP * 5), 1, 1);
      }
    }

    // Boss 用高清立绘，这里只保留影子和预警，不画方块身体
    if (e.kind === 'boss') return;

    if (e.kind === 'bomber' && e.state === 'fuse') {
      var fuseP = 1 - Math.max(0, e.timer) / BOMBER_FUSE;

      ctx.strokeStyle = 'rgba(255,150,90,' + (0.18 + fuseP * 0.42).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, BOMBER_RADIUS, BOMBER_RADIUS * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    if (spawnT > 0) {
      // 只显示地面以上的部分，看起来像从地里冒出来
      ctx.beginPath();
      ctx.rect(x - 16, y - 36, 32, 36);
      ctx.clip();
      ctx.globalAlpha = alpha;
    }

    var baseY = y - bob + rise;

    if (!archer && e.state === 'windup') {
      ctx.fillStyle = 'rgba(255,90,90,' + (0.22 + 0.12 * Math.sin(time * 22)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, baseY - 5, 13, 0, Math.PI * 2);
      ctx.fill();
    }

    if (archer && e.state === 'draw') {
      var tx = x + (player.x - e.x);
      var ty = baseY + (player.y - 8 - e.y);

      ctx.strokeStyle = 'rgba(255,205,120,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, baseY - 5);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      var ux = player.x - e.x;
      var uy = (player.y - 8) - (e.y - 5);
      var ul = Math.sqrt(ux * ux + uy * uy) || 1;
      var charge = 1 - Math.max(0, e.timer) / ARCHER_DRAW;

      ctx.fillStyle = 'rgba(255,225,140,' + (0.45 + charge * 0.5).toFixed(3) + ')';
      ctx.fillRect(Math.round(x + ux / ul * 9) - 1, Math.round(baseY - 5 + uy / ul * 9) - 1, 2, 2);
    }

    var bomber = e.kind === 'bomber';
    var fusing = bomber && e.state === 'fuse';
    var blinkOn = false;

    if (fusing) {
      var fuseProgress = 1 - Math.max(0, e.timer) / BOMBER_FUSE;
      blinkOn = Math.sin(time * (12 + fuseProgress * 42)) > 0;
    }

    var palettes = {
      melee: { dark: '#8e2f3c', light: '#c04a58', horn: '#5d1c26', eye: '#ffd76a' },
      archer: { dark: '#4a3a6b', light: '#7160a8', horn: '#2c2140', eye: '#8ce8ff' },
      bomber: { dark: '#4f7a3a', light: '#7aa84f', horn: '#2f4a22', eye: '#ff9a3c' },
      shield: { dark: '#465a72', light: '#6f8bab', horn: '#26323f', eye: '#ff6b6b' },
      charger: { dark: '#8a4a22', light: '#c9743a', horn: '#3d1d0c', eye: '#ffe28a' },
      splitter: { dark: '#6c2f6c', light: '#a4539f', horn: '#331233', eye: '#ffd1ff' },
      spawnling: { dark: '#a34a86', light: '#d07bb4', horn: '#4a1c3a', eye: '#ffe2f4' },
      turret: { dark: '#3a4050', light: '#5d6678', horn: '#20242c', eye: '#ff5a5a' },
      brute: { dark: '#5b4a2e', light: '#8d7444', horn: '#2e2516', eye: '#ff9a3c' },
      blinker: { dark: '#2f2a4a', light: '#5a4f8a', horn: '#161226', eye: '#c78bff' },
      caster: { dark: '#2f5049', light: '#4f8b7a', horn: '#16302a', eye: '#7dffd0' },
      boss: { dark: '#4a1018', light: '#9a2433', horn: '#23060b', eye: '#ffd24a' }
    };
    var pal = palettes[e.kind] || palettes.melee;

    var bodyDark = pal.dark;
    var bodyLight = pal.light;
    var horn = pal.horn;

    if (fusing) {
      bodyDark = blinkOn ? '#e9f5d8' : pal.dark;
      bodyLight = blinkOn ? '#ffffff' : pal.light;
      horn = blinkOn ? '#ffffff' : pal.horn;
    }

    var small = e.kind === 'spawnling';
    var boss = e.kind === 'boss';
    var big = e.kind === 'brute';
    var bw = boss ? 24 : big ? 15 : small ? 7 : 10;
    var bh = boss ? 20 : big ? 13 : small ? 7 : 9;
    var bx = x - bw / 2;

    // 裂地者：蓄力时地面亮起震地范围
    if (e.kind === 'brute' && e.state === 'slam') {
      var slamP = 1 - Math.max(0, e.timer) / BRUTE_WINDUP;
      ctx.strokeStyle = 'rgba(255,170,80,' + (0.25 + slamP * 0.5).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, BRUTE_SLAM_RADIUS, BRUTE_SLAM_RADIUS * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = hurt ? '#ffffff' : bodyDark;
    ctx.fillRect(bx + wob, baseY - bh, bw, bh);
    ctx.fillStyle = hurt ? '#ffffff' : bodyLight;
    ctx.fillRect(bx + wob, baseY - bh, bw, 3);

    if (!small) {
      ctx.fillStyle = hurt ? '#ffffff' : horn;
      ctx.fillRect(x - 5 + wob, baseY - 11, 2, 2);
      ctx.fillRect(x + 3 + wob, baseY - 11, 2, 2);
    }

    if (!hurt) {
      ctx.fillStyle = pal.eye;
      if (small) {
        ctx.fillRect(x - 1, baseY - 4, 1, 1);
      } else {
        ctx.fillRect(x - 3 + wob, baseY - 6, 2, 2);
        ctx.fillRect(x + 1 + wob, baseY - 6, 2, 2);
      }
    }

    // 盾卫：朝向主角的一面举着盾牌（被眩晕时盾牌垂下，颜色变暗）
    if (e.kind === 'shield') {
      var sdx = player.x - e.x;
      var sdy = (player.y - 8) - (e.y - 5);
      var sl = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      var shieldDown = e.stun > 0;
      var sx = x + sdx / sl * (shieldDown ? 6 : 8);
      var sy = baseY - 5 + sdy / sl * (shieldDown ? 4 : 8) + (shieldDown ? 3 : 0);

      ctx.fillStyle = shieldDown ? '#66727f' : '#9fb4cc';
      ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 4, 6, 8);
      ctx.fillStyle = shieldDown ? '#7d8794' : '#d5e4f2';
      ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 4, 6, 2);
    }

    // 冲刺兵：蓄力时画出冲锋方向
    if (e.kind === 'charger' && e.state === 'windup') {
      var tdx = player.x - e.x;
      var tdy = (player.y - 8) - (e.y - 5);
      var tl = Math.sqrt(tdx * tdx + tdy * tdy) || 1;

      ctx.strokeStyle = 'rgba(255,90,60,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, baseY - 5);
      ctx.lineTo(x + tdx / tl * 30, baseY - 5 + tdy / tl * 30);
      ctx.stroke();
    }

    // 分裂怪：核心脉动
    if (e.kind === 'splitter') {
      var pulse = 0.5 + 0.5 * Math.sin(time * 8);
      ctx.fillStyle = 'rgba(255,150,255,' + (0.3 + pulse * 0.5).toFixed(2) + ')';
      ctx.fillRect(x - 1, baseY - 6, 2, 2);
    }

    // 炮台：四个方向的炮口
    if (e.kind === 'turret') {
      ctx.fillStyle = '#8b93a7';
      ctx.fillRect(x - 1, baseY - 13, 2, 3);
      ctx.fillRect(x - 1, baseY - 1, 2, 3);
      ctx.fillRect(x - 8, baseY - 6, 3, 2);
      ctx.fillRect(x + 5, baseY - 6, 3, 2);
    }

    // 精英：脚下的彩色光环 + 头顶小标记
    if (e.elite) {
      var ec;
      if (e.elite === 'boss') ec = '#ffd24a';
      else if (e.elite === 'frenzy') ec = '#ff6b4a';
      else if (e.elite === 'armor') ec = '#6fa8ff';
      else ec = '#ffb84a';

      var rr = e.elite === 'boss' ? 12 : 9;

      ctx.strokeStyle = ec;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, rr, rr * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = ec;
      ctx.fillRect(x - 1, baseY - 18, 2, 2);
      if (e.elite === 'boss') ctx.fillRect(x - 3, baseY - 18, 2, 2);
      if (e.elite === 'boss') ctx.fillRect(x + 1, baseY - 18, 2, 2);
    }

    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x - 6, baseY - 15, 12, 2);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x - 6, baseY - 15, Math.max(0, 12 * e.hp / e.maxHp), 2);
    }

    // 被盾反打出的硬直：头顶转圈的小星
    if (e.stun > 0) {
      for (var st = 0; st < 3; st++) {
        var ang = time * 7 + st * 2.1;
        ctx.fillStyle = 'rgba(180,235,255,0.9)';
        ctx.fillRect(
          Math.round(x + Math.cos(ang) * 6),
          Math.round(baseY - 16 + Math.sin(ang) * 2),
          2,
          2
        );
      }
    }

    ctx.restore();
  }

  function drawArrows(ox, oy) {
    for (var i = 0; i < arrows.length; i++) {
      var a = arrows[i];
      var x = Math.round(ox + a.x);
      var y = Math.round(oy + a.y);
      var nx = a.vx / ARROW_SPEED;
      var ny = a.vy / ARROW_SPEED;

      for (var s = 0; s < 3; s++) {
        if (a.reflected) {
          ctx.fillStyle = s === 0 ? '#b8f4ff' : 'rgba(120,220,255,0.65)';
        } else if (a.bolt) {
          ctx.fillStyle = s === 0 ? '#e2c8ff' : 'rgba(160,120,220,0.6)';
        } else {
          ctx.fillStyle = s === 0 ? '#fff0c4' : 'rgba(210,186,138,0.6)';
        }
        ctx.fillRect(Math.round(x - nx * s * 2), Math.round(y - ny * s * 2), 2, 2);
      }
    }
  }

  function drawBooms(ox, oy) {
    for (var i = 0; i < booms.length; i++) {
      var b = booms[i];
      var p = Math.min(1, b.t / b.dur);
      var x = ox + b.x;
      var y = oy + b.y;
      var r = 10 + p * BOMBER_RADIUS;

      ctx.fillStyle = 'rgba(255,190,110,' + (0.45 * (1 - p)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,225,165,' + (0.8 * (1 - p)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParry(ox, oy) {
    if (parryT <= 0 && parryFlash <= 0) return;

    var px = ox + player.x;
    var py = oy + player.y - 8;

    var face = parryFacing();
    var ang = Math.atan2(face.y, face.x);
    var a0 = ang - PARRY_HALF;
    var a1 = ang + PARRY_HALF;

    ctx.save();
    ctx.lineCap = 'round';

    if (parryT > 0) {
      var p = 1 - parryT / PARRY_WINDOW;
      var r = 20 - p * 3;

      // 内侧柔光
      ctx.strokeStyle = 'rgba(120,220,255,' + (0.26 - p * 0.12).toFixed(3) + ')';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(px, py, r, a0, a1);
      ctx.stroke();

      // 主弧
      ctx.strokeStyle = 'rgba(175,240,255,' + (0.9 - p * 0.35).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, r, a0, a1);
      ctx.stroke();
    }

    if (parryFlash > 0) {
      var q = 1 - parryFlash / 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * (1 - q)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 21 + q * 13, a0, a1);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawShocks(ox, oy) {
    for (var i = 0; i < shocks.length; i++) {
      var s = shocks[i];
      var p = Math.min(1, s.t / s.dur);
      var x = ox + s.x;
      var y = oy + s.y;
      var r = 10 + p * SHOCK_RADIUS;

      ctx.strokeStyle = 'rgba(140,235,255,' + (0.85 * (1 - p)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * (1 - p)).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawParticles(ox, oy) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.max(0, Math.min(1, p.life / 0.4));
      ctx.fillStyle = 'rgba(255,120,120,' + a.toFixed(3) + ')';
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), 2, 2);
    }
  }

  /* ---------- 主角：直接用三视图原图，画在高清图层上 ---------- */

  var HERO_IMG = { front: null, side: null, back: null };

  function loadHeroArt() {
    var stamp = '?v=2';   // 改图时加版本号，避免浏览器用旧缓存
    var files = {
      front: 'assets/img/hero-front.png' + stamp,
      side: 'assets/img/hero-side.png' + stamp,
      back: 'assets/img/hero-back.png' + stamp,
      boss: 'assets/img/boss-face.png' + stamp
    };

    Object.keys(files).forEach(function (key) {
      var img = new Image();
      img.src = files[key];
      HERO_IMG[key] = img;
    });
  }

  // 这个世界层里只留影子和无敌圈，身体画在 #hero 上
  function drawPlayer(x, y) {
    // 走路时影子随着脚步变宽变淡，能把「踩地」的感觉带出来
    var step = player.moving ? 1 - Math.abs(Math.cos(player.walk)) : 0;   // 落地时最大

    ctx.fillStyle = 'rgba(0,0,0,' + (0.34 + step * 0.12).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, 5.5 + step * 1.1, 2.2 + step * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    if (invuln > 0) {
      ctx.strokeStyle = 'rgba(255,110,110,' + (0.35 + 0.25 * Math.sin(time * 30)).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - 8, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Boss 的高清立绘（画在玩家之前，所以玩家永远在上面）
  function drawBossOverlay() {
    var boss = current && current.boss;
    if (!boss || boss.dead) return;

    var img = HERO_IMG.boss;
    if (!img || !img.complete || !img.naturalWidth) return;

    var heightInternal = 26;
    var hPix = heightInternal * heroScale;
    var wPix = hPix * (img.naturalWidth / img.naturalHeight);

    // 出场时从地面升起：前 1.2 秒逐渐显现
    var appear = boss.spawnT > 0 ? Math.max(0.15, 1 - boss.spawnT / 1.2) : 1;

    // 只有头，让它轻微悬浮
    var hover = Math.sin(time * 2) * 0.8;

    var cx = (originX + boss.x + shakeDX) * heroScale;
    var cy = (originY + boss.y + shakeDY) * heroScale - (3 + hover) * heroScale;

    // 类型光晕：近战红 / 弹幕紫 / 最终金
    var aura = (boss.cfg && boss.cfg.aura) || 'rgba(255,120,140,';
    var glowY = cy - hPix * 0.55;
    var glowR = hPix * 0.95;
    var glow = heroCtx.createRadialGradient(cx, glowY, hPix * 0.1, cx, glowY, glowR);
    glow.addColorStop(0, aura + (0.34 * appear).toFixed(3) + ')');
    glow.addColorStop(0.55, aura + (0.12 * appear).toFixed(3) + ')');
    glow.addColorStop(1, aura + '0)');
    heroCtx.save();
    heroCtx.fillStyle = glow;
    heroCtx.fillRect(cx - glowR, glowY - glowR, glowR * 2, glowR * 2);
    heroCtx.restore();

    heroCtx.save();
    heroCtx.globalAlpha = appear;
    heroCtx.imageSmoothingEnabled = true;
    if (heroCtx.imageSmoothingQuality !== undefined) heroCtx.imageSmoothingQuality = 'high';
    heroCtx.drawImage(img, cx - wPix / 2, cy - hPix + (1 - appear) * 12 * heroScale, wPix, hPix);
    heroCtx.restore();
  }

  // 在 #hero 高清画布上画角色
  function drawHeroOverlay() {
    if (!heroCtx || !heroCanvas) return;

    heroCtx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
    if (!active || !current || dead) return;

    drawBossOverlay();

    var img = player.dir === 3 ? HERO_IMG.back
      : player.dir === 0 ? HERO_IMG.front
      : HERO_IMG.side;

    var phase = player.walk;
    var moving = player.moving;

    // 上下起伏：一步一次（2 个台阶 = 一次弹跳）
    var bob = moving ? Math.abs(Math.cos(phase)) * 1.6 : 0;

    var heightInternal = 20;
    var hPix = heightInternal * heroScale;

    var cx = (originX + player.x + shakeDX) * heroScale;
    var cy = (originY + player.y - bob + shakeDY) * heroScale;

    // 图还没下载完时，先画一个纯色占位，避免角色完全隐身
    if (!img || !img.complete || !img.naturalWidth) {
      heroCtx.save();
      heroCtx.fillStyle = 'rgba(242, 193, 58, 0.9)';
      heroCtx.beginPath();
      heroCtx.ellipse(cx, cy - hPix * 0.45, hPix * 0.3, hPix * 0.45, 0, 0, Math.PI * 2);
      heroCtx.fill();
      heroCtx.restore();
      return;
    }

    var wPix = hPix * (img.naturalWidth / img.naturalHeight);

    heroCtx.save();
    heroCtx.imageSmoothingEnabled = true;
    if (heroCtx.imageSmoothingQuality !== undefined) heroCtx.imageSmoothingQuality = 'high';

    // 以脚底为轴心做动作，身体才不会「飘」
    heroCtx.translate(cx, cy);

    if (player.dir === 1) heroCtx.scale(-1, 1);

    if (moving) {
      var sway = Math.sin(phase) * 0.45 * heroScale;       // 左右轻摆
      var tilt = Math.sin(phase) * 0.045;                  // 身体侧倾
      var squash = 1 - 2 * Math.abs(Math.cos(phase));       // 落地压缩、腾空拉伸

      heroCtx.translate(sway, 0);
      heroCtx.rotate(tilt);
      heroCtx.scale(1 + squash * 0.03, 1 - squash * 0.04);
    }

    heroCtx.drawImage(img, -wPix / 2, -hPix, wPix, hPix);

    heroCtx.restore();

    // 按最近火把的亮度给角色压暗，避免在暗处发光
    var light = 0;
    for (var i = 0; i < current.torches.length; i++) {
      var t = current.torches[i];
      var dx = t.x - player.x;
      var dy = (t.y - 6) - player.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      light = Math.max(light, Math.max(0, 1 - d / 72));
    }

    var dark = (1 - light) * 0.42;
    if (dark > 0.02) {
      heroCtx.globalCompositeOperation = 'source-atop';
      heroCtx.fillStyle = 'rgba(4,6,10,' + dark.toFixed(3) + ')';
      heroCtx.fillRect(0, 0, heroCanvas.width, heroCanvas.height);
      heroCtx.globalCompositeOperation = 'source-over';
    }
  }
  /* ---------- 光照 ---------- */

  function punchLight(g, x, y, radius) {
    var grad = g.createRadialGradient(x, y, 2, x, y, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0.96)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.72)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
    g.fill();
  }

  function drawMuzzle(ox, oy) {
    if (muzzleTimer <= 0) return;

    var a = Math.min(1, muzzleTimer / 0.06);
    var x = Math.round(ox + muzzleX);
    var y = Math.round(oy + muzzleY);

    ctx.fillStyle = 'rgba(255,232,160,' + (a * 0.85).toFixed(2) + ')';
    ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  function drawBullets(ox, oy) {
    var i;

    for (i = 0; i < bullets.length; i++) {
      var b = bullets[i];
      var x = Math.round(ox + b.x);
      var y = Math.round(oy + b.y);

      // 按真实速度归一化，配合「高速弹」也不会把拖尾拉变形
      var blen = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
      var nx = b.vx / blen;
      var ny = b.vy / blen;

      for (var s = 1; s <= 4; s++) {
        ctx.fillStyle = 'rgba(255,214,140,' + (0.42 - s * 0.08).toFixed(2) + ')';
        ctx.fillRect(Math.round(x - nx * s * 2), Math.round(y - ny * s * 2), 2, 2);
      }

      ctx.fillStyle = '#fff4c9';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    for (i = 0; i < impacts.length; i++) {
      var imp = impacts[i];
      var a = Math.max(0, imp.life / 0.14);
      ctx.fillStyle = 'rgba(255,226,160,' + (a * 0.9).toFixed(2) + ')';
      ctx.fillRect(Math.round(ox + imp.x) - 2, Math.round(oy + imp.y) - 2, 4, 4);
    }
  }

  function drawLighting(ox, oy) {
    var lctx = lightCanvas.getContext('2d');

    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = 'rgba(4,6,10,0.5)';
    lctx.fillRect(0, 0, W, H);

    lctx.globalCompositeOperation = 'destination-out';

    for (var i = 0; i < current.torches.length; i++) {
      var t = current.torches[i];
      var flicker = 2 * Math.sin(time * 11 + t.x);
      punchLight(lctx, ox + t.x, oy + t.y - 6, (72 + flicker) * ruleValue('lightMul', 1));
    }

    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCanvas, 0, 0);
  }

  function drawWarmGlow(ox, oy) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < current.torches.length; i++) {
      var t = current.torches[i];
      var x = ox + t.x;
      var y = oy + t.y - 8;
      var grad = ctx.createRadialGradient(x, y, 1, x, y, 32);
      grad.addColorStop(0, 'rgba(255,172,92,0.26)');
      grad.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 34, y - 34, 68, 68);
    }
    ctx.restore();
  }

  /* ---------- 小地图 ---------- */

  function drawMinimap() {
    var cell = 6;
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    var i;

    for (i = 0; i < rooms.length; i++) {
      if (!rooms[i].visited) continue;
      minX = Math.min(minX, rooms[i].gx);
      minY = Math.min(minY, rooms[i].gy);
      maxX = Math.max(maxX, rooms[i].gx);
      maxY = Math.max(maxY, rooms[i].gy);
    }
    if (minX === Infinity) return;

    var cols = maxX - minX + 1;
    var rows = maxY - minY + 1;

    // 画布像素 ↔ CSS 像素换算，用来把地图放到右上角齿轮按钮的左边
    var cssScale = H / Math.max(1, window.innerHeight);
    var gearLeft = window.innerWidth - 46;   // 12 右边距 + 34 按钮宽
    var padX = (gearLeft - 12) / Math.max(1, window.innerWidth) * W - cols * cell;
    var padY = Math.max(2, 29 * cssScale - rows * cell / 2);

    ctx.fillStyle = 'rgba(5,7,10,0.55)';
    ctx.fillRect(padX - 3, padY - 3, cols * cell + 6, rows * cell + 6);

    for (i = 0; i < rooms.length; i++) {
      var room = rooms[i];
      if (!room.visited) continue;
      var x = padX + (room.gx - minX) * cell;
      var y = padY + (room.gy - minY) * cell;

      // 出生房绿色、楼梯房黄色，其他保持灰色
      var color = '#39435a';
      if (room === rooms[0]) color = '#4cc06a';
      else if (room.stairs) color = '#e0b13a';

      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);

      // 当前所在房间用青色描边标出来
      if (room === current) {
        ctx.strokeStyle = '#6ee7ff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    }

    // 未清理房间数：小地图上方的红点 + 数字
    var remaining = unclearedRooms();
    if (remaining > 0) {
      var label = String(remaining);
      ctx.font = 'bold 9px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      var textWidth = ctx.measureText(label).width;
      var boxW = 12 + textWidth;
      var bx = padX + cols * cell + 3 - boxW;
      var by = padY + rows * cell + 9;   // 地图在右上，角标放到地图下方

      ctx.fillStyle = 'rgba(5,7,10,0.6)';
      ctx.fillRect(bx - 2, by - 6, boxW + 4, 12);

      ctx.fillStyle = '#ff5a5a';
      ctx.beginPath();
      ctx.arc(bx + 4, by, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffe3e3';
      ctx.fillText(label, bx + 11, by + 0.5);
    }
  }

  /* ---------- 渲染 ---------- */

  function render() {
    var i;
    var r;
    var c;

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, W, H);
    if (outsideCanvas) ctx.drawImage(outsideCanvas, 0, 0);

    var ox = originX;
    var oy = originY;

    // 震屏：只抖世界，不动小地图和 HUD
    shakeDX = 0;
    shakeDY = 0;
    if (shake > 0) {
      shakeDX = (Math.random() * 2 - 1) * shake * 3;
      shakeDY = (Math.random() * 2 - 1) * shake * 3;
      ox += shakeDX;
      oy += shakeDY;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox - 4, oy - 4, ROOM_PX + 8, ROOM_PX + 8);

    for (r = 0; r < ROOM_TILES; r++) {
      for (c = 0; c < ROOM_TILES; c++) {
        if (current.tiles[r][c] !== FLOOR) continue;
        drawFloor(c, r, ox + c * TS, oy + r * TS);
      }
    }

    // 门口是最底层的地面细节，画在墙和怪之前
    var locked = hasEnemies();
    for (r = 0; r < ROOM_TILES; r++) {
      for (c = 0; c < ROOM_TILES; c++) {
        if (current.tiles[r][c] !== FLOOR) continue;
        var dir = doorAt(c, r);
        if (dir) drawDoorway(c, r, dir, ox + c * TS, oy + r * TS, locked);
      }
    }

    // 楼梯属于地面，画在所有物体之下
    if (current.stairs) {
      drawStairs(ox + (ROOM_TILES / 2 - 1) * TS, oy + (ROOM_TILES / 2 - 1) * TS);
    }

    // 刷怪预警也在地面层
    drawSpawnMarks(ox, oy);

    var items = [];

    for (r = 0; r < ROOM_TILES; r++) {
      for (c = 0; c < ROOM_TILES; c++) {
        if (current.tiles[r][c] !== WALL) continue;
        items.push({
          y: (r + 1) * TS + WALL_H,
          draw: (function (cc, rr) {
            return function () {
              drawWall(cc, rr, ox + cc * TS, oy + rr * TS);
            };
          })(c, r)
        });
      }
    }

    for (i = 0; i < current.props.length; i++) {
      items.push({
        y: current.props[i].y,
        draw: (function (prop) {
          return function () {
            drawProp(prop, ox + prop.x, oy + prop.y);
          };
        })(current.props[i])
      });
    }

    if (current.enemies) {
      for (i = 0; i < current.enemies.length; i++) {
        var foe = current.enemies[i];
        if (foe.dead) continue;
        items.push({
          y: foe.y,
          draw: (function (en) {
            return function () {
              drawEnemy(en, ox + en.x, oy + en.y);
            };
          })(foe)
        });
      }
    }

    items.sort(function (a, b) {
      return a.y - b.y;
    });
    for (i = 0; i < items.length; i++) items[i].draw();

    // 火把画在地图之上、角色之下
    for (i = 0; i < current.torches.length; i++) {
      drawTorch(current.torches[i], ox + current.torches[i].x, oy + current.torches[i].y);
    }

    // 角色永远在最上层
    drawPlayer(ox + player.x, oy + player.y);
    drawParry(ox, oy);
    drawMuzzle(ox, oy);
    drawBullets(ox, oy);
    drawArrows(ox, oy);
    drawParticles(ox, oy);
    drawBooms(ox, oy);
    drawMeteors(ox, oy);
    drawShocks(ox, oy);
    drawFloaters(ox, oy);

    drawWarmGlow(ox, oy);
    drawLighting(ox, oy);

    if (damageFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + (Math.min(0.3, damageFlash) * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // Boss 血条
    var bossNow = current && current.boss;
    if (bossNow && !bossNow.dead) {
      var barW = Math.min(W * 0.55, 210);
      var barX = (W - barW) / 2;
      // 有本层规则时，血条让到规则文字下面
      var barY = floorRule ? 24 : 9;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, 9);
      ctx.fillStyle = '#2a0a10';
      ctx.fillRect(barX, barY, barW, 7);
      ctx.fillStyle = '#ff4d5e';
      ctx.fillRect(barX, barY, Math.max(0, barW * bossNow.hp / bossNow.maxHp), 7);
      ctx.strokeStyle = '#ff9aa6';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, 6);
    }

    drawMinimap();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + (flash * 0.9).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    drawStick();
  }

  function drawStick() {
    if (!stick.visible) return;

    var bx = stick.baseX;
    var by = stick.baseY;

    ctx.fillStyle = 'rgba(8,12,18,0.34)';
    ctx.beginPath();
    ctx.arc(bx, by, STICK_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = stick.active ? 'rgba(110,231,255,0.55)' : 'rgba(232,238,251,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, by, STICK_R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = stick.active ? 'rgba(110,231,255,0.28)' : 'rgba(232,238,251,0.1)';
    ctx.beginPath();
    ctx.moveTo(bx - 4, by);
    ctx.lineTo(bx + 4, by);
    ctx.moveTo(bx, by - 4);
    ctx.lineTo(bx, by + 4);
    ctx.stroke();

    ctx.fillStyle = stick.active ? 'rgba(110,231,255,0.75)' : 'rgba(232,238,251,0.3)';
    ctx.beginPath();
    ctx.arc(bx + stick.x * STICK_MAX, by + stick.y * STICK_MAX, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 尺寸 ---------- */

  function buildOutside() {
    outsideCanvas = document.createElement('canvas');
    outsideCanvas.width = W;
    outsideCanvas.height = H;

    var g = outsideCanvas.getContext('2d');
    g.fillStyle = '#06080d';
    g.fillRect(0, 0, W, H);

    var dots = Math.floor(W * H * 0.012);
    for (var i = 0; i < dots; i++) {
      var x = Math.floor(Math.random() * W);
      var y = Math.floor(Math.random() * H);
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.3)';
      g.fillRect(x, y, 1, 1);
    }

    var grad = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.72);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.8)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  /* ---------- 手机键位自定义 ---------- */

  var PAD_DEFAULT = {
    stick: { x: 0.13, y: 0.73 },
    attack: { x: 0.94, y: 0.86 },
    dash: { x: 0.85, y: 0.68 },
    shock: { x: 0.95, y: 0.52 },
    parry: { x: 0.76, y: 0.86 }
  };

  var padLayout = clonePad(PAD_DEFAULT);
  var editingPad = false;
  var padDrag = null;

  function clonePad(src) {
    var out = {};
    Object.keys(src).forEach(function (key) {
      out[key] = { x: src[key].x, y: src[key].y };
    });
    return out;
  }

  function loadPadLayout() {
    try {
      var raw = window.localStorage.getItem('dungeon-pad-layout');
      if (!raw) return;
      var saved = JSON.parse(raw);
      Object.keys(PAD_DEFAULT).forEach(function (key) {
        var p = saved && saved[key];
        if (p && typeof p.x === 'number' && typeof p.y === 'number' &&
          p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) {
          padLayout[key] = { x: p.x, y: p.y };
        }
      });
    } catch (error) {
      /* 读不到就用默认 */
    }
  }

  function savePadLayout() {
    try {
      window.localStorage.setItem('dungeon-pad-layout', JSON.stringify(padLayout));
    } catch (error) {
      /* 忽略 */
    }
  }

  function padTargets() {
    return [
      { key: 'attack', el: attackBtn },
      { key: 'dash', el: dashBtn },
      { key: 'shock', el: shockBtn },
      { key: 'parry', el: parryBtn }
    ];
  }

  function applyPadLayout() {
    var size = { attack: 66, dash: 54, shock: 54, parry: 54 };

    padTargets().forEach(function (item) {
      if (!item.el || !padLayout[item.key]) return;
      var p = padLayout[item.key];
      var half = size[item.key] / 2;

      item.el.style.left = (p.x * 100).toFixed(2) + '%';
      item.el.style.top = (p.y * 100).toFixed(2) + '%';
      item.el.style.right = 'auto';
      item.el.style.bottom = 'auto';
      item.el.style.marginLeft = (-half) + 'px';
      item.el.style.marginTop = (-half) + 'px';
    });

    if (padLayout.stick) {
      stick.baseX = padLayout.stick.x * W;
      stick.baseY = padLayout.stick.y * H;
    }

    var ghost = document.getElementById('pad-ghost');
    if (ghost && padLayout.stick) {
      ghost.style.left = (padLayout.stick.x * 100).toFixed(2) + '%';
      ghost.style.top = (padLayout.stick.y * 100).toFixed(2) + '%';
    }
  }

  function clampPad(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function openPadEditor() {
    if (editingPad) return;

    editingPad = true;
    paused = true;
    cardsEl && (cardsEl.hidden = true);
    if (menuEl) menuEl.hidden = true;

    var editor = document.getElementById('pad-editor');
    var ghost = document.getElementById('pad-ghost');
    if (editor) editor.hidden = false;
    if (ghost) ghost.hidden = false;

    applyPadLayout();
  }

  function closePadEditor(save) {
    if (!editingPad) return;

    editingPad = false;
    padDrag = null;

    var editor = document.getElementById('pad-editor');
    var ghost = document.getElementById('pad-ghost');
    if (editor) editor.hidden = true;
    if (ghost) ghost.hidden = true;

    if (save) savePadLayout();

    paused = false;
    applyPadLayout();
    updateStats();
  }

  function resetPadLayout() {
    padLayout = clonePad(PAD_DEFAULT);
    applyPadLayout();
    savePadLayout();
  }

  function bindPadDrag(el, key) {
    if (!el) return;

    el.addEventListener('pointerdown', function (event) {
      if (!editingPad) return;
      event.preventDefault();
      event.stopPropagation();
      padDrag = { key: key, id: event.pointerId, el: el };
      el.classList.add('is-dragging');
      try { el.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ }
    });
  }
  function resize() {
    var vw = Math.max(1, window.innerWidth);
    var vh = Math.max(1, window.innerHeight);

    H = BASE_H;
    W = clamp(Math.round(H * (vw / vh)), 280, 560);

    canvas.width = W;
    canvas.height = H;
    ctx.imageSmoothingEnabled = false;

    originX = Math.round((W - ROOM_PX) / 2);
    originY = Math.round((H - ROOM_PX) / 2);

    stick.baseX = 60;
    stick.baseY = H - 56;

    lightCanvas = document.createElement('canvas');
    lightCanvas.width = W;
    lightCanvas.height = H;

    if (heroCanvas) {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      heroCanvas.width = Math.round(vw * dpr);
      heroCanvas.height = Math.round(vh * dpr);
      heroScale = heroCanvas.width / W;
    }

    buildOutside();
    applyPadLayout();
  }

  /* ---------- 设置菜单 ---------- */

  function syncFullscreenLabel() {
    var el = document.getElementById('menu-fullscreen');
    if (!el) return;
    el.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  }

  function openMenu() {
    if (!menuEl || paused) return;
    paused = true;
    keys = {};
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
    syncFullscreenLabel();
    menuEl.hidden = false;
    if (btnMenu) btnMenu.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!menuEl) return;
    menuEl.hidden = true;
    paused = false;
    if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');
  }

  function toggleFullscreen() {
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
    syncFullscreenLabel();
  }

  /* ---------- 输入 ---------- */

  function toScene(event) {
    var box = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - box.left) / box.width * W,
      y: (event.clientY - box.top) / box.height * H
    };
  }

  function applyStick(px, py) {
    var dx = px - stick.baseX;
    var dy = py - stick.baseY;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > STICK_MAX) {
      dx = dx / len * STICK_MAX;
      dy = dy / len * STICK_MAX;
      len = STICK_MAX;
    }
    stick.x = dx / STICK_MAX;
    stick.y = dy / STICK_MAX;

    // 摇杆一推就同步朝向，这样扭头立刻按盾反也是准的
    if (len > 2) {
      player.faceX = dx / len;
      player.faceY = dy / len;
    }
  }

  function bind() {
    if (dashBtn) {
      dashBtn.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (editingPad) return;
        doDash();
      });
    }

    if (shockBtn) {
      shockBtn.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (editingPad) return;
        doShock();
      });
    }

    if (parryBtn) {
      parryBtn.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (editingPad) return;
        doParry();
      });
    }

    if (cardsRow) {
      cardsRow.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest ? event.target.closest('[data-card]') : null;
        if (!btn) return;
        pickCard(btn.getAttribute('data-card'));
      });
    }

    window.addEventListener('keydown', function (event) {
      if (cardsEl && !cardsEl.hidden && /^[1-3]$/.test(event.key) &&
        cardsRow && typeof cardsRow.querySelectorAll === 'function') {
        var options = cardsRow.querySelectorAll('[data-card]');
        var picked = options[parseInt(event.key, 10) - 1];
        if (picked) {
          pickCard(picked.getAttribute('data-card'));
          event.preventDefault();
          return;
        }
      }
      if (event.key === 'Escape' && menuEl && !menuEl.hidden) {
        event.preventDefault();
        closeMenu();
        return;
      }
      var key = event.key.toLowerCase();
      keys[key] = true;
      if (key === 'j' || key === ' ') fireHeld = true;
      if (key === 'shift') doDash();
      if (key === 'q') doShock();
      if (key === 'k') doParry();
      if (key.indexOf('arrow') === 0 || key === ' ') event.preventDefault();
    });

    window.addEventListener('keyup', function (event) {
      var key = event.key.toLowerCase();
      keys[key] = false;
      if (key === 'j' || key === ' ') fireHeld = false;
    });

    window.addEventListener('blur', function () {
      keys = {};
      fireHeld = false;
      stick.active = false;
      stick.id = null;
    });

    canvas.addEventListener('pointerdown', function (event) {
      if (paused || editingPad) return;
      if (event.pointerType === 'mouse') {
        fireHeld = true;
        shoot();
        return;
      }
      if (stick.active) return;
      if (event.pointerType === 'touch') stick.visible = true;

      var p = toScene(event);
      var dx = p.x - stick.baseX;
      var dy = p.y - stick.baseY;
      if (Math.sqrt(dx * dx + dy * dy) > STICK_GRAB) return;

      stick.active = true;
      stick.id = event.pointerId;
      applyStick(p.x, p.y);

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        /* 忽略 */
      }
    });

    canvas.addEventListener('pointermove', function (event) {
      if (!stick.active || event.pointerId !== stick.id) return;
      var p = toScene(event);
      applyStick(p.x, p.y);
    });

    function release(event) {
      if (event && event.pointerId !== stick.id) return;
      stick.active = false;
      stick.id = null;
      stick.x = 0;
      stick.y = 0;
    }

    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    window.addEventListener('pointerup', function (event) {
      if (event.pointerType === 'mouse') fireHeld = false;
    });
    canvas.addEventListener('pointerleave', function (event) {
      if (event.pointerId === stick.id && !event.buttons) release(event);
    });

    if (btnMenu) btnMenu.addEventListener('click', openMenu);

    var resumeBtn = document.getElementById('menu-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', closeMenu);

    var homeBtn = document.getElementById('menu-home');
    if (homeBtn) {
      homeBtn.addEventListener('click', function () {
        if (window.Game && window.Game.leave) window.Game.leave();
      });
    }

    var victoryBtn = document.getElementById('victory-home');
    if (victoryBtn) {
      victoryBtn.addEventListener('click', function () {
        resetRun();
        if (window.Game && window.Game.leave) window.Game.leave();
      });
    }

    var musicSlider = document.getElementById('music-volume');
    var musicVal = document.getElementById('music-volume-val');

    if (musicSlider && window.Sfx && window.Sfx.getMusicVolume) {
      var initial = Math.round(window.Sfx.getMusicVolume() * 100);
      musicSlider.value = String(initial);
      if (musicVal) musicVal.textContent = String(initial);

      musicSlider.addEventListener('input', function () {
        var percent = Number(musicSlider.value) || 0;
        window.Sfx.setMusicVolume(percent / 100);
        if (musicVal) musicVal.textContent = String(percent);
      });
    }

    var soundBtn = document.getElementById('menu-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', function () {
        if (!window.Sfx) return;

        var muted = window.Sfx.toggleMute();
        soundBtn.textContent = muted ? '声音：关' : '声音：开';

        // 打开声音时顺手唤醒音频并放一声，方便确认到底有没有声音
        if (!muted) {
          if (window.Sfx.resume) window.Sfx.resume();
          if (window.Sfx.play) window.Sfx.play('levelup');
        }
      });
    }

    if (nextBtn) nextBtn.addEventListener('click', goNextFloor);

    if (deathHome) {
      deathHome.addEventListener('click', function () {
        resetRun();
        if (window.Game && window.Game.leave) window.Game.leave();
      });
    }

    if (attackBtn) {
      attackBtn.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        if (paused || editingPad) return;
        fireHeld = true;
        attackBtn.classList.add('is-down');
        shoot();
        try {
          attackBtn.setPointerCapture(event.pointerId);
        } catch (error) {
          /* 忽略 */
        }
      });

      var releaseAttack = function () {
        fireHeld = false;
        attackBtn.classList.remove('is-down');
      };

      attackBtn.addEventListener('pointerup', releaseAttack);
      attackBtn.addEventListener('pointercancel', releaseAttack);
      attackBtn.addEventListener('pointerleave', releaseAttack);
    }

    /* ---------- 键位自定义：绑定 ---------- */

    padTargets().forEach(function (item) {
      bindPadDrag(item.el, item.key);
    });

    var ghostEl = document.getElementById('pad-ghost');
    if (ghostEl) {
      ghostEl.addEventListener('pointerdown', function (event) {
        if (!editingPad) return;
        event.preventDefault();
        padDrag = { key: 'stick', id: event.pointerId, el: ghostEl };
        ghostEl.classList.add('is-dragging');
        try { ghostEl.setPointerCapture(event.pointerId); } catch (error) { /* 忽略 */ }
      });
    }

    window.addEventListener('pointermove', function (event) {
      if (!padDrag || event.pointerId !== padDrag.id) return;

      var x = clampPad(event.clientX / Math.max(1, window.innerWidth), 0.04, 0.96);
      var y = clampPad(event.clientY / Math.max(1, window.innerHeight), 0.06, 0.94);

      padLayout[padDrag.key] = { x: x, y: y };
      applyPadLayout();
    });

    function endPadDrag(event) {
      if (!padDrag || (event && event.pointerId !== padDrag.id)) return;
      if (padDrag.el) padDrag.el.classList.remove('is-dragging');
      padDrag = null;
    }

    window.addEventListener('pointerup', endPadDrag);
    window.addEventListener('pointercancel', endPadDrag);

    var padBtn = document.getElementById('menu-pad');
    if (padBtn) padBtn.addEventListener('click', openPadEditor);

    var padDone = document.getElementById('pad-done');
    if (padDone) padDone.addEventListener('click', function () { closePadEditor(true); });

    var padReset = document.getElementById('pad-reset');
    if (padReset) {
      padReset.addEventListener('click', function () {
        resetPadLayout();
      });
    }

    var fsBtn = document.getElementById('menu-fullscreen');
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);

    if (menuEl) {
      menuEl.addEventListener('click', function (event) {
        if (event.target === menuEl) closeMenu();
      });
    }

    document.addEventListener('fullscreenchange', syncFullscreenLabel);

    var timer = null;
    window.addEventListener('resize', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(resize, 120);
    });
  }

  /* ---------- 主循环 ---------- */

  var lastTime = 0;
  var active = false;
  var booted = false;

  function loop(now) {
    window.requestAnimationFrame(loop);

    if (!active) {
      lastTime = now;
      return;
    }

    var dt = lastTime ? (now - lastTime) / 1000 : 0.016;
    lastTime = now;
    dt = Math.min(dt, 0.05);

    if (!paused) {
      if (hitStop > 0) hitStop = Math.max(0, hitStop - dt);
      else update(dt);
    }
    render();
    drawHeroOverlay();
  }

  function boot() {
    if (booted) return;
    booted = true;
    loadPadLayout();
    resize();
    generate();
    updateFloorLabel();
    updateStats();
    updateXpHud();
    setStairButton(false);
    bind();
    applyPadLayout();
    window.requestAnimationFrame(loop);
  }

  /* ---------- 对外接口 ---------- */

  // 页面一加载就开始下载主角三视图，进游戏时就不用等了
  loadHeroArt();

  window.Game = {
    rules: function () {
      return FLOOR_RULES.map(function (r) {
        return { id: r.id, name: r.name, desc: r.desc };
      });
    },
    enter: function (nextMode) {
      mode = nextMode === 'endless' ? 'endless' : 'campaign';

      var app = document.getElementById('app');
      var stage = document.getElementById('stage');
      if (app) app.hidden = true;
      if (stage) stage.hidden = false;
      if (window.Lobby && window.Lobby.hide) window.Lobby.hide();

      boot();

      // 从大厅进来永远是全新的一局
      resetRun();

      active = true;
      paused = false;
      keys = {};
      stick.active = false;
      stick.x = 0;
      stick.y = 0;
      lastTime = 0;

      if (menuEl) menuEl.hidden = true;
      if (deathEl) deathEl.hidden = true;
      if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');

      var hint = document.getElementById('hint');
      if (hint) {
        hint.style.animation = 'none';
        void hint.offsetWidth;
        hint.style.animation = '';
      }

      resize();
      syncFullscreenLabel();
      updateFloorLabel();

      if (window.Sfx) {
        window.Sfx.unlock();
        window.Sfx.startBgm();
      }
    },
    leave: function () {
      active = false;
      if (heroCtx) heroCtx.clearRect(0, 0, heroCanvas.width, heroCanvas.height);
      paused = false;
      if (menuEl) menuEl.hidden = true;
      if (cardsEl) cardsEl.hidden = true;
      if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');
      if (window.Sfx) window.Sfx.stopBgm();
      if (window.Lobby && window.Lobby.show) window.Lobby.show();
    },
    setStats: function (next) {
      if (!next) return;
      if (typeof next.hp === 'number') stats.hp = Math.max(0, Math.min(stats.hpMax, next.hp));
      if (typeof next.ep === 'number') stats.ep = Math.max(0, Math.min(stats.epMax, next.ep));
      updateStats();
    },
    getStats: function () {
      return stats;
    }
  };

  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      stick.visible = true;
    }
  } catch (error) {
    /* 忽略 */
  }
})();
