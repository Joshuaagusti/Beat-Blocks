import { state } from './GameState.js';
import { fx, playBongoAt } from './AudioManager.js';
import { scrollChildToCenter } from './Utils.js';

// UI Elements
export const elements = {
    container: document.getElementById("dice-container"),
    title: document.getElementById("title"),
    countdownElement: document.getElementById("countdown"),
    countdownDots: document.querySelectorAll("#countdown .dot"),
    quarterIcon: document.getElementById("quarter-note-icon"),
    quarterText: document.getElementById("quarter-p"),
    judgementEl: document.getElementById("judgement"),
    sidebar: document.getElementById("side"),
    modal: document.getElementById("restModal"),
    preview: document.getElementById("preview"),
    sidebarTitle: document.getElementById("sidebar-block-title"),
    playIcon: document.getElementById("play-icon"),
    bpmUi: document.getElementById("bpm-ui"),
    listenBtn: document.getElementById("listen"),
    drummingArea: document.getElementById("drumming-area"),
    fileInput: document.getElementById("fileInput"),
    audioInput: document.getElementById("audioInput"),
    blocksSelect: document.getElementById("blocks"),
    bpmInput: document.getElementById("bpmInput"),
    autoInput: document.getElementById("autoCheck"),
    startCheck: document.getElementById("startCheck"),
    dotDotInputs: document.getElementById("restDotInputs"),
    bongoElement: document.getElementById("bongo")
};

export const titleLabels = ["1", "2", "Ready!", "Go!"];
const faceClasses = {
  1: "first-face",
  2: "second-face",
  3: "third-face",
  4: "fourth-face",
  5: "fifth-face",
  6: "sixth-face",
};

export const bongo_play = (function () {
  let toggle = false; // Tracks which frame to show

  return function () {
    const bongoElement = elements.bongoElement;

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

export function updateDieColors() {
  const rootStyles = getComputedStyle(document.documentElement);
  for (let i = 1; i <= 6; i++) {
    state.dieColors[i] = rootStyles.getPropertyValue(`--face-${i}-color`).trim();
  }
}

export function createJudgementEl() {
  const span = document.createElement("span");
  span.classList.add("hidden");
  span.classList.add("judgement");
  span.textContent = "Perfect!";
  return span;
}

export function repaintDieFace(dieEl) {
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
    state.pipOrder[value].forEach((pipIndex, j) => {
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
    if (soundMap.length !== state.pipOrder[value].length) {
      soundMap = new Array(state.pipOrder[value].length).fill(1);
      dieEl.dataset.soundmap = JSON.stringify(soundMap);
    }
  } catch (e) {
    console.error("Error parsing soundmap:", e);
    soundMap = new Array(state.pipOrder[value].length).fill(1);
    dieEl.dataset.soundmap = JSON.stringify(soundMap);
  }
}

let currentEditorDice;

export function openDotEditorForBlock(die) {
  currentEditorDice = die;
  repaintDieFace(die);

  elements.preview.innerHTML = "";
  elements.dotDotInputs.innerHTML = "";
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
      state.pattern[i].soundMap = diemap;
      renderPattern(state.pattern);
      repaintDieFace(die);
      updateSideBar(die);
    });

    elements.dotDotInputs.appendChild(checkbox);
  });

  elements.sidebar.classList.add("open-side");
  elements.modal.classList.remove("hidden");
}

export function updateSideBar(die) {
  elements.preview.innerHTML = "";

  const clone = die.cloneNode(true);

  const value = clone.dataset.value;
  if (!value || !(value in state.dieColors)) {
    // console.warn("Invalid or missing die value:", value); // Suppress warning if colors not ready
    // return;
  }

  clone.classList.add(`die-face-${value}`);
  elements.sidebarTitle.innerText = `Options for Block #${Number(die.dataset.index) + 1}`;
  elements.preview.appendChild(clone);

  // UX Improvement: Populate inputs with current block data
  if (elements.blocksSelect) elements.blocksSelect.value = value;
  if (elements.bpmInput) elements.bpmInput.value = die.dataset.bpmChange || "";
  if (elements.autoInput) elements.autoInput.checked = (die.dataset.auto === "true" || die.dataset.auto === true);
  
  // Check if this block is the start position
  const isStartPos = state.pattern.startPos === Number(die.dataset.index);
  if (elements.startCheck) elements.startCheck.checked = isStartPos;
}

