import * as THREE from 'three';

export class AudioManager {
  constructor(camera, scene) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.scene = scene;
    this.context = this.listener.context;
    this.initialized = false;
    this.muted = false;
    this.volume = 0.5;
    this.masterGain = null;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    // Master gain for mute/volume control
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.volume;
    this.masterGain.connect(this.context.destination);

    this._startAmbientDrone();
    this._startRandomSounds();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    return this.muted;
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.value = this.volume;
    }
  }

  _startAmbientDrone() {
    // Very quiet, subtle drone - barely noticeable
    const osc1 = this.context.createOscillator();
    const gainNode = this.context.createGain();

    osc1.type = 'sine';
    osc1.frequency.value = 38;
    gainNode.gain.value = 0.04; // Very quiet

    const lfo = this.context.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.02;
    const lfoGain = this.context.createGain();
    lfoGain.gain.value = 0.02;

    lfo.connect(lfoGain);
    lfoGain.connect(gainNode.gain);

    osc1.connect(gainNode);
    gainNode.connect(this.masterGain);

    osc1.start();
    lfo.start();
  }

  _startRandomSounds() {
    const playRandom = () => {
      if (!this.initialized) return;
      
      const delay = 12000 + Math.random() * 25000;
      setTimeout(() => {
        if (!this.initialized || this.muted) {
          playRandom();
          return;
        }
        
        const type = Math.floor(Math.random() * 4);
        switch (type) {
          case 0: this._playDistantCreak(); break;
          case 1: this._playDrip(); break;
          case 2: this._playWhisper(); break;
          case 3: this._playVentSound(); break;
        }
        
        playRandom();
      }, delay);
    };
    
    playRandom();
  }

  _playDistantCreak() {
    const bufferSize = this.context.sampleRate * 1.5;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const env = Math.exp(-t * 2) * Math.sin(t * 4);
      data[i] = (Math.random() * 2 - 1) * env * 0.08;
    }
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 250;
    filter.Q.value = 2;
    
    const gain = this.context.createGain();
    gain.gain.value = 0.05;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  _playDrip() {
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, this.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, this.context.currentTime + 0.06);
    
    gain.gain.setValueAtTime(0.03, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.context.currentTime + 0.1);
  }

  _playWhisper() {
    const bufferSize = this.context.sampleRate * 1.0;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const env = Math.sin(t * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.02;
    }
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 4;
    
    const gain = this.context.createGain();
    gain.gain.value = 0.01;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  _playVentSound() {
    const bufferSize = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const env = Math.sin(t * Math.PI / 2);
      data[i] = (Math.random() * 2 - 1) * env * 0.04;
    }
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 250;
    
    const gain = this.context.createGain();
    gain.gain.value = 0.025;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playFootstep(isSprinting) {
    if (!this.initialized || this.muted) return;

    const vol = isSprinting ? 0.3 : 0.15;
    const now = this.context.currentTime;

    // Thud
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(70 + Math.random() * 15, now);
    osc.frequency.exponentialRampToValueAtTime(15, now + 0.08);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playDoorCreek() {
    if (!this.initialized || this.muted) return;

    const bufferSize = this.context.sampleRate * 1.0;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.context.sampleRate * 0.25));
    }
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 350;
    
    const gain = this.context.createGain();
    gain.gain.value = 1.5;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playRustle() {
    if (!this.initialized || this.muted) return;

    const bufferSize = this.context.sampleRate * 0.2;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.context.sampleRate * 0.08));
    }
    
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;

    const gain = this.context.createGain();
    gain.gain.value = 0.5;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();
  }

  playPickup() {
    if (!this.initialized || this.muted) return;

    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playAllKeysFound() {
    if (!this.initialized || this.muted) return;

    const now = this.context.currentTime;
    const notes = [660, 880, 1320];

    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + i * 0.11;

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }

  playVictory() {
    if (!this.initialized || this.muted) return;

    const now = this.context.currentTime;
    const notes = [392, 494, 587, 784];

    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + i * 0.15;

      osc.type = 'triangle';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.3);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  playLockedDoorRattle() {
    if (!this.initialized || this.muted) return;

    const now = this.context.currentTime;

    // Metallic thud
    const osc = this.context.createOscillator();
    const oscGain = this.context.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    oscGain.gain.setValueAtTime(0.15, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);

    // Rattle: short noise burst through a resonant bandpass
    const bufferSize = this.context.sampleRate * 0.25;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const env = Math.exp(-t * 18) * (0.5 + 0.5 * Math.sin(t * 90));
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 3;

    const gain = this.context.createGain();
    gain.gain.value = 0.35;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(now);
  }

  // Faint, spatialized one-shot for the "presence" system - a drag or a few taps,
  // panned to a world position well away from the player. Quieter than playScare().
  playDistantReaction(position) {
    if (!this.initialized || this.muted || !position) return;

    const now = this.context.currentTime;
    const panner = this.context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3;
    panner.maxDistance = 40;
    panner.rolloffFactor = 1.2;
    if (panner.positionX) {
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;
    } else if (panner.setPosition) {
      panner.setPosition(position.x, position.y, position.z);
    }

    const gain = this.context.createGain();
    gain.gain.value = 0.12;
    panner.connect(gain);
    gain.connect(this.masterGain);

    if (Math.random() < 0.5) {
      // Slow dragging noise
      const bufferSize = this.context.sampleRate * 1.2;
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / this.context.sampleRate;
        const env = Math.sin(Math.min(1, t) * Math.PI) * 0.6;
        data[i] = (Math.random() * 2 - 1) * env;
      }
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      source.connect(filter);
      filter.connect(panner);
      source.start(now);
    } else {
      // A few faint taps
      for (let i = 0; i < 3; i++) {
        const osc = this.context.createOscillator();
        const tapGain = this.context.createGain();
        const start = now + i * (0.15 + Math.random() * 0.1);
        osc.type = 'square';
        osc.frequency.value = 120 + Math.random() * 40;
        tapGain.gain.setValueAtTime(0.0001, start);
        tapGain.gain.exponentialRampToValueAtTime(0.08, start + 0.01);
        tapGain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
        osc.connect(tapGain);
        tapGain.connect(panner);
        osc.start(start);
        osc.stop(start + 0.1);
      }
    }
  }

  playScare() {
    if (!this.initialized || this.muted) return;

    const now = this.context.currentTime;

    // Loud distorted noise burst
    const bufferSize = this.context.sampleRate * 0.5;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const t = i / this.context.sampleRate;
      const env = Math.exp(-t * 6);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;

    const gain = this.context.createGain();
    gain.gain.value = 3.0; // LOUD

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start();

    // Low rumble
    const osc = this.context.createOscillator();
    const rumbleGain = this.context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(40, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    rumbleGain.gain.setValueAtTime(0.5, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(rumbleGain);
    rumbleGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }
}
