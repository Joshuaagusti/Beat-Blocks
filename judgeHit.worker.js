// judgeHit.worker.js
let subdivisionTimes = [];
let dotMap = [];
let volumeMap = [];
let hitWindow = 0.12; // max "OK" window in seconds

// nested windows inside hitWindow
const windows = {
  perfect: 0.05,
  good: 0.08,
  ok: 0.12,
};

self.onmessage = (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    ({ subdivisionTimes, dotMap, volumeMap, hitWindow } = data);
    return;
  }

  if (type === 'hit') {
    let { offset, nextBeatIndex, expected } = data;
    if (nextBeatIndex >= subdivisionTimes.length) {
      self.postMessage({ type: 'finished' });
      return;
    }

    const volume = volumeMap[nextBeatIndex % volumeMap.length];
    const index = nextBeatIndex % dotMap.length;
    const { dieIdx, pip } = dotMap[index];

    // Handle silent beats (e.g., rests)
    if (volume === 0) {
      self.postMessage({
        type: 'silentHit',
        dieIdx,
        pip,
        offset,
      });
      return;
    }
  
    const timeOffset = offset - expected;
    const absOffset = Math.abs(timeOffset);

    console.log(`Hit at ${offset}, expected: ${expected}, timeOffset: ${timeOffset}`);

    let judgment;
    if (absOffset <= windows.perfect) {
      judgment = "perfect";
    } else if (absOffset <= windows.good) {
      judgment = "good";
    } else if (absOffset <= windows.ok) {
      judgment = "ok";
    } else {
      judgment = "miss";
    }

    self.postMessage({
      type: judgment,
      dieIdx,
      pip,
      offset: timeOffset,
    });
  }
};
