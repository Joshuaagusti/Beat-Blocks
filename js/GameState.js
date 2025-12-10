export const state = {
  audioContext: null,
  audioContextwithoffset: null,
  bongoBuffer: null,
  trackBuffer: null,
  metroBuffer: null,
  musicSrc: null,
  beatQueue: [],
  actualBeats: [],
  dotMap: [],
  subdivisionTimes: [],
  volumeMap: [],
  activeBongoSources: [],
  visualIndex: 0,
  animationId: null,
  countdownAnimId: null,
  isPlaying: false,
  autoHitPending: false,
  metronomeonly: true,
  waitForStart: true,
  metroCount: -1,
  dieElements: [],
  pattern: [],
  songData: null,
  // Interactivity
  hitWindow: 0.12,
  nextBeatIndex: 0,
  BlockMaxNumber: 6,
  
  // Playback
  bpm: 120, // Default, will be overwritten
  offset: 0.085,
  crotchet: 0,
  listening: true,
  startPosOffset: 0,
  
  // Metronome
  nextNoteTime: 0.0,
  schedulerTimerId: null,
  
  // Visuals
  dotElementsMap: null,
  
  // Constants
  pipOrder: {
    1: [0],
    2: [0, 1],
    3: [1, 0, 2],
    4: [0, 2, 1, 3],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5],
  },
  
  dieColors: {}
};

export function resetState() {
    state.metroCount = -1;
    state.subdivisionTimes = [];
    state.beatQueue = [];
    state.actualBeats = [];
    state.isPlaying = false;
    state.nextBeatIndex = 0;
    state.visualIndex = 0;
    // state.pattern = []; // Don't reset pattern on simple reset?
}
