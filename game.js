// ======================================================
//  TORGRIM DEFENSE — GAME.JS
//  BLOKK 2/4 — Grunnvariabler, UI, HP, menyer, pathfinding
// ======================================================

// ---------------------------
// Grunnvariabler
// ---------------------------
let currentWaveIndex = 0;
let isWaveRunning = false;
let isBetweenWaves = true;

let enemies = [];
let towers = [];
let bullets = [];
let barricades = [];

let money = 150;
let totalMoneySpent = 0;
let totalKills = 0;

let selectedTowerType = null;
let selectedBarricadeType = null;

let playerHealth = 50;
let maxHealth = 50;

let pendingSpawns = [];
let spawnTimer = 0;

let unlockedTowers = ["rifle", "shotgun", "freeze"];
let unlockedBarricades = ["small", "large", "tank"];

let infiniteMode = false;

// ---------------------------
// Canvas + UI
// ---------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const waveText = document.getElementById("waveText");
const moneyText = document.getElementById("moneyText");
const startWaveBtn = document.getElementById("startWaveBtn");

const towerMenu = document.getElementById("towerMenu");
const barricadeMenu = document.getElementById("barricadeMenu");

const playerHpBar = document.getElementById("playerHpBar");
const playerHpText = document.getElementById("playerHpText");

const gameOverScreen = document.getElementById("gameOverScreen");
const goWave = document.getElementById("goWave");
const goKills = document.getElementById("goKills");
const goSpent = document.getElementById("goSpent");
const restartBtn = document.getElementById("restartBtn");

// ---------------------------
// Canvas skal skalere pent
// ---------------------------
function resizeCanvas() {
  const scale = Math.min(
    window.innerWidth / 900,
    window.innerHeight / 600
  );
  canvas.style.transform = `scale(${scale})`;
  canvas.style.transformOrigin = "top left";
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------------------------
// HP-bar oppdatering
// ---------------------------
function updatePlayerHpUI() {
  const ratio = Math.max(0, playerHealth / maxHealth);
  playerHpBar.style.width = (ratio * 100) + "%";
  playerHpText.textContent = `${playerHealth} / ${maxHealth}`;
}
updatePlayerHpUI();

// ---------------------------
// Spilleren tar skade
// ---------------------------
function damagePlayer(amount) {
  playerHealth -= amount;
  if (playerHealth < 0) playerHealth = 0;
  updatePlayerHpUI();

  if (playerHealth <= 0) {
    triggerGameOver();
  }
}

// ---------------------------
// GAME OVER SCREEN
// ---------------------------
function triggerGameOver() {
  isWaveRunning = false;
  isBetweenWaves = false;

  goWave.textContent = `Wave nådd: ${currentWaveIndex}`;
  goKills.textContent = `Fiender drept: ${totalKills}`;
  goSpent.textContent = `Penger brukt: ${totalMoneySpent}`;

  gameOverScreen.style.display = "flex";
}

restartBtn.addEventListener("click", () => {
  location.reload();
});

// ---------------------------
// Menyvalg — Tårn
// ---------------------------
towerMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const type = btn.dataset.tower;
  if (!type) return;

  selectedTowerType = type;
  selectedBarricadeType = null;

  // UI highlight
  towerMenu.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  barricadeMenu.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
});

//skulle legge til:
// ======================================================
//  ENEMY VS BARRICADE INTERACTION
// ======================================================

function updateEnemyBarricadeInteraction(enemy, dt) {
  for (let i = barricades.length - 1; i >= 0; i--) {
    const b = barricades[i];

    const dx = enemy.x - b.x;
    const dy = enemy.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Hvis fienden treffer barrikaden
    if (dist < b.size + 10) {

      // Fienden gjør skade på barrikaden
      b.hp -= getEnemyDamage(enemy.type) * 0.05 * dt;

      // Hvis barrikaden ødelegges
      if (b.hp <= 0) {
        barricades.splice(i, 1);
      }

      // Fienden stopper litt opp
      enemy.speed *= 0.4;
      return;
    }
  }
}


