let eventsData     = [];
let alliesData     = {};
let attributesData = {};

let gs = {
  money:      50,
  food:       3,
  health:     3,
  beauty:     3,
  compassion: 3,
  suspicion:  0,
  status:     'Embroidery Maid',

  year:  0,
  ally:  null,
  scandalShieldUsed: false,

  // "intro" | "prep" | "ally" | "event" | "result" | "death" | "end"
  phase: 'intro',

  pendingConsequences: null,
  resultText:   '',
  chosenChoice: -1,
  prepAllocations: {},
  yearStartMoney: 0,
  deathType: null,
  pendingDeathAfterResult: false,
};

// ---- scene stuff
let scenes = {};
let currentScene = null;

function switchScene(name) {
  gs.phase = name;
  currentScene = scenes[name];
  if (currentScene.onEnter) currentScene.onEnter();
}

// ---- palette
const palette = {
  bg: '#8da4a1',
  paper: '#A7BDBB',
  gold: '#7C504F',
  goldLight: '#a66b6a',
  cream: '#f6ebc8',
  red: '#8D1C1C',
  redLight: '#b52828',
  jade: '#4a7c59',
  muted: '#7a5c5c',
};

let startImg       = null;
let killedImg      = null;
let deathSickImg   = null;
let deathFoodImg   = null;
let deathSusImg    = null;
let deathWrongImg  = null;
let bestEndingImg  = null;
let okEndingImg    = null;

// ---- music
let shiqutrack   = null;   // all other scenes
let shouxingtrack = null;  // milestones
let yinmantrack  = null;   // prep phase
let currentTrack = null;

function playTrack(track) {
  if (!track) return;
  if (currentTrack === track) return; // already playing this one
  if (currentTrack && currentTrack.isPlaying()) currentTrack.stop();
  currentTrack = track;
  track.loop();
}

function stopMusic() {
  if (currentTrack && currentTrack.isPlaying()) currentTrack.stop();
  currentTrack = null;
}

function preload() {
  eventsData = loadJSON('events.json');
  alliesData = loadJSON('allies.json');
  attributesData = loadJSON('attributes.json');
  startImg      = loadImage('startpage.jpg');
  killedImg     = loadImage('killed-page.JPG');
  deathSickImg  = loadImage('death-sick.JPG');
  deathFoodImg  = loadImage('death-food.JPG');
  deathSusImg   = loadImage('death-sus.JPG');
  deathWrongImg = loadImage('death-wrong.JPG');
  bestEndingImg = loadImage('best-ending.JPG');
  okEndingImg   = loadImage('ok-ending.JPG');
  shiqutrack = loadSound('shiqu.mp3');
  shouxingtrack = loadSound('shouxing.mp3');
  yinmantrack = loadSound('yinman.mp3');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(displayDensity());
  textFont('Newsreader');

  scenes.intro = new IntroScene();
  scenes.narrative = new NarrativeScene();
  scenes.prep = new PrepScene();
  scenes.ally = new AllyScene();
  scenes.event = new EventScene();
  scenes.result = new ResultScene();
  scenes.death = new DeathScene();
  scenes.end = new EndScene();

  switchScene('intro');
}

function draw() {
  background(palette.bg);
  if (currentScene) currentScene.draw();
}

// ---- Global input routing 
function mousePressed() {
  if (currentScene && currentScene.mousePressed) currentScene.mousePressed();
}

function keyPressed() {
  if (currentScene && currentScene.keyPressed) currentScene.keyPressed(key, keyCode);
}

// ---- Game logic helpers ----
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function applyConsequences(cons) {
  gs.money      = clamp(gs.money      + (cons.money      || 0), 0, 999);
  gs.food       = clamp(gs.food       + (cons.food       || 0), 0, 10);
  gs.health     = clamp(gs.health     + (cons.health     || 0), 0, 10);
  gs.beauty     = clamp(gs.beauty     + (cons.beauty     || 0), 0, 10);
  gs.compassion = clamp(gs.compassion + (cons.compassion || 0), 0, 10);
  gs.suspicion  = clamp(gs.suspicion  + (cons.suspicion  || 0), 0, 10);
}

