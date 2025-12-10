// ======================================================
// AUDIO & SCHEDULING GLOBALS
// ======================================================
let audioContext; // Web Audio API context
let audioContextwithoffset; // Web Audio API context
let bongoBuffer; // Sound buffer for bongo hit
let trackBuffer; // Sound buffer for background music
let metroBuffer; // Sound buffer for metronome tick
let musicSrc; // Background track audio source
let beatQueue = []; // Array of subdivision durations
let dotMap = []; // Maps to dice indices and pip positions {dieIdx, pip}
let subdivisionTimes = []; // Exact timing for each beat
let volumeMap = []; // Volume level for each beat (1 = play, 0 = silent)
let activeBongoSources = []; // Track active bongo sounds for cleanup
let visualIndex = 0; // Current visual marker position
let animationId; // Animation frame ID for visual updates
let countdownAnimId; // Animation frame ID for countdown
let isPlaying = false; // Playback state
let metronomeonly = true; // Whether to play only metronome (no music)
let waitForStart = true; // Whether to wait for the 4 starts before playing music
let metroCount = -1; // for the metronome hit
let dieElements = [];
let pattern = [];

// ======================================================
// INTERACTIVITY GLOBALS
// ======================================================
const hitWindow = 0.12; // Timing window for hit detection (seconds)
let nextBeatIndex = 0; // Next expected beat to hit
let judgementEl = document.getElementById("judgement"); // Visual feedback element
let BlockMaxNumber = 6;

// ======================================================

const bongo_play = (function () {
  let toggle = false; // Tracks which frame to show

  return function () {
    const bongoElement = document.getElementById("bongo");

    if (!bongoElement) {
      console.error("Bongo element not found!");
      return;
    }

    const frames = [
      "assets/imgs/bongo/bongo-idle-ezgif.com-resize.png",
      "assets/imgs/bongo/bongo-l-ezgif.com-resize.png",
      "assets/imgs/bongo/bongo-r-ezgif.com-resize.png",
    ];

    // Alternate between left and right paw frames
    bongoElement.src = toggle ? frames[1] : frames[2];

    // Flip toggle for next call
    toggle = !toggle;

    // Return to idle after 50ms
    setTimeout(() => {
      bongoElement.src = frames[0];
    }, 150);
  };
})();

// ======================================================
// PLAYBACK PARAMETERS
// ======================================================
let bpm; // Beats per minute
let offset = 0.085; //ing offset
let crotchet = 0; // Duration of a beat in seconds
let listening = true; // Whether to play bongos on hits

class Conductor {
  constructor(bpm, offset = 0, audioContext) {
    this.bpm = bpm; // beats per minute
    this.offset = offset; // start offset in seconds
    this.audioContext = audioContext;
    this.startTime = 0; // when the music starts
    this.isPlaying = false;

    // Calculate crotchet from BPM
    this.crotchet = 60 / bpm; // duration of a beat in seconds
  }

  // Update BPM and recalculate crotchet
  setBPM(newBPM) {
    this.bpm = newBPM;
    this.crotchet = 60 / newBPM;
    console.log(
      `BPM updated to ${newBPM}, crotchet = ${this.crotchet.toFixed(3)}s`,
    );
  }

  // Getter for seconds per beat (optional, same as crotchet)
  get secondsPerBeat() {
    return this.crotchet;
  }
}

let conductor = new Conductor(bpm, offset, audioContext, crotchet);

// ======================================================
// LOAD SONG DATA
// ======================================================
let songData;
fetch("assets/temp/pattern(30).mjson")
  .then((res) => res.json())
  .then((data) => {
    console.log("Loaded song data:", data);
    songData = data;
    pattern = data.dicePattern;
    conductor.setBPM(data.bpm);

    renderPattern(pattern); // draw the UI
    buildTimingTables(pattern); // prep your queues
    document.getElementById("bpm-ui").value = songData.bpm;

    quarterText.innerText = "= " + conductor.bpm + " Bpm";
    const first16 = Array.from(container.children).slice(0, 16);

    const anim = gsap.from(first16, {
      y: 15,
      opacity: 0,
      duration: 0.3,
      stagger: 0.025,
      paused: true, // don’t start immediately
    });

    anim.play(); // start the animation
  })
  .catch((err) => {
    console.error("Failed to load JSON", err);
  });

// ======================================================
// CONSTANTS
// ======================================================
// Die color mapping
let dieColors = {};
let rootStyles = getComputedStyle(document.documentElement);
function updateDieColors() {
  rootStyles = getComputedStyle(document.documentElement);
  for (let i = 1; i <= 6; i++) {
    dieColors[i] = rootStyles.getPropertyValue(`--face-${i}-color`).trim();
  }
}

console.log(dieColors);

// Pip order per die face
const pipOrder = {
  1: [0], // One dot in center
  2: [0, 1], // Two dots
  3: [1, 0, 2], // Three dots
  4: [0, 2, 1, 3], // Four dots
  5: [0, 1, 2, 3, 4], // Four dots
  6: [0, 1, 2, 3, 4, 5], // Four dots
};

// ======================================================
// UI ELEMENTS
// ======================================================
const countdownElement = document.getElementById("countdown");
const countdownDots = countdownElement.querySelectorAll(".dot");
const title = document.getElementById("title");
const titleLabels = ["1", "2", "Ready!", "Go!"];
// AUDIO ELEMENTS

let BongoSoundPath = "assets/audio/Bongos/Bongo.wav";
let MetroSoundPath = "assets/audio/Metronomes/Percussion.wav";

class SoundFX {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {}; // store decoded audio buffers
  }

  // preload multiple sounds at once
  async load(sounds) {
    const entries = Object.entries(sounds);
    const promises = entries.map(async ([name, url]) => {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(data);
      this.buffers[name] = buffer;
    });
    await Promise.all(promises);
  }

  // play by name
  play(name, options = {}) {
    const buffer = this.buffers[name];
    if (!buffer) {
      console.warn(`Sound "${name}" not loaded yet.`);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Default options
    const {
      volume = 1.0,
      detune = 0, // in cents
      randomPitch = true,
      minPitch = 0.9,
      maxPitch = 1,
      loop = false,
    } = options;

    // Apply slight random pitch variation
    if (randomPitch) {
      const pitch = Math.random() * (maxPitch - minPitch) + minPitch;
      source.playbackRate.value = pitch;
    } else {
      source.playbackRate.value = 1.0;
    }

    source.detune.value = detune;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    // Loop option
    source.loop = loop;

    source.start(0);
  }
}