// ---------------------------
// Menyvalg — Barrikader
// ---------------------------
barricadeMenu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const type = btn.dataset.barricade;
  if (!type) return;

  selectedBarricadeType = type;
  selectedTowerType = null;

  // UI highlight
  towerMenu.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  barricadeMenu.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
});

// ======================================================
//  PATHFINDING
// ======================================================

// Hovedsti
const mainPath = [
  { x: 0,   y: 300 },
  { x: 200, y: 300 },
  { x: 350, y: 200 },
  { x: 500, y: 200 },
  { x: 650, y: 350 },
  { x: 800, y: 350 },
  { x: 900, y: 300 }
];

// Sideveier
const sidePaths = [
  [
    { x: 200, y: 300 },
    { x: 250, y: 400 },
    { x: 350, y: 400 },
    { x: 500, y: 300 }
  ],
  [
    { x: 500, y: 200 },
    { x: 550, y: 100 },
    { x: 700, y: 150 },
    { x: 800, y: 300 }
  ]
];

// Avstand fra punkt til linjesegment
function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let t = -1;

  if (lenSq !== 0) t = dot / lenSq;
  if (t < 0) return Math.hypot(px - x1, py - y1);
  if (t > 1) return Math.hypot(px - x2, py - y2);

  const projX = x1 + t * C;
  const projY = y1 + t * D;

  return Math.hypot(px - projX, py - projY);
}

// Sjekk om en sti er blokkert av barrikader
function isSegmentBlocked(x1, y1, x2, y2) {
  for (const b of barricades) {
    const dist = distancePointToSegment(b.x, b.y, x1, y1, x2, y2);
    if (dist < b.size) return true;
  }
  return false;
}

function isPathBlocked(path) {
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    if (isSegmentBlocked(p1.x, p1.y, p2.x, p2.y)) return true;
  }
  return false;
}

// Velg sti for fiende
function choosePathForEnemy(enemy) {
  // 1) Prøv hovedstien
  if (!isPathBlocked(mainPath)) {
    enemy.path = mainPath;
    enemy.pathIndex = 0;
    return;
  }

  // 2) Prøv sideveier
  for (const sp of sidePaths) {
    if (!isPathBlocked(sp)) {
      enemy.path = sp;
      enemy.pathIndex = 0;
      return;
    }
  }

  // 3) Alt blokkert → gå til nærmeste barrikade
  let closest = null;
  let closestDist = Infinity;

  for (const b of barricades) {
    const dx = b.x - enemy.x;
    const dy = b.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist) {
      closestDist = dist;
      closest = b;
    }
  }

  if (closest) {
    enemy.path = [
      { x: enemy.x, y: enemy.y },
      { x: closest.x, y: closest.y }
    ];
    enemy.pathIndex = 0;
    enemy.forceBreak = true;
    return;
  }
}

function getNextPathPoint(enemy) {
  const path = enemy.path;
  const index = enemy.pathIndex;
  if (!path || index >= path.length - 1) return null;
  return path[index + 1];
}

function assignPathToEnemy(enemy) {
  choosePathForEnemy(enemy);
  enemy.x = enemy.path[0].x;
  enemy.y = enemy.path[0].y;
}

// ======================================================
//  TORGRIM DEFENSE — GAME.JS
//  BLOKK 3/4 — Fiender, waves, infinite mode, barrikader,
//              tårn, oppgraderinger, freeze-effekter
// ======================================================


// ======================================================
//  ENEMY STATS & ABILITIES
// ======================================================

function getEnemyBaseHp(type) {
  switch (type) {
    case "grunt": return 35;
    case "runner": return 22;
    case "tank": return 180;
    case "swarm": return 12;
    case "bruiser": return 70;
    case "ghost": return 40;     // ignorerer barrikader
    case "medic": return 45;     // healer andre
    case "splitter": return 30;  // spawner 2 swarm
    case "bomber": return 28;    // sprenger barrikader
    default: return 30;
  }
}