function applyAllyPassive() {
  if (!gs.ally) return;
  const ally = alliesData[gs.ally];
  if (!ally) return;
  applyConsequences(ally.passive_bonus || {});
}

function checkDeathCondition() {
  if (gs.health     <= 0)  return { type: 'sick',      msg: 'Your health has failed. You pass quietly, far from home.' };
  if (gs.food       <= 0)  return { type: 'food',      msg: 'Hunger claims you before suspicion can. You do not survive the season.' };
  if (gs.suspicion  >= 10) return { type: 'suspicion', msg: 'Your accumulated suspicion has proved fatal. The palace closes around you like a fist.' };
  return null;
}

function resetGS() {
  gs = {
    money: 50, food: 3, health: 3, beauty: 3,
    compassion: 3, suspicion: 0,
    status: 'Embroidery Maid',
    year: 0, ally: null, scandalShieldUsed: false,
    phase: 'intro',
    pendingConsequences: null, resultText: '',
    chosenChoice: -1, prepAllocations: {},
    yearStartMoney: 0, deathType: null, pendingDeathAfterResult: false,
  };
}

function advanceYear() {
  gs.year++;
  if (gs.year >= eventsData.length) { switchScene('end'); return; }
  gs.prepAllocations   = {};
  gs.scandalShieldUsed = false;

  // Annual stat decay
  gs.food = clamp(gs.food - 0.5, 0, 10);
  if (Math.random() < 0.25) gs.health = clamp(gs.health - 1, 0, 10);
  if (Math.random() < 0.25) gs.beauty = clamp(gs.beauty - 1, 0, 10);

  applyAllyPassive();
  const death = checkDeathCondition();
  if (death) { gs.deathType = death.type; gs.resultText = death.msg; switchScene('death'); return; }
  switchScene('prep');
}

function selectChoice(i) {
  const ev = eventsData[gs.year];
  if (i < 0 || i >= ev.choices.length) return;
  const choice               = ev.choices[i];
  gs.chosenChoice            = i;
  gs.pendingConsequences     = choice.consequences;
  gs.resultText              = choice.result;

  // Check for instant condemned death before applying consequences
  if (choice.death_type) {
    gs.deathType = choice.death_type;
    gs.pendingDeathAfterResult = true;
    switchScene('result');
    return;
  }

  applyConsequences(gs.pendingConsequences);
  const allyData = gs.ally ? alliesData[gs.ally] : null;
  if (allyData && allyData.scandal_shield && !gs.scandalShieldUsed && gs.suspicion >= 7) {
    gs.suspicion = max(gs.suspicion - 2, 0);
    gs.resultText += '\n\n[Your ally Ming Yue intervenes, dampening suspicion.]';
    gs.scandalShieldUsed = true;
  }
  const death = checkDeathCondition();
  if (death) { gs.deathType = death.type; gs.resultText = death.msg; switchScene('death'); }
  else switchScene('result');
}

// ---- Shared draw helpers 
function drawPanel(x, y, w, h, alpha) {
  if (alpha === undefined) alpha = 220;
  push();
  let c = color(palette.paper);
  fill(red(c), green(c), blue(c), alpha);
  stroke(palette.gold); strokeWeight(1.5);
  rect(x, y, w, h, 6);
  pop();
}

function goldDivider(x, y, w) {
  push();
  stroke(palette.gold); strokeWeight(1);
  line(x, y, x + w, y);
  fill(palette.gold); noStroke();
  ellipse(x, y, 6, 6);
  ellipse(x + w, y, 6, 6);
  pop();
}

