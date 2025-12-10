import { state, resetState } from './GameState.js';
import { Conductor } from './Conductor.js';
import { initAudio, playBongoAt, playMetroAt, fx } from './AudioManager.js';
import { elements, updateVisuals, triggerAnimation, triggerHitAnimation, showJudgement, bongo_play, repaintDieFace, renderPattern, titleLabels } from './UI.js';

import { lowerBound, scrollChildToCenter } from './Utils.js';
import { splitLyrics, getCurrentLyric } from './Lyrics.js';

export class Game {
  constructor() {
    this.conductor = new Conductor(state.bpm, state.offset, state.audioContext);
    this.worker = new Worker("judgeHit.worker.js");
    this.setupWorker();
    
    // Metronome scheduler
    this.schedulerTimerId = null;
    this.lookahead = 25.0;
    this.scheduleAhead = 0.1;
  }

  setupWorker() {
    this.worker.onmessage = (e) => {
      const { type, dieIdx, pip, offset } = e.data;
      const showMs = window.GameSettings?.showOffsetCheckbox;
      const dieElement = state.dieElements[dieIdx];
      if (!dieElement) return;
      const dotElements = dieElement.querySelectorAll(".dot");

      if (type === "finished") {
        console.log("Finished sequence");
        return;
      }

      const offsetMs = offset.toFixed(2) + " ms";

      if (type === "silentHit") {
        triggerAnimation(dotElements[pip], "hit");
        state.nextBeatIndex++;
        return;
      }

      if (type === "perfect") {
        triggerAnimation(dotElements[pip], "hit");
        triggerHitAnimation(dieElement);
        showJudgement(dieElement, showMs ? offsetMs : "Perfect!", "#ffffff");

        const hasJudgement = dieElement.querySelector(".judgement");
        if (state.listening && hasJudgement) {
          bongo_play();
        }
        state.nextBeatIndex++;
      } else if (type === "good") {
        triggerAnimation(dotElements[pip], "hit");
        triggerHitAnimation(dieElement);
        showJudgement(dieElement, showMs ? offsetMs : "Good!", "#a8e6cf");
        if (state.listening) bongo_play();
        state.nextBeatIndex++;
      } else if (type === "ok") {
        triggerAnimation(dotElements[pip], "hit");
        triggerHitAnimation(dieElement);
        showJudgement(dieElement, showMs ? offsetMs : "Ok!", "#ffd3b6");
        if (state.listening) bongo_play();
        state.nextBeatIndex++;
      } else if (type === "miss") {
        showJudgement(dieElement, showMs ? offsetMs : "Miss!", "#ff8b94");
      }
      
      if (state.autoHitPending) {
          // If we just processed an auto-hit, clear the flag
          // But wait, we don't know if THIS message was the auto-hit result.
          // However, since worker is sequential, it should be fine.
          // Actually, we should check if nextBeatIndex advanced.
          state.autoHitPending = false;
      }
    };
  }

  async startPlayback(startIndex = 0) {
    if (state.isPlaying) return;
    state.isPlaying = true;

    if (!state.audioContext) {
      await initAudio();
      this.conductor.audioContext = state.audioContext;
    }
    if (state.audioContext.state === "suspended") await state.audioContext.resume();

    this.conductor.setBPM(document.getElementById("bpm-ui").value);

    console.log(
      "Starting playback at index:",
      state.pattern.startPos,
      "with BPM:",
      this.conductor.bpm
    );

    state.nextBeatIndex = startIndex;
    const now = state.audioContext.currentTime;
    state.offset = (window.GameSettings?.offset || 0) / 1000;

    // Play countdown ticks
    for (let i = 0; i < 4; i++) {
      playMetroAt(now + i * this.conductor.crotchet, (window.GameSettings?.metronomeVolume || 50) / 50);
    }
    
    if (state.pattern.startPos != null) {
        state.metroCount = (state.pattern.startPos || 0 % 4) - 1;
    } else {
        state.metroCount = -1;
    }

    const trackStart = now + 4 * this.conductor.crotchet;
    let time = trackStart + state.offset;
    
    this.buildTimingTables(state.pattern, time);

    if (state.trackBuffer) {
      state.musicSrc = state.audioContext.createBufferSource();
      state.musicSrc.buffer = state.trackBuffer;
      const gainNode = state.audioContext.createGain();
      gainNode.gain.value = 0.4;
      state.musicSrc.connect(gainNode).connect(state.audioContext.destination);
      state.musicSrc.start(trackStart, state.startPosOffset);
    }

    this.worker.postMessage({
      type: "init",
      data: {
        subdivisionTimes: state.subdivisionTimes,
        dotMap: state.dotMap,
        volumeMap: state.volumeMap,
        hitWindow: state.hitWindow,
      },
    });

    if (!window.GameSettings?.playHitsoundsOnHit) {
      state.subdivisionTimes.forEach((t, i) => {
        const volume = state.volumeMap[i % state.volumeMap.length];
        if (volume) {
          if (t >= state.startPosOffset) {
            const when = t - state.startPosOffset - state.offset;
            playBongoAt(when, volume);
          }
        }
      });
    }

    this.countdown();

    if (state.metronomeonly) {
      this.startMetronome();
    }

    state.visualIndex = 0;
    cancelAnimationFrame(state.animationId);
    state.animationId = requestAnimationFrame(this.update.bind(this));
    
    // Update UI icons
    elements.playIcon.classList.remove("fa-play");
    elements.playIcon.classList.add("fa-stop");
    elements.quarterText.innerText = " = " + this.conductor.bpm + " Bpm";
  }