function getEnemyBaseSpeed(type) {
  switch (type) {
    case "grunt": return 1.0;
    case "runner": return 2.0;
    case "tank": return 0.55;
    case "swarm": return 1.6;
    case "bruiser": return 0.9;
    case "ghost": return 1.3;
    case "medic": return 1.0;
    case "splitter": return 1.1;
    case "bomber": return 1.0;
    default: return 1.0;
  }
}

function getEnemyDamage(type) {
  switch (type) {
    case "tank": return 3;
    case "runner": return 2;
    case "swarm": return 1;
    case "bruiser": return 2;
    case "ghost": return 2;
    case "medic": return 1;
    case "splitter": return 1;
    case "bomber": return 3;
    case "grunt": return 1;
    default: return 1;
  }
}

function getEnemyColor(type) {
  switch (type) {
    case "grunt": return "#4caf50";
    case "runner": return "#ff9800";
    case "tank": return "#f44336";
    case "swarm": return "#9c27b0";
    case "bruiser": return "#795548";
    case "ghost": return "#88ccff";
    case "medic": return "#66ff99";
    case "splitter": return "#ff66cc";
    case "bomber": return "#ff4444";
    default: return "#fff";
  }
}


// ======================================================
//  WAVES 1–30 + INFINITE MODE
// ======================================================

const waves = [
  { id: 1, enemies: [{ type: "grunt", count: 8, interval: 800 }], reward: 40 },
  { id: 2, enemies: [{ type: "grunt", count: 12, interval: 700 }], reward: 45 },
  { id: 3, enemies: [
      { type: "grunt", count: 10, interval: 650 },
      { type: "runner", count: 3, interval: 900 }
    ], reward: 55 },
  { id: 4, enemies: [
      { type: "grunt", count: 12, interval: 600 },
      { type: "runner", count: 4, interval: 850 }
    ], reward: 70 },
  { id: 5, enemies: [
      { type: "grunt", count: 14, interval: 550 },
      { type: "runner", count: 5, interval: 800 },
      { type: "tank", count: 1, interval: 0 }
    ], reward: 90 },

  // --- Waves 6–10 ---
  { id: 6, enemies: [
      { type: "swarm", count: 20, interval: 220 },
      { type: "grunt", count: 10, interval: 600 }
    ], reward: 100 },
  { id: 7, enemies: [
      { type: "runner", count: 8, interval: 750 },
      { type: "grunt", count: 16, interval: 550 }
    ], reward: 120 },
  { id: 8, enemies: [
      { type: "tank", count: 2, interval: 0 },
      { type: "grunt", count: 18, interval: 500 }
    ], reward: 150 },
  { id: 9, enemies: [
      { type: "swarm", count: 30, interval: 180 },
      { type: "runner", count: 8, interval: 700 }
    ], reward: 180 },
  { id: 10, enemies: [
      { type: "tank", count: 3, interval: 0 },
      { type: "grunt", count: 22, interval: 480 }
    ], reward: 250 },

  // --- Waves 11–20 (nye fiender) ---
  { id: 11, enemies: [
      { type: "bruiser", count: 6, interval: 700 },
      { type: "grunt", count: 12, interval: 500 }
    ], reward: 200 },
  { id: 12, enemies: [
      { type: "medic", count: 4, interval: 900 },
      { type: "runner", count: 10, interval: 650 }
    ], reward: 220 },
  { id: 13, enemies: [
      { type: "splitter", count: 6, interval: 800 },
      { type: "swarm", count: 20, interval: 200 }
    ], reward: 240 },
  { id: 14, enemies: [
      { type: "ghost", count: 6, interval: 900 },
      { type: "grunt", count: 14, interval: 550 }
    ], reward: 260 },
  { id: 15, enemies: [
      { type: "bomber", count: 4, interval: 1000 },
      { type: "tank", count: 2, interval: 0 }
    ], reward: 300 },

  { id: 16, enemies: [
      { type: "runner", count: 12, interval: 650 },
      { type: "bruiser", count: 6, interval: 700 }
    ], reward: 260 },
  { id: 17, enemies: [
      { type: "medic", count: 6, interval: 850 },
      { type: "grunt", count: 20, interval: 450 }
    ], reward: 280 },
  { id: 18, enemies: [
      { type: "ghost", count: 10, interval: 700 },
      { type: "swarm", count: 25, interval: 180 }
    ], reward: 300 },
  { id: 19, enemies: [
      { type: "splitter", count: 10, interval: 700 },
      { type: "runner", count: 10, interval: 650 }
    ], reward: 320 },
  { id: 20, enemies: [
      { type: "tank", count: 4, interval: 0 },
      { type: "bruiser", count: 10, interval: 600 }
    ], reward: 400 },

  // --- Waves 21–30 (kaos) ---
  { id: 21, enemies: [
      { type: "ghost", count: 12, interval: 650 },
      { type: "bomber", count: 6, interval: 900 }
    ], reward: 350 },
  { id: 22, enemies: [
      { type: "medic", count: 10, interval: 800 },
      { type: "swarm", count: 30, interval: 160 }
    ], reward: 360 },
  { id: 23, enemies: [
      { type: "splitter", count: 12, interval: 700 },
      { type: "runner", count: 14, interval: 600 }
    ], reward: 380 },
  { id: 24, enemies: [
      { type: "bruiser", count: 14, interval: 650 },
      { type: "ghost", count: 10, interval: 700 }
    ], reward: 400 },
  { id: 25, enemies: [
      { type: "tank", count: 5, interval: 0 },
      { type: "bomber", count: 8, interval: 850 }
    ], reward: 450 },

  { id: 26, enemies: [
      { type: "swarm", count: 40, interval: 150 },
      { type: "runner", count: 16, interval: 600 }
    ], reward: 420 },
  { id: 27, enemies: [
      { type: "ghost", count: 14, interval: 650 },
      { type: "medic", count: 12, interval: 800 }
    ], reward: 440 },
  { id: 28, enemies: [
      { type: "splitter", count: 16, interval: 650 },
      { type: "bruiser", count: 12, interval: 700 }
    ], reward: 460 },
  { id: 29, enemies: [
      { type: "bomber", count: 10, interval: 800 },
      { type: "tank", count: 6, interval: 0 }
    ], reward: 500 },
  { id: 30, enemies: [
      { type: "tank", count: 8, interval: 0 },
      { type: "ghost", count: 12, interval: 600 },
      { type: "medic", count: 10, interval: 700 }
    ], reward: 600 }
];