function drawStat(label, value, max, x, y, barW, barH, col) {
  push();
  textFont('Newsreader');
  textSize(15);
  let lw = 80;
  fill(palette.cream); noStroke(); textAlign(LEFT, CENTER);
  text(label, x, y + barH / 2);
  fill(palette.bg); stroke(palette.muted); strokeWeight(0.5);
  rect(x + lw, y, barW, barH, 2);
  noStroke(); fill(col || palette.jade);
  rect(x + lw, y, map(value, 0, max, 0, barW), barH, 2);
  fill(palette.cream); textAlign(RIGHT, CENTER); textSize(14);
  text(value, x + lw + barW - 3, y + barH / 2);
  pop();
}

function wrapText(txt, maxW) {
  let words = String(txt).split(' ');
  let lines = [], line = '';
  for (let w of words) {
    let test = line ? line + ' ' + w : w;
    if (textWidth(test) > maxW) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawHint(msg) {
  push();
  fill(palette.muted); noStroke();
  textFont('Newsreader'); textSize(16);
  textAlign(CENTER, BOTTOM); textStyle(ITALIC);
  text(msg, width / 2, height - 14);
  textStyle(NORMAL);
  pop();
}

function drawOptionRow(numLabel, mainText, subText, x, y, rowW, rowH, dimmed) {
  push();
  fill(dimmed ? '#1e0e0e' : palette.paper);
  stroke(dimmed ? palette.muted : palette.gold);
  strokeWeight(dimmed ? 0.5 : 1);
  rect(x, y, rowW, rowH, 4);

  fill(dimmed ? palette.muted : palette.gold);
  noStroke(); textFont('Newsreader'); textSize(19); textAlign(LEFT, TOP);
  text(numLabel, x + 12, y + (rowH - 20) / 2);

  fill(dimmed ? palette.muted : palette.cream);
  textSize(17); textAlign(LEFT, TOP);
  let lines = wrapText(mainText, rowW - 70);
  let ly = y + 10;
  for (let l of lines) { text(l, x + 52, ly); ly += 18; }

  if (subText) {
    fill(palette.muted); textSize(14);
    let slines = wrapText(subText, rowW - 70);
    for (let l of slines.slice(0, 2)) { text(l, x + 52, ly); ly += 13; }
  }
  pop();
}

class StatPanel {
  constructor(x, y, w, h) { this.x = x; this.y = y; this.w = w; this.h = h; }

  draw() {
    drawPanel(this.x, this.y, this.w, this.h);
    push();
    textFont('Newsreader');
    fill(palette.gold); textSize(15); textAlign(CENTER);
    text('— Stats —', this.x + this.w / 2, this.y + 22);
    const stats = [
      { label: 'Food',       val: gs.food       },
      { label: 'Health',     val: gs.health     },
      { label: 'Beauty',     val: gs.beauty     },
      { label: 'Compassion', val: gs.compassion },
      { label: 'Suspicion',  val: gs.suspicion  },
    ];
    let statY = this.y + 44;
    const gap = 22;
    textSize(13);
    for (let s of stats) {
      fill(palette.muted); textAlign(LEFT, TOP);
      text(s.label, this.x + 12, statY);
      fill(palette.gold); textAlign(RIGHT, TOP);
      text(s.val, this.x + this.w - 12, statY);
      statY += gap;
    }
    statY += 4;
    goldDivider(this.x + 10, statY, this.w - 20);
    statY += 14;
    fill(palette.gold); textSize(13); textAlign(CENTER, TOP);
    text(gs.status, this.x + this.w / 2, statY);
    pop();
  }
}

// --- NPC stuff
class NPCCard {
  constructor(ally, x, y, w, h, num, key) {
    this.ally = ally;
    this.key  = key;   // the alliesData JSON key e.g. "senior_eunuch"
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.num = num;
    this.selected = false;
  }

  draw() {
    push();
    fill(this.selected ? '#3a1a1a' : palette.paper);
    stroke(this.selected ? palette.goldLight : palette.gold);
    strokeWeight(this.selected ? 2 : 1);
    rect(this.x, this.y, this.w, this.h, 6);

    fill(this.selected ? palette.goldLight : palette.gold);
    noStroke(); textFont('Newsreader');
    textSize(17); textAlign(LEFT, TOP);
    text('[' + this.num + ']', this.x + 8, this.y + 8);

    fill(palette.goldLight); textSize(17); textAlign(CENTER, TOP);
    text(this.ally.name, this.x + this.w / 2, this.y + 12);

    fill(palette.muted); textSize(14);
    text(this.ally.role, this.x + this.w / 2, this.y + 30);

    fill(palette.cream); textSize(14); textAlign(LEFT, TOP);
    let lines = wrapText(this.ally.desc, this.w - 16);
    let ly = this.y + 50;
    for (let l of lines) { text(l, this.x + 8, ly); ly += 14; }

    const b = this.ally.passive_bonus || {};
    let bonusParts = [];
    for (let [k, v] of Object.entries(b)) bonusParts.push((v > 0 ? '+' : '') + v + ' ' + k);
    if (bonusParts.length) {
      fill(palette.jade); textSize(13); textAlign(CENTER, TOP);
      text(bonusParts.join(', '), this.x + this.w / 2, ly + 4); ly += 16;
    }
    if (this.ally.scandal_shield) {
      fill(palette.jade); textSize(13); textAlign(CENTER, TOP);
      text('✦ Scandal Shield', this.x + this.w / 2, ly + 4);
    }
    if (this.selected) {
      fill(palette.goldLight); textSize(15); textAlign(CENTER, BOTTOM);
      text('✓ Selected', this.x + this.w / 2, this.y + this.h - 8);
    }
    pop();
  }
}

class Backgrounds {
  static palace() {
    push();
    background('#8da4a1');
    pop();
  }
}

// --- Intro scene
// Press Space to begin
class IntroScene {
  constructor() { this.alpha = 0; }
  onEnter()     { this.alpha = 0; stopMusic(); }

  draw() {
    if (startImg) {
      let imgAspect = startImg.width / startImg.height;
      let canvasAspect = width / height;
      let dw, dh, dx, dy;
      if (canvasAspect > imgAspect) {
        dw = width; dh = width / imgAspect;
      } else {
        dh = height; dw = height * imgAspect;
      }
      dx = (width - dw) / 2;
      dy = (height - dh) / 2;
      image(startImg, dx, dy, dw, dh);
    } else {
      Backgrounds.palace();
    }
  }

  keyPressed(k, kc) { if (k === ' ' || kc === 32) switchScene('narrative'); }
}

// ---- NarrativeScene

// ---- NarrativeScene — multi-page intro with snow wipe transition
class NarrativeScene {
  constructor() {
    this.pages = [
      // Page 1: the setup
      [
        { text: 'Year 1: Yingluo Enters the Forbidden Palace', size: 26, style: 'bold', color: 'gold' },
        { text: '' },
        { text: 'It is the Qing Dynasty, the year of 1741.', size: 19 },
        { text: 'Your name is Wei Yingluo, a 16-year-old girl', size: 19 },
        { text: 'with a sharp mind and nimble hands.', size: 19 },
        { text: '' },
        { text: 'You have entered the Forbidden Palace to find', size: 19 },
        { text: "your sister's murderer. They can be anyone...", size: 19 },
        { text: 'from a fellow embroidery maid to the Emperor himself.', size: 19 },
      ],
      // Page 2: objectives
      [
        { text: 'Your objectives:', size: 22, style: 'bold', color: 'gold' },
        { text: '' },
        { text: '✦  Survive the palace', size: 19 },
        { text: "✦  Find your sister's murderer", size: 19 },
        { text: '✦  Avenge her, and the allies you may make along the way', size: 19 },
      ],
      // Page 3: attributes explanation
      [
        { text: 'Your Attributes', size: 22, style: 'bold', color: 'gold' },
        { text: '' },
        { text: 'At the start of every year, monitor these carefully:', size: 17, color: 'muted' },
        { text: '' },
        { text: 'Status — Your current rank in the palace', size: 17 },
        { text: 'Money — Coins to invest in yourself and your choices', size: 17 },
        { text: 'Food — Too low, and illness finds you first', size: 17 },
        { text: 'Health — Too low, and you may not survive the season', size: 17 },
        { text: 'Beauty — Shapes how others see and treat you', size: 17 },
        { text: 'Compassion — May open doors others cannot', size: 17 },
        { text: 'Suspicion — The higher it rises, the more danger you are in', size: 17 },
        { text: '' },
        { text: 'When certain attributes fall to zero — you will die.', size: 17, color: 'muted', style: 'italic' },
        { text: 'Which ones? That is for you to discover.', size: 17, color: 'muted', style: 'italic' },
      ],
    ];

    this.pageIdx   = 0;
    this.snowflakes = [];
    this.deep      = 0;
    this.wiping    = false;
    this.bgAlpha   = 0;
    this.snowAlpha = 255;
    this.fading    = false;
    this.pageFlipped = false;
  }

  onEnter() {
    this.pageIdx = 0;
    this.wiping  = false;
    this.bgAlpha = 0;
    this.pageFlipped = false;
    this._buildSnow();
    this.deep = height; // pile starts off-screen (no pile yet)
    this.snowAlpha = 255;
    this.fading    = false;
    playTrack(yinmantrack);
  }

  _buildSnow() {
    this.snowflakes = [];
    for (let i = 0; i < 160; i++) {
      this.snowflakes.push({
        x:     random(width),
        y:     random(height),
        speed: random(1, 3),
      });
    }
  }

  _nextPage() {
    if (this.wiping) return;      // already animating
    this.wiping = true;
    this.deep   = height;         // reset pile to bottom so it rises fresh
    this._buildSnow();
  }

  draw() {
    // Background
    Backgrounds.palace();

    // Fade in page text
    if (!this.wiping && this.bgAlpha < 255) this.bgAlpha = min(255, this.bgAlpha + 4);

    // --- draw page text ---
    push();
    drawingContext.globalAlpha = this.bgAlpha / 255;
    textFont('Newsreader');

    const page  = this.pages[this.pageIdx];
    const cx    = width / 2;
    const totalH = page.length * 26;
    let ty = (height - totalH) / 2 - 20;

    for (let line of page) {
      const sz    = line.size  || 19;
      const style = line.style || 'normal';
      const col   = line.color === 'gold'  ? palette.gold
                  : line.color === 'muted' ? palette.muted
                  : palette.cream;

      textSize(sz);
      textStyle(style === 'bold' ? BOLD : style === 'italic' ? ITALIC : NORMAL);
      fill(col); noStroke(); textAlign(CENTER, TOP);
      text(line.text || '', cx, ty);
      ty += sz + 10;
    }

    textStyle(NORMAL);
    drawingContext.globalAlpha = 1;
    pop();

    // --- snow + wipe ---
    if (this.wiping) {
      // falling flakes
      push();
      fill(255); noStroke();
      for (let s of this.snowflakes) {
        circle(s.x, s.y, 4);
        s.y += s.speed;
        if (s.y > this.deep) { s.y = 0; s.x = random(width); }
      }
      // rising snow pile (white rect from bottom)
      fill(255);
      rect(0, this.deep, width, height - this.deep);
      this.deep -= 12;

      if (this.deep <= 0) {
        this.fading = true;      // pile is full, start fading
      }
      pop();
    }

    if (this.fading) {
      // Flip the page as soon as white covers the screen (before fading out)
      if (!this.pageFlipped) {
        this.pageFlipped = true;
        this.pageIdx++;
        if (this.pageIdx >= this.pages.length) {
          gs.prepAllocations   = {};
          gs.scandalShieldUsed = false;
          switchScene('prep');
          return;
        }
        this.bgAlpha = 255; // new page text visible underneath white
      }

      // fade white out to reveal new page
      this.snowAlpha = max(0, this.snowAlpha - 4);
      push();
      fill(255, 255, 255, this.snowAlpha);
      rect(0, 0, width, height);
      pop();

      if (this.snowAlpha <= 0) {
        this.fading      = false;
        this.wiping      = false;
        this.pageFlipped = false;
        this.snowAlpha   = 255;
        this.deep        = height;
        this._buildSnow();
      }
    }

    // hint text
    const isLast = this.pageIdx === this.pages.length - 1;
    drawHint(isLast ? 'Press Space to begin your journey' : 'Press Space to continue');
  }

  keyPressed(k, kc) {
    if (k === ' ' || kc === 32) this._nextPage();
  }
}

// ---- PrepScene 
class PrepScene {
  constructor() { this.statPanel = null; this.opts = []; }

  onEnter() {
    this.statPanel = new StatPanel(width - 210, 60, 190, 195);
    this.opts = [];
    const ev   = eventsData[gs.year];
    const defs = attributesData.options;
    for (let id of ev.prep_options) {
      if (defs[id]) {
        if (!gs.prepAllocations[id]) gs.prepAllocations[id] = 0;
        this.opts.push({ id, def: defs[id] });
      }
    }
    playTrack(yinmantrack);
  }

  _buy(i) {
    const cost = attributesData.cost_per_allocation;
    if (i < 0 || i >= this.opts.length || gs.money < cost) return;
    gs.money -= cost;
    const { id, def } = this.opts[i];
    gs.prepAllocations[id]++;
    for (let [k, v] of Object.entries(def.effect)) {
      if (k === 'money') gs.money = clamp(gs.money + v, 0, 999);
      else if (k in gs)  gs[k]    = clamp(gs[k]    + v, 0, 10);
    }
  }

  draw() {
    Backgrounds.palace();
    this.statPanel.draw();

    const cost  = attributesData.cost_per_allocation;
    const mainW = width - 260;

    push();
    textFont('Newsreader');
    fill(palette.gold); noStroke(); textAlign(CENTER, TOP); textSize(26);
    text('Year ' + (gs.year + 1) + ' — Prepare Yourself', mainW / 2, 28);
    textSize(16); fill(palette.muted);
    text('Each purchase costs ' + cost + ' coins  ·  You have ' + gs.money + ' coins', mainW / 2, 58);
    goldDivider(60, 78, mainW - 80);

    const rowH = 62, rowW = mainW - 120, startX = 60, startY = 96;
    for (let i = 0; i < this.opts.length; i++) {
      const { id, def } = this.opts[i];
      const y        = startY + i * (rowH + 8);
      const canAfford = gs.money >= cost;
      drawOptionRow(
        '[' + (i + 1) + ']',
        def.label + '   ×' + gs.prepAllocations[id],
        def.description,
        startX, y, rowW, rowH,
        !canAfford
      );
    }
    pop();

    drawHint('Press 1–' + this.opts.length + ' to purchase  ·  Space or Enter to continue');
  }

  keyPressed(k, kc) {
    const n = parseInt(k);
    if (!isNaN(n) && n >= 1 && n <= this.opts.length) { this._buy(n - 1); return; }
    if (k === ' ' || kc === 13) switchScene('ally');
  }
}

// ---- AllyScene (counts as prep, keep yinman)
class AllyScene {
  constructor() { this.cards = []; this.selectedIdx = -1; }

  onEnter() {
    this.cards = []; this.selectedIdx = -1;
    const ev    = eventsData[gs.year];
    const pool  = ev.alliance_pool;
    const cw = 175, ch = 240, gap = 18;
    const totalW = pool.length * cw + (pool.length - 1) * gap;
    let sx = (width - totalW) / 2;
    const sy = 150;
    pool.forEach((id, i) => {
      const ally = alliesData[id];
      if (!ally) return;
      const card = new NPCCard(ally, sx, sy, cw, ch, i + 1, id);
      if (gs.ally && id === gs.ally) { card.selected = true; this.selectedIdx = i; }
      this.cards.push(card);
      sx += cw + gap;
    });
    playTrack(yinmantrack); // still prep phase
  }

  _select(i) {
    if (i < 0 || i >= this.cards.length) return;
    this.selectedIdx = i;
    this.cards.forEach((c, j) => c.selected = (j === i));
  }

  draw() {
    Backgrounds.palace();
    push();
    textFont('Newsreader');
    fill(palette.gold); noStroke(); textAlign(CENTER, TOP); textSize(26);
    text('Choose Your Alliance', width / 2, 28);
    textSize(16); fill(palette.muted);
    text('Your ally grants a passive bonus each year and may shield you from scandal.', width / 2, 58);
    goldDivider(80, 78, width - 160);
    pop();
    for (let c of this.cards) c.draw();
    drawHint('Press 1–' + this.cards.length + ' to choose  ·  Space or Enter to confirm');
  }

  keyPressed(k, kc) {
    const n = parseInt(k);
    if (!isNaN(n) && n >= 1 && n <= this.cards.length) { this._select(n - 1); return; }
    if ((k === ' ' || kc === 13) && this.selectedIdx >= 0) {
      gs.ally = this.cards[this.selectedIdx].key;
      switchScene('event');
    }
  }
}

// ---- EventScene 
class EventScene {
  constructor() { this.statPanel = null; }

  onEnter() {
    this.statPanel = new StatPanel(width - 210, 60, 190, 195);
    // milestone years get shouxing, all others get shiqu
    const ev = eventsData[gs.year];
    playTrack(ev.milestone ? shouxingtrack : shiqutrack);
  }

  draw() {
    Backgrounds.palace();
    this.statPanel.draw();

    const ev    = eventsData[gs.year];
    const mainW = width - 260;
    const cx    = mainW / 2;

    push();
    textFont('Newsreader');

    fill(palette.muted); noStroke(); textAlign(LEFT, TOP); textSize(15);
    text('Year ' + (gs.year + 1) + '  ·  Age ' + ev.age, 60, 24);
    if (ev.milestone) {
      fill(palette.gold); textAlign(RIGHT, TOP); textSize(14);
      text('★ MILESTONE', mainW - 10, 24);
    }

    fill(palette.goldLight); textAlign(CENTER, TOP); textSize(28);
    text(ev.title, cx, 44);
    goldDivider(60, 76, mainW - 70);

    fill(palette.cream); textSize(18); textAlign(CENTER, TOP);
    const storyLines = wrapText(ev.story, mainW - 120);
    let ty = 94;
    for (let l of storyLines) { text(l, cx, ty); ty += 22; }

    goldDivider(60, ty + 10, mainW - 70);
    ty += 26;

    const rowH = 56, rowW = mainW - 120;
    for (let i = 0; i < ev.choices.length; i++) {
      drawOptionRow('[' + (i + 1) + ']', ev.choices[i].label, null, 60, ty, rowW, rowH, false);
      ty += rowH + 10;
    }
    pop();

    drawHint('Press 1, 2 or 3 to choose');
  }

  keyPressed(k) {
    const n = parseInt(k);
    if (!isNaN(n) && n >= 1 && n <= 3) selectChoice(n - 1);
  }
}

// ---- ResultScene (keep current track playing)
class ResultScene {
  constructor() { this.alpha = 0; }
  onEnter()     { this.alpha = 0; } // no music change, let current track continue

  draw() {
    Backgrounds.palace();
    if (this.alpha < 255) this.alpha = min(255, this.alpha + 3);

    push();
    drawingContext.globalAlpha = this.alpha / 255;
    textFont('Newsreader');

    const panelW = min(580, width - 120);
    const panelH = 280;
    const px = (width - panelW) / 2;
    const py = (height - panelH) / 2;

    drawPanel(px, py, panelW, panelH);
    fill(palette.gold); noStroke(); textAlign(CENTER, TOP); textSize(21);
    text('What Happened', px + panelW / 2, py + 18);
    goldDivider(px + 20, py + 44, panelW - 40);

    fill(palette.cream); textSize(18); textAlign(CENTER, TOP);
    const lines = wrapText(gs.resultText, panelW - 70);
    let ty = py + 60;
    for (let l of lines) { text(l, px + panelW / 2, ty); ty += 22; }

    if (gs.pendingConsequences) {
      const parts = [];
      for (let [k, v] of Object.entries(gs.pendingConsequences))
        if (v !== 0) parts.push((v > 0 ? '+' : '') + v + ' ' + k);
      if (parts.length) {
        fill(palette.muted); textSize(15); ty += 8;
        text(parts.join('  ·  '), px + panelW / 2, ty);
      }
    }

    drawingContext.globalAlpha = 1;
    pop();

    drawHint('Click anywhere to continue to the next year');
  }

  mousePressed() {
    if (gs.pendingDeathAfterResult) {
      gs.pendingDeathAfterResult = false;
      switchScene('death');
    } else {
      advanceYear();
    }
  }
}

// ---- DeathScene 
class DeathScene {
  constructor() { this.alpha = 0; }
  onEnter() {
    this.alpha = 0;
    stopMusic();
  }

  _img() {
    if (gs.deathType === 'killed')    return killedImg;
    if (gs.deathType === 'condemned') return deathWrongImg;
    if (gs.deathType === 'sick')      return deathSickImg;
    if (gs.deathType === 'food')      return deathFoodImg;
    if (gs.deathType === 'suspicion') return deathSusImg;
    return null;
  }

  draw() {
    const img = this._img();

    if (img) {
      // Image-based death screen
      background(0);
      if (this.alpha < 255) this.alpha = min(255, this.alpha + 3);
      push();
      drawingContext.globalAlpha = this.alpha / 255;
      // Scale image to cover canvas
      let imgAspect    = img.width / img.height;
      let canvasAspect = width / height;
      let dw, dh, dx, dy;
      if (canvasAspect > imgAspect) {
        dw = width; dh = width / imgAspect;
      } else {
        dh = height; dw = height * imgAspect;
      }
      dx = (width - dw) / 2;
      dy = (height - dh) / 2;
      image(img, dx, dy, dw, dh);
      drawingContext.globalAlpha = 1;
      pop();
    }
  }

  keyPressed(k, kc) {
    if (kc === 13) { resetGS(); switchScene('intro'); }
  }
}

// ---- EndScene
class EndScene {
  constructor() { this.alpha = 0; }

  _img() {
    if (gs.suspicion  >= 8)  return deathSusImg;
    if (gs.compassion >= 15) return bestEndingImg;
    return okEndingImg;
  }

  onEnter() { this.alpha = 0; stopMusic(); }

  draw() {
    const img = this._img();
    if (!img) { background(0); return; }
    background(0);
    if (this.alpha < 255) this.alpha = min(255, this.alpha + 3);
    push();
    drawingContext.globalAlpha = this.alpha / 255;
    let imgAspect    = img.width / img.height;
    let canvasAspect = width / height;
    let dw, dh, dx, dy;
    if (canvasAspect > imgAspect) {
      dw = width; dh = width / imgAspect;
    } else {
      dh = height; dw = height * imgAspect;
    }
    dx = (width - dw) / 2;
    dy = (height - dh) / 2;
    image(img, dx, dy, dw, dh);
    drawingContext.globalAlpha = 1;
    pop();
  }

  keyPressed(k, kc) {
    if (kc === 13) { resetGS(); switchScene('intro'); }
  }
}

// ---- Window resize 
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (currentScene && currentScene.onEnter) currentScene.onEnter();
}