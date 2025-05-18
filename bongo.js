const bongo = document.getElementById("bongo");
const frames = [
  "assets/imgs/bongo/bongo-idle-ezgif.com-resize.png",
  "assets/imgs/bongo/bongo-l-ezgif.com-resize.png",
  "assets/imgs/bongo/bongo-r-ezgif.com-resize.png"
];

// Keyboard input
document.addEventListener("keydown", (e) => {
  if (e.key === "j") bongo.src = frames[1]; // Left
  if (e.key === "f") bongo.src = frames[2]; // Right
});

document.addEventListener("keyup", (e) => {
  if (e.key === "j" || e.key === "f") bongo.src = frames[0]; // Idle
});

// 🧠 Touch support
document.addEventListener("touchstart", (e) => {
  const touchX = e.touches[0].clientX;
  const screenWidth = window.innerWidth;

  if (touchX < screenWidth / 2) {
    // Left side = "j"
    bongo.src = frames[1];
  } else {
    // Right side = "f"
    bongo.src = frames[2];
  }
}, { passive: false });

document.addEventListener("touchend", () => {
  bongo.src = frames[0]; // Reset to idle
});