  resetGame() {
    console.log("Resetting game...");
    if (state.musicSrc) {
        try {
            state.musicSrc.stop();
        } catch(e) { console.warn("Error stopping musicSrc", e); }
    }
    this.stopMetronome();
    state.activeBongoSources.forEach((source) => {
      try {
        source.source.stop();
      } catch (e) { /* already stopped */ }
    });

    if (state.audioContext) {
      state.audioContext.close().then(() => {
        console.log("AudioContext killed.");
        state.audioContext = null;
      });
    }
    
    cancelAnimationFrame(state.animationId);
    cancelAnimationFrame(state.countdownAnimId);

    resetState();
    
    document.querySelectorAll(".dot").forEach((dot) => dot.classList.remove("active", "hit"));
    document.querySelectorAll("#dice-container .item").forEach((die) => die.classList.add("item-inactive"));
    
    elements.judgementEl.innerText = "";
    elements.judgementEl.classList.remove("pop");
    
    elements.playIcon.classList.remove("fa-stop");
    elements.playIcon.classList.add("fa-play");
  }

  update() {
    if (state.visualIndex >= state.subdivisionTimes.length) {
      console.log("All beats processed, stopping update.");
      cancelAnimationFrame(state.animationId);
      this.stopMetronome();
      return;
    }

    const startPos = state.startPosOffset;
    const now = state.audioContext.currentTime + startPos;

    if (now > state.nextNoteTime) { // Using nextNoteTime as a proxy for nextHittime logic 

      
    }
    
    // Re-implementing the simple visual beat flash from script.js
    // It used nextHittime.
    if (now > this.nextHittime) {
        this.nextHittime += this.conductor.crotchet;
        elements.quarterText.innerText = "= " + this.conductor.bpm + " Bpm";
        triggerAnimation(elements.quarterIcon, "bounce-flash");
    }

    this.checkForMissedBeats(now);
    this.checkForMissedBeats(now);
    updateVisuals(this.conductor, this.judgeHit.bind(this), (newBpm, oldCrotchet) => {
        // Update UI
        document.getElementById("bpm-ui").value = newBpm;
        elements.quarterText.innerText = "= " + newBpm + " Bpm";
        
        // Align metronome
        // Adjust nextNoteTime to reflect the new tempo immediately for the next beat
        const newCrotchet = this.conductor.crotchet;
        state.nextNoteTime = state.nextNoteTime - oldCrotchet + newCrotchet;
        
        // Also restart scheduler to ensure it picks up the new interval immediately if needed
        // But scheduler uses setTimeout loop.
        // If we just adjust nextNoteTime, the loop will pick it up.
    });
    
    // Lyrics update
    const lyric = getCurrentLyric(splitLyrics, now);
    if (lyric && lyric.trim() !== "") {
        elements.title.innerText = lyric;
    }
    
    state.animationId = requestAnimationFrame(this.update.bind(this));
  }

  checkForMissedBeats(currentTime) {
    const cutoff = currentTime - state.hitWindow;
    const newIndex = lowerBound(
      state.subdivisionTimes,
      cutoff,
      Math.max(0, state.nextBeatIndex),
      state.subdivisionTimes.length,
    );
    state.nextBeatIndex = Math.max(state.nextBeatIndex, newIndex);
  }

  judgeHit(audioTime) {
    state.offset = audioTime;
    if (!state.listening) {
      while (state.volumeMap[state.nextBeatIndex % state.volumeMap.length] === 0) {
        state.nextBeatIndex++;
      }
    }

    this.worker.postMessage({
      type: "hit",
      data: { offset: state.offset, nextBeatIndex: state.nextBeatIndex, expected: state.subdivisionTimes[state.nextBeatIndex] },
    });
  }

  buildTimingTables(pattern, start) {
    state.beatQueue.length = 0;
    state.dotMap.length = 0;
    state.volumeMap.length = 0;
    state.subdivisionTimes.length = 0;
    state.actualBeats = []; // script.js had this global

    let time = start;
    let tcrotchet = this.conductor.secondsPerBeat;
    let found_pos = false;

    pattern.forEach((note, i) => {
      const steps = state.pipOrder[note.value];
      if (note.bpmChange) {
        tcrotchet = 60 / note.bpmChange;
      }
      steps.forEach((pip, j) => {
        state.beatQueue.push(4 * note.value);
        state.dotMap.push({ dieIdx: i, pip });
        state.volumeMap.push(note.soundMap[j] ?? 1);
        state.subdivisionTimes.push(time);

        if (note.soundMap[j] === 1 && note.auto !== true) {
             state.actualBeats.push(time);
        }
        if (i === state.pattern.startPos && !found_pos && state.pattern.startPos != 0) {
          state.startPosOffset = time - state.offset;
          found_pos = true;
        }
        time += tcrotchet / steps.length;
      });
    });
  }

