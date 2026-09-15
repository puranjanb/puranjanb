(() => {
  "use strict";

  // ---- Config ----
  const MAX_STEPS = 60;
  const BUFFER_SIZE = 140; // internal simulation resolution (kept small for perf, upscaled visually)
  const SEED = 20240613;
  const STEP_INTERVAL_MS = 90;

  // ---- Elements ----
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const slider = document.getElementById("stepSlider");
  const stepCountEl = document.getElementById("stepCount");
  const stepMaxEl = document.getElementById("stepMax");
  const playBtn = document.getElementById("playBtn");
  const resetBtn = document.getElementById("resetBtn");

  slider.max = String(MAX_STEPS);
  stepMaxEl.textContent = String(MAX_STEPS);

  // Offscreen low-res buffer canvas we render pixel data into, then scale up.
  const buffer = document.createElement("canvas");
  buffer.width = BUFFER_SIZE;
  buffer.height = BUFFER_SIZE;
  const bctx = buffer.getContext("2d");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ---- Deterministic PRNG (mulberry32) seeded per-pixel so the same step
  // always renders identically (no flicker when scrubbing the slider). ----
  function hash2D(x, y, seed) {
    let h = seed ^ (x * 374761393) ^ (y * 668265263);
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }

  function rand01(x, y, channel, seed) {
    return hash2D(x * 3 + channel * 97, y * 3 + channel * 131, seed + channel * 7919);
  }

  // ---- Build the "target" (fully denoised) pattern once: a soft mandala /
  // radial-gradient bloom, purely procedural (no external assets). ----
  function targetColor(nx, ny) {
    // nx, ny in [-1, 1], centered at (0,0)
    const r = Math.sqrt(nx * nx + ny * ny);
    const angle = Math.atan2(ny, nx);

    const petals = 6;
    const swirl = Math.sin(angle * petals + r * 8 - r * r * 6) * 0.5 + 0.5;
    const rings = Math.sin(r * 10 - swirl * 2) * 0.5 + 0.5;
    const glow = Math.max(0, 1 - r * 1.05);

    const t = swirl * 0.6 + rings * 0.4;

    const cr = 0.5 + 0.5 * Math.sin(6.28318 * (t + 0.0));
    const cg = 0.5 + 0.5 * Math.sin(6.28318 * (t + 0.33));
    const cb = 0.5 + 0.5 * Math.sin(6.28318 * (t + 0.66));

    const shade = 0.25 + 0.75 * glow;
    return [
      Math.round(255 * cr * shade),
      Math.round(255 * cg * shade),
      Math.round(255 * cb * shade),
    ];
  }

  const targetData = new Uint8ClampedArray(BUFFER_SIZE * BUFFER_SIZE * 4);
  const noiseData = new Uint8ClampedArray(BUFFER_SIZE * BUFFER_SIZE * 4);

  for (let y = 0; y < BUFFER_SIZE; y++) {
    for (let x = 0; x < BUFFER_SIZE; x++) {
      const idx = (y * BUFFER_SIZE + x) * 4;
      const nx = (x / (BUFFER_SIZE - 1)) * 2 - 1;
      const ny = (y / (BUFFER_SIZE - 1)) * 2 - 1;

      const [r, g, b] = targetColor(nx, ny);
      targetData[idx] = r;
      targetData[idx + 1] = g;
      targetData[idx + 2] = b;
      targetData[idx + 3] = 255;

      noiseData[idx] = Math.round(rand01(x, y, 0, SEED) * 255);
      noiseData[idx + 1] = Math.round(rand01(x, y, 1, SEED) * 255);
      noiseData[idx + 2] = Math.round(rand01(x, y, 2, SEED) * 255);
      noiseData[idx + 3] = 255;
    }
  }

  // Smoothstep easing so the transition reads clearly as "denoising".
  function easeSignal(p) {
    return p * p * (3 - 2 * p);
  }

  const frameData = bctx.createImageData(BUFFER_SIZE, BUFFER_SIZE);

  function renderStep(step) {
    const p = Math.min(1, Math.max(0, step / MAX_STEPS));
    const signal = easeSignal(p);
    const noiseWeight = 1 - signal;
    const textureAmount = 55 * noiseWeight; // residual fine-grained noise texture

    const out = frameData.data;
    for (let y = 0; y < BUFFER_SIZE; y++) {
      for (let x = 0; x < BUFFER_SIZE; x++) {
        const idx = (y * BUFFER_SIZE + x) * 4;
        for (let c = 0; c < 3; c++) {
          const t = targetData[idx + c];
          const n = noiseData[idx + c];
          let v = t * signal + n * noiseWeight;
          v += (rand01(x, y, c + 10, SEED) - 0.5) * textureAmount;
          out[idx + c] = Math.min(255, Math.max(0, v));
        }
        out[idx + 3] = 255;
      }
    }

    bctx.putImageData(frameData, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);

    stepCountEl.textContent = String(step);
  }

  // ---- Playback control ----
  let isPlaying = false;
  let timerId = null;

  function setStep(step) {
    slider.value = String(step);
    renderStep(step);
  }

  function tick() {
    let step = parseInt(slider.value, 10);
    step += 1;
    if (step > MAX_STEPS) {
      step = 0; // loop the demo so it stays engaging
    }
    setStep(step);
  }

  function play() {
    if (isPlaying) return;
    isPlaying = true;
    playBtn.textContent = "⏸ Pause";
    timerId = window.setInterval(tick, STEP_INTERVAL_MS);
  }

  function pause() {
    isPlaying = false;
    playBtn.textContent = "▶ Play";
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  playBtn.addEventListener("click", () => {
    if (isPlaying) pause();
    else play();
  });

  resetBtn.addEventListener("click", () => {
    pause();
    setStep(0);
  });

  slider.addEventListener("input", () => {
    pause();
    renderStep(parseInt(slider.value, 10));
  });

  // ---- Init ----
  setStep(0);
})();
