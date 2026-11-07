/* ==========================================================================
   地牢回响 · 第一层
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
  var BULLET_SPEED = 200;
  var BULLET_LIFE = 0.85;
  var BULLET_DAMAGE = 15;

  var ENEMY_HP = 50;
  var ENEMY_DAMAGE = 10;
  // 主角速度 70，小怪取 30% = 21
  var ENEMY_SPEED = 21;
  var ENEMY_SIGHT = 130;
  var ENEMY_RANGE = 26;
  var PLAYER_INVULN = 0.8;
  var WAVES_PER_ROOM = 3;

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

  var W = 336;
  var H = BASE_H;

  var rooms = [];
  var roomMap = {};
  var current = null;
  var player = { x: 0, y: 0, dir: 0, moving: false, walk: 0 };

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
  var impacts = [];
  var particles = [];
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
  var hudCount = document.getElementById('hud-count');
  var nextBtn = document.getElementById('next-floor');
  var deathEl = document.getElementById('death');
  var deathNote = document.getElementById('death-note');
  var deathHome = document.getElementById('death-home');
  var attackBtn = document.getElementById('attack');
  var hpFill = document.getElementById('hp-fill');
  var hpVal = document.getElementById('hp-val');
  var epFill = document.getElementById('ep-fill');
  var epVal = document.getElementById('ep-val');
  var stats = { hp: 100, hpMax: 100, ep: 100, epMax: 100 };
  var nearStairs = false;
  var stairReady = false;
  var floor = 1;

  /* ---------- 经验与升级 ---------- */
  var XP_PER_KILL = { melee: 5, archer: 8, bomber: 7 };
  var XP_CLEAR_BONUS = 10;
  var xp = 0;
  var level = 1;
  var xpNext = 35;
  var pendingLevels = 0;
  var upgrades = { damage: 0, fireRate: 0, speed: 0, pierce: 0 };

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
      addObstacles(room);
      decorate(room);
    }

    // 最远的房间放楼梯（先定下来，再刷怪）
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

    for (var s = 0; s < rooms.length; s++) {
      spawnEnemies(rooms[s]);
    }

    current = rooms[0];
    current.visited = true;
    player.x = (ROOM_TILES / 2) * TS;
    player.y = (ROOM_TILES / 2) * TS;
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
    arrows.length = 0;
    spawnMarks.length = 0;
    booms.length = 0;
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
    if (hudFloor) hudFloor.textContent = floorName(floor);
    if (nextBtn) nextBtn.textContent = '下到' + floorName(floor + 1);
  }

  function updateStats() {
    if (hpFill) hpFill.style.width = (Math.max(0, Math.min(1, stats.hp / stats.hpMax)) * 100) + '%';
    if (hpVal) hpVal.textContent = Math.ceil(stats.hp) + '/' + stats.hpMax;
    if (epFill) epFill.style.width = (Math.max(0, Math.min(1, stats.ep / stats.epMax)) * 100) + '%';
    if (epVal) epVal.textContent = Math.ceil(stats.ep) + '/' + stats.epMax;
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

  function awardXP(amount) {
    if (dead || amount <= 0) return;

    xp += amount;
    while (xp >= xpNext) {
      xp -= xpNext;
      level += 1;
      xpNext = xpNeeded(level);
      pendingLevels += 1;
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
      desc: '射击间隔 -12%',
      apply: function () { upgrades.fireRate += 1; }
    },
    {
      id: 'speed',
      name: '轻快步伐',
      desc: '移动速度 +12%',
      apply: function () { upgrades.speed += 1; }
    },
    {
      id: 'hp',
      name: '强健体魄',
      desc: '最大生命 +45，并回复 45',
      apply: function () {
        stats.hpMax += 45;
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
      desc: '立即回复 80 生命',
      apply: function () {
        stats.hp = Math.min(stats.hpMax, stats.hp + 80);
      }
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

    var pool = CARD_POOL.slice();
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
    for (var i = 0; i < CARD_POOL.length; i++) {
      if (CARD_POOL[i].id !== id) continue;
      CARD_POOL[i].apply();
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

  function shoot() {
    if (paused || fireCooldown > 0) return;

    var originX = player.x;
    var originY = player.y - 8;
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

    var ox = originX + dx * 8;
    var oy = originY + dy * 8;

    bullets.push({
      x: ox,
      y: oy,
      vx: dx * BULLET_SPEED,
      vy: dy * BULLET_SPEED,
      life: BULLET_LIFE,
      pierce: upgrades.pierce,
      hits: []
    });

    fireCooldown = FIRE_INTERVAL * Math.pow(0.88, upgrades.fireRate);
    muzzleTimer = 0.06;
    muzzleX = ox;
    muzzleY = oy;
  }

  function updateBullets(dt) {
    var i;

    for (i = bullets.length - 1; i >= 0; i--) {
      var b = bullets[i];
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

      if (b.life <= 0 || solidAt(b.x, b.y)) {
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

  function waveSize() {
    return 2 + Math.floor(Math.random() * 3);   // 2~4 只
  }

  function pushEnemy(room, x, y, kind) {
    var hp = kind === 'archer' ? ARCHER_HP : kind === 'bomber' ? BOMBER_HP : ENEMY_HP;

    room.enemies.push({
      kind: kind,
      x: x,
      y: y,
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

      var roll = Math.random();
      var kind = roll < 0.45 ? 'melee' : roll < 0.8 ? 'archer' : 'bomber';

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
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }

      if (e.kind === 'archer') updateArcher(e, dt);
      else if (e.kind === 'bomber') updateBomber(e, dt);
      else updateMelee(e, dt);
    }
  }

  function updateArcher(e, dt) {
    var dx = player.x - e.x;
    var dy = (player.y - 8) - (e.y - 5);
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (e.cd > 0) e.cd -= dt;

    var speed = e.state === 'draw' ? ARCHER_SPEED_DRAW : ARCHER_SPEED_IDLE;

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
        moveEnemy(e, dx / dist * BOMBER_FUSE_SPEED * dt, dy / dist * BOMBER_FUSE_SPEED * dt);
      }
      return;
    }

    if (dist > BOMBER_TRIGGER && dist > 0.1) {
      e.state = 'chase';
      moveEnemy(e, dx / dist * BOMBER_SPEED * dt, dy / dist * BOMBER_SPEED * dt);
    } else {
      e.state = 'fuse';
      e.timer = BOMBER_FUSE;
    }
  }

  function explode(e) {
    e.dead = true;
    burst(e.x, e.y - 5, 16);
    booms.push({ x: e.x, y: e.y - 2, t: 0, dur: 0.35 });

    var dx = player.x - e.x;
    var dy = (player.y - 5) - e.y;
    if (Math.sqrt(dx * dx + dy * dy) <= BOMBER_RADIUS && hasLineOfSight(e)) {
      hurtPlayer(BOMBER_DAMAGE);
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
      life: ARROW_LIFE
    });
  }

  function updateArrows(dt) {
    for (var i = arrows.length - 1; i >= 0; i--) {
      var a = arrows[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;

      var hitPlayer = a.x > player.x - 6 && a.x < player.x + 6 &&
        a.y > player.y - 15 && a.y < player.y + 2;

      if (hitPlayer) {
        hurtPlayer(ARROW_DAMAGE);
        impacts.push({ x: a.x, y: a.y, life: 0.14 });
        arrows.splice(i, 1);
        continue;
      }

      if (a.life <= 0 || solidAt(a.x, a.y)) {
        impacts.push({ x: a.x, y: a.y, life: 0.14 });
        arrows.splice(i, 1);
      }
    }
  }

  function updateMelee(e, dt) {
    var dx = player.x - e.x;
    var dy = player.y - e.y;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (e.state === 'windup') {
      e.timer -= dt;
      if (e.timer <= 0) {
        if (dist < ENEMY_RANGE * 1.6) hurtPlayer(ENEMY_DAMAGE);
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
      moveEnemy(e, dx / dist * ENEMY_SPEED * dt, dy / dist * ENEMY_SPEED * dt);
    } else {
      e.state = 'windup';
      e.timer = 0.45;
    }
  }

  function hurtPlayer(amount) {
    if (invuln > 0 || dead) return;

    stats.hp = Math.max(0, stats.hp - amount);
    invuln = PLAYER_INVULN;
    damageFlash = 0.3;
    updateStats();

    if (stats.hp <= 0) playerDied();
  }

  function playerDied() {
    dead = true;
    paused = true;
    if (deathNote) deathNote.textContent = '倒在第 ' + floor + ' 层';
    if (deathEl) deathEl.hidden = false;
  }

  function resetRun() {
    floor = 1;
    stats.hpMax = 100;
    stats.hp = 100;
    stats.epMax = 100;
    stats.ep = 100;
    xp = 0;
    level = 1;
    xpNext = xpNeeded(1);
    pendingLevels = 0;
    upgrades = { damage: 0, fireRate: 0, speed: 0, pierce: 0 };
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
    spawnMarks.length = 0;
    booms.length = 0;
    if (deathEl) deathEl.hidden = true;

    generate();
    updateFloorLabel();
    updateStats();
    updateEnemyHud();
    updateXpHud();
  }

  function updateEnemyHud() {
    var n = 0;
    if (current && current.enemies) {
      for (var i = 0; i < current.enemies.length; i++) {
        if (!current.enemies[i].dead) n++;
      }
    }
    if (n === shownEnemies) return;
    shownEnemies = n;
    if (!hudCount) return;
    hudCount.hidden = n === 0;
    hudCount.textContent = '敌人 ' + n;
  }

  /* ---------- 粒子 ---------- */

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

  function hitEnemy(bullet) {
    if (!current || !current.enemies) return false;

    for (var i = 0; i < current.enemies.length; i++) {
      var e = current.enemies[i];
      if (e.dead) continue;
      if (bullet.hits && bullet.hits.indexOf(e) >= 0) continue;
      if (Math.abs(bullet.x - e.x) > 8 || Math.abs(bullet.y - (e.y - 5)) > 9) continue;

      if (bullet.hits) bullet.hits.push(e);

      e.hp -= BULLET_DAMAGE + upgrades.damage;
      e.hurt = 0.12;
      e.state = 'chase';
      e.timer = 0;

      // 轻微击退
      var len = Math.sqrt(bullet.vx * bullet.vx + bullet.vy * bullet.vy) || 1;
      moveEnemy(e, bullet.vx / len * 5, bullet.vy / len * 5);

      if (e.hp <= 0) {
        e.dead = true;
        burst(e.x, e.y - 5, 9);
        awardXP(XP_PER_KILL[e.kind] || 5);
      }
      return true;
    }
    return false;
  }

  /* ---------- 更新 ---------- */

  function update(dt) {
    time += dt;
    if (flash > 0) flash = Math.max(0, flash - dt * 4.5);

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

    player.moving = len > 0.12;
    if (player.moving) {
      player.walk += dt * 9;
      if (Math.abs(ix) > Math.abs(iy)) player.dir = ix > 0 ? 2 : 1;
      else player.dir = iy > 0 ? 0 : 3;
    } else {
      player.walk *= 0.6;
    }

    var speed = 70 * Math.pow(1.12, upgrades.speed);
    if (ix) moveAxis(ix * speed * dt, 0);
    if (iy) moveAxis(0, iy * speed * dt);

    if (fireCooldown > 0) fireCooldown -= dt;
    if (muzzleTimer > 0) muzzleTimer -= dt;
    if (invuln > 0) invuln -= dt;
    if (damageFlash > 0) damageFlash -= dt;
    if (fireHeld) shoot();
    updateBullets(dt);
    updateArrows(dt);
    updateSpawnMarks(dt);
    updateBooms(dt);
    updateEnemies(dt);
    updateWaves(dt);
    updateParticles(dt);
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

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 2.2, 0, 0, Math.PI * 2);
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

    var bodyDark = bomber
      ? (blinkOn ? '#e9f5d8' : '#4f7a3a')
      : archer ? '#4a3a6b' : '#8e2f3c';
    var bodyLight = bomber
      ? (blinkOn ? '#ffffff' : '#7aa84f')
      : archer ? '#7160a8' : '#c04a58';
    var horn = bomber
      ? (blinkOn ? '#ffffff' : '#2f4a22')
      : archer ? '#2c2140' : '#5d1c26';

    ctx.fillStyle = hurt ? '#ffffff' : bodyDark;
    ctx.fillRect(x - 5 + wob, baseY - 9, 10, 9);
    ctx.fillStyle = hurt ? '#ffffff' : bodyLight;
    ctx.fillRect(x - 5 + wob, baseY - 9, 10, 3);

    ctx.fillStyle = hurt ? '#ffffff' : horn;
    ctx.fillRect(x - 5 + wob, baseY - 11, 2, 2);
    ctx.fillRect(x + 3 + wob, baseY - 11, 2, 2);

    if (!hurt) {
      ctx.fillStyle = archer ? '#8ce8ff' : bomber ? '#ff9a3c' : '#ffd76a';
      ctx.fillRect(x - 3 + wob, baseY - 6, 2, 2);
      ctx.fillRect(x + 1 + wob, baseY - 6, 2, 2);
    }

    if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x - 6, baseY - 15, 12, 2);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(x - 6, baseY - 15, Math.max(0, 12 * e.hp / e.maxHp), 2);
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
        ctx.fillStyle = s === 0 ? '#fff0c4' : 'rgba(210,186,138,0.6)';
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

  function drawParticles(ox, oy) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.max(0, Math.min(1, p.life / 0.4));
      ctx.fillStyle = 'rgba(255,120,120,' + a.toFixed(3) + ')';
      ctx.fillRect(Math.round(ox + p.x), Math.round(oy + p.y), 2, 2);
    }
  }

  function drawPlayer(x, y) {
    var step = player.moving ? Math.sin(player.walk) : 0;
    var bob = player.moving ? Math.round(Math.abs(Math.cos(player.walk))) : 0;
    var legA = Math.round(Math.max(0, step) * 2);
    var legB = Math.round(Math.max(0, -step) * 2);

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    var baseY = y - bob;

    ctx.fillStyle = '#232b3b';
    ctx.fillRect(x - 3, baseY - 3 - legA, 2, 3 + legA);
    ctx.fillRect(x + 1, baseY - 3 - legB, 2, 3 + legB);

    ctx.fillStyle = '#3b63c9';
    ctx.fillRect(x - 4, baseY - 10, 8, 7);
    ctx.fillStyle = '#4f7ae0';
    ctx.fillRect(x - 4, baseY - 10, 8, 2);
    ctx.fillStyle = '#1d2433';
    ctx.fillRect(x - 4, baseY - 4, 8, 1);

    // 手枪
    ctx.fillStyle = '#39435a';
    if (player.dir === 2) {
      ctx.fillRect(x + 4, baseY - 10, 5, 2);
      ctx.fillStyle = '#5b6b85';
      ctx.fillRect(x + 8, baseY - 10, 1, 2);
    } else if (player.dir === 1) {
      ctx.fillRect(x - 9, baseY - 10, 5, 2);
      ctx.fillStyle = '#5b6b85';
      ctx.fillRect(x - 9, baseY - 10, 1, 2);
    } else if (player.dir === 0) {
      ctx.fillRect(x + 2, baseY - 6, 2, 5);
    } else {
      ctx.fillRect(x + 2, baseY - 15, 2, 5);
    }

    ctx.fillStyle = '#f2c79b';
    ctx.fillRect(x - 3, baseY - 15, 6, 5);

    ctx.fillStyle = '#9aa7bb';
    ctx.fillRect(x - 4, baseY - 16, 8, 3);
    ctx.fillStyle = '#c3cede';
    ctx.fillRect(x - 4, baseY - 16, 8, 1);
    ctx.fillStyle = '#7f8b9e';
    ctx.fillRect(x - 4, baseY - 13, 8, 1);

    if (player.dir !== 3) {
      ctx.fillStyle = '#10141c';
      var offset = player.dir === 1 ? -1 : player.dir === 2 ? 1 : 0;
      ctx.fillRect(x - 2 + offset, baseY - 12, 1, 2);
      ctx.fillRect(x + 1 + offset, baseY - 12, 1, 2);
    }

    if (invuln > 0) {
      ctx.strokeStyle = 'rgba(255,110,110,' + (0.35 + 0.25 * Math.sin(time * 30)).toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y - 8, 11, 0, Math.PI * 2);
      ctx.stroke();
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

      var nx = b.vx / BULLET_SPEED;
      var ny = b.vy / BULLET_SPEED;

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
      punchLight(lctx, ox + t.x, oy + t.y - 6, 72 + flicker);
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
    var padX = W - 10 - cols * cell;
    var padY = H - 12 - rows * cell;

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
      var by = padY - 12;

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
    drawMuzzle(ox, oy);
    drawBullets(ox, oy);
    drawArrows(ox, oy);
    drawParticles(ox, oy);
    drawBooms(ox, oy);

    drawWarmGlow(ox, oy);
    drawLighting(ox, oy);

    if (damageFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + (Math.min(0.3, damageFlash) * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
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

    buildOutside();
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
    }
    stick.x = dx / STICK_MAX;
    stick.y = dy / STICK_MAX;
  }

  function bind() {
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
      if (paused) return;
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
        if (paused) return;
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

    if (!paused) update(dt);
    render();
  }

  function boot() {
    if (booted) return;
    booted = true;
    resize();
    generate();
    updateFloorLabel();
    updateStats();
    updateXpHud();
    setStairButton(false);
    bind();
    window.requestAnimationFrame(loop);
  }

  /* ---------- 对外接口 ---------- */

  window.Game = {
    enter: function () {
      var app = document.getElementById('app');
      var stage = document.getElementById('stage');
      if (app) app.hidden = true;
      if (stage) stage.hidden = false;
      if (window.Lobby && window.Lobby.hide) window.Lobby.hide();

      boot();

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
    },
    leave: function () {
      active = false;
      paused = false;
      if (menuEl) menuEl.hidden = true;
      if (cardsEl) cardsEl.hidden = true;
      if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');
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
