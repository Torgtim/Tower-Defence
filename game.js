// ======================================================
//  TORGRIM DEFENSE — FULLSTENDIG GAME.JS
// ======================================================

// ---------------------------
// 1. Grunnvariabler & Tilstand
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

let infiniteMode = false;

// ---------------------------
// 2. Canvas & UI Oppsett
// ---------------------------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Sett fast virtuell oppløsning
canvas.width = 900;
canvas.height = 600;

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

function resizeCanvas() {
    const scale = Math.min(window.innerWidth / 900, window.innerHeight / 600);
    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = "top left";
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// ---------------------------
// 3. Stats & Konfigurasjon
// ---------------------------

const TOWER_TYPES = {
    rifle: { name: "Rifle", range: 130, damage: 9, fireRate: 550, cost: 55, color: "#4fc3f7" },
    shotgun: { name: "Shotgun", range: 85, damage: 20, fireRate: 900, cost: 80, color: "#ffb74d" },
    freeze: { name: "Freeze", range: 110, damage: 3, fireRate: 500, cost: 75, color: "#80deea", slowFactor: 0.35, slowDuration: 2000 }
};

const BARRICADE_TYPES = {
    small: { hp: 70, size: 20, cost: 20 },
    large: { hp: 180, size: 40, cost: 70 },
    tank:  { hp: 350, size: 50, cost: 175 }
};

function getEnemyBaseHp(type) {
    const hp = { grunt: 35, runner: 22, tank: 180, swarm: 12, bruiser: 70, ghost: 40, medic: 45, splitter: 30, bomber: 28 };
    return hp[type] || 30;
}

function getEnemyBaseSpeed(type) {
    const spd = { grunt: 1.0, runner: 2.0, tank: 0.55, swarm: 1.6, bruiser: 0.9, ghost: 1.3, medic: 1.0, splitter: 1.1, bomber: 1.0 };
    return spd[type] || 1.0;
}

function getEnemyDamage(type) {
    const dmg = { tank: 3, runner: 2, bomber: 3, grunt: 1 };
    return dmg[type] || 1;
}

function getEnemyColor(type) {
    const colors = { grunt: "#4caf50", runner: "#ff9800", tank: "#f44336", swarm: "#9c27b0", bruiser: "#795548", ghost: "#88ccff", medic: "#66ff99", splitter: "#ff66cc", bomber: "#ff4444" };
    return colors[type] || "#fff";
}

// ---------------------------
// 4. Pathfinding & Stier
// ---------------------------
const mainPath = [{x:0,y:300},{x:200,y:300},{x:350,y:200},{x:500,y:200},{x:650,y:350},{x:800,y:350},{x:900,y:300}];
const sidePaths = [
    [{x:200,y:300},{x:250,y:400},{x:350,y:400},{x:500,y:300}],
    [{x:500,y:200},{x:550,y:100},{x:700,y:150},{x:800,y:300}]
];

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x1 - x2)**2 + (y1 - y2)**2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function isPathBlocked(path) {
    for (let i = 0; i < path.length - 1; i++) {
        for (const b of barricades) {
            if (distancePointToSegment(b.x, b.y, path[i].x, path[i].y, path[i+1].x, path[i+1].y) < b.size/2 + 5) return true;
        }
    }
    return false;
}

function choosePathForEnemy(enemy) {
    if (!isPathBlocked(mainPath)) { enemy.path = mainPath; enemy.pathIndex = 0; return; }
    for (const sp of sidePaths) {
        if (!isPathBlocked(sp)) { enemy.path = sp; enemy.pathIndex = 0; return; }
    }
    let closest = null, minDist = Infinity;
    barricades.forEach(b => {
        let d = Math.hypot(enemy.x - b.x, enemy.y - b.y);
        if (d < minDist) { minDist = d; closest = b; }
    });
    if (closest) {
        enemy.path = [{x: enemy.x, y: enemy.y}, {x: closest.x, y: closest.y}, ...mainPath.slice(-1)];
        enemy.pathIndex = 0;
    }
}

// ---------------------------
// 5. Spill-logikk (Update)
// ---------------------------

function update(dt) {
    if (playerHealth <= 0) return;

    updateWaveSystem(dt);
    updateEnemies(dt);
    updateTowers(dt);
    updateBullets(dt);
    
    // Oppdater UI tekst
    moneyText.textContent = Math.floor(money);
    waveText.textContent = `Wave: ${currentWaveIndex + (isWaveRunning ? 1 : 0)}`;
}