const fx = new SoundFX();
function getCurrentLyric(lyrics, currentTime) {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      return lyrics[i].text;
    }
  }
  return ""; // before first lyric
}
const originalLyrics = [
  { time: 23.46, text: "You got exactly what you want" },
  { time: 26.42, text: "I got exactly what I wanna be" },
  { time: 29.57, text: "I was inspired not to cut" },
  { time: 33.11, text: "When you told me that you wanna see" },
  { time: 35.87, text: "I've a tube inside my arm" },
  { time: 38.58, text: "I've always struggled with my honesty" },
  { time: 41.90, text: "But now I'm honest like I'm abe" },
  { time: 44.87, text: "4am I'm on an odyssey" },
  { time: 48.60, text: "I got your beat down to the pulse" },
  { time: 51.23, text: "You're in the red like all the cars I see" },
  { time: 54.52, text: "Break new ground I blam the blunt" },
  { time: 57.62, text: "I get clocked like its a job to me" },
  { time: 60.33, text: "Beat Blocks" },
  { time: 67.08, text: "PUSH UR T3MPRR" },
  { time: 68.56, text: "Beat Blocks" },
  { time: 73.61, text: "PUSH UR T3MPRR" },
  { time: 74.94, text: "Beat Blocks" },
  { time: 79.46, text: "PUSH UR T3MPRR" },
  { time: 80.98, text: "Beat Blocks" },
  { time: 85.76, text: "PUSH UR T3MPRR" },
  { time: 87.53, text: "Beat Blocks" },
  { time: 99.06, text: "I got a guy and we're best friends" },
  { time: 100.35, text: "I hope we get to kill ourselves together" },
  { time: 103.38, text: "Grab me by the hips and flip the switch and lose your temper" },
  { time: 106.13, text: "People never change, but skin will rot in any weather" },
  { time: 109.03, text: "Come with me lets play pretend, I know you'll feel great" },
  { time: 112.04, text: "It's not cause I don't like you, I don't wanna see your face" },
  { time: 114.78, text: "Bitch I do not miss you, I miss how you used to taste" },
  { time: 118.33, text: "Put your cigs out on my tummy, smoke 3 packs a day" },
  { time: 121.40, text: "I'm just here to push your temper, put me in my grave" },
  { time: 124.27, text: "" },
  { time: 129.12, text: "Push your temper" },
  { time: 130.62, text: "Beat Blocks" },
  { time: 135.33, text: "Push your temper" },
  { time: 136.83, text: "Beat Blocs" },
  { time: 141.59, text: "Push your temper" },
  { time: 143.06, text: "Beat Blocks" },
  { time: 147.93, text: "Push your temper" },
  { time: 148.67, text: "Beat Blocks" }
];


const splitLyrics = [];

originalLyrics.forEach(lyric => {
  if (!lyric.text) return; // skip empty lines
  const words = lyric.text.split(" ");
  const chunkDuration = 0.387; // time added per 2-word chunk
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words
      .slice(i, i + 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)) // capitalize each word
      .join(" ");
    splitLyrics.push({
      time: lyric.time +2+ (i / 2) * chunkDuration, // use chunk index
      text: chunk
    });
  }
});






// Example usage in an update loop:
function updateLyricsDisplay() {
  const currentTime = audioContext.currentTime;
  const lyric = getCurrentLyric(splitLyrics, currentTime);

  // Only update if lyric is not empty
  if (lyric && lyric.trim() !== "") {
    console.log(lyric); // for debugging
    title.innerText = lyric;
  }

  requestAnimationFrame(updateLyricsDisplay);
}




fx.load({
  add_block: "assets/audio/fx/Editor/78060__sugu14__fustapla07.wav",
  remove_block: "assets/audio/fx/Editor/78059__sugu14__fustapla06.wav", // example of adding more
  click: "assets/audio/fx/UI/click.wav",
}).then(() => {
  console.log("All sounds loaded!");
});

function getBongoSoundPath(name) {
  switch (name) {
    case "Ping Pong":
      return "assets/audio/Bongos/PingPong.wav";
      break;
    case "Bongo":
      return "assets/audio/Bongos/Bongo.wav";
      break;
    case "Bongo 2":
      return "assets/audio/Bongos/Bongo2.wav";
      break;
    case "Drum":
      return "assets/audio/Bongos/drum.wav";
      break;
  }
}

function getMetroSoundPath(name) {
  switch (name) {
    case "Original":
      return "assets/audio/Metronomes/Original.wav";
    case "Percussion":
      return "assets/audio/Metronomes/Percussion.wav";
    case "Electronic":
      return "assets/audio/Metronomes/Electronic.wav";
    case "Classic":
      return "assets/audio/Metronomes/Classic.wav";
    default:
      console.warn("Unknown metronome type:", name);
      return ""; // or a fallback path
  }
}

// ======================================================
// MAIN GAME CONTROL
// ====================================================
//

const icon = document.getElementById("play-icon");

function play() {
  if (isPlaying) {
    resetGame();
    nextHittime = 0;
    icon.classList.remove("fa-stop");
    icon.classList.add("fa-play");
    return;
  }

  renderPattern(pattern);

  scrollChildToCenter(
    pattern.startPos != null
      ? document.querySelector(
          `.die-wrapper .item[data-index='${pattern.startPos}']`,
        )
      : document.querySelector(".die-wrapper .item"),
    container,
  );
  icon.classList.remove("fa-play");
  icon.classList.add("fa-stop");
  startPlayback(pattern.startPos || 0);
  quarterText.innerText = " = " + conductor.bpm + " Bpm";
  updateLyricsDisplay();
}

// ======================================================
// AUDIO INITIALIZATION
// ======================================================

async function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    BongoSoundPath = getBongoSoundPath(window.GameSettings.hitsoundType);
    // Later, when you need it:
    MetroSoundPath = getMetroSoundPath(window.GameSettings.metronomeType);

    // Load metronome and bongo sounds (essential)
    const [bongoData, metronomeData] = await Promise.all([
      fetch(BongoSoundPath).then((r) => r.arrayBuffer()),
      fetch(MetroSoundPath).then((r) => r.arrayBuffer()),
    ]);

    // Decode audio data
    bongoBuffer = await audioContext.decodeAudioData(bongoData);
    metroBuffer = await audioContext.decodeAudioData(metronomeData);

    // Attempt to load and decode background track
    let trackData,
      trackLoadSuccess = false;
    try {
      trackData = await fetch(songData.songPath).then((r) => r.arrayBuffer());
      trackBuffer = await audioContext.decodeAudioData(trackData);
      trackLoadSuccess = !!trackBuffer;
    } catch (trackErr) {
      console.warn(
        "Track failed to load or decode. Falling back to metronome-only mode.",
      );
      trackBuffer = null;
    }

    // Check if essential sounds loaded successfully
    if (bongoBuffer && metroBuffer) {
      console.log(
        "Essential audio loaded. Track:",
        trackLoadSuccess ? "Loaded" : "Missing",
      );
      return true;
    } else {
      console.error("Failed to load essential audio (bongo or metronome).");
      return false;
    }
  } catch (error) {
    console.error("Error loading or decoding audio:", error);
    return false;
  }
}

