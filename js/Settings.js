import { state } from './GameState.js';
import { updateDieColors } from './UI.js';
import { startWizard } from './OffsetWizard.js';

// 1) Default GameSettings
window.GameSettings = {
  metronomeVolume: 50,
  hitsoundVolume: 70,
  bongoVolume: 1,
  dotColor: "#ffffff",
  dotHit: "#000000",
  blockColor: "#808080", 
  keybinds: ["f", "j", "Space"],
  offset: 0,
  metronomeType: "Original",
  hitsoundType: "Bongo",
  showOffsetCheckbox: false,
  // --- Dice face colors ---
  face1: "#fb6354",
  face2: "#70b8fe",
  face3: "#ffd000",
  face4: "#c739ff",
  face5: "#ffa84d",
  face6: "#7fe2c0",
  showJudgement: false,
  playHitsoundsOnHit: false
};
const defaultColors = {
  "--dot-color": "#ffffff",
  "--block-inactive-color": "#808080",
  "--dot-hit-color": "#000000",
  "--face-1-color": "#fb6354",
  "--face-2-color": "#70b8fe",
  "--face-3-color": "#ffd000",
  "--face-4-color": "#c739ff",
  "--face-5-color": "#ffa84d",
  "--face-6-color": "#7fe2c0"
};

for (const [varName, value] of Object.entries(defaultColors)) {
  document.documentElement.style.setProperty(varName, value);
}

// --- 2) Load settings from localStorage ---
export function loadSettings() {
  const gs = window.GameSettings;

  // Keys + parser function (use JSON.parse for arrays/objects)
  const storedKeys = [
    ["metronomeVolume", Number],
    ["hitsoundVolume", Number],
    ["bongoVolume", Number],
    ["dotColor", String],
    ["blockColor", String],
    ["dotHit", String],
    ["offset", Number],
    ["metronomeType", String],
    ["hitsoundType", String],
    ["keybinds", JSON.parse],
    ["face1", String],
    ["face2", String],
    ["face3", String],
    ["face4", String],
    ["face5", String],
    ["face6", String],
    ["showOffsetCheckbox", (v) => v === "true"],
    ["showJudgement", (v) => v === "true"],
    ["playHitsoundsOnHit", (v) => v === "true"]
  ];

  for (const [key, parser] of storedKeys) {
    const val = localStorage.getItem(key);
    if (val !== null) {
      try {
        gs[key] = parser === JSON.parse ? JSON.parse(val) : parser(val);
      } catch (err) {
        console.warn(`Failed to parse ${key} from localStorage:`, err);
      }
    }
  }
}

export function resetSettings() {
  localStorage.clear();
 
  window.GameSettings = {

    metronomeVolume: 50,
    hitsoundVolume: 70,
    bongoVolume: 1,
    dotColor: "#ffffff",
    dotHit: "#000000",
    blockColor: "#808080", // fixed: consistent default
    keybinds: ["f", "j", "Space"], // fixed: consistent defaults
    offset: 0,
    metronomeType: "Original",
    hitsoundType: "Bongo",
    face1: "#fb6354",
    face2: "#70b8fe",
    face3: "#ffd000",
    face4: "#c739ff",
    face5: "#ffa84d",
    face6: "#7fe2c0",
    showOffsetCheckbox: false,
    showJudgement: false,
    playHitsoundsOnHit: false
  };

  // Push defaults to UI + CSS variables
  applySettingsToUI();

  // Persist fresh defaults
  saveSettings();

  alert("Settings have been reset to default!");
}

// --- 3) Save settings to localStorage ---
export function saveSettings() {
  const gs = window.GameSettings;
  for (const key in gs) {
    if (!Object.prototype.hasOwnProperty.call(gs, key)) continue;
    const val = gs[key];
    // store arrays/objects as JSON, primitives as string
    localStorage.setItem(key, typeof val === "object" ? JSON.stringify(val) : String(val));
  }
}