function updateEnemyMovement(enemy, dt) {
    if (!enemy.path || enemy.pathIndex >= enemy.path.length - 1) {
        const next = (enemy.path && enemy.path[enemy.pathIndex + 1]) || null;
        if (!next) {
            enemy.alive = false;
            damagePlayer(getEnemyDamage(enemy.type));
            return;
        }
    }

    const target = enemy.path[enemy.pathIndex + 1];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 2) {
        enemy.pathIndex++;
        return;
    }

    let speed = enemy.speed;
    if (enemy.slow) {
        enemy.slow.remaining -= dt;
        if (enemy.slow.remaining <= 0) enemy.slow = null;
        else speed *= enemy.slow.factor;
    }

    // Barrikade-interaksjon
    if (enemy.type !== "ghost") {
        for (let i = barricades.length - 1; i >= 0; i--) {
            const b = barricades[i];
            if (Math.hypot(enemy.x - b.x, enemy.y - b.y) < b.size/2 + 10) {
                b.hp -= getEnemyDamage(enemy.type) * 0.05 * dt;
                if (b.hp <= 0) barricades.splice(i, 1);
                speed *= 0.3; // Fienden sakker ned mens han slår
            }
        }
    }

    const move = speed * 0.1 * dt;
    enemy.x += (dx / dist) * move;
    enemy.y += (dy / dist) * move;
}

function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (!e.alive) {
            if (e.type === "splitter") spawnSplitterChildren(e);
            enemies.splice(i, 1);
            totalKills++;
            continue;
        }
        if (e.type === "bomber" && e.hp < e.maxHp * 0.3) {
            bomberExplode(e);
            e.alive = false;
            continue;
        }
        if (e.type === "medic") medicHeal(e, dt);
        updateEnemyMovement(e, dt);
    }
}

function updateTowers(dt) {
    towers.forEach(t => {
        t.lastShot += dt;
        if (t.lastShot < t.fireRate) return;

        let target = null;
        let minDist = t.range;

        enemies.forEach(e => {
            const d = Math.hypot(e.x - t.x, e.y - t.y);
            if (d < minDist) { minDist = d; target = e; }
        });

        if (target) {
            let dmg = t.damage;
            if (target.type === "tank") dmg *= 0.6;
            target.hp -= dmg;
            if (t.slowFactor) applySlowEffect(target, t.slowFactor, t.slowDuration);
            if (target.hp <= 0) { target.alive = false; money += 6; }
            
            bullets.push({ x: t.x, y: t.y, target: target, speed: 0.8 });
            t.lastShot = 0;
        }
    });
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        if (!b.target.alive) { bullets.splice(i, 1); continue; }
        const dx = b.target.x - b.x, dy = b.target.y - b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 10) { bullets.splice(i, 1); continue; }
        const move = b.speed * dt;
        b.x += (dx/dist) * move; b.y += (dy/dist) * move;
    }
}

// ---------------------------
// 6. Rendering (Draw)
// ---------------------------

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Tegn sti (bakgrunn)
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 40;
    ctx.lineJoin = "round";
    ctx.beginPath();
    mainPath.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    drawBarricades();
    drawEnemies();
    drawTowers();
    drawBullets();
}

// (Her bruker vi tegne-funksjonene du allerede hadde, de fungerer fint)

// ---------------------------
// 7. Event Listeners & UI Logikk
// ---------------------------

canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const clickedTower = towers.find(t => Math.hypot(t.x - x, t.y - y) < 20);
    if (clickedTower) { upgradeTower(clickedTower); return; }

    if (selectedBarricadeType) placeBarricade(x, y, selectedBarricadeType);
    else if (selectedTowerType) placeTower(x, y, selectedTowerType);
});

towerMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    selectedTowerType = btn.dataset.tower;
    selectedBarricadeType = null;
    document.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
});

barricadeMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    selectedBarricadeType = btn.dataset.barricade;
    selectedTowerType = null;
    document.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
});

function damagePlayer(amount) {
    playerHealth -= amount;
    updatePlayerHpUI();
    if (playerHealth <= 0) triggerGameOver();
}

function updatePlayerHpUI() {
    const ratio = Math.max(0, playerHealth / maxHealth);
    playerHpBar.style.width = (ratio * 100) + "%";
    playerHpText.textContent = `${Math.ceil(playerHealth)} / ${maxHealth}`;
}

// Start loopen
requestAnimationFrame(gameLoop);

function gameLoop(timestamp) {
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    update(dt || 16);
    draw();
    requestAnimationFrame(gameLoop);
}