// ======================================================
// DIE FACE RENDERING
// ======================================================
const faceClasses = {
  1: "first-face",
  2: "second-face",
  3: "third-face",
  4: "fourth-face",
  5: "fifth-face",
  6: "sixth-face",
};

function createJudgementEl() {
  const span = document.createElement("span");

  span.classList.add("hidden");
  span.classList.add("judgement");
  span.textContent = "Perfect!";
  return span;
}

function repaintDieFace(dieEl) {
  const value = Number(dieEl.dataset.value);

  // Clear classes and content
  dieEl.className = `item grey`; //removed grey
  dieEl.classList.add(faceClasses[value] || "first-face", "die-face-flip");
  if (dieEl.dataset.bpmChange) {
    dieEl.classList.add("speed-up");
  }
  if (dieEl.dataset.auto === "true" || dieEl.dataset.auto === true) {
    dieEl.classList.add("auto-block");
  }

  const faceTemplate = document.getElementById(`face-${value}`);
  if (faceTemplate) {
    while (dieEl.firstChild) {
      dieEl.removeChild(dieEl.firstChild);
    }

    dieEl.appendChild(faceTemplate.content.cloneNode(true));
    /*  dieEl.style.boxShadow = `inset 0 0 0 1px ${dieColors[dieEl.dataset.value]}`; */
    const judgement = createJudgementEl();

    if (!dieEl.classList.contains("auto-block")) {
      dieEl.appendChild(judgement);
    }
  } else {
    console.warn(`No template found for die face ${value}`);
  }

  const dots = dieEl.querySelectorAll(".dot");
  try {
    const soundMap = JSON.parse(dieEl.dataset.soundmap || "[]");
    pipOrder[value].forEach((pipIndex, j) => {
      if ((soundMap[j] ?? 1) === 0) {
        dots[pipIndex].classList.add("silent");
      }
    });
  } catch (e) {
    console.error("Error parsing soundmap:", e);
  }
  let soundMap;
  try {
    soundMap = JSON.parse(dieEl.dataset.soundmap || "[]");
    // If soundmap is empty or wrong length, create default for this value
    if (soundMap.length !== pipOrder[value].length) {
      soundMap = new Array(pipOrder[value].length).fill(1);
      dieEl.dataset.soundmap = JSON.stringify(soundMap);
    }
  } catch (e) {
    console.error("Error parsing soundmap:", e);
    soundMap = new Array(pipOrder[value].length).fill(1);
    dieEl.dataset.soundmap = JSON.stringify(soundMap);
  }
}

// ======================================================
// DICE MANAGEMENT
// ======================================================
function addListenersToDice(die, i) {
  let pressTimer = null;
  let longPressed = false;
  let startX, startY;
  const longDelay = 500; // ms
  const moveThresh = 10; // px

  // fired when the long‑press actually “completes”
  function onLongPress() {
    longPressed = true;
    console.log("Long press on die", i);

    openDotEditorForBlock(die); // Open dot editor for this die
  }

  // start tracking
  function startPress(e) {
    longPressed = false;
    // grab initial coords
    if (e.type === "touchstart") {
      e.preventDefault(); // needed so that touchmove isn’t passive
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else {
      startX = e.clientX;
      startY = e.clientY;
    }
    // schedule the long‑press
    pressTimer = setTimeout(onLongPress, longDelay);
  }

  // cancel if too early or too much movement
  function cancelPress() {
    clearTimeout(pressTimer);
  }

  function movePress(e) {
    let currX, currY;
    if (e.type === "touchmove") {
      currX = e.touches[0].clientX;
      currY = e.touches[0].clientY;
    } else {
      currX = e.clientX;
      currY = e.clientY;
    }
    // if moved more than threshold, it’s not a long‑press
    if (Math.hypot(currX - startX, currY - startY) > moveThresh) {
      cancelPress();
    }
  }

  // after touch/mouse ends, clear timer (or release click block)
  function endPress(e) {
    cancelPress();
  }

  // “click”/tap handler — skip if longPressed fired
  function handleClick(e) {
    if (longPressed) {
      e.preventDefault();
      return;
    }
    if (isPlaying) {
      return;
    }
    // your tap logic:
    let v = Number(die.dataset.value) || 1;
    const newValue = (v % BlockMaxNumber) + 1;
    die.dataset.value = newValue;

    repaintDieFace(die);
    openDotEditorForBlock(die);
    pattern[i].value = newValue;
    pattern[i].soundMap = JSON.parse(die.dataset.soundmap);
  }

  function startPress(e) {
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    pressTimer = setTimeout(onLongPress, longDelay);
  }

  die.style.touchAction = "none";
  die.addEventListener("pointerdown", startPress);
  die.addEventListener("pointermove", movePress);
  die.addEventListener("pointerup", endPress);
  die.addEventListener("pointercancel", endPress);
  die.addEventListener("click", handleClick);
}
let currentEditorDice;
const sidebar = document.getElementById("side");
const modal = document.getElementById("restModal");
const preview = document.getElementById("preview");

const sidebarTitle = document.getElementById("sidebar-block-title");

function openDotEditorForBlock(die) {
  currentEditorDice = die;
  repaintDieFace(die);

  preview.innerHTML = "";
  const row = document.getElementById("restDotInputs");
  row.innerHTML = "";
  updateSideBar(die);

  const diemap = JSON.parse(die.dataset.soundmap);

  const i = Number(die.dataset.index);

  diemap.forEach((val, dotIndex) => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(val);
    checkbox.classList.add("dot-checkbox");
    checkbox.addEventListener("change", () => {
      // 4a) Update the diemap array
      diemap[dotIndex] = checkbox.checked ? 1 : 0;
      // 4b) Write it back to the DOM
      die.dataset.soundmap = JSON.stringify(diemap);
      pattern[i].soundMap = diemap;
      renderPattern(pattern);
      repaintDieFace(die);
      updateSideBar(die);
    });

    row.appendChild(checkbox);
  });

  sidebar.classList.add("open-side");
  modal.classList.remove("hidden");
}