// ======================================================
//  INFINITE MODE SKALERING
// ======================================================

function generateInfiniteWave(waveNumber) {
  const scale = 1 + (waveNumber - 30) * 0.12;

  return {
    id: waveNumber,
    enemies: [
      { type: "grunt", count: Math.floor(10 * scale), interval: 600 },
      { type: "runner", count: Math.floor(6 * scale), interval: 700 },
      { type: "swarm", count: Math.floor(25 * scale), interval: 180 },
      { type: "bruiser", count: Math.floor(4 * scale), interval: 800 },
      { type: "ghost", count: Math.floor(4 * scale), interval: 850 },
      { type: "tank", count: Math.floor(2 * scale), interval: 0 }
    ],
    reward: Math.floor(300 * scale)
  };
}


// ======================================================
//  BARRIKADER
// ======================================================

const BARRICADE_TYPES = {
  small: { hp: 70, size: 20, cost: 20 },
  large: { hp: 180, size: 40, cost: 70 },
  tank:  { hp: 350, size: 50, cost: 175 }
};

function placeBarricade(x, y, type) {
  const data = BARRICADE_TYPES[type];
  if (!data) return;
  if (money < data.cost) return;

  barricades.push({
    x,
    y,
    hp: data.hp,
    size: data.size,
    type
  });

  money -= data.cost;
  totalMoneySpent += data.cost;
}


// ======================================================
//  TÅRN + OPPGRADERINGER
// ======================================================