export function closeSidebar() {
  elements.sidebar.classList.remove("open-side");
}

export function renderPattern(pattern) {
  // Clear container
  while (elements.container.firstChild) {
    elements.container.removeChild(elements.container.firstChild);
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
    die.dataset.auto = note.auto || false;
    
    // Check if this is the start position
    if (state.pattern.startPos === i) {
      die.classList.add("start-pos");
    }

    repaintDieFace(die);
    addListenersToDice(die, i);

    wrapper.appendChild(die);
    elements.container.appendChild(wrapper);
  });

  state.dieElements = Array.from(document.querySelectorAll(".item"));
}

function addListenersToDice(die, i) {
  let pressTimer = null;
  let longPressed = false;
  let startX, startY;
  const longDelay = 500; // ms
  const moveThresh = 10; // px

  function onLongPress() {
    longPressed = true;
    console.log("Long press on die", i);
    openDotEditorForBlock(die);
  }

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
    if (Math.hypot(currX - startX, currY - startY) > moveThresh) {
      cancelPress();
    }
  }

  function endPress(e) {
    cancelPress();
  }

  function handleClick(e) {
    if (longPressed) {
      e.preventDefault();
      return;
    }
    if (state.isPlaying) {
      return;
    }
    let v = Number(die.dataset.value) || 1;
    const newValue = (v % state.BlockMaxNumber) + 1;
    die.dataset.value = newValue;

    repaintDieFace(die);
    openDotEditorForBlock(die);
    state.pattern[i].value = newValue;
    state.pattern[i].soundMap = JSON.parse(die.dataset.soundmap);
  }

  function startPress(e) {
    longPressed = false;
    if (e.type === "touchstart") {
        // e.preventDefault(); // needed so that touchmove isn’t passive - Removing to allow scroll if needed?
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    } else {
        startX = e.clientX;
        startY = e.clientY;
    }
    pressTimer = setTimeout(onLongPress, longDelay);
  }

  die.style.touchAction = "none";
  die.addEventListener("pointerdown", startPress);
  die.addEventListener("pointermove", movePress);
  die.addEventListener("pointerup", endPress);
  die.addEventListener("pointercancel", endPress);
  die.addEventListener("click", handleClick);
}

export function triggerAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force reflow
  element.classList.add(className);
}

const hitTimelines = new WeakMap();

export function triggerHitAnimation(element) {
  let tl = hitTimelines.get(element);

  if (!tl) {
    tl = gsap.timeline({ paused: true });
    tl.to(element, { scale: 1.15, duration: 0.09, ease: "power1.out" }).to(
      element,
      { scale: 1, duration: 0.21, ease: "power1.in" },
    );
    hitTimelines.set(element, tl);
  }
  tl.restart();
}

export function showJudgement(dieEl, text, color) {
  if (window.GameSettings?.showJudgement === false) return;
  const el = dieEl.querySelector(".judgement");
  if (!el) return;

  el.textContent = text;
  el.style.color = color;
  el.classList.remove("hidden");

  if (el._sj_raf) cancelAnimationFrame(el._sj_raf);
  if (el._sj_raf2) cancelAnimationFrame(el._sj_raf2);
  if (el._sj_to) {
    clearTimeout(el._sj_to);
    el._sj_to = null;
  }

  el.classList.remove("float-up");

  const start = () => {
    const onEnd = () => {
      el.classList.remove("float-up");
    };
    el.addEventListener("animationend", onEnd, { once: true });

    el._sj_raf = requestAnimationFrame(() => {
      el._sj_raf2 = requestAnimationFrame(() => {
        el.classList.add("float-up");
        el._sj_raf = el._sj_raf2 = null;
      });
    });
  };

  if (el.offsetWidth === 0) {
    el._sj_to = setTimeout(() => {
      void el.offsetWidth;
      start();
      el._sj_to = null;
    }, 20);
  } else {
    void el.offsetWidth;
    start();
  }
}