function updateSideBar(die) {
  preview.innerHTML = "";

  const clone = die.cloneNode(true);

  const value = clone.dataset.value;
  if (!value || !(value in dieColors)) {
    console.warn("Invalid or missing die value:", value);
    return;
  }

  clone.classList.add(`die-face-${value}`);
  sidebarTitle.innerText = `Options for Block #${Number(die.dataset.index) + 1}`;
  preview.appendChild(clone);
}

function addDice() {
  if (isPlaying) {
    return;
  }
  const container = document.getElementById("dice-container");
  let i = container.children.length;

  const wrapper = document.createElement("div");
  wrapper.classList.add("die-wrapper");

  const die = document.createElement("div");
  die.classList.add("item", "grey", `die${i + 1}`);
  die.dataset.index = i;
  die.dataset.value = 1;
  die.dataset.soundmap = "[1]";

  pattern.push({
    value: 1,
    soundMap: [1],
  });
  console.log(pattern);
  repaintDieFace(die);
  addListenersToDice(die, i);
  openDotEditorForBlock(die);

  wrapper.appendChild(die);
  container.appendChild(wrapper);
  fx.play("add_block");
  setTimeout(() => {
    scrollChildToCenter(die, container);
  }, 50);
  gsap
    .fromTo(
      wrapper,
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 0.145 },
    )
    .delay(0.05);
}

function removeDice() {
  if (isPlaying) return;
  const container = document.getElementById("dice-container");

  // Find the last die that hasn't been marked for removal
  let lastDie = null;
  for (let i = container.children.length - 1; i >= 0; i--) {
    const die = container.children[i];
    if (!die.dataset.removing) {
      lastDie = die;
      break;
    }
  }

  if (!lastDie) return;

  // Mark this die as being removed
  lastDie.dataset.removing = "true";

  // Animate fade-out + upward motion immediately
  gsap.to(lastDie, {
    opacity: 0,
    y: -20,
    duration: 0.145,
    onComplete: () => {
      // Only remove if still a child
      if (container.contains(lastDie)) {
        container.removeChild(lastDie);
        pattern.pop();
      }
    },
  });

  // Play sound immediately with slight pitch variation
  fx.play("remove_block", { randomPitch: true });
}

// ======================================================
// BEAT GENERATION
// ======================================================
const container = document.getElementById("dice-container");
function renderPattern(pattern) {
  // Clear container
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  pattern.forEach((note, i) => {
    const wrapper = document.createElement("div");
    wrapper.classList.add("die-wrapper");

    const die = document.createElement("div");

    die.dataset.index = i;
    die.dataset.value = note.value;
    die.dataset.soundmap = JSON.stringify(note.soundMap);
    die.dataset.bpmChange = note.bpmChange || "";
    die.dataset.auto = note.auto || false;
    // If this note has startPos true, add class 'start-pos'
    if (note.startPos === true) {
      console.log("start pos true for die", i);
    }

    repaintDieFace(die);
    addListenersToDice(die, i);

    wrapper.appendChild(die);
    container.appendChild(wrapper);
  });

  dieElements = Array.from(document.querySelectorAll(".item"));
}
let actualBeats = [];
function buildTimingTables(pattern, start) {
  beatQueue.length =
    dotMap.length =
    volumeMap.length =
    subdivisionTimes.length =
      0;
  let time = start;
  let tcrotchet = conductor.secondsPerBeat;
  let found_pos = false;
  pattern.forEach((note, i) => {
    const steps = pipOrder[note.value];
    if (note.bpmChange) {
      tcrotchet = 60 / note.bpmChange;
      console.log("BPM change to", note.bpmChange, "Crotchet now", tcrotchet);
    }
    steps.forEach((pip, j) => {
      beatQueue.push(4 * note.value);
      dotMap.push({ dieIdx: i, pip });
      volumeMap.push(note.soundMap[j] ?? 1);

      subdivisionTimes.push(time);

      if (note.soundMap[j] === 1 && note.auto !== true) {
        actualBeats.push(time);
      }
      if (i === pattern.startPos && !found_pos && pattern.startPos != 0) {
        startPosOffset = time - offset;
        console.log("auto block at", time);
        found_pos = true;
      }
      time += tcrotchet / steps.length;
    });
  });
  console.log(subdivisionTimes);
}

// ======================================================
// AUDIO PLAYBACK
// ======================================================
function playBongoAt(time, volume) {
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  gainNode.gain.value = (volume * window.GameSettings.hitsoundVolume) / 50;

  source.buffer = bongoBuffer;

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(time);

  source.onended = () => {
    activeBongoSources = activeBongoSources.filter((s) => s !== source);
  };

  activeBongoSources.push({
    source,
    gainNode,
    scheduledTime: time,
    hit: false,
    canceled: false,
  });
}

function playMetroAt(time, volume = window.GameSettings.metronomeVolume / 50) {
  metroCount++;
  //triggerAnimation(quarterIcon, 'bounce-flash');
  const source = audioContext.createBufferSource();
  source.buffer = metroBuffer;

  const gainNode = audioContext.createGain();
  let adjustedVolume = volume;
  let playbackRate = 1.0;

  if (metroCount > 4) {
    if ((metroCount - 4) % 4 === 0) {
      adjustedVolume = volume * 2;
      playbackRate = 1.2; // Speed up every 4th beat after the first 4
    }
  }

  gainNode.gain.value = adjustedVolume;
  source.playbackRate.value = playbackRate;

  source.connect(gainNode).connect(audioContext.destination);
  source.start(time);
}

