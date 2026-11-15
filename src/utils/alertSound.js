// Ring + vibrate for incoming calls. Browsers only allow sound after the
// user has tapped the page once, so the driver screen unlocks audio on the
// first tap.
let ctx = null;

export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ||= new AC();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    // No audio: vibration and the on-screen alert still work.
  }
}

export function ring(beeps = 3) {
  try {
    unlockAudio();
    if (ctx) {
      const t0 = ctx.currentTime + 0.02;
      for (let i = 0; i < beeps; i++) {
        const at = t0 + i * 0.35;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = i % 2 ? 660 : 880;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 0.3);
      }
    }
  } catch {
    // ignore
  }
  // Phones only allow vibration after the person has touched the page.
  if (navigator.userActivation?.hasBeenActive !== false) {
    try {
      navigator.vibrate?.(Array.from({ length: beeps * 2 - 1 }, (_, i) => (i % 2 ? 150 : 400)));
    } catch {
      // Not allowed yet; the sound still plays.
    }
  }
}
