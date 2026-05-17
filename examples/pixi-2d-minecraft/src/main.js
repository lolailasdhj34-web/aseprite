import * as PIXI from "https://cdn.jsdelivr.net/npm/pixi.js@8.8.1/dist/pixi.mjs";

const TILE_SIZE = 32;
const WORLD_WIDTH = 170;
const WORLD_HEIGHT = 56;
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;
const GRAVITY = 1900;
const MOVE_SPEED = 270;
const JUMP_FORCE = 650;
const REACH = 5.2;

const BLOCKS = {
  air: { id: 0, name: "空气", color: 0x000000, solid: false },
  grass: { id: 1, name: "草方块", color: 0x55aa35, side: 0x7a512d, solid: true },
  dirt: { id: 2, name: "泥土", color: 0x8a5a31, solid: true },
  stone: { id: 3, name: "石头", color: 0x777a82, solid: true },
  wood: { id: 4, name: "木头", color: 0x96602d, solid: true },
  leaves: { id: 5, name: "树叶", color: 0x2f8b41, solid: true },
  sand: { id: 6, name: "沙子", color: 0xd8c26a, solid: true },
  water: { id: 7, name: "水", color: 0x2b87d3, solid: false, liquid: true },
  coal: { id: 8, name: "煤矿", color: 0x2f3035, solid: true },
  copper: { id: 9, name: "铜矿", color: 0xc47d45, solid: true },
};

const HOTBAR = ["grass", "dirt", "stone", "wood", "leaves"];
const idToBlock = new Map(Object.values(BLOCKS).map((block) => [block.id, block]));
const blockToKey = new Map(Object.entries(BLOCKS).map(([key, block]) => [block.id, key]));

const root = document.querySelector("#game-root");
const status = document.querySelector("#status");
const app = new PIXI.Application();

await app.init({
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  resizeTo: root,
  antialias: false,
  backgroundAlpha: 0,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
});

root.appendChild(app.canvas);
app.canvas.addEventListener("contextmenu", (event) => event.preventDefault());

const sky = new PIXI.Graphics();
const worldLayer = new PIXI.Container();
const entityLayer = new PIXI.Container();
const overlayLayer = new PIXI.Container();
const hudLayer = new PIXI.Container();
app.stage.addChild(sky, worldLayer, entityLayer, overlayLayer, hudLayer);

const keys = new Set();
const pointer = { x: 0, y: 0, worldX: 0, worldY: 0, downButton: null };
let world = [];
let placed = 0;
let mined = 0;
let selectedIndex = 0;
let seed = Math.floor(Math.random() * 100000);
let time = 0;
let cameraX = 0;
let cameraY = 0;

const player = {
  x: 14 * TILE_SIZE,
  y: 10 * TILE_SIZE,
  width: 22,
  height: 46,
  vx: 0,
  vy: 0,
  grounded: false,
  sprite: new PIXI.Graphics(),
};
entityLayer.addChild(player.sprite);

const targetBox = new PIXI.Graphics();
overlayLayer.addChild(targetBox);

const crosshair = new PIXI.Graphics();
hudLayer.addChild(crosshair);

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  keys.add(event.code);

  if (/^Digit[1-5]$/.test(event.code)) {
    selectedIndex = Number(event.code.slice(-1)) - 1;
    drawHud();
  }

  if (event.code === "KeyR") {
    seed = Math.floor(Math.random() * 100000);
    generateWorld();
  }
});

window.addEventListener("keyup", (event) => keys.delete(event.code));

app.canvas.addEventListener("pointermove", (event) => {
  const rect = app.canvas.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left) * (app.screen.width / rect.width);
  pointer.y = (event.clientY - rect.top) * (app.screen.height / rect.height);
  updatePointerWorld();
});

app.canvas.addEventListener("pointerdown", (event) => {
  pointer.downButton = event.button;
  editBlock(event.button === 2 ? "place" : "mine");
});

app.canvas.addEventListener("pointerup", () => {
  pointer.downButton = null;
});

app.ticker.add((ticker) => {
  const delta = Math.min(ticker.deltaMS / 1000, 0.033);
  time += delta;
  stepPlayer(delta);
  updateCamera();
  updatePointerWorld();
  drawScene();
  drawHud();
});

generateWorld();

