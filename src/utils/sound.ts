// Sound synthesizer using Web Audio API for photobooth sound effects
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a high-pitched countdown tick beep (3, 2, 1)
 */
export function playCountdownBeep(isFinal = false): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(isFinal ? 1046.5 : 587.33, ctx.currentTime); // C6 for final, D5 for ticks

  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinal ? 0.25 : 0.12));

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + (isFinal ? 0.25 : 0.12));
}

/**
 * Play a mechanical camera shutter snap sound
 */
export function playShutterSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Mechanical click 1
  const clickOsc1 = ctx.createOscillator();
  const clickGain1 = ctx.createGain();
  clickOsc1.type = 'square';
  clickOsc1.frequency.setValueAtTime(120, ctx.currentTime);
  clickGain1.gain.setValueAtTime(0.35, ctx.currentTime);
  clickGain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
  clickOsc1.connect(clickGain1);
  clickGain1.connect(ctx.destination);
  clickOsc1.start();
  clickOsc1.stop(ctx.currentTime + 0.05);

  // Noise burst for mechanical shutter flap
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1400, ctx.currentTime);
  filter.Q.setValueAtTime(2, ctx.currentTime);

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.4, ctx.currentTime + 0.02);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(ctx.destination);

  noise.start(ctx.currentTime + 0.02);
  noise.stop(ctx.currentTime + 0.09);

  // Mechanical click 2 (re-arm)
  setTimeout(() => {
    if (!ctx) return;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(320, ctx.currentTime);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start();
    osc2.stop(ctx.currentTime + 0.06);
  }, 120);
}

/**
 * Play a cheerful chime when photostrip finishes generating
 */
export function playSuccessChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

    gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime + idx * 0.08);
    osc.stop(ctx.currentTime + idx * 0.08 + 0.36);
  });
}
