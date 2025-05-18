// ======================================================
// AUDIO & SCHEDULING GLOBALS
// ======================================================
let audioContext;                // Web Audio API context
let bongoBuffer;                 // Sound buffer for bongo hit
let trackBuffer;                 // Sound buffer for background music
let metroBuffer;                 // Sound buffer for metronome tick
let musicSrc;                    // Background track audio source
let beatQueue = [];              // Array of subdivision durations
let dotMap = [];                 // Maps to dice indices and pip positions {dieIdx, pip}
let subdivisionTimes = [];       // Exact timing for each beat 
let volumeMap = [];              // Volume level for each beat (1 = play, 0 = silent)
const activeBongoSources = [];   // Track active bongo sounds for cleanup
let visualIndex = 0;             // Current visual marker position
let animationId;                 // Animation frame ID for visual updates
let countdownAnimId;             // Animation frame ID for countdown
let isPlaying = false;           // Playback state
let metronomeonly = true;        // Whether to play only metronome (no music)
let looptimes = 4;               // Number of times to loop the pattern
let subdivisionsPerLoop = 0;     // Number of "ticks" in one loop
let maxDiceVisible;              // Maximum dice visible at once
let currentSlice = 0;            // Current visible slice/page of dice
let totalSlices = 0;             // Total number of slices/pages
let sliceBoundaries = [];        // Subdivision-index at end of each slice

// ======================================================
// INTERACTIVITY GLOBALS
// ======================================================
const hitWindow = 0.1;          // Timing window for hit detection (seconds)
let nextBeatIndex = 0;           // Next expected beat to hit
let judgementEl = document.getElementById("judgement"); // Visual feedback element
let loopIndex = 0;               // Current loop iteration