function generateWorld() {
  const heightMap = [];
  const noiseOffset = seed * 0.00091;

  for (let x = 0; x < WORLD_WIDTH; x += 1) {
    const rollingHill = Math.sin(x * 0.12 + noiseOffset) * 4;
    const ridge = Math.sin(x * 0.037 + seed) * 7;
    const detail = seededNoise(x, seed) * 3;
    heightMap[x] = Math.round(24 + rollingHill + ridge + detail);
  }

  world = Array.from({ length: WORLD_HEIGHT }, (_, y) =>
    Array.from({ length: WORLD_WIDTH }, (_, x) => blockAtDepth(x, y, heightMap[x])),
  );

  carveCaves(heightMap);
  plantTrees(heightMap);
  addLake(heightMap);

  const spawnX = 12;
  player.x = spawnX * TILE_SIZE;
  player.y = (heightMap[spawnX] - 3) * TILE_SIZE;
  player.vx = 0;
  player.vy = 0;
  mined = 0;
  placed = 0;
}

function blockAtDepth(x, y, groundY) {
  if (y < groundY) return BLOCKS.air.id;
  if (y === groundY) return x % 23 < 3 ? BLOCKS.sand.id : BLOCKS.grass.id;
  if (y < groundY + 5) return BLOCKS.dirt.id;
  if (seededNoise(x * 3 + y * 17, seed) > 0.82) return BLOCKS.coal.id;
  if (y > groundY + 15 && seededNoise(x * 11 - y * 7, seed) > 0.88) return BLOCKS.copper.id;
  return BLOCKS.stone.id;
}

function carveCaves(heightMap) {
  for (let y = 12; y < WORLD_HEIGHT - 5; y += 1) {
    for (let x = 4; x < WORLD_WIDTH - 4; x += 1) {
      const cave = Math.sin(x * 0.22 + seed) + Math.cos(y * 0.37 - seed * 0.1);
      if (y > heightMap[x] + 5 && cave > 1.42 && seededNoise(x * 19 + y, seed) > 0.38) {
        setTile(x, y, BLOCKS.air.id);
      }
    }
  }
}

function plantTrees(heightMap) {
  for (let x = 8; x < WORLD_WIDTH - 8; x += 9 + Math.floor(seededNoise(x, seed) * 9)) {
    if (world[heightMap[x]]?.[x] !== BLOCKS.grass.id) continue;
    const trunkHeight = 3 + Math.floor(seededNoise(x * 13, seed) * 3);
    for (let y = heightMap[x] - trunkHeight; y < heightMap[x]; y += 1) {
      setTile(x, y, BLOCKS.wood.id);
    }
    for (let ly = heightMap[x] - trunkHeight - 2; ly <= heightMap[x] - trunkHeight + 1; ly += 1) {
      for (let lx = x - 2; lx <= x + 2; lx += 1) {
        if (Math.abs(lx - x) + Math.abs(ly - (heightMap[x] - trunkHeight)) < 4) {
          setTile(lx, ly, BLOCKS.leaves.id);
        }
      }
    }
  }
}

function addLake(heightMap) {
  const center = 42 + Math.floor(seededNoise(seed, seed) * 60);
  const waterY = Math.max(...heightMap.slice(center - 7, center + 8)) - 1;
  for (let x = center - 8; x <= center + 8; x += 1) {
    for (let y = waterY; y <= heightMap[x]; y += 1) {
      setTile(x, y, y === heightMap[x] ? BLOCKS.sand.id : BLOCKS.water.id);
    }
  }
}

function seededNoise(value, salt) {
  const n = Math.sin(value * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function stepPlayer(delta) {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  const jump = keys.has("KeyW") || keys.has("ArrowUp") || keys.has("Space");

  player.vx = (Number(right) - Number(left)) * MOVE_SPEED;
  if (jump && player.grounded) {
    player.vy = -JUMP_FORCE;
    player.grounded = false;
  }

  player.vy += GRAVITY * delta;
  moveAxis("x", player.vx * delta);
  moveAxis("y", player.vy * delta);
}

function moveAxis(axis, amount) {
  player[axis] += amount;
  const bounds = getPlayerBounds();
  const minX = Math.floor(bounds.left / TILE_SIZE);
  const maxX = Math.floor((bounds.right - 1) / TILE_SIZE);
  const minY = Math.floor(bounds.top / TILE_SIZE);
  const maxY = Math.floor((bounds.bottom - 1) / TILE_SIZE);

  player.grounded = axis === "y" && amount > 0 ? false : player.grounded;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!isSolid(x, y)) continue;

      if (axis === "x") {
        if (amount > 0) player.x = x * TILE_SIZE - player.width - 1;
        if (amount < 0) player.x = (x + 1) * TILE_SIZE + 1;
        player.vx = 0;
      } else {
        if (amount > 0) {
          player.y = y * TILE_SIZE - player.height;
          player.grounded = true;
        }
        if (amount < 0) player.y = (y + 1) * TILE_SIZE;
        player.vy = 0;
      }
    }
  }

  player.x = Math.max(TILE_SIZE, Math.min(player.x, WORLD_WIDTH * TILE_SIZE - player.width - TILE_SIZE));
  player.y = Math.min(player.y, WORLD_HEIGHT * TILE_SIZE - player.height);
}