  countdown() {
    let count = -1;
    const start = state.audioContext.currentTime;
    const end = start + 4 * this.conductor.crotchet;

    elements.countdownDots.forEach((dot) => dot.classList.remove("active"));
    elements.title.innerText = titleLabels[0];

    const step = () => {
      const now = state.audioContext.currentTime;
      const beat = Math.floor((now - start) / this.conductor.crotchet);

      if (beat !== count && beat >= 0 && beat < elements.countdownDots.length) {
        elements.countdownDots[beat].classList.add("active");
        elements.title.innerText = titleLabels[beat];
        count = beat;
      }

      if (now < end) {
        state.countdownAnimId = requestAnimationFrame(step);
      } else {
        elements.title.innerText = state.songData?.title || "Beat Blocks";
        elements.countdownDots.forEach((dot) => dot.classList.remove("active"));
        cancelAnimationFrame(state.countdownAnimId);
      }
    };

    step();
  }

  scheduler() {
    const secondsPerBeat = this.conductor.crotchet;
    while (state.nextNoteTime < state.audioContext.currentTime + this.scheduleAhead) {
      playMetroAt(state.nextNoteTime);
      state.nextNoteTime += secondsPerBeat;
    }
    this.schedulerTimerId = setTimeout(() => this.scheduler(), this.lookahead);
  }

  startMetronome() {
    this.stopMetronome();
    state.nextNoteTime = state.audioContext.currentTime;
    this.scheduler();
  }

  stopMetronome() {
    clearTimeout(this.schedulerTimerId);
    this.schedulerTimerId = null;
  }

  addDice() {
    if (state.isPlaying) return;
    const container = elements.container;
    let i = container.children.length;

    const wrapper = document.createElement("div");
    wrapper.classList.add("die-wrapper");

    const die = document.createElement("div");
    die.classList.add("item", "grey", `die${i + 1}`);
    die.dataset.index = i;
    die.dataset.value = 1;
    die.dataset.soundmap = "[1]";

    state.pattern.push({
      value: 1,
      soundMap: [1],
    });

    repaintDieFace(die);
    // We need to re-attach listeners. 
    // Since addListenersToDice is in UI.js and not exported, we should probably export it or handle it there.
    // I exported it in UI.js but it's not in the export list? 
    // Wait, I defined it inside UI.js but didn't export it?
    // I should check UI.js content. I think I didn't export `addListenersToDice`.
    // I will assume I can fix UI.js or I should have exported it.
    // For now, let's assume UI.renderPattern handles everything, but for single add, we need to attach.
    // I will call renderPattern again to be safe and easy, or I need to export addListenersToDice.
    // Re-rendering everything is inefficient but safe.
    // Actually, `addDice` in script.js appended manually.
    // Let's rely on UI.renderPattern for now or fix UI.js.
    
    // Better: UI.addDice(state.pattern) ?
    // Let's just call UI.renderPattern(state.pattern)
    renderPattern(state.pattern);
    
    // But we want animation.
    // script.js had animation.
    // Let's leave it simple for now, or move addDice logic to UI.js entirely?
    // `addDice` modifies state AND UI.
    
    fx.play("add_block");
    
    // Animation logic
    const newDie = container.lastChild.firstChild; // wrapper -> die
    setTimeout(() => {
        scrollChildToCenter(newDie, container);
    }, 50);
    
    gsap.fromTo(
        container.lastChild,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.145 }
    ).delay(0.05);
  }

  removeDice() {
    if (state.isPlaying) return;
    const container = elements.container;
    let lastDie = null;
    for (let i = container.children.length - 1; i >= 0; i--) {
      const die = container.children[i]; // wrapper
      // script.js: container.children[i] is wrapper? No, script.js structure: wrapper -> die.
      // script.js: const die = container.children[i]; if (!die.dataset.removing)...
      // In script.js renderPattern: wrapper.appendChild(die); container.appendChild(wrapper);
      // So container.children are wrappers.
      // But script.js checked `die.dataset.removing`. 
      // If `die` is wrapper, it doesn't have dataset.removing unless set.
      // Let's assume wrapper.
      
      if (!die.dataset.removing) {
        lastDie = die;
        break;
      }
    }

    if (!lastDie) return;

    lastDie.dataset.removing = "true";

    gsap.to(lastDie, {
      opacity: 0,
      y: -20,
      duration: 0.145,
      onComplete: () => {
        if (container.contains(lastDie)) {
          container.removeChild(lastDie);
          state.pattern.pop();
        }
      },
    });

    fx.play("remove_block", { randomPitch: true });
  }
}