const TOWER_TYPES = {
  rifle: {
    name: "Rifle Tower",
    range: 130,
    damage: 9,
    fireRate: 550,
    cost: 55,
    color: "#4fc3f7"
  },
  shotgun: {
    name: "Shotgun Tower",
    range: 85,
    damage: 20,
    fireRate: 900,
    cost: 80,
    color: "#ffb74d"
  },
  freeze: {
    name: "Freeze Tower",
    range: 110,
    damage: 3,
    fireRate: 500,
    cost: 75,
    color: "#80deea",
    slowFactor: 0.35,
    slowDuration: 2000
  }
};

function placeTower(x, y, type) {
  const data = TOWER_TYPES[type];
  if (!data) return;
  if (money < data.cost) return;

  towers.push({
    x,
    y,
    type,
    range: data.range,
    damage: data.damage,
    fireRate: data.fireRate,
    lastShot: 0,
    slowFactor: data.slowFactor || null,
    slowDuration: data.slowDuration || null,
    level: 1
  });

  money -= data.cost;
  totalMoneySpent += data.cost;
}

function upgradeTower(tower) {
  if (tower.level >= 3) return;

  const upgradeCost = 40 + tower.level * 30;
  if (money < upgradeCost) return;

  tower.level++;
  tower.damage *= 1.3;
  tower.range *= 1.15;
  tower.fireRate *= 0.85;

  money -= upgradeCost;
  totalMoneySpent += upgradeCost;
}


// ======================================================
//  FREEZE-EFFEKT
// ======================================================

function applySlowEffect(enemy, factor, duration) {
  // Runners påvirkes mindre
  if (enemy.type === "runner") {
    factor = 1 - (1 - factor) * 0.5;
  }
  // Swarm påvirkes mer
  if (enemy.type === "swarm") {
    factor = 1 - (1 - factor) * 1.5;
    if (factor < 0.2) factor = 0.2;
  }

  if (!enemy.slow) {
    enemy.slow = { factor, remaining: duration };
  } else {
    enemy.slow.factor = factor;
    enemy.slow.remaining = duration;
  }
}

// ======================================================
//  TORGRIM DEFENSE — GAME.JS
//  BLOKK 4/4 — Fiende-AI, bomber, splitter, healing,
//              tårn-skyting, rendering, game loop
// ======================================================


// ======================================================
//  ENEMY MOVEMENT + SPECIAL ABILITIES
// ======================================================

function updateEnemyMovement(enemy, dt) {
  const next = getNextPathPoint(enemy);

  // Hvis fienden står fast for lenge → velg ny sti
if (!enemy.lastPos) enemy.lastPos = { x: enemy.x, y: enemy.y, timer: 0 };

const movedDist = Math.hypot(enemy.x - enemy.lastPos.x, enemy.y - enemy.lastPos.y);

if (movedDist < 0.5) {
  enemy.lastPos.timer += dt;

  // 500 ms uten bevegelse = STUCK
  if (enemy.lastPos.timer > 500) {
    choosePathForEnemy(enemy); // tving ny sti
    enemy.lastPos.timer = 0;
  }
} else {
  // fienden beveger seg normalt
  enemy.lastPos.x = enemy.x;
  enemy.lastPos.y = enemy.y;
  enemy.lastPos.timer = 0;
}


  // Nådd enden → skade spiller
  if (!next) {
    enemy.alive = false;
    const dmg = getEnemyDamage(enemy.type);
    damagePlayer(dmg);
    return;
  }

  const dx = next.x - enemy.x;
  const dy = next.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) {
    enemy.pathIndex++;
    return;
  }

  // Slow-effekt
  let speed = enemy.speed;
  if (enemy.slow) {
    enemy.slow.remaining -= dt;
    if (enemy.slow.remaining <= 0) {
      enemy.slow = null;
    } else {
      speed *= enemy.slow.factor;
    }
  }

  // Ghost ignorerer barrikader
  if (enemy.type !== "ghost") {
    updateEnemyBarricadeInteraction(enemy, dt);
  }

  const move = speed * 0.1 * dt;
  enemy.x += (dx / dist) * move;
  enemy.y += (dy / dist) * move;
}