function getPlayerBounds() {
  return {
    left: player.x,
    top: player.y,
    right: player.x + player.width,
    bottom: player.y + player.height,
  };
}

function updateCamera() {
  cameraX = clamp(player.x + player.width / 2 - app.screen.width / 2, 0, WORLD_WIDTH * TILE_SIZE - app.screen.width);
  cameraY = clamp(player.y + player.height / 2 - app.screen.height / 2, 0, WORLD_HEIGHT * TILE_SIZE - app.screen.height);
}

function updatePointerWorld() {
  pointer.worldX = pointer.x + cameraX;
  pointer.worldY = pointer.y + cameraY;
}

function editBlock(mode) {
  const tileX = Math.floor(pointer.worldX / TILE_SIZE);
  const tileY = Math.floor(pointer.worldY / TILE_SIZE);
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const distance = Math.hypot(tileX + 0.5 - playerCenterX / TILE_SIZE, tileY + 0.5 - playerCenterY / TILE_SIZE);
  if (distance > REACH) return;

  if (mode === "mine" && isBreakable(tileX, tileY)) {
    setTile(tileX, tileY, BLOCKS.air.id);
    mined += 1;
  }

  if (mode === "place" && getTile(tileX, tileY) === BLOCKS.air.id && !intersectsPlayer(tileX, tileY)) {
    setTile(tileX, tileY, BLOCKS[HOTBAR[selectedIndex]].id);
    placed += 1;
  }
}

function isBreakable(x, y) {
  const tile = getTile(x, y);
  return tile !== BLOCKS.air.id && tile !== BLOCKS.water.id;
}

function intersectsPlayer(x, y) {
  const block = { left: x * TILE_SIZE, top: y * TILE_SIZE, right: (x + 1) * TILE_SIZE, bottom: (y + 1) * TILE_SIZE };
  const bounds = getPlayerBounds();
  return block.left < bounds.right && block.right > bounds.left && block.top < bounds.bottom && block.bottom > bounds.top;
}

function drawScene() {
  drawSky();
  drawWorld();
  drawPlayer();
  drawTargetBox();
}

function drawSky() {
  const phase = (Math.sin(time * 0.045) + 1) / 2;
  const top = lerpColor(0x0f1832, 0x73b9ff, phase);
  const bottom = lerpColor(0x24324f, 0xb9e8ff, phase);
  sky.clear();
  sky.rect(0, 0, app.screen.width, app.screen.height).fill(top);
  sky.rect(0, app.screen.height * 0.45, app.screen.width, app.screen.height * 0.55).fill({ color: bottom, alpha: 0.78 });

  const sunX = ((time * 22) % (app.screen.width + 180)) - 90;
  const sunY = 92 + Math.sin(time * 0.35) * 28;
  sky.circle(sunX, sunY, 38).fill(0xffe27a);
}

function drawWorld() {
  worldLayer.removeChildren();
  const startX = Math.max(0, Math.floor(cameraX / TILE_SIZE) - 1);
  const endX = Math.min(WORLD_WIDTH - 1, Math.ceil((cameraX + app.screen.width) / TILE_SIZE) + 1);
  const startY = Math.max(0, Math.floor(cameraY / TILE_SIZE) - 1);
  const endY = Math.min(WORLD_HEIGHT - 1, Math.ceil((cameraY + app.screen.height) / TILE_SIZE) + 1);

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const id = getTile(x, y);
      if (id === BLOCKS.air.id) continue;
      const block = idToBlock.get(id);
      const tile = new PIXI.Graphics();
      const screenX = x * TILE_SIZE - cameraX;
      const screenY = y * TILE_SIZE - cameraY;
      tile.rect(screenX, screenY, TILE_SIZE, TILE_SIZE).fill({ color: block.color, alpha: block.liquid ? 0.64 : 1 });
      if (block.side) tile.rect(screenX, screenY + 11, TILE_SIZE, TILE_SIZE - 11).fill(block.side);
      tile.rect(screenX + 2, screenY + 2, TILE_SIZE - 4, 5).fill({ color: 0xffffff, alpha: block.liquid ? 0.16 : 0.1 });
      tile.rect(screenX, screenY, TILE_SIZE, TILE_SIZE).stroke({ color: 0x0b0e14, alpha: 0.18, width: 1 });
      if (id === BLOCKS.coal.id || id === BLOCKS.copper.id) {
        tile.circle(screenX + 10, screenY + 10, 3).fill(block.color === BLOCKS.coal.color ? 0x111216 : 0xffb06c);
        tile.circle(screenX + 22, screenY + 21, 4).fill(block.color === BLOCKS.coal.color ? 0x191a20 : 0xff9b51);
      }
      worldLayer.addChild(tile);
    }
  }
}

