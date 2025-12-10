import { initSettings } from './Settings.js';
import { Game } from './Game.js';
import { state } from './GameState.js';
import * as UI from './UI.js';
import { fx } from './AudioManager.js';
import { scrollChildToCenter } from './Utils.js';

initSettings();

const game = new Game();
UI.initDrummingArea(game);

// Expose functions to window for HTML onclick handlers
window.play = () => {
    if (state.isPlaying) {
        game.resetGame();
        return;
    }

    UI.renderPattern(state.pattern);

    const startPos = state.pattern.startPos;
    const target = startPos != null
        ? document.querySelector(`.die-wrapper .item[data-index='${startPos}']`)
        : document.querySelector(".die-wrapper .item");
        
    if (target) {
        scrollChildToCenter(target, UI.elements.container);
    }
    
    game.startPlayback(state.pattern.startPos || 0);
};

window.resetGame = () => game.resetGame();
window.addDice = () => game.addDice();
window.removeDice = () => game.removeDice();
window.listenMode = () => {
    state.listening = !state.listening;
    const btn = document.getElementById("listen");
    if (state.listening) {
        btn.classList.remove("inactive");
    } else {
        btn.classList.add("inactive");
    }
};
window.hide_nav = () => {
    const diceUI = document.getElementsByClassName("dice-ui")[0];
    diceUI.classList.toggle("hidden");
};
window.closeSidebar = () => UI.closeSidebar();
window.changeBlock = () => {
    const currentEditorDice = UI.getCurrentEditorDice();
    if (!currentEditorDice) return;
    
    const index = parseInt(currentEditorDice.dataset.index);
    const select = document.getElementById("blocks");
    const value = parseInt(select.value);
    let soundMap;

    switch (value) {
        case 1: soundMap = [1]; break;
        case 2: soundMap = [1, 1]; break;
        case 3: soundMap = [1, 1, 1]; break;
        case 4: soundMap = [1, 1, 1, 1]; break;
        case 5: soundMap = [1, 1, 1, 1, 1]; break;
        case 6: soundMap = [1, 1, 1, 1, 1, 1]; break;
        default: soundMap = [1]; console.warn("Unexpected value for block, defaulting soundMap to [1]");
    }

    state.pattern[index] = {
        value: value,
        soundMap: soundMap,
    };

    currentEditorDice.dataset.value = value.toString();
    currentEditorDice.dataset.soundmap = JSON.stringify(soundMap);

    UI.renderPattern(state.pattern);
    UI.openDotEditorForBlock(currentEditorDice);
};

window.uploadAudio = () => {
    document.getElementById("audioInput").click();
};

window.downloadMJSON = () => {
    state.songData.dicePattern = state.pattern;
    state.songData.bpm = game.conductor.bpm;

    const dataStr = JSON.stringify(state.songData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = "pattern.mjson";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
};

// Event Listeners
document.getElementById("fileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
        alert("Please select a file to upload.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        try {
            const fileContent = event.target.result;
            const parsedData = JSON.parse(fileContent);
            console.log(parsedData);
            state.songData = parsedData;

            if (state.songData.dicePattern) {
                document.getElementById("bpm-ui").value = state.songData.bpm;
                game.conductor.setBPM(state.songData.bpm);
                state.pattern = state.songData.dicePattern;

                UI.renderPattern(state.pattern);
                game.buildTimingTables(state.pattern, 0); // Start time 0 for initial build?
            }
            alert("chart uploaded successfully!");
            
            // Animation
            const first16 = Array.from(UI.elements.container.children).slice(0, 16);
            gsap.from(first16, {
                y: 15,
                opacity: 0,
                duration: 0.3,
                stagger: 0.025,
                paused: false // script.js said paused: true then anim.play(). I'll just auto play.
            });

        } catch (error) {
            alert("Error parsing the uploaded file. Make sure it's a valid .mjson file.");
            console.error(error);
        }
    };
    reader.onerror = function () {
        alert("Error reading the file.");
    };
    reader.readAsText(file);
});