// ======================================================
// PLAYBACK CONTROL
// ======================================================
let startPosOffset = 0;
async function startPlayback(startIndex = 0) {
  if (isPlaying) return;
  isPlaying = true;
  // Initialize audio if needed
  if (!audioContext) {
    await initAudio();
  }
  if (audioContext.state === "suspended") await audioContext.resume();

  conductor.setBPM(document.getElementById("bpm-ui").value);

  console.log(
    "Starting playback at index:",
    pattern.startPos,
    "with BPM:",
    conductor.bpm,
    "Crotchet duration:",
    conductor.crotchet,
  );

  // Reset playback state

  nextBeatIndex = startIndex;

  const now = audioContext.currentTime;
  offset = window.GameSettings.offset / 1000; // Convert ms to seconds
  // Play countdown ticks
  for (let i = 0; i < 4; i++) {
    playMetroAt(now + i * crotchet, window.GameSettings.metronomeVolume / 50);
  }
  if (pattern.startPos != null) {
    metroCount = (pattern.startPos || 0 % 4) - 1; // Reset metroCount to start position
  } else {
    metroCount = -1; // Reset metroCount to -1 if no startPos
  }

  // Schedule background track
  const trackStart = now + 4 * conductor.crotchet;

  let time = trackStart + offset;
  buildTimingTables(pattern, time);
  if (trackBuffer) {
    musicSrc = audioContext.createBufferSource();
    musicSrc.buffer = trackBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0.4;
    musicSrc.connect(gainNode).connect(audioContext.destination);
    musicSrc.start(trackStart, startPosOffset); // now for instant and
  }

  // Calculate exact timing for each subdivision

  worker.postMessage({
    type: "init",
    data: {
      subdivisionTimes, // Array of beat times in audioContext.currentTime units
      dotMap,
      volumeMap,
      hitWindow, // e.g., 0.05s = 50ms window
    },
  });

  if (!window.GameSettings.playHitsoundsOnHit) {
    subdivisionTimes.forEach((t, i) => {
      const volume = volumeMap[i % volumeMap.length];
      if (volume) {
        if (t >= startPosOffset) {
          const when = t - startPosOffset - offset;
          playBongoAt(when, volume);
        }
      }
    });
  }

  countdown();

  if (metronomeonly) {
    startMetronome(conductor.bpm);
  }

  // Start visual animations
  visualIndex = 0;
  cancelAnimationFrame(animationId);

  animationId = requestAnimationFrame(update);
}

function calculateStartPosOffset(startPos) {
  let PosOffset = 0;
  let local_crotchet = conductor.crotchet;

  for (let i = 0; i < startPos && i < pattern.length; i++) {
    const note = pattern[i];
    PosOffset += local_crotchet;
    if (note.bpmChange) {
      local_crotchet = 60 / note.bpmChange;
      console.log(
        "BPM change to",
        note.bpmChange,
        "Crotchet now",
        local_crotchet,
      );
    }
  }

  console.log("returning at", PosOffset);
  return PosOffset;
}
// ======================================================
// VISUAL FEEDBACK
// ======================================================
function countdown() {
  let count = -1;
  const start = audioContext.currentTime;
  const end = start + 4 * conductor.crotchet;

  // Reset countdown UI
  countdownDots.forEach((dot) => dot.classList.remove("active"));
  title.innerText = titleLabels[0];

  function step() {
    const now = audioContext.currentTime;
    const beat = Math.floor((now - start) / conductor.crotchet);

    // Update UI when crossing a beat boundary
    if (beat !== count && beat >= 0 && beat < countdownDots.length) {
      countdownDots[beat].classList.add("active");
      title.innerText = titleLabels[beat];
      count = beat;
    }

    // Continue animation or cleanup
    if (now < end) {
      countdownAnimId = requestAnimationFrame(step);
    } else {
      title.innerText = songData.title || "Beat Blocks";
      countdownDots.forEach((dot) => dot.classList.remove("active"));
      cancelAnimationFrame(countdownAnimId);
    }
  }

  step();
}
let newTime = 0;
const quarterIcon = document.getElementById("quarter-note-icon");
const quarterText = document.getElementById("quarter-p");
// Setup animation reset once

quarterIcon.addEventListener("animationend", () => {
  quarterIcon.classList.remove("bounce-flash");
});

// Trigger animation on each beat
function triggerAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force reflow
  element.classList.add(className);
}

let nextHittime = 0;
function update() {
  if (visualIndex >= subdivisionTimes.length) {
    console.log("All beats processed, stopping update.");
    cancelAnimationFrame(animationId);
    stopMetronome();
    return;
  }

  const startPos = startPosOffset;
  const now = audioContext.currentTime + startPos; // Adjust for startPosOffset

  if (now > nextHittime) {
    nextHittime += conductor.crotchet;
    quarterText.innerText = "= " + conductor.bpm + " Bpm";
    triggerAnimation(quarterIcon, "bounce-flash");
    // Animate the element with ID container-bg
  }

  checkForMissedBeats(now);
  updateVisuals();
  animationId = requestAnimationFrame(update);
}
// When initializing
// Outer-scope cache variables (declare somewhere appropriate)
let dotElementsMap = null; // will be an array-of-arrays: dotElementsMap[dieIdx][pip]
let maxIterationsPerUpdate = 30; // tune as needed

function cacheDotElements(dieElements) {
  // dieElements may be NodeList or Array
  const dies = Array.from(dieElements);
  dotElementsMap = dies.map((die) => Array.from(die.querySelectorAll(".dot")));
}

function setDieFaceClass(dieEl, faceValue) {
  // Normalize faceValue to integer 1..6
  const v = Math.min(6, Math.max(1, Number(faceValue) || 1));

  // Fast-exit if same face already applied (cached)
  if (dieEl.__lastFace === v) return;

  // Remove previous face class if present
  const prev = dieEl.__lastFace;
  if (prev) dieEl.classList.remove(`die-face-${prev}`);

  // Add new face class
  dieEl.classList.add(`die-face-${v}`);
  // Optionally keep dataset in sync
  dieEl.dataset.face = String(v);

  // Cache for future comparisons (very cheap)
  dieEl.__lastFace = v;
}