// --- 4) Apply CSS variables and UI values ---
export function applySettingsToUI() {
  const gs = window.GameSettings;
  
  // Volume sliders & labels - FIXED: Added event listeners
  const ms = document.getElementById("metronomeSlider");
  const ml = document.getElementById("metronomeVolumeLabel");
  const hs = document.getElementById("hitsoundSlider");
  const hl = document.getElementById("hitsoundVolumeLabel");
  
  const box = document.getElementById("showOffsetCheckbox");
  const judgebox = document.getElementById("showJudge");
  const playHitsoundBox = document.getElementById("playHitsoundsOnHit");
  if (playHitsoundBox) {
    playHitsoundBox.checked = gs.playHitsoundsOnHit;
    playHitsoundBox.addEventListener("change", () => {
      gs.playHitsoundsOnHit = playHitsoundBox.checked;
      saveSettings();
    });
  }

  if (judgebox) {
    judgebox.checked = gs.showJudgement;
    judgebox.addEventListener("change", () => {
      gs.showJudgement = judgebox.checked;
      saveSettings();
    });
  }
  box.addEventListener("change", () => {
    gs.showOffsetCheckbox = box.checked;
    saveSettings();
  });
   
  if (ms && ml) { 
    ms.value = gs.metronomeVolume; 
    ml.textContent = gs.metronomeVolume;
    
    // Add event listener for metronome slider
    ms.addEventListener("input", () => {
      gs.metronomeVolume = Number(ms.value);
      ml.textContent = gs.metronomeVolume;
      saveSettings();
    });
  }
  
  if (hs && hl) { 
    hs.value = gs.hitsoundVolume; 
    hl.textContent = gs.hitsoundVolume;
    
    // Add event listener for hitsound slider
    hs.addEventListener("input", () => {
      gs.hitsoundVolume = Number(hs.value);
      hl.textContent = gs.hitsoundVolume;
      saveSettings();
    });

  
  }

  // Color pickers (id, GameSettings key, CSS variable)
  const colorPickers = [
    ["dot-color-picker", "dotColor", "--dot-color"],
    ["block-color-picker", "blockColor", "--block-inactive-color"],
    ["dot-hit-color-picker", "dotHit", "--dot-hit-color"],
    ["face-1-picker", "face1", "--face-1-color"],
    ["face-2-picker", "face2", "--face-2-color"],
    ["face-3-picker", "face3", "--face-3-color"],
    ["face-4-picker", "face4", "--face-4-color"],
    ["face-5-picker", "face5", "--face-5-color"],
    ["face-6-picker", "face6", "--face-6-color"]
  ];

  colorPickers.forEach(([id, key, cssVar]) => {
    const el = document.getElementById(id);
    if (!el) {
      if (gs[key] !== undefined) document.documentElement.style.setProperty(cssVar, gs[key]);
      return;
    }

    // initialize element value (in case loadSettings populated GameSettings from storage)
    if (gs[key] !== undefined) el.value = gs[key];

    // apply initial CSS variable
    document.documentElement.style.setProperty(cssVar, gs[key]);

    // wire input updates - FIXED: Remove existing listeners to prevent duplicates
    el.removeEventListener("input", el._settingsHandler);
    el._settingsHandler = () => {
      gs[key] = el.value;
      document.documentElement.style.setProperty(cssVar, el.value);
      saveSettings();
      updateDieColors(); // Initial load
    };
    el.addEventListener("input", el._settingsHandler);
  });
   updateDieColors(); // Initial load

  // Offset input
  const of = document.getElementById("offsetInput");
  const calBtn = document.getElementById("decreaseOffset");
  
  if (calBtn) {
      calBtn.onclick = startWizard;
  }

  if (of) {
    of.value = gs.offset;
    
    // Remove existing listener to prevent duplicates
    of.removeEventListener("input", of._settingsHandler);
    of._settingsHandler = () => {
      const v = Number(of.value);
      if (!isNaN(v)) { 
        gs.offset = v; 
        saveSettings(); 
      }
    };
    of.addEventListener("input", of._settingsHandler);
  }

  // Selects (metronome/hitsound types)
  const mts = document.getElementById("metronomeTypeSelect");
  if (mts) {
    mts.value = gs.metronomeType;
    
    // Remove existing listener to prevent duplicates
    mts.removeEventListener("change", mts._settingsHandler);
    mts._settingsHandler = () => { 
      gs.metronomeType = mts.value; 
      saveSettings(); 
    };
    mts.addEventListener("change", mts._settingsHandler);
  }
  
  const hts = document.getElementById("hitsoundTypeSelect");
  if (hts) {
    hts.value = gs.hitsoundType;
    
    // Remove existing listener to prevent duplicates
    hts.removeEventListener("change", hts._settingsHandler);
    hts._settingsHandler = () => { 
      gs.hitsoundType = hts.value; 
      saveSettings(); 
    };
    hts.addEventListener("change", hts._settingsHandler);
  }

  // Keybinds UI
  renderKeybinds();
}

// FIXED: Moved keybind functions outside of applySettingsToUI to avoid redefinition
function renderKeybinds() {
  const container = document.getElementById("keybind-tags");
  if (!container) return;
  
  container.innerHTML = "";
  window.GameSettings.keybinds.forEach(k => {
    const tag = document.createElement("div");
    tag.className = "keybind-tag";
    tag.innerHTML = `${k} <button onclick="removeKeybind('${k}')">&times;</button>`;
    container.appendChild(tag);
  });
}

window.removeKeybind = (key) => { 
  window.GameSettings.keybinds = window.GameSettings.keybinds.filter(k => k !== key); 
  renderKeybinds(); 
  saveSettings(); 
};

// Expose to window for HTML onclick handlers
window.resetSettings = resetSettings;
window.openSettings = () => document.querySelector(".settings-wrapper")?.classList.remove("hidden");
window.closeSettings = () => document.querySelector(".settings-wrapper")?.classList.add("hidden");

// Initialize
export function initSettings() {
  loadSettings();
  applySettingsToUI();
  updateDieColors();
  
  // Keybind modal wiring
  const addBtn = document.getElementById("add-keybind-btn");
  const modal = document.getElementById("keybind-modal");
  const cancel = document.getElementById("cancel-btn");

  function handleKeyPress(e) {
    e.preventDefault();
    const k = e.key === " " ? "Space" : e.key;
    if (!window.GameSettings.keybinds.includes(k)) {
      window.GameSettings.keybinds.push(k);
      renderKeybinds();
      saveSettings();
    }
    if (modal) modal.classList.add("hidden");
    window.removeEventListener("keydown", handleKeyPress);
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (modal) modal.classList.remove("hidden");
      window.addEventListener("keydown", handleKeyPress);
    });
  }
  
  if (cancel) {
    cancel.addEventListener("click", () => {
      if (modal) modal.classList.add("hidden");
      window.removeEventListener("keydown", handleKeyPress);
    });
  }
}