// ======================================================
//  SPECIAL ENEMY BEHAVIOR
// ======================================================

// Bomber → sprenger barrikader
function bomberExplode(enemy) {
  for (let i = barricades.length - 1; i >= 0; i--) {
    const b = barricades[i];
    const dx = enemy.x - b.x;
    const dy = enemy.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < b.size + 20) {
      b.hp -= 200; // massiv skade
      if (b.hp <= 0) barricades.splice(i, 1);
    }
  }
}

// Splitter → spawner 2 swarm
function spawnSplitterChildren(enemy) {
  for (let i = 0; i < 2; i++) {
    const child = {
      type: "swarm",
      hp: getEnemyBaseHp("swarm"),
      maxHp: getEnemyBaseHp("swarm"),
      speed: getEnemyBaseSpeed("swarm"),
      alive: true,
      path: enemy.path,
      pathIndex: enemy.pathIndex,
      x: enemy.x + (Math.random() * 10 - 5),
      y: enemy.y + (Math.random() * 10 - 5),
      slow: null,
      forceBreak: false
    };
    enemies.push(child);
  }
}

// Medic → healer nærmeste fiende
function medicHeal(enemy, dt) {
  let closest = null;
  let closestDist = 80;

  for (const e of enemies) {
    if (e === enemy || !e.alive) continue;

    const dx = e.x - enemy.x;
    const dy = e.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist) {
      closestDist = dist;
      closest = e;
    }
  }

  if (closest) {
    closest.hp = Math.min(closest.maxHp, closest.hp + 0.03 * dt);
  }
}


// ======================================================
//  ENEMY UPDATE LOOP
// ======================================================

function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];

    if (!e.alive) {
      // Splitter dør → spawn små fiender
      if (e.type === "splitter") {
        spawnSplitterChildren(e);
      }
      enemies.splice(i, 1);
      totalKills++;
      continue;
    }

    // Bomber → eksploderer når HP lav
    if (e.type === "bomber" && e.hp < e.maxHp * 0.3) {
      bomberExplode(e);
      e.alive = false;
      enemies.splice(i, 1);
      continue;
    }

    // Medic → healer
    if (e.type === "medic") {
      medicHeal(e, dt);
    }

    updateEnemyMovement(e, dt);
  }
}


// ======================================================
//  TOWER SHOOTING + BULLETS
// ======================================================

function updateTowers(dt) {
  for (const t of towers) {
    t.lastShot += dt;
    if (t.lastShot < t.fireRate) continue;

    let target = null;
    let closestDist = Infinity;

    for (const e of enemies) {
      const dx = e.x - t.x;
      const dy = e.y - t.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= t.range && dist < closestDist) {
        closestDist = dist;
        target = e;
      }
    }

    if (target) {
      let dmg = t.damage;

      // Tank tar mindre skade
      if (target.type === "tank") dmg *= 0.6;

      target.hp -= dmg;

      if (t.slowFactor) {
        applySlowEffect(target, t.slowFactor, t.slowDuration);
      }

      if (target.hp <= 0) {
        target.alive = false;
        money += 6;
      }

      bullets.push({
        x: t.x,
        y: t.y,
        target: target,
        speed: 0.6
      });

      t.lastShot = 0;
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const e = b.target;

    if (!e || !e.alive) {
      bullets.splice(i, 1);
      continue;
    }

    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      bullets.splice(i, 1);
      continue;
    }

    const speed = b.speed * dt;
    b.x += (dx / dist) * speed;
    b.y += (dy / dist) * speed;
  }
}


// ======================================================
//  WAVE SYSTEM + INFINITE MODE
// ======================================================