function updateVisuals() {
  const startPos = pattern.startPos != null ? pattern.startPos : 0;
  const now = audioContext.currentTime + (startPosOffset || 0); // Adjust for startPosOffset

  // Nothing to process
  if (visualIndex >= subdivisionTimes.length) return;

  // Ensure dot cache exists (fallback)
  if (!dotElementsMap) cacheDotElements(dieElements);

  // Batches for writes / decisions
  const dotsToActivate = [];
  const facesToApply = new Map(); // dieElement -> faceValue
  const judgeTimes = [];
  let scrollCandidate = null;

  // Pre-read container rect once (if scrolling is used)
  const containerRect = container ? container.getBoundingClientRect() : null;
  const containerCenter = containerRect
    ? (containerRect.top + containerRect.bottom) / 2
    : null;

  // dieRects cache this call to avoid repeated reads
  const dieRects = new Map();

  let iterations = 0;
  while (
    visualIndex < subdivisionTimes.length &&
    now >= subdivisionTimes[visualIndex] &&
    iterations < maxIterationsPerUpdate
  ) {
    const displayIndex = visualIndex % dotMap.length;

    // defensive: skip if dotMap weird
    if (displayIndex >= dotMap.length) {
      visualIndex++;
      iterations++;
      continue;
    }

    const { dieIdx, pip } = dotMap[displayIndex];
    const dieElement = dieElements[dieIdx];
    if (!dieElement) {
      visualIndex++;
      iterations++;
      continue;
    } else {
      console.log("Die element found for index", dieIdx);
      if (dieElement.dataset.bpmChange) {
        console.log("BPM change to", dieElement.dataset.bpmChange);
        conductor.setBPM(dieElement.dataset.bpmChange);
        console.log("Crotchet now", conductor.crotchet);

        stopMetronome();
      }

     

    }
    // Prefer cached dots; if cache missing for this die (rare), fall back and populate
    let dotsForDie = dotElementsMap && dotElementsMap[dieIdx];
    if (!dotsForDie) {
      dotsForDie = Array.from(dieElement.querySelectorAll(".dot"));
      if (!dotElementsMap) dotElementsMap = [];
      dotElementsMap[dieIdx] = dotsForDie;
    }

    const dotEl = dotsForDie && dotsForDie[pip] ? dotsForDie[pip] : null;
    if (dotEl) dotsToActivate.push(dotEl);

    // Defer reading value/decide face class and write later
    const dieValue = Number(dieElement.dataset.value) || 1;
    // queue face assignment (only write-phase will actually toggle class)
    facesToApply.set(dieElement, dieValue);

    // Decide scrolling once per die this batch (read once)
    if (containerRect) {
      if (!dieRects.has(dieIdx)) {
        dieRects.set(dieIdx, dieElement.getBoundingClientRect());
      }
      const dieRect = dieRects.get(dieIdx);
      const dieCenter = dieRect.top + dieRect.bottom;
      if (Math.abs(dieCenter - containerCenter) > containerRect.height * 0.5) {
        scrollCandidate = dieElement;
      }
    }

    visualIndex++;
    iterations++;
  }

  // --------- WRITE PHASE (batched) ----------
  // 1) Activate dot classes (avoid repeated classList writes)
  for (const d of dotsToActivate) {
    if (!d.classList.contains("active")) d.classList.add("active");
  }

  // 2) Apply face classes (only when changed) using the cached __lastFace
  for (const [dieEl, faceValue] of facesToApply.entries()) {
    setDieFaceClass(dieEl, faceValue);
  }

  // 3) Single scroll per update (if necessary)
  if (scrollCandidate && typeof scrollChildToCenter === "function") {
    scrollChildToCenter(scrollCandidate, container);
  }

  // 4) Call judgeHit after writes (keeps reads/writes separated)
  if (listening && typeof judgeHit === "function") {
    for (const t of judgeTimes) {
      judgeHit(t);
    }
  }

  // If we still have backlog (missed many beats), schedule another micro-batch
  if (
    visualIndex < subdivisionTimes.length &&
    now >= subdivisionTimes[visualIndex]
  ) {
    requestAnimationFrame(() => updateVisuals());
  }
}

function scrollChildToCenter(child, container) {
  const parent = child.parentElement;
  if (!parent || !container) return;

  const containerRect = container.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  const scrollTop = container.scrollTop;
  const offset = parentRect.top - containerRect.top;
  const centerOffset =
    offset - containerRect.height / 2 + parentRect.height / 2;

  const targetScroll = scrollTop + centerOffset;

  container.scrollTo({
    top: targetScroll,
    behavior: "smooth",
  });
}

// ======================================================
// ANIMATION HELPERS
// ======================================================
function triggerAnimation(element, className) {
  element.classList.remove(className);

  // Force reflow (reset animation)
  void element.offsetWidth;
  element.classList.add(className);
}

// ======================================================
// HIT DETECTION & FEEDBACK
// ======================================================
// Assuming you already have audioContext
const worker = new Worker("judgeHit.worker.js");

// Init worker

let showMs = false;
// Store timelines per element
const hitTimelines = new WeakMap();

function triggerHitAnimation(element) {
  let tl = hitTimelines.get(element);

  if (!tl) {
    // Create a new timeline for this element
    tl = gsap.timeline({ paused: true });
    tl.to(element, { scale: 1.15, duration: 0.09, ease: "power1.out" }).to(
      element,
      { scale: 1, duration: 0.21, ease: "power1.in" },
    );

    // Save it for future reuse
    hitTimelines.set(element, tl);
  }

  // Restart the animation
  tl.restart();
}

worker.onmessage = (e) => {
  const { type, dieIdx, pip, offset } = e.data;
  showMs = window.GameSettings.showOffsetCheckbox;
  const dieElement = dieElements[dieIdx];
  if (!dieElement) return;
  const dotElements = dieElement.querySelectorAll(".dot");

  if (type === "finished") {
    console.log("Finished sequence");
    return;
  }

  const offsetMs = offset.toFixed(2) + " ms";

  if (type === "silentHit") {
    triggerAnimation(dotElements[pip], "hit");
    nextBeatIndex++;
    return;
  }

  if (type === "perfect") {
    // if(window.GameSettings.playHitsoundsOnHit){
    //    playBongoAt(audioContext.currentTime, window.GameSettings.hitsoundVolume / 50);
    // }
    triggerAnimation(dotElements[pip], "hit");
    triggerHitAnimation(dieElement);
    showJudgement(dieElement, showMs ? offsetMs : "Perfect!", "#ffffff");

    // Only play bongo if listening AND dieElement has children
    const hasJudgement = dieElement.querySelector(".judgement");

    if (listening && hasJudgement) {
      bongo_play();
    }

    nextBeatIndex++;
  } else if (type === "good") {
    triggerAnimation(dotElements[pip], "hit");
    triggerHitAnimation(dieElement);
    showJudgement(dieElement, showMs ? offsetMs : "Good!", "#a8e6cf");
    if (listening) bongo_play();
    nextBeatIndex++;
  } else if (type === "ok") {
    triggerAnimation(dotElements[pip], "hit");
    triggerHitAnimation(dieElement);
    showJudgement(dieElement, showMs ? offsetMs : "Ok!", "#ffd3b6");
    if (listening) bongo_play();
    nextBeatIndex++;
  } else if (type === "miss") {
    showJudgement(dieElement, showMs ? offsetMs : "Miss!", "#ff8b94");
  }
};

// On input
function judgeHit(audioTime) {
  offset = audioTime;
  if (!listening) {
    while (volumeMap[nextBeatIndex % volumeMap.length] === 0) {
      nextBeatIndex++;
    }
  }

  worker.postMessage({
    type: "hit",
    data: { offset, nextBeatIndex, expected: subdivisionTimes[nextBeatIndex] },
  });
}

