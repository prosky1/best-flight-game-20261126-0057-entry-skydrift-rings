// Sound, all synthesised: a two-oscillator engine whose pitch follows the
// throttle, filtered wind noise that rises with airspeed, and short chimes
// for rings, fuel, strikes and the stall warning. The context is created on
// the first user gesture (browser policy); every call is guarded so a
// missing or suspended context is simply silence, never an error.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let master = null;
  let muted = false;
  let stallBeepAt = 0;

  /** Create the context and the continuous engine/wind voices. Safe to call twice. */
  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const wind = ctx.createBufferSource();
      wind.buffer = noiseBuffer;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      wind.start();
    } catch {
      ctx = null;
    }
  }

  /** Follow the flight: engine pitch with throttle, wind with airspeed. */
  function update(flight) {
    if (!ctx || !engineOsc) return;
    try {
      const now = ctx.currentTime;
      const rpm = flight.engineDead ? 0 : 0.25 + flight.throttle * 0.75;
      engineOsc.frequency.setTargetAtTime(38 + rpm * 62 + flight.speed * 0.12, now, 0.08);
      engineOsc2.frequency.setTargetAtTime(19 + rpm * 31, now, 0.08);
      engineGain.gain.setTargetAtTime(flight.engineDead ? 0.004 : 0.05 + flight.throttle * 0.1, now, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.16, flight.speed / 900), now, 0.15);
      if (flight.stalled && now > stallBeepAt) {
        stallBeepAt = now + 0.55;
        blip(880, 0.09, 0.12, 'square');
      }
    } catch {
      // A dying context must never take the game down with it.
    }
  }

  function blip(frequency, seconds, gain, type = 'sine', delay = 0) {
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const start = ctx.currentTime + delay;
      osc.type = type;
      osc.frequency.value = frequency;
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch {
      // Silence is acceptable; a thrown error is not.
    }
  }

  function noiseBurst(seconds, gain, frequency) {
    if (!ctx) return;
    try {
      const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      const g = ctx.createGain();
      g.gain.value = gain;
      source.connect(filter);
      filter.connect(g);
      g.connect(master);
      source.start();
    } catch {
      // See blip().
    }
  }

  return {
    init,
    update,
    ring() { blip(784, 0.14, 0.16); blip(1175, 0.2, 0.14, 'sine', 0.07); },
    pickup() { blip(523, 0.1, 0.14); blip(659, 0.12, 0.14, 'sine', 0.06); },
    miss() { blip(220, 0.18, 0.12, 'triangle'); },
    graze() { noiseBurst(0.22, 0.3, 500); },
    crash() { noiseBurst(0.7, 0.5, 300); },
    complete() { blip(659, 0.16, 0.15); blip(784, 0.16, 0.15, 'sine', 0.12); blip(1047, 0.3, 0.16, 'sine', 0.24); },
    click() { blip(440, 0.05, 0.08, 'triangle'); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
  };
}
