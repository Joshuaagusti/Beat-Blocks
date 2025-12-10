export class Conductor {
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