function showJudgement(dieEl, text, color) {
  if (window.GameSettings.showJudgement === false) return;
  const el = dieEl.querySelector(".judgement");
  if (!el) return;

  // Update content & color
  el.textContent = text;
  el.style.color = color;

  // Make visible if you hide with `.hidden` (display:none)
  el.classList.remove("hidden");

  // Cancel previously scheduled frames/timeouts if any
  if (el._sj_raf) cancelAnimationFrame(el._sj_raf);
  if (el._sj_raf2) cancelAnimationFrame(el._sj_raf2);
  if (el._sj_to) {
    clearTimeout(el._sj_to);
    el._sj_to = null;
  }

  // Remove animation class to reset to base .judgement state
  el.classList.remove("float-up");

  // Helper to actually start the animation using double RAF (most reliable)
  const start = () => {
    // cleanup when animation ends (remove class so element is back to base state)
    const onEnd = () => {
      el.classList.remove("float-up");
      // no need to remove listener manually because we use { once: true }
    };
    el.addEventListener("animationend", onEnd, { once: true });

    // double RAF ensures browser observes the state flip before adding the animation class
    el._sj_raf = requestAnimationFrame(() => {
      el._sj_raf2 = requestAnimationFrame(() => {
        el.classList.add("float-up");
        el._sj_raf = el._sj_raf2 = null;
      });
    });
  };

  // If element is not in layout (offsetWidth === 0 — often because of display:none),
  // give a tiny timeout so layout happens before forcing the animation.
  if (el.offsetWidth === 0) {
    el._sj_to = setTimeout(() => {
      void el.offsetWidth; // extra reflow safety
      start();
      el._sj_to = null;
    }, 20);
  } else {
    // normal path: force a reflow and start immediately
    void el.offsetWidth;
    start();
  }
}

function lowerBound(sortedArr, target, lo = 0, hi = sortedArr.length) {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedArr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
// ======================================================
// MISSED BEAT HANDLER
// ======================================================
function checkForMissedBeats(currentTime) {
  const cutoff = currentTime - hitWindow; // Adjusted cutoff for missed beats
  // clamp lo to valid range; assume nextBeatIndex initially 0
  const newIndex = lowerBound(
    subdivisionTimes,
    cutoff,
    Math.max(0, nextBeatIndex),
    subdivisionTimes.length,
  );
  // only move forward (avoid accidental backward jumps)
  nextBeatIndex = Math.max(nextBeatIndex, newIndex);
}

let last = performance.now();
let frameCount = 0;
let fps = 0;
let lastFpsUpdate = performance.now();

function tick() {
  const now = performance.now();
  frameCount++;
  const delta = now - last;
  last = now;

  if (now - lastFpsUpdate >= 1000) {
    fps = (frameCount * 1000) / (now - lastFpsUpdate);
    console.log(fps.toFixed(1));
    frameCount = 0;
    lastFpsUpdate = now;
  }

  requestAnimationFrame(tick);
}

tick();

// ======================================================
// GAME RESET
// ======================================================
function resetGame() {
  // Stop all audio
  if (musicSrc) musicSrc.stop();
  stopMetronome();
  activeBongoSources.forEach((source) => {
    try {
      source.source.stop();
    } catch (e) {
      /* already stopped */
    }
  });

  audioContext.close().then(() => {
    console.log("AudioContext killed.");
    audioContext = null;
  });

  // Cancel animations
  cancelAnimationFrame(animationId);
  cancelAnimationFrame(countdownAnimId);

  // Reset state
  metroCount = -1;
  subdivisionTimes = [];
  beatQueue = [];
  isPlaying = false;
  nextBeatIndex = 0;
  visualIndex = 0;
  newTime = 0;
  // Reset visual elements
  document
    .querySelectorAll(".dot")
    .forEach((dot) => dot.classList.remove("active", "hit"));
  document
    .querySelectorAll("#dice-container .item")
    .forEach((die) => die.classList.add("item-inactive"));

  // Clear judgment display
  judgementEl.innerText = "";
  judgementEl.classList.remove("pop");
}

// ======================================================
// KEYBOARD CONTROLS
// ======================================================
document.body.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  const key = event.key === " " ? "Space" : event.key;

  // Check if key is in user-defined keybinds
  if (window.GameSettings?.keybinds?.includes(key)) {
    event.preventDefault();

    judgeHit(audioContext.currentTime);
    if (window.GameSettings.playHitsoundsOnHit) {
      playBongoAt(
        audioContext.currentTime,
        window.GameSettings.hitsoundVolume / 50,
      );
    }

    return;
  }

  // Other hardcoded keys
  if (event.key.toLowerCase() === "r") {
    resetGame();
  }
  if (event.key.toLowerCase() === "l") {
    listenMode();
  }
  if (event.key === "Escape") {
    closeSidebar();
  }
  if (event.key === "Enter") {
    play();
  }
  if (event.key.toLowerCase() === "d") {
    hide_nav();
  }
  if (event.key.toLowerCase() === "g") {
const glow = document.querySelector(".glow");

gsap.fromTo(
  glow,
  { y: 0, opacity: 0 },  // starting state
  { 
    y: -50, 
    opacity: 0.6,           // peak state
    duration: 0.2,        // slightly longer duration
    yoyo: true,
    repeat: 1,
    ease: "power2.Out"  // smoother easing
  }
);

  }


});
function hide_nav() {
  const diceUI = document.getElementsByClassName("dice-ui")[0];
  diceUI.classList.toggle("hidden"); // hide/show each click
}

// Optimized phone tap support
const drummingArea = document.getElementById("drumming-area");

// Pre-create and reuse ripple elements
const ripplePool = [];
const POOL_SIZE = 2;

// Initialize ripple pool
for (let i = 0; i < POOL_SIZE; i++) {
  const ripple = document.createElement("span");
  ripple.classList.add("ripple");
  ripplePool.push(ripple);
}

// Debounce rapid hits (optional - adjust based on your needs)
let lastHitTime = 0;
const MIN_TIME_BETWEEN_HITS = 50; // ms

drummingArea.addEventListener(
  "touchstart",
  function (event) {
    event.preventDefault();

    const now = Date.now();
    if (now - lastHitTime < MIN_TIME_BETWEEN_HITS) {
      return;
    }
    lastHitTime = now;

    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      judgeHit(audioContext.currentTime);

      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);

      // Get ripple from pool or create new one if pool is empty
      const ripple =
        ripplePool.length > 0
          ? ripplePool.pop()
          : document.createElement("span");
      ripple.classList.add("ripple");

      ripple.style.width = ripple.style.height = size + "px";
      ripple.style.left =
        event.touches[0].clientX - rect.left - size / 2 + "px";
      ripple.style.top = event.touches[0].clientY - rect.top - size / 2 + "px";

      this.appendChild(ripple);

      // Single event listener for animation end
      const onAnimationEnd = () => {
        ripple.removeEventListener("animationend", onAnimationEnd);
        ripple.remove();

        // Reset and return to pool
        ripple.classList.remove("ripple");
        if (ripplePool.length < POOL_SIZE) {
          ripplePool.push(ripple);
        }
      };

      ripple.addEventListener("animationend", onAnimationEnd, { once: true });
    });
  },
  { passive: false },
);