function drawPlayer() {
  player.sprite.clear();
  const x = player.x - cameraX;
  const y = player.y - cameraY;
  player.sprite.roundRect(x, y + 12, player.width, player.height - 12, 5).fill(0x2f75d6);
  player.sprite.rect(x + 3, y + 27, 6, 16).fill(0x245099);
  player.sprite.rect(x + 13, y + 27, 6, 16).fill(0x245099);
  player.sprite.roundRect(x + 1, y, player.width - 2, 20, 5).fill(0xffc88d);
  player.sprite.rect(x + 14, y + 8, 3, 3).fill(0x1c2432);
  player.sprite.rect(x + 4, y + 8, 3, 3).fill(0x1c2432);
}

function drawTargetBox() {
  const tileX = Math.floor(pointer.worldX / TILE_SIZE);
  const tileY = Math.floor(pointer.worldY / TILE_SIZE);
  targetBox.clear();
  if (!inBounds(tileX, tileY)) return;
  const playerCenterX = player.x + player.width / 2;
  const playerCenterY = player.y + player.height / 2;
  const distance = Math.hypot(tileX + 0.5 - playerCenterX / TILE_SIZE, tileY + 0.5 - playerCenterY / TILE_SIZE);
  if (distance > REACH) return;
  targetBox.rect(tileX * TILE_SIZE - cameraX, tileY * TILE_SIZE - cameraY, TILE_SIZE, TILE_SIZE).stroke({ color: 0xffffff, alpha: 0.9, width: 3 });
}

function drawHud() {
  hudLayer.removeChildren();
  hudLayer.addChild(crosshair);
  crosshair.clear();
  crosshair.moveTo(pointer.x - 7, pointer.y).lineTo(pointer.x + 7, pointer.y).stroke({ color: 0xffffff, alpha: 0.75, width: 2 });
  crosshair.moveTo(pointer.x, pointer.y - 7).lineTo(pointer.x, pointer.y + 7).stroke({ color: 0xffffff, alpha: 0.75, width: 2 });

  const slotSize = 48;
  const startX = app.screen.width / 2 - (HOTBAR.length * (slotSize + 8)) / 2;
  const y = app.screen.height - 68;
  HOTBAR.forEach((key, index) => {
    const slot = new PIXI.Graphics();
    const x = startX + index * (slotSize + 8);
    slot.roundRect(x, y, slotSize, slotSize, 8).fill({ color: 0x101720, alpha: 0.84 });
    slot.roundRect(x + 8, y + 8, slotSize - 16, slotSize - 16, 4).fill(BLOCKS[key].color);
    if (BLOCKS[key].side) slot.rect(x + 8, y + 23, slotSize - 16, slotSize - 16).fill(BLOCKS[key].side);
    slot.roundRect(x, y, slotSize, slotSize, 8).stroke({ color: index === selectedIndex ? 0xfff176 : 0xffffff, alpha: index === selectedIndex ? 1 : 0.22, width: index === selectedIndex ? 4 : 2 });
    hudLayer.addChild(slot);
  });

  status.innerHTML = `
    <span>当前方块：<strong>${BLOCKS[HOTBAR[selectedIndex]].name}</strong></span>
    <span>已挖掘：${mined}　已放置：${placed}</span>
    <span>世界种子：${seed}</span>
  `;
}

function setTile(x, y, id) {
  if (inBounds(x, y)) world[y][x] = id;
}

function getTile(x, y) {
  if (!inBounds(x, y)) return BLOCKS.stone.id;
  return world[y][x];
}

function isSolid(x, y) {
  const block = idToBlock.get(getTile(x, y));
  return Boolean(block?.solid);
}

function inBounds(x, y) {
  return x >= 0 && x < WORLD_WIDTH && y >= 0 && y < WORLD_HEIGHT;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerpColor(from, to, amount) {
  const ar = (from >> 16) & 255;
  const ag = (from >> 8) & 255;
  const ab = from & 255;
  const br = (to >> 16) & 255;
  const bg = (to >> 8) & 255;
  const bb = to & 255;
  const rr = Math.round(ar + (br - ar) * amount);
  const rg = Math.round(ag + (bg - ag) * amount);
  const rb = Math.round(ab + (bb - ab) * amount);
  return (rr << 16) | (rg << 8) | rb;
}

window.PixiCraftDebug = {
  get worldSeed() {
    return seed;
  },
  get selectedBlock() {
    return blockToKey.get(BLOCKS[HOTBAR[selectedIndex]].id);
  },
  regenerate: generateWorld,
};
