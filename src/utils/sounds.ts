import { useSettingsStore } from '../stores/settings-store';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Synthesizes default game sound effects entirely in the browser using the Web Audio API.
 * This guarantees audio works completely offline without needing large audio assets.
 */
function playSynthSound(action: string, volume: number) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.connect(ctx.destination);

    if (action === 'teammate_death') {
      // Somber descending pitch sweep (dramatic defeat tone)
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime); // C4
      osc.frequency.exponentialRampToValueAtTime(65, ctx.currentTime + 0.6); // C2
      
      gainNode.gain.setValueAtTime(volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      
      osc.connect(gainNode);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } else if (action === 'teammate_offline_death') {
      // Double deep bass drum synth drone (offline raid/kill warning)
      const playDrum = (delay: number) => {
        const osc = ctx.createOscillator();
        const drumGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(120, ctx.currentTime + delay);
        osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + delay + 0.45);
        
        drumGain.gain.setValueAtTime(volume * 1.2, ctx.currentTime + delay);
        drumGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.45);
        
        osc.connect(drumGain);
        drumGain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.45);
      };
      playDrum(0);
      playDrum(0.35);
    } else if (action === 'smart_alarm') {
      // Urgent siren sweeps (alarm/raid alert)
      const duration = 0.9;
      const beeps = 3;
      const beepDuration = duration / beeps;
      for (let i = 0; i < beeps; i++) {
        const delay = i * beepDuration;
        const osc = ctx.createOscillator();
        const beepGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + delay + beepDuration * 0.5);
        
        beepGain.gain.setValueAtTime(volume, ctx.currentTime + delay);
        beepGain.gain.setValueAtTime(volume, ctx.currentTime + delay + beepDuration * 0.7);
        beepGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + beepDuration);
        
        osc.connect(beepGain);
        beepGain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + beepDuration);
      }
    } else if (action === 'event_spawn') {
      // Bright ascending chime (C5 -> E5 -> G5 -> C6) for cargo/heli
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const delay = idx * 0.08;
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        
        noteGain.gain.setValueAtTime(volume * 0.5, ctx.currentTime + delay);
        noteGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.4);
        
        osc.connect(noteGain);
        noteGain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.4);
      });
    } else if (action === 'fish_catch') {
      // Splashing water bubble noise effect
      const bufferSize = ctx.sampleRate * 0.75;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // White noise
        data[i] = Math.random() * 2 - 1;
      }
      
      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.75);
      filter.Q.setValueAtTime(4, ctx.currentTime);
      
      const splashGain = ctx.createGain();
      splashGain.gain.setValueAtTime(volume, ctx.currentTime);
      
      // Amplitude modulation for bubble/splash texture
      for (let t = 0; t < 0.75; t += 0.05) {
        splashGain.gain.setValueAtTime(volume * (1 - t / 0.75) * (0.4 + 0.6 * Math.sin(t * 50)), ctx.currentTime + t);
      }
      splashGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
      
      noiseNode.connect(filter);
      filter.connect(splashGain);
      splashGain.connect(ctx.destination);
      
      noiseNode.start();
      noiseNode.stop(ctx.currentTime + 0.75);
    }
  } catch (err) {
    console.error('Failed to play synthesized sound:', err);
  }
}

/**
 * Triggers sound for a given action. Respects user settings volume and mute status,
 * playing their custom base64-encoded sound if uploaded, otherwise falls back to synthesized audio.
 */
export function triggerSound(action: string) {
  const settings = useSettingsStore.getState();
  if (!settings.soundEnabled) return;
  
  const volume = settings.soundVolume ?? 0.5;
  const customSound = settings.customSounds?.[action];
  
  if (customSound) {
    try {
      const audio = new Audio(customSound);
      audio.volume = volume;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Failed to play custom sound, falling back to synthesizer:', err);
          playSynthSound(action, volume);
        });
      }
    } catch (err) {
      console.warn('Failed to initialize Audio for custom sound, falling back to synthesizer:', err);
      playSynthSound(action, volume);
    }
  } else {
    playSynthSound(action, volume);
  }
}