// ======================================================
// BONGO CAT ANIMATION
// ======================================================
const bongo_play = (function() {
  let toggle = false; // Tracks which frame to show
  
  return function() {
    const bongoElement = document.getElementById("bongo");
    
    if (!bongoElement) {
      console.error("Bongo element not found!");
      return;
    }
    
    const frames = [
      "assets/imgs/bongo/bongo-idle-ezgif.com-resize.png",
      "assets/imgs/bongo/bongo-l-ezgif.com-resize.png",
      "assets/imgs/bongo/bongo-r-ezgif.com-resize.png"
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
let bpm;                      // Beats per minute
let offset = 0;               // Timing offset
let crotchet = 60 / bpm;      // Duration of quarter note in seconds
let listening = false;        // Whether to play bongos on hits

// ======================================================
// LOAD SONG DATA
// ======================================================
let songData;
fetch('assets/charts/pattern.mjson')
  .then(res => res.json())
  .then(data => {
    console.log('Loaded song data:', data);
    songData = data;
    maxDiceVisible = songData.maxDiceVisible || 16; 
    generateBeatQueue(songData.dicePattern);
    document.getElementById('bpm-ui').value = songData.bpm;
  })
  .catch(err => {
    console.error('Failed to load JSON', err);
  });

// ======================================================
// CONSTANTS
// ======================================================
// Die color mapping
const dieColors = {
  1: "#fb6354",  // Red 
  2: "#72b9fe",  // Blue
  3: "#fece00",  // Yellow
  4: "#c739ff"   // Purple
};

// Pip order per die face
const pipOrder = {
  1: [0],              // One dot in center
  2: [0, 1],           // Two dots
  3: [1, 0, 2],        // Three dots
  4: [0, 2, 1, 3]      // Four dots
};

// ======================================================
// UI ELEMENTS
// ======================================================
const countdownElement = document.getElementById("countdown");
const countdownDots = countdownElement.querySelectorAll('.dot');
const title = document.getElementById("title");
const titleLabels = ["1", "2", "Ready?", "Go!"];

// ======================================================
// MAIN GAME CONTROL
// ======================================================
function play() {
  if (isPlaying) {
    resetGame();
    document.getElementById('play').innerHTML = '<i class="fa-solid fa-play" style="color: #ffffff;"></i>';
    return;
  }
 
  document.getElementById('play').innerHTML = '<i class="fa-solid fa-stop" style="color: #ffffff;"></i>';
  generateBeatQueueFromDOM();
  startPlayback();
}

// ======================================================
// AUDIO INITIALIZATION
// ======================================================
async function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Load metronome and bongo sounds (essential)
    const [bongoData, metronomeData] = await Promise.all([
      fetch("assets/audio/bongo-one-shot-clean_G_minor.wav").then(r => r.arrayBuffer()),
      fetch("assets/audio/fx/Metronomes/Perc_MetronomeQuartz_hi.wav").then(r => r.arrayBuffer())
    ]);

    // Decode audio data
    bongoBuffer = await audioContext.decodeAudioData(bongoData);
    metroBuffer = await audioContext.decodeAudioData(metronomeData);

    // Attempt to load and decode background track
    let trackData, trackLoadSuccess = false;
    try {
      trackData = await fetch(songData.songPath).then(r => r.arrayBuffer());
      trackBuffer = await audioContext.decodeAudioData(trackData);
      trackLoadSuccess = !!trackBuffer;
    } catch (trackErr) {
      console.warn("Track failed to load or decode. Falling back to metronome-only mode.");
      trackBuffer = null;
    }

    // Check if essential sounds loaded successfully
    if (bongoBuffer && metroBuffer) {
      console.log('Essential audio loaded. Track:', trackLoadSuccess ? 'Loaded' : 'Missing');
      return true;
    } else {
      console.error('Failed to load essential audio (bongo or metronome).');
      return false;
    }
  } catch (error) {
    console.error('Error loading or decoding audio:', error);
    return false;
  }
}

// ======================================================
// DIE FACE RENDERING
// ======================================================
function repaintDieFace(dieEl) {
  const value = Number(dieEl.dataset.value);
  const index = dieEl.dataset.patternIndex;

  // Clear classes and content
  dieEl.className = `item grey die${+index+1}`; //removed grey
  
  // Add appropriate face class
  const faceClasses = {
    1: 'first-face',
    2: 'second-face',
    3: 'third-face',
    4: 'fourth-face'
  };
  
  dieEl.classList.add(faceClasses[value] || 'first-face', 'die-face-flip');

  // Rebuild inner HTML for dots based on die value
  let html = '';
  switch (value) {
    case 1:
      html = `<span class="dot"></span>`;
      break;
    case 2:
      html = `<span class="dot"></span><span class="dot"></span>`;
      break;
    case 3:
      html = `
        <div class="column"><span class="dot"></span></div>
        <div class="column"><span class="dot"></span><span class="dot"></span></div>`;
      break;
    case 4:
      html = `
        <div class="column"><span class="dot"></span><span class="dot"></span></div>
        <div class="column"><span class="dot"></span><span class="dot"></span></div>`;
      break;
  }
 dieEl.innerHTML =html;

  
  // Get all dots in the die
  const dots = dieEl.querySelectorAll('.dot');
  
  // Apply sound mapping (silent dots)
  try {
    const soundMap = JSON.parse(dieEl.dataset.soundmap || '[]');
    pipOrder[value].forEach((pipIndex, j) => {
      if ((soundMap[j] ?? 1) === 0) {
        dots[pipIndex].classList.add('silent');
      }
    });
  } catch (e) {
    console.error('Error parsing soundmap:', e);
  }
}

// ======================================================
// DICE MANAGEMENT
// ======================================================
function addDice() {
  const container = document.getElementById('dice-container');
  let i = container.children.length;
  
  const wrapper = document.createElement("div");
  wrapper.classList.add("die-wrapper");
  
  const die = document.createElement("div");
  die.classList.add( "item","grey", `die${i+1}`); 
  die.dataset.patternIndex = i;
  die.dataset.value = 1;
  die.dataset.soundmap = "[1]";
  
  repaintDieFace(die);
  
  // Add click handler to cycle die values
  die.addEventListener('click', () => {
    let value = Number(die.dataset.value) || 1;
    die.dataset.value = (value % 4) + 1; // Cycle 1 → 2 → 3 → 4 → 1
    repaintDieFace(die);
  });
  
  // Append die inside wrapper
  wrapper.appendChild(die);
  
  // Append wrapper to container
  container.appendChild(wrapper);
  
  // Delay scrollIntoView to allow DOM update
  setTimeout(() => {
    die.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }, 50); // Delay to ensure the DOM has been updated
}


function removeDice() {
  const container = document.getElementById('dice-container');
  if (container.children.length > 0) {
    const lastDie = container.lastElementChild;
    container.removeChild(lastDie);
  }
}

// ======================================================
// BEAT GENERATION
// ======================================================
function generateBeatQueueFromDOM() {
  // Clear all previous arrays
  beatQueue.length = 0;
  dotMap.length = 0;
  volumeMap.length = 0;
  subdivisionTimes.length = 0;
  
  // Create pattern from current DOM
  const pattern = [];
  const diceElements = document.querySelectorAll('#dice-container .item');
  
  console.log(`Found ${diceElements.length} dice in the DOM`);
  
  // Extract data from each die element
  diceElements.forEach((die, i) => {
    const value = Number(die.dataset.value) || 1;
    let soundMap = [];
    
    try {
      soundMap = JSON.parse(die.dataset.soundmap || '[]');
      // Create default soundMap if needed
      if (soundMap.length === 0 && pipOrder[value]) {
        soundMap = new Array(pipOrder[value].length).fill(1);
      }
    } catch (e) {
      // Default to all audible if parsing fails
      soundMap = new Array(pipOrder[value].length).fill(1);
    }
    
    pattern.push({ value, soundMap });
  });
  

  
  // Build timing and volume maps from pattern
  pattern.forEach(({ value, soundMap }, i) => {
    // Ensure valid soundMap for this die
    const sm = Array.isArray(soundMap) && soundMap.length > 0
               ? soundMap 
               : new Array(pipOrder[value].length).fill(1);
    
    // Process each pip position
    pipOrder[value].forEach((pipPosition, j) => {
      beatQueue.push(4 * value);                    // Duration divisor
      dotMap.push({ dieIdx: i, pip: pipPosition }); // Visual map
      volumeMap.push(sm[j] ?? 1);                   // Volume (default 1)
    });
  });
  


  
  console.log('Generated beat queue from DOM:', {
    beatQueue: beatQueue.length,
    dotMap: dotMap.length,
    volumeMap: volumeMap.length,
    sliceBoundaries
  });
  
  return true;
}

function generateBeatQueue(pattern) {
  // Clear previous data
  beatQueue.length = 0;
  dotMap.length = 0;
  volumeMap.length = 0;
  subdivisionTimes.length = 0;
  


  // Clear and rebuild dice container
  const container = document.getElementById("dice-container");
  container.innerHTML = "";
 
  // Create dice elements from pattern
  pattern.forEach(({ value, soundMap }, i) => {
    // Default to value 1 if not specified
    const dieValue = value || 1;
       const wrapper = document.createElement("div");
        wrapper.classList.add("die-wrapper");
    // Create die element
    const die = document.createElement("div");
    die.classList.add("grey", "item", `die${i+1}`);
    die.dataset.patternIndex = i;
    die.dataset.value = dieValue;
    die.dataset.soundmap = JSON.stringify(soundMap);
    repaintDieFace(die);
    
    // Add click handler to cycle die values
    die.addEventListener('click', () => {
      let v = Number(die.dataset.value) || 1;
      die.dataset.value = (v % 4) + 1; // Cycle 1 → 2 → 3 → 4 → 1
      repaintDieFace(die);
    });
    
   // Append die inside wrapper
  wrapper.appendChild(die);
  
  // Append wrapper to container
  container.appendChild(wrapper);
   
    // Build timing and volume maps
    const sm = Array.isArray(soundMap)
               ? soundMap
               : new Array(pipOrder[dieValue].length).fill(1);
               
    pipOrder[dieValue].forEach((pipPosition, j) => {
      beatQueue.push(4 * dieValue);
      dotMap.push({ dieIdx: i, pip: pipPosition });
      volumeMap.push(sm[j]);
    });

    // Mark silent dots
    const dots = die.querySelectorAll('.dot');
    pipOrder[dieValue].forEach((pipIndex, j) => {
      if ((sm[j] ?? 0) === 0) dots[pipIndex].classList.add('silent');
    });
  });


  
  
  document.getElementById('quarter-p').innerHTML = '&nbsp;= ' + songData.bpm + ' bpm';

}


// ======================================================
// AUDIO PLAYBACK
// ======================================================
function playBongoAt(time, volume = 1) {
  const source = audioContext.createBufferSource();
  const gainNode = audioContext.createGain();

  gainNode.gain.value = volume;

  source.buffer = bongoBuffer;

 
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);

  source.start(time);
  activeBongoSources.push(source);
}


let metroCount = -1;



function playMetroAt(time, volume = 1) {
  metroCount++;

  const source = audioContext.createBufferSource();
  source.buffer = metroBuffer;

  const gainNode = audioContext.createGain();
  let adjustedVolume = volume;
  let playbackRate = 1.0;

  if (metroCount > 4) {
    if ((metroCount - 4) % 4 === 0) {
      adjustedVolume = volume * 2;
      playbackRate = 1.2;
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
async function startPlayback() {
  if (isPlaying) return;
  
  // Initialize audio if needed
  if (!audioContext) await initAudio();
  if (audioContext.state === 'suspended') await audioContext.resume();

  // Get current BPM and calculate timing
  bpm = document.getElementById('bpm-ui').value;
  crotchet = 60 / bpm;



  // Reset playback state
  isPlaying = true;
  nextBeatIndex = 0;
  subdivisionTimes.length = 0;

  const now = audioContext.currentTime;
  
  // Play countdown ticks
  for (let i = 0; i < 4; i++) {
    playMetroAt(now + i * crotchet, 0.3);
  }

  // Schedule background track
  const trackStart = now + 4 * crotchet + offset;
  
  if (trackBuffer) {
    musicSrc = audioContext.createBufferSource();
    musicSrc.buffer = trackBuffer;
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1;
    musicSrc.connect(gainNode).connect(audioContext.destination);
    musicSrc.start(trackStart);
  }
  
  // Calculate exact timing for each subdivision
  let time = trackStart;
  beatQueue.forEach(subdivisionDuration => {
    subdivisionTimes.push(time);
    time += (4 / subdivisionDuration) * crotchet;
  });
  
  // Schedule bongo sounds if listening mode is active
  subdivisionTimes.forEach((time, i) => {
    const volume = volumeMap[i % volumeMap.length]; // wrap index
    if (listening && volume) {
      playBongoAt(time);
    }
  });

  // Start visual countdown
  countdown();
  
  // Start metronome if needed
  if (metronomeonly) {
    startMetronome(bpm);
  }

  // Start visual animations
  visualIndex = 0;
  cancelAnimationFrame(animationId);

   animationId = requestAnimationFrame(update);
}

// ======================================================
// VISUAL FEEDBACK
// ======================================================
function countdown() {
  let count = -1;
  const start = audioContext.currentTime;
  const end = start + 4 * crotchet;

  // Reset countdown UI
  countdownDots.forEach(dot => dot.classList.remove('active'));
  title.innerHTML = titleLabels[0];

  function step() {
    const now = audioContext.currentTime;
    const beat = Math.floor((now - start) / crotchet);
    
    // Update UI when crossing a beat boundary
    if (beat !== count && beat >= 0 && beat < countdownDots.length) {
      countdownDots[beat].style.backgroundColor = "black";
      title.innerHTML = titleLabels[beat];
      count = beat;
    }
    
    // Continue animation or cleanup
    if (now < end) {
      countdownAnimId = requestAnimationFrame(step);
    } else {
      title.innerHTML = songData.title || "Beat Blocks";
      countdownDots.forEach(dot => dot.style.backgroundColor = "darkgrey");
      cancelAnimationFrame(countdownAnimId);
    }
  }
  
  step();
}
  let newTime = 0;
 const quarterIcon = document.getElementById('quarter-note-icon');
 // Setup animation reset once
quarterIcon.addEventListener('animationend', () => {
  quarterIcon.classList.remove('bounce-flash');
});

// Trigger animation on each beat
function triggerAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth; // force reflow
  element.classList.add(className);
}

let shouldResetVisuals = false;
function update() {

  
   updateVisuals();
if (audioContext.currentTime > crotchet + newTime) {
    newTime += crotchet;

   
    triggerAnimation(quarterIcon, 'bounce-flash');
     console.log("beat");
 
}

  // 2. Request next frame
  animationId = requestAnimationFrame(update);
}

function updateVisuals() {
  const now = audioContext.currentTime;
  checkForMissedBeats(now);
  
  // Process all beats that should have happened by now
  while (visualIndex < subdivisionTimes.length && now >= subdivisionTimes[visualIndex]) {
    const displayIndex = visualIndex % dotMap.length;
    
    // Skip if index is out of bounds
    if (displayIndex >= dotMap.length) {
      visualIndex++;
      continue;
    }
    
    // Get die and pip info for this beat
    const { dieIdx, pip } = dotMap[displayIndex];
    const dieElement = document.querySelector(`.die${dieIdx+1}`);
    
    // Skip if die doesn't exist
    if (!dieElement) {
      visualIndex++;
      continue;
    }
    
    // Highlight the active pip
    const dotElements = dieElement.querySelectorAll('.dot');
if (dotElements[pip]) {
  // Remove active class from all dots first
  dieElement.querySelectorAll('.dot.active').forEach(dot => {
    dot.classList.remove('active');
  });

  // Add active class to the current dot
  dotElements[pip].classList.add('active');

  // Update die background color and scroll into view
  const dieValue = Number(dieElement.dataset.value) || 1;
  dieElement.scrollIntoView({ block: 'center' });
  dieElement.style.backgroundColor = dieColors[dieValue];


  
}

    // Check for player hit if in listening mode
    if (listening) {
      judgeHit(subdivisionTimes[visualIndex]);
    }

    // Check if we've reached a slice boundary
    if (visualIndex > 0 && visualIndex === sliceBoundaries[currentSlice]) {
      shouldResetVisuals = true;
    }

    visualIndex++;
  }

  // Move to next page if needed
  if (shouldResetVisuals) {  
    currentSlice = (currentSlice + 1) % totalSlices;
    console.log(`Page swap → now showing slice ${currentSlice}`);
    updateDiceVisibility();
    console.log("updateVisuals", currentSlice, totalSlices, visualIndex, sliceBoundaries[currentSlice]);
    shouldResetVisuals = false;
  }


}

// ======================================================
// ANIMATION HELPERS
// ======================================================
function triggerAnimation(element, className) {
 
  element.classList.remove(className);

  // Force reflow (reset animation)
  void element.offsetWidth;

  // Add the class to start animation
  element.classList.add(className);


}


// ======================================================
// HIT DETECTION & FEEDBACK
// ======================================================
function judgeHit(preciseTime) {

  checkForMissedBeats(preciseTime);

  // Stop if all beats are done
  if (nextBeatIndex >= subdivisionTimes.length) return;

  // Skip silent subdivisions
  const volume = volumeMap[nextBeatIndex % volumeMap.length];
  if (volume === 0) {
    nextBeatIndex++;
    return;
  }

  // Get die and pip for current beat
  const index = nextBeatIndex % dotMap.length;
  const { dieIdx, pip } = dotMap[index];
  const dieElement = document.querySelector(`.die${dieIdx+1}`);
  
  // Skip if die or pip doesn't exist
  if (!dieElement) {
 
    return;
  }
  
  const dotElements = dieElement.querySelectorAll('.dot');
  if (!dotElements[pip]) {
   
    return;
  }

  // Calculate window
  const timeOffset = preciseTime - subdivisionTimes[nextBeatIndex];

  // Reset judgment animation
  judgementEl.classList.remove('pop');
  void judgementEl.offsetWidth; // Force reflow

  // Evaluate hit quality
  if (Math.abs(timeOffset) <= hitWindow) {
    // Perfect hit
    triggerAnimation(dotElements[pip], 'hit');
    triggerAnimation(dieElement, 'hit');
    judgementEl.textContent = 'perfect!';
    judgementEl.style.color = 'green';
    nextBeatIndex++;
    
    // Play bongo cat animation if in listening mode
    if (listening) {
      bongo_play();
    }
  } else if (timeOffset > hitWindow) {
    // Late hit
    judgementEl.textContent = 'missed! late';
    judgementEl.style.color = 'red';
  } else {
    // Early hit
    judgementEl.textContent = 'missed! early';
    judgementEl.style.color = 'red';
  }

  // Show judgment animation
  judgementEl.classList.add('pop');
}

// ======================================================
// MISSED BEAT HANDLER
// ======================================================
function checkForMissedBeats(currentTime) {
  // Skip past any beats that are too old to hit
  while (nextBeatIndex < subdivisionTimes.length && 
         currentTime - subdivisionTimes[nextBeatIndex] > hitWindow) {
    nextBeatIndex++;
  }
}

// ======================================================
// GAME RESET
// ======================================================
function resetGame() {
  // Stop all audio
  if (musicSrc) musicSrc.stop();
  stopMetronome();
  activeBongoSources.forEach(source => {
    try { source.stop(); } catch (e) { /* already stopped */ }
  });

  
  // Cancel animations
  cancelAnimationFrame(animationId);
  cancelAnimationFrame(countdownAnimId);
  
  // Reset state
  subdivisionTimes = [];
  beatQueue = [];
  isPlaying = false;
  nextBeatIndex = 0;
  visualIndex = 0;
  newTime = 0;
  // Reset visual elements
  document.querySelectorAll('.dot').forEach(dot => dot.classList.remove('active', 'hit'));
  document.getElementById('dice-container').querySelectorAll('.item').forEach(die => {
    die.style.backgroundColor = 'grey';
  });
  
  // Clear judgment display
  judgementEl.innerHTML = '';
  judgementEl.classList.remove('pop');
}

// ======================================================
// KEYBOARD CONTROLS
// ======================================================
document.body.addEventListener('keydown', event => {
  if (event.repeat) return;

  if (event.code === 'Space' || event.code === 'KeyF' || event.code === 'KeyJ') {
    event.preventDefault(); 
    playBongoAt(0);
    judgeHit(audioContext.currentTime);
  }

  if (event.key.toLowerCase() === 'r') {
    resetGame();
  }
});

// phone tap support
document.body.addEventListener('touchstart', event => {


  judgeHit(audioContext.currentTime);
}, { passive: false }); 



// ======================================================
// SAVE/LOAD FUNCTIONALITY
// ======================================================


//unfinished save
function downloadMJSON() {
  // Create pattern from current DOM state
  const pattern = [];
  document.querySelectorAll('#dice-container .item').forEach(die => {
    const value = Number(die.dataset.value) || 1;
    let soundMap = [];
    
    try {
      soundMap = JSON.parse(die.dataset.soundmap || '[]');
    } catch (e) {
      soundMap = new Array(pipOrder[value].length).fill(1);
    }
    
    pattern.push({ value, soundMap });
  });
  
  // Update song data with current pattern
  songData.dicePattern = pattern;
  
  
  const dataStr = JSON.stringify(songData, null, 2); // Pretty-print
  const blob = new Blob([dataStr], { type: "application/json" });
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
let nextNoteTime = 0.0;
let schedulerTimerId = null;
const lookahead = 25.0;    
const scheduleAhead = 0.1;  

function scheduler(bpm) {
  const secondsPerBeat = 60.0 / bpm;


  while (nextNoteTime < audioContext.currentTime + scheduleAhead) {
    playMetroAt(nextNoteTime);
  
    nextNoteTime += secondsPerBeat;
  }

  // Schedule next call
  schedulerTimerId = setTimeout(() => scheduler(bpm), lookahead);
}

function startMetronome(bpm) {
  stopMetronome();
  nextNoteTime = audioContext.currentTime;
  
  
  scheduler(bpm);
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

  reader.onload = function(event) {
    try {
      const fileContent = event.target.result; 
      const parsedData = JSON.parse(fileContent);

      // Process the uploaded data
      console.log(parsedData);
      songData = parsedData;
      
 
      if (songData.dicePattern) {
        document.getElementById('bpm-ui').value = songData.bpm;
        maxDiceVisible = songData.maxDiceVisible;
        generateBeatQueue(songData.dicePattern);
        songData.songPath = songData.songPath;
          initAudio();
      }
      console.log(songData.songPath);
      alert("chart uploaded successfully!");
    } catch (error) {
      alert("Error parsing the uploaded file. Make sure it's a valid .mjson file.");
      console.error(error);
    }
  };

  reader.onerror = function() {
    alert("Error reading the file.");
  };
  reader.readAsText(file);
}
/* low lag test (didnt work :skull:)
lowLag.init();
lowLag.load("assets/audio/bongo-one-shot-clean_G_minor.wav");
function lowPlayBongo(){

  lowLag.play("assets/audio/bongo-one-shot-clean_G_minor.wav")
}
*/
//listem mode toggle
function listenMode() {
  if (listening) {
    listening = false;
    document.getElementById('listen').classList.add('inactive');
  }
  else{
    listening = true;
    document.getElementById('listen').classList.remove('inactive');

  }
}
document.getElementById('fileInput').addEventListener('change', handleFileUpload);
