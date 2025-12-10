import { state } from './GameState.js';

export class SoundFX {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.buffers = {}; // store decoded audio buffers
  }

  // preload multiple sounds at once
  async load(sounds) {
    const entries = Object.entries(sounds);
    const promises = entries.map(async ([name, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load sound: ${url} (${res.status})`);
      const data = await res.arrayBuffer();
      try {
        const buffer = await this.ctx.decodeAudioData(data);
        this.buffers[name] = buffer;
      } catch (e) {
        console.error(`Failed to decode audio for ${name} (${url})`, e);
      }
    });
    await Promise.all(promises);
  }

  // play by name
  play(name, options = {}, time = 0) {
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

    source.start(time);
  }
}

export const fx = new SoundFX();

export function getBongoSoundPath(name) {
  switch (name) {
    case "Ping Pong":
      return "assets/audio/Bongos/PingPong.wav";
    case "Bongo":
      return "assets/audio/Bongos/Bongo.wav";
    case "Bongo 2":
      return "assets/audio/Bongos/Bongo2.wav";
    case "Drum":
      return "assets/audio/Bongos/drum.wav";
    default:
        return "assets/audio/Bongos/Bongo.wav";
  }
}

export function getMetroSoundPath(name) {
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
      return "assets/audio/Metronomes/Percussion.wav";
  }
}

export async function initAudio() {
 
  try {
    // Always create a new context for the game loop, matching script.js behavior
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioContext = state.audioContext;

    let BongoSoundPath = getBongoSoundPath(window.GameSettings?.hitsoundType || "Bongo");
    let MetroSoundPath = getMetroSoundPath(window.GameSettings?.metronomeType || "Percussion");

    // Load metronome and bongo sounds (essential)
    const [bongoData, metronomeData] = await Promise.all([
      fetch(BongoSoundPath).then(r => { if (!r.ok) throw new Error(`Failed to load ${BongoSoundPath}`); return r.arrayBuffer(); }),
      fetch(MetroSoundPath).then(r => { if (!r.ok) throw new Error(`Failed to load ${MetroSoundPath}`); return r.arrayBuffer(); }),
    ]);

    // Decode audio data
    try {
        state.bongoBuffer = await audioContext.decodeAudioData(bongoData);
    } catch (e) { console.error("Failed to decode Bongo sound", e); }
    
    try {
        state.metroBuffer = await audioContext.decodeAudioData(metronomeData);
    } catch (e) { console.error("Failed to decode Metronome sound", e); }

    // Attempt to load and decode background track
    if (state.songData && state.songData.songPath) {
        let trackData;
        try {
        trackData = await fetch(state.songData.songPath).then((r) => r.arrayBuffer());
        state.trackBuffer = await audioContext.decodeAudioData(trackData);
        } catch (trackErr) {
        console.warn(
            "Track failed to load or decode. Falling back to metronome-only mode.",
        );
        state.trackBuffer = null;
        }
    }

    // Check if essential sounds loaded successfully
    if (state.bongoBuffer && state.metroBuffer) {
      console.log(
        "Essential audio loaded. Track:",
        state.trackBuffer ? "Loaded" : "Missing",
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

export function playBongoAt(time, volume) {
  const audioContext = state.audioContext;
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  gainNode.gain.value = (volume * (window.GameSettings?.hitsoundVolume || 50)) / 50;

  source.buffer = state.bongoBuffer;

  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(time);

  source.onended = () => {
    state.activeBongoSources = state.activeBongoSources.filter((s) => s !== source);
  };

  state.activeBongoSources.push({
    source,
    gainNode,
    scheduledTime: time,
    hit: false,
    canceled: false,
  });
}

export function playMetroAt(time, volume = (window.GameSettings?.metronomeVolume || 50) / 50) {
  state.metroCount++;
  const audioContext = state.audioContext;
  //triggerAnimation(quarterIcon, 'bounce-flash'); // This is UI, should be handled via callback or event? 
  // For now, we'll leave UI out of Audio.
  
  const source = audioContext.createBufferSource();
  source.buffer = state.metroBuffer;

  const gainNode = audioContext.createGain();
  let adjustedVolume = volume;
  let playbackRate = 1.0;

  if (state.metroCount > 4) {
    if ((state.metroCount - 4) % 4 === 0) {
      adjustedVolume = volume * 2;
      playbackRate = 1.2; // Speed up every 4th beat after the first 4
    }
  }

  gainNode.gain.value = adjustedVolume;
  source.playbackRate.value = playbackRate;

  source.connect(gainNode).connect(audioContext.destination);
  source.start(time);
}