document.getElementById("audioInput").addEventListener("change", function () {
    const file = this.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        if (state.songData) state.songData.songPath = url;
        console.log("Audio file loaded:", url);
    }
});

document.getElementById("bpmInput").addEventListener("input", function () {
    const currentEditorDice = UI.getCurrentEditorDice();
    if (!currentEditorDice) return;
    const newBpm = parseInt(this.value, 10);
    if (!isNaN(newBpm) && newBpm > 0) {
        state.pattern[currentEditorDice.dataset.index].bpmChange = newBpm;
        currentEditorDice.dataset.bpmChange = newBpm;
        UI.repaintDieFace(currentEditorDice);
    }
});

document.getElementById("autoCheck").addEventListener("change", function () {
    const currentEditorDice = UI.getCurrentEditorDice();
    if (!currentEditorDice) return;
    state.pattern[currentEditorDice.dataset.index].auto = this.checked;
    currentEditorDice.dataset.auto = this.checked;
    UI.repaintDieFace(currentEditorDice);
});

document.getElementById("startCheck").addEventListener("change", function () {
    const currentEditorDice = UI.getCurrentEditorDice();
    if (!currentEditorDice) return;
    const index = parseInt(currentEditorDice.dataset.index);

    state.pattern.forEach((item, i) => {
        item.startPos = false;
        UI.elements.container.children[i].classList.remove("start-pos");
    });
    state.startPosOffset = 0;

    if (this.checked) {
        state.pattern.startPos = index; // This sets property on array? script.js did this: pattern.startPos = index.
        // Arrays are objects, so yes.
        UI.elements.container.children[index].classList.add("start-pos");
    } else {
        state.pattern.startPos = 0;
    }
});

// Keyboard controls
document.body.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const key = event.key === " " ? "Space" : event.key;

    if (window.GameSettings?.keybinds?.includes(key)) {
        event.preventDefault();
        game.judgeHit(state.audioContext ? state.audioContext.currentTime : 0);
        if (window.GameSettings.playHitsoundsOnHit) {
            playBongoAt(state.audioContext ? state.audioContext.currentTime : 0, window.GameSettings.hitsoundVolume / 50);
        }
        return;
    }

    if (event.key.toLowerCase() === "r") game.resetGame();
    if (event.key.toLowerCase() === "l") window.listenMode();
    if (event.key === "Escape") window.closeSidebar();
    if (event.key === "Enter") window.play();
    if (event.key.toLowerCase() === "d") window.hide_nav();
    if (event.key.toLowerCase() === "g") {
        UI.triggerFlash();
        const glow = document.querySelector(".glow");
        gsap.fromTo(glow, { y: 0, opacity: 0 }, { y: -50, opacity: 0.6, duration: 0.2, yoyo: true, repeat: 1, ease: "power2.Out" });
    }
});

// Load initial song data
fetch("assets/temp/pattern(30).mjson")
    .then((res) => res.json())
    .then((data) => {
        console.log("Loaded song data:", data);
        state.songData = data;
        state.pattern = data.dicePattern;
        game.conductor.setBPM(data.bpm);

        UI.renderPattern(state.pattern);
        game.buildTimingTables(state.pattern, 0);
        document.getElementById("bpm-ui").value = state.songData.bpm;
        UI.elements.quarterText.innerText = "= " + game.conductor.bpm + " Bpm";

        const first16 = Array.from(UI.elements.container.children).slice(0, 16);
        gsap.from(first16, {
            y: 15,
            opacity: 0,
            duration: 0.3,
            stagger: 0.025,
            paused: false
        });
        
        // Load sounds
        fx.load({
            add_block: "assets/audio/fx/Editor/78060__sugu14__fustapla07.wav",
            remove_block: "assets/audio/fx/Editor/78059__sugu14__fustapla06.wav",
            click: "assets/audio/fx/UI/click.wav",
        }).then(() => {
            console.log("All sounds loaded!");
        });

    })
    .catch((err) => {
        console.error("Failed to load JSON", err);
    });
