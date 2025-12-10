export const originalLyrics = [
  { time: 23.46, text: "You got exactly what you want" },
  { time: 26.42, text: "I got exactly what I wanna be" },
  { time: 29.57, text: "I was inspired not to cut" },
  { time: 33.11, text: "When you told me that you wanna see" },
  { time: 35.87, text: "I've a tube inside my arm" },
  { time: 38.58, text: "I've always struggled with my honesty" },
  { time: 41.90, text: "But now I'm honest like I'm abe" },
  { time: 44.87, text: "4am I'm on an odyssey" },
  { time: 48.60, text: "I got your beat down to the pulse" },
  { time: 51.23, text: "You're in the red like all the cars I see" },
  { time: 54.52, text: "Break new ground I blam the blunt" },
  { time: 57.62, text: "I get clocked like its a job to me" },
  { time: 60.33, text: "Beat Blocks" },
  { time: 67.08, text: "PUSH UR T3MPRR" },
  { time: 68.56, text: "Beat Blocks" },
  { time: 73.61, text: "PUSH UR T3MPRR" },
  { time: 74.94, text: "Beat Blocks" },
  { time: 79.46, text: "PUSH UR T3MPRR" },
  { time: 80.98, text: "Beat Blocks" },
  { time: 85.76, text: "PUSH UR T3MPRR" },
  { time: 87.53, text: "Beat Blocks" },
  { time: 99.06, text: "I got a guy and we're best friends" },
  { time: 100.35, text: "I hope we get to kill ourselves together" },
  { time: 103.38, text: "Grab me by the hips and flip the switch and lose your temper" },
  { time: 106.13, text: "People never change, but skin will rot in any weather" },
  { time: 109.03, text: "Come with me lets play pretend, I know you'll feel great" },
  { time: 112.04, text: "It's not cause I don't like you, I don't wanna see your face" },
  { time: 114.78, text: "Bitch I do not miss you, I miss how you used to taste" },
  { time: 118.33, text: "Put your cigs out on my tummy, smoke 3 packs a day" },
  { time: 121.40, text: "I'm just here to push your temper, put me in my grave" },
  { time: 124.27, text: "" },
  { time: 129.12, text: "Push your temper" },
  { time: 130.62, text: "Beat Blocks" },
  { time: 135.33, text: "Push your temper" },
  { time: 136.83, text: "Beat Blocs" },
  { time: 141.59, text: "Push your temper" },
  { time: 143.06, text: "Beat Blocks" },
  { time: 147.93, text: "Push your temper" },
  { time: 148.67, text: "Beat Blocks" }
];

export const splitLyrics = [];

originalLyrics.forEach(lyric => {
  if (!lyric.text) return; // skip empty lines
  const words = lyric.text.split(" ");
  const chunkDuration = 0.387; // time added per 2-word chunk
  for (let i = 0; i < words.length; i += 2) {
    const chunk = words
      .slice(i, i + 2)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)) // capitalize each word
      .join(" ");
    splitLyrics.push({
      time: lyric.time + 2 + (i / 2) * chunkDuration, // use chunk index
      text: chunk
    });
  }
});

export function getCurrentLyric(lyrics, currentTime) {
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (currentTime >= lyrics[i].time) {
      return lyrics[i].text;
    }
  }
  return ""; // before first lyric
}
