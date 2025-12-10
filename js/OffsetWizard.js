import { SoundFX } from './AudioManager.js';
import { saveSettings } from './Settings.js';
import { triggerAnimation, triggerHitAnimation } from './UI.js'; 
import { state } from './GameState.js';

let wizardActive = false;
let sequenceCount = 0;
let offsets = [];
let animationId = null;
let startTime = 0;
let beatIndex = 0;

const BPM = 120;
const CROTCHET = 60 / BPM;
const TOTAL_SEQUENCES = 4;

const elements = {
    modal: document.getElementById("offset-wizard-modal"),
    instructions: document.getElementById("wizard-instructions"),
    status: document.getElementById("wizard-status"),
    die: [
        document.getElementById("die-1"),
        document.getElementById("die-2"),
        document.getElementById("die-3"),
        document.getElementById("die-4")
    ],
    cancelBtn: document.getElementById("wizard-cancel-btn")
};

// Wizard audio
const wizardFX = new SoundFX();
let audioContext = null;

// Track beat times for current sequence
let currentSequenceBeats = [];
let inputReceived = false;

// -------------------------------------------------------------
// START WIZARD
// -------------------------------------------------------------
export function startWizard() {
    if (wizardActive) return;

    wizardActive = true;
    sequenceCount = 0;
    offsets = [];

    elements.modal.classList.remove("hidden");
    elements.instructions.innerText = "Press any key when you hear the 3rd beat!";
    elements.status.innerText = "Get ready...";
    
    resetDots();

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    wizardFX.ctx = audioContext;

    if (audioContext.state === "suspended") audioContext.resume();

    wizardFX.load({
        wizard_beat: "assets/audio/Bongos/drum.wav",
        wizard_target: "assets/audio/slick-rimshot_D_major.wav"
    }).then(() => {
        console.log("Wizard sounds loaded");
        setTimeout(startSequence, 1000);
    });

    window.addEventListener("keydown", handleInput);
    elements.cancelBtn.onclick = stopWizard;
}

// -------------------------------------------------------------
// STOP WIZARD
// -------------------------------------------------------------
function stopWizard() {
    wizardActive = false;

    elements.modal.classList.add("hidden");
    window.removeEventListener("keydown", handleInput);

    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
}

// -------------------------------------------------------------
// START EACH SEQUENCE
// -------------------------------------------------------------
function startSequence() {
    if (!wizardActive) return;

    if (sequenceCount >= TOTAL_SEQUENCES) {
        finishWizard();
        return;
    }

    beatIndex = 0;
    inputReceived = false;
    currentSequenceBeats = [];

    startTime = audioContext.currentTime;

    elements.status.innerText = `Sequence ${sequenceCount + 1}/${TOTAL_SEQUENCES}`;
    resetDots();

    scheduleBeats();
    animateDots();
}

// -------------------------------------------------------------
// SCHEDULE THE AUDIO BEATS
// -------------------------------------------------------------
function scheduleBeats() {
    for (let i = 0; i < 4; i++) {
        const t = startTime + i * CROTCHET;
        currentSequenceBeats.push(t);

        if (i === 0 || i === 1) {
            wizardFX.play("wizard_beat", { volume: 2.0 }, t);
        } else if (i === 2) {
            wizardFX.play("wizard_target", { volume: 2.0 }, t);
        }
    }
}

// -------------------------------------------------------------
// DOT ANIMATION + SEQUENCE END HANDLING
// -------------------------------------------------------------
function animateDots() {
    if (!wizardActive) return;

    const now = audioContext.currentTime;

    // Trigger beat visual
    if (beatIndex < currentSequenceBeats.length && now >= currentSequenceBeats[beatIndex]) {
        const currentDie = elements.die[beatIndex];
        if (currentDie) {
            currentDie.style.backgroundColor = state.dieColors[1];
            triggerHitAnimation(currentDie);
        }

        beatIndex++;

        // After beat 4, wait a bit, then move to next sequence
        if (beatIndex >= 4) {
            setTimeout(() => {
                if (wizardActive) {
                    sequenceCount++;
                    startSequence();
                }
            }, CROTCHET * 1000);  // Allow beat 4 to visually settle
            return;
        }
    }

    animationId = requestAnimationFrame(animateDots);
}

// -------------------------------------------------------------
// HANDLE USER INPUT
// -------------------------------------------------------------
function handleInput(e) {
    if (!wizardActive || e.repeat || inputReceived) return;

    const now = audioContext.currentTime;
    const currentOffsetMs = window.GameSettings?.offset || 0;
    const currentOffsetSec = currentOffsetMs / 1000;

    const targetTime = currentSequenceBeats[2] + currentOffsetSec;
    const timingWindow = CROTCHET * 0.6;
    const difference = now - targetTime;

    if (Math.abs(difference) < timingWindow) {
        inputReceived = true;
        offsets.push(difference);

        const targetDie = elements.die[2];
        const dotElement = targetDie?.getElementsByClassName("dot")[0];
        if (dotElement) {
            triggerAnimation(dotElement, "hit");
        }

        const ms = Math.round(difference * 1000);
        elements.status.innerText = `${ms > 0 ? "+" : ""}${ms}ms`;
        elements.status.style.color =
            Math.abs(ms) < 50 ? "#4caf50" : (ms > 0 ? "#ff9800" : "#2196f3");

        // IMPORTANT:
        // DO NOT restart the sequence here.
        // Wait until animateDots reaches the end of the 4/4 measure.
    }
}

// -------------------------------------------------------------
// FINISH WIZARD
// -------------------------------------------------------------
function finishWizard() {
    stopWizard();

    if (offsets.length === 0) {
        alert("No inputs recorded. Calibration cancelled.");
        return;
    }

    const avg = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const avgMs = Math.round(avg * 1000);

    const newOffset = (window.GameSettings.offset || 0) + avgMs;
    window.GameSettings.offset = newOffset;

    saveSettings();

    const offsetInput = document.getElementById("offsetInput");
    if (offsetInput) offsetInput.value = newOffset;

    alert(`Calibration complete!\nAdjusted offset: ${newOffset}ms\n(Avg deviation: ${avgMs}ms)`);
}

// -------------------------------------------------------------
// RESET DOTS
// -------------------------------------------------------------
function resetDots() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;

    elements.die.forEach((die) => {
        die.style.backgroundColor = "var(--block-inactive-color, #444)";
        die.style.transform = "scale(1)";

        const dot = die.getElementsByClassName("dot")[0];
        if (dot) {
            dot.style.backgroundColor = "";
            dot.classList.remove("hit");
        }
    });

    if (elements.die[2]) {
        elements.die[2].style.boxShadow = "0 0 20px 10px var(--block-active-color)";
    }
}