// ======================================================
// SAVE/LOAD FUNCTIONALITY
// ======================================================

//unfinished save
function downloadMJSON() {
  // Update song data with current pattern
  songData.dicePattern = pattern;
  songData.bpm = conductor.bpm;

  const dataStr = JSON.stringify(songData, null, 2); // Pretty-print
  const blob = new Blob([dataStr], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "pattern.mjson";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
}

// ======================================================
// METRONOME CONTROL
// ======================================================
let nextNoteTime = 0.0; // Time for next note
let schedulerTimerId = null;
const lookahead = 25.0;
const scheduleAhead = 0.1;

function scheduler() {
  const secondsPerBeat = conductor.crotchet;
  while (nextNoteTime < audioContext.currentTime + scheduleAhead) {
    playMetroAt(nextNoteTime);

    nextNoteTime += secondsPerBeat;
  }
  schedulerTimerId = setTimeout(() => scheduler(conductor.bpm), lookahead);
}

function startMetronome() {
  stopMetronome();
  nextNoteTime = audioContext.currentTime;
  scheduler();
}

function stopMetronome() {
  clearTimeout(schedulerTimerId);
  schedulerTimerId = null;
}

//load funtion

function handleFileUpload() {
  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0]; // Get the first file selected

  if (!file) {
    alert("Please select a file to upload.");
    return;
  }

  const reader = new FileReader();

  reader.onload = function (event) {
    try {
      const fileContent = event.target.result;
      const parsedData = JSON.parse(fileContent);

      // Process the uploaded data
      console.log(parsedData);
      songData = parsedData;

      if (songData.dicePattern) {
        document.getElementById("bpm-ui").value = songData.bpm;
        conductor.setBPM(songData.bpm);
        pattern = songData.dicePattern;

        renderPattern(pattern);
        buildTimingTables(pattern);
        songData.songPath = songData.songPath;
      }
      console.log(songData.songPath);
      alert("chart uploaded successfully!");
      const first16 = Array.from(container.children).slice(0, 16);

      const anim = gsap.from(first16, {
        y: 15,
        opacity: 0,
        duration: 0.3,
        stagger: 0.025,
        paused: true, // don’t start immediately
      });

      anim.play(); // start the animation
    } catch (error) {
      alert(
        "Error parsing the uploaded file. Make sure it's a valid .mjson file.",
      );
      console.error(error);
    }
  };

  reader.onerror = function () {
    alert("Error reading the file.");
  };
  reader.readAsText(file);
}

//listem mode toggle
function listenMode() {
  if (listening) {
    listening = false;
    document.getElementById("listen").classList.add("inactive");
  } else {
    listening = true;
    document.getElementById("listen").classList.remove("inactive");
  }
}
document
  .getElementById("fileInput")
  .addEventListener("change", handleFileUpload);

function triggerFlash() {
  const overlay = document.getElementById("flash-overlay");
  overlay.classList.add("flash-now");

  overlay.addEventListener(
    "animationend",
    () => {
      overlay.classList.remove("flash-now");
    },
    {
      once: true,
    },
  );
}

function closeSidebar() {
  sidebar.classList.remove("open-side");
}
const audioInput = document.getElementById("audioInput");
audioInput.addEventListener("change", function () {
  const file = this.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    songData.songPath = url;
    console.log("Audio file loaded:", url);
    // Optionally, you can load and decode the audio here if needed
  }
});
function uploadAudio() {
  // Trigger click on hidden input
  document.getElementById("audioInput").click();
}

function changeBlock() {
  const index = parseInt(currentEditorDice.dataset.index);
  const select = document.getElementById("blocks");
  const value = parseInt(select.value);

  let soundMap;

  // Determine soundMap based on the selected value
  switch (value) {
    case 1:
      soundMap = [1];
      break;
    case 2:
      soundMap = [1, 1];
      break;
    case 3:
      soundMap = [1, 1, 1];
      break;
    case 4:
      soundMap = [1, 1, 1, 1];
      break;
    case 5:
      soundMap = [1, 1, 1, 1, 1];
      break;
    case 6:
      soundMap = [1, 1, 1, 1, 1, 1];
      break;
    default:
      // Handle cases where value might be outside 1-6, or set a default
      soundMap = [1];
      console.warn("Unexpected value for block, defaulting soundMap to [1]");
  }

  // Update pattern data structure
  pattern[index] = {
    value: value,
    soundMap: soundMap,
  };

  // Update dataset attributes on the element as JSON strings
  currentEditorDice.dataset.value = value.toString(); // Dataset values are strings
  currentEditorDice.dataset.soundmap = JSON.stringify(soundMap);

  // Update UI
  renderPattern(pattern);
  openDotEditorForBlock(currentEditorDice);
}

const bpmInput = document.getElementById("bpmInput");
bpmInput.addEventListener("input", function () {
  const newBpm = parseInt(this.value, 10);
  if (!isNaN(newBpm) && newBpm > 0) {
    console.log("New BPM:", newBpm);
    pattern[currentEditorDice.dataset.index].bpmChange = newBpm;
    console.log(pattern);
  }
});
const autoInput = document.getElementById("autoCheck");

autoInput.addEventListener("change", function () {
  const isChecked = this.checked;
  console.log("Auto-check enabled:", isChecked);

  pattern[currentEditorDice.dataset.index].auto = isChecked;
  console.log(pattern);
});

const checkbox = document.getElementById("startCheck");
console.log(checkbox.checked); // true if checked, false if not
checkbox.addEventListener("change", function () {
  const index = parseInt(currentEditorDice.dataset.index);

  // First, reset all startPos flags in the model and remove the class from all children
  pattern.forEach((item, i) => {
    item.startPos = false;
    container.children[i].classList.remove("start-pos");
  });
  startPosOffset = 0;

  if (this.checked) {
    if (
      index >= 0 &&
      index < pattern.length &&
      index < container.children.length
    ) {
      pattern.startPos = index; // Update the model
      container.children[index].classList.add("start-pos");
    } else {
      console.warn("Index out of bounds:", index);
    }
  } else {
    // If unchecked, just remove the class and reset the model

    pattern.startPos = 0;
  }

  console.log(pattern.startPos);
});
