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
    baseX: 44,
    baseY: 140,
    x: 0,
    y: 0
  };
  var STICK_R = 27;
  var STICK_GRAB = 44;
  var STICK_MAX = 21;

  var outsideCanvas = null;
  var lightCanvas = null;

  var hudSub = document.getElementById('hud-sub');
  var hudFloor = document.getElementById('hud-floor');
  var nextBtn = document.getElementById('next-floor');
  var nearStairs = false;
  var floor = 1;
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
      decorate(room);
    }

    // 最远的房间放楼梯
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

    current = rooms[0];
    current.visited = true;
    player.x = (ROOM_TILES / 2) * TS;
    player.y = (ROOM_TILES / 2) * TS;
    updateHud();
  }

  function decorate(room) {
    room.torches = [];
    room.props = [];

    for (var c = 1; c < ROOM_TILES - 1; c++) {
      if (room.tiles[0][c] !== WALL) continue;
      if (c === DOOR_A || c === DOOR_B) continue;
      if (Math.random() > 0.55) continue;
      room.torches.push({ x: (c + 0.5) * TS, y: TS });
      if (room.torches.length >= 4) break;
    }

    for (var r = 2; r < ROOM_TILES - 2; r++) {
      for (c = 1; c < ROOM_TILES - 1; c++) {
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
    setStairButton(false);
    updateHud();
  }

  function updateHud() {
    if (!hudSub) return;
    hudSub.textContent = '房间 ' + (rooms.indexOf(current) + 1) + ' / ' + rooms.length;
  }

  var CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  function floorName(n) {
    return '第' + (CN_NUM[n - 1] || n) + '层';
  }

  function updateFloorLabel() {
    if (hudFloor) hudFloor.textContent = floorName(floor);
    if (nextBtn) nextBtn.textContent = '下到' + floorName(floor + 1);
  }

  function setStairButton(show) {
    nearStairs = show;
    if (nextBtn) nextBtn.hidden = !show;
  }

  function goNextFloor() {
    floor += 1;
    generate();
    flash = 1;
    setStairButton(false);
    updateFloorLabel();
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

    var speed = 70;
    if (ix) moveAxis(ix * speed * dt, 0);
    if (iy) moveAxis(0, iy * speed * dt);

    var c = Math.floor(player.x / TS);
    var r = Math.floor(player.y / TS);
    var door = doorAt(c, r);
    if (door && current.doors[door]) enterRoom(door);

    var onStair = false;
    if (current.stairs) {
      var sx = (ROOM_TILES / 2 - 1) * TS;
      var sy = (ROOM_TILES / 2 - 1) * TS;
      onStair = player.x > sx - 2 && player.x < sx + TS * 2 + 2 &&
        player.y > sy - 2 && player.y < sy + TS * 2 + 2;
    }
    if (onStair !== nearStairs) setStairButton(onStair);
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

  function drawDoorway(c, r, dir, x, y) {
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

  function drawLighting(ox, oy) {
    var lctx = lightCanvas.getContext('2d');

    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.fillStyle = 'rgba(4,6,10,0.62)';
    lctx.fillRect(0, 0, W, H);

    lctx.globalCompositeOperation = 'destination-out';
    punchLight(lctx, ox + player.x, oy + player.y - 8, 54);

    for (var i = 0; i < current.torches.length; i++) {
      var t = current.torches[i];
      var flicker = 2 * Math.sin(time * 11 + t.x);
      punchLight(lctx, ox + t.x, oy + t.y - 6, 46 + flicker);
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
      var grad = ctx.createRadialGradient(x, y, 1, x, y, 26);
      grad.addColorStop(0, 'rgba(255,172,92,0.24)');
      grad.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 28, y - 28, 56, 56);
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
      var isCurrent = room === current;
      ctx.fillStyle = isCurrent ? '#6ee7ff' : '#39435a';
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
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

    for (i = 0; i < current.torches.length; i++) {
      items.push({
        y: current.torches[i].y,
        draw: (function (torch) {
          return function () {
            drawTorch(torch, ox + torch.x, oy + torch.y);
          };
        })(current.torches[i])
      });
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

    if (current.stairs) {
      items.push({
        y: (ROOM_TILES / 2) * TS + TS,
        draw: function () {
          drawStairs(ox + (ROOM_TILES / 2 - 1) * TS, oy + (ROOM_TILES / 2 - 1) * TS);
        }
      });
    }

    items.sort(function (a, b) {
      return a.y - b.y;
    });
    for (i = 0; i < items.length; i++) items[i].draw();

    // 门口细节画在墙之后
    for (r = 0; r < ROOM_TILES; r++) {
      for (c = 0; c < ROOM_TILES; c++) {
        if (current.tiles[r][c] !== FLOOR) continue;
        var dir = doorAt(c, r);
        if (dir) drawDoorway(c, r, dir, ox + c * TS, oy + r * TS);
      }
    }

    // 角色永远在最上层
    drawPlayer(ox + player.x, oy + player.y);

    drawWarmGlow(ox, oy);
    drawLighting(ox, oy);
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

    stick.baseX = 44;
    stick.baseY = H - 40;

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
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && menuEl && !menuEl.hidden) {
        event.preventDefault();
        closeMenu();
        return;
      }
      var key = event.key.toLowerCase();
      keys[key] = true;
      if (key.indexOf('arrow') === 0 || key === ' ') event.preventDefault();
    });

    window.addEventListener('keyup', function (event) {
      keys[event.key.toLowerCase()] = false;
    });

    window.addEventListener('blur', function () {
      keys = {};
      stick.active = false;
      stick.id = null;
    });

    canvas.addEventListener('pointerdown', function (event) {
      if (paused) return;
      if (stick.active) return;
      if (event.pointerType === 'mouse') return;
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
      if (btnMenu) btnMenu.setAttribute('aria-expanded', 'false');
      if (window.Lobby && window.Lobby.show) window.Lobby.show();
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