function startWave() {
  if (isWaveRunning) return;

  // Infinite mode
  if (currentWaveIndex >= waves.length) {
    infiniteMode = true;
    const newWave = generateInfiniteWave(currentWaveIndex + 1);
    waves.push(newWave);
  }

  const wave = waves[currentWaveIndex];

  isWaveRunning = true;
  isBetweenWaves = false;

  pendingSpawns = [];
  for (const group of wave.enemies) {
    for (let i = 0; i < group.count; i++) {
      pendingSpawns.push({
        type: group.type,
        interval: group.interval
      });
    }
  }

  pendingSpawns.sort(() => Math.random() - 0.5);
  spawnTimer = 0;
}

startWaveBtn.addEventListener("click", startWave);

function spawnEnemy(type) {
  const enemy = {
    type,
    hp: getEnemyBaseHp(type),
    maxHp: getEnemyBaseHp(type),
    speed: getEnemyBaseSpeed(type),
    alive: true,
    path: null,
    pathIndex: 0,
    x: 0,
    y: 0,
    slow: null,
    forceBreak: false
  };

  assignPathToEnemy(enemy);
  enemies.push(enemy);
}

function updateWaveSystem(dt) {
  if (!isWaveRunning) return;

  if (pendingSpawns.length > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const next = pendingSpawns.shift();
      spawnEnemy(next.type);
      spawnTimer = next.interval;
    }
  }

  if (pendingSpawns.length === 0 && enemies.length === 0) {
    endWave();
  }
}

function endWave() {
  const wave = waves[currentWaveIndex];

  isWaveRunning = false;
  isBetweenWaves = true;

  money += wave.reward;

  currentWaveIndex++;
}


// ======================================================
//  RENDERING
// ======================================================

function drawEnemies() {
  for (const e of enemies) {
    ctx.fillStyle = getEnemyColor(e.type);
    ctx.beginPath();
    ctx.arc(e.x, e.y, 12, 0, Math.PI * 2);
    ctx.fill();

    // HP-bar
    const barWidth = 26;
    const barHeight = 4;
    const hpRatio = Math.max(0, e.hp / e.maxHp);
    const barX = e.x - barWidth / 2;
    const barY = e.y - 20;

    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = "#4caf50";
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

    // Name tag
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(e.type, e.x, barY - 3);
  }
}

function drawBarricades() {
  for (const b of barricades) {
    ctx.fillStyle =
      b.type === "small" ? "#ffaa00" :
      b.type === "large" ? "#ff4444" :
      "#66aaff";

    ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
  }
}

function drawTowers() {
  for (const t of towers) {
    const data = TOWER_TYPES[t.type];
    ctx.fillStyle = data.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 12 + (t.level - 1) * 2, 0, Math.PI * 2);
    ctx.fill();

    // Range circle
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
    ctx.stroke();

    // Level text
    ctx.fillStyle = "#fff";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("L" + t.level, t.x, t.y + 3);
  }
}

function drawBullets() {
  for (const b of bullets) {
    if (!b.target || !b.target.alive) continue;

    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.target.x, b.target.y);
    ctx.stroke();
  }
}


// ======================================================
//  GAME LOOP
// ======================================================

function update(dt) {
  updateWaveSystem(dt);
  updateEnemies(dt);
  updateTowers(dt);
  updateBullets(dt);

  waveText.textContent = currentWaveIndex;
  moneyText.textContent = money;
  startWaveBtn.style.display = isBetweenWaves ? "block" : "none";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawEnemies();
  drawBarricades();
  drawTowers();
  drawBullets();
}

let lastTime = 0;
function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ======================================================
//  CANVAS CLICK HANDLING (TÅRN + BARRIKADER + OPPGRADERING)
// ======================================================

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // Klikk på tårn → oppgrader
  const clickedTower = towers.find(t => {
    const dx = t.x - x;
    const dy = t.y - y;
    return Math.sqrt(dx * dx + dy * dy) <= 14;
  });

  if (clickedTower) {
    upgradeTower(clickedTower);
    return;
  }

  // Plasser barrikade
  if (selectedBarricadeType) {
    placeBarricade(x, y, selectedBarricadeType);
    return;
  }

  // Plasser tårn
  if (selectedTowerType) {
    placeTower(x, y, selectedTowerType);
    return;
  }
});