export function updateVisuals(conductor, judgeHitCallback, onBPMChange) {
  const startPos = state.pattern.startPos != null ? state.pattern.startPos : 0;
  const now = state.audioContext.currentTime + (state.startPosOffset || 0);

  if (state.visualIndex >= state.subdivisionTimes.length) return;

  if (!state.dotElementsMap) cacheDotElements(state.dieElements);

  const dotsToActivate = [];
  const facesToApply = new Map();
  const judgeTimes = [];
  let scrollCandidate = null;

  const containerRect = elements.container ? elements.container.getBoundingClientRect() : null;
  const containerCenter = containerRect
    ? (containerRect.top + containerRect.bottom) / 2
    : null;

  const dieRects = new Map();
  let iterations = 0;
  let maxIterationsPerUpdate = 30;

  while (
    state.visualIndex < state.subdivisionTimes.length &&
    now >= state.subdivisionTimes[state.visualIndex] &&
    iterations < maxIterationsPerUpdate
  ) {
    const displayIndex = state.visualIndex % state.dotMap.length;

    if (displayIndex >= state.dotMap.length) {
      state.visualIndex++;
      iterations++;
      continue;
    }

    const { dieIdx, pip } = state.dotMap[displayIndex];
    const dieElement = state.dieElements[dieIdx];
    if (!dieElement) {
      state.visualIndex++;
      iterations++;
      continue;
    } else {
      if (dieElement.dataset.bpmChange) {
        const oldCrotchet = conductor.crotchet;
        const newBpm = dieElement.dataset.bpmChange;
        conductor.setBPM(newBpm);
        if (onBPMChange) onBPMChange(newBpm, oldCrotchet);
      }
    }

    let dotsForDie = state.dotElementsMap && state.dotElementsMap[dieIdx];
    if (!dotsForDie) {
      dotsForDie = Array.from(dieElement.querySelectorAll(".dot"));
      if (!state.dotElementsMap) state.dotElementsMap = [];
      state.dotElementsMap[dieIdx] = dotsForDie;
    }

    const dotEl = dotsForDie && dotsForDie[pip] ? dotsForDie[pip] : null;
    if (dotEl) dotsToActivate.push(dotEl);

    const dieValue = Number(dieElement.dataset.value) || 1;
    facesToApply.set(dieElement, dieValue);

    // Auto-hit logic: if block is auto OR global listening mode is on
    if (state.listening || dieElement.dataset.auto === "true" || dieElement.dataset.auto === true) {
        judgeTimes.push(state.subdivisionTimes[state.visualIndex]);
    }

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

    state.visualIndex++;
    iterations++;
  }

  for (const d of dotsToActivate) {
    if (!d.classList.contains("active")) d.classList.add("active");
  }

  for (const [dieEl, faceValue] of facesToApply.entries()) {
     setDieFaceClass(dieEl, faceValue);
  }

  if (scrollCandidate) {
    scrollChildToCenter(scrollCandidate, elements.container);
  }
  
  // Call judgeHit for auto beats
  if (judgeHitCallback && typeof judgeHitCallback === "function") {
    for (const t of judgeTimes) {
      judgeHitCallback(t);
    }
  }
  
  if (state.visualIndex < state.subdivisionTimes.length && now >= state.subdivisionTimes[state.visualIndex]) {
       requestAnimationFrame(() => updateVisuals(conductor, judgeHitCallback, onBPMChange));
  }
}

function cacheDotElements(dieElements) {
  const dies = Array.from(dieElements);
  state.dotElementsMap = dies.map((die) => Array.from(die.querySelectorAll(".dot")));
}

function setDieFaceClass(dieEl, faceValue) {
  const v = Math.min(6, Math.max(1, Number(faceValue) || 1));
  if (dieEl.__lastFace === v) return;
  const prev = dieEl.__lastFace;
  if (prev) dieEl.classList.remove(`die-face-${prev}`);
  dieEl.classList.add(`die-face-${v}`);
  dieEl.dataset.face = String(v);
  dieEl.__lastFace = v;
}

export function getCurrentEditorDice() {
    return currentEditorDice;
}
export function triggerFlash() {
  const overlay = document.getElementById("flash-overlay");
  if (!overlay) return;
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

export function initDrummingArea(gameInstance) {
    const drummingArea = elements.drummingArea;
    if (!drummingArea) return;

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
                if (gameInstance && state.audioContext) {
                    gameInstance.judgeHit(state.audioContext.currentTime);
                }

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
}
