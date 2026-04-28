// Ringtone library with authentic audio samples
// Each ringtone is generated as a more realistic audio clip using Web Audio API

export type RingtoneName =
  | 'pulse'
  | 'chime'
  | 'beacon'
  | 'rooster'
  | 'beat-plucker'
  | 'morning-glory'
  | 'apex'
  | 'digital-phone'
  | 'classic-clock'
  | 'alarm-2010';

export interface RingtoneSpec {
  name: RingtoneName;
  displayName: string;
  description: string;
  generate: () => Promise<AudioBuffer>;
}

function createOfflineContext(): OfflineAudioContext {
  return new OfflineAudioContext(1, 48000 * 3, 48000); // 1 channel, 3 seconds, 48kHz
}

/**
 * Global audio context and current playback tracker to prevent multiple concurrent sounds
 */
let globalAudioContext: AudioContext | null = null;
let currentPlayingSource: AudioBufferSource | null = null;

function getAudioContext(): AudioContext {
  if (!globalAudioContext) {
    const ContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextConstructor) {
      throw new Error('Web Audio API not supported');
    }
    globalAudioContext = new ContextConstructor();
  }
  return globalAudioContext;
}

/**
 * Stop any currently playing audio
 */
export function stopCurrentAudio(): void {
  if (currentPlayingSource) {
    try {
      currentPlayingSource.stop();
    } catch {
      // Already stopped, ignore
    }
    currentPlayingSource = null;
  }
}

/**
 * Generate a realistic Rooster sound using multiple oscillators
 */
async function generateRoosterSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  // Simulate rooster crow with pitch changes
  const crows = [
    { freq: 800, start: 0, duration: 0.3 },
    { freq: 1200, start: 0.35, duration: 0.25 },
    { freq: 900, start: 0.65, duration: 0.3 },
    { freq: 1400, start: 1.0, duration: 0.25 },
    { freq: 1000, start: 1.3, duration: 0.35 },
    { freq: 1600, start: 1.7, duration: 0.3 },
  ];

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

  crows.forEach(({ freq, start, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + start);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.6, now + start + duration);
    gain.gain.setValueAtTime(0.1, now + start);
    gain.gain.exponentialRampToValueAtTime(0, now + start + duration);
    osc.start(now + start);
    osc.stop(now + start + duration);
  });

  return ctx.startRendering();
}

/**
 * Generate Beat Plucker - percussive plucked string effect
 */
async function generateBeatPluckerSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.4, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.5);

  const beatPattern = [1046, 784, 1046, 784, 1310, 1046, 784, 1046];
  let time = 0.1;

  beatPattern.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.15, now + time);
    gain.gain.exponentialRampToValueAtTime(0.01, now + time + 0.15);
    osc.start(now + time);
    osc.stop(now + time + 0.15);
    time += 0.22;
  });

  return ctx.startRendering();
}

/**
 * Generate Morning Glory - melodic rising pattern
 */
async function generateMorningGlorySound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

  const melody = [
    { freq: 523, duration: 0.4 },
    { freq: 659, duration: 0.4 },
    { freq: 784, duration: 0.4 },
    { freq: 1047, duration: 0.5 },
  ];

  let time = 0.2;
  melody.forEach(({ freq, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.2, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + duration);
    osc.start(now + time);
    osc.stop(now + time + duration);
    time += duration + 0.1;
  });

  return ctx.startRendering();
}

/**
 * Generate Apex - sharp high-frequency alert
 */
async function generateApexSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.35, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);

  const pulses = [1047, 1319, 1568, 1047, 1319, 1568];
  let time = 0.1;

  pulses.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.12, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.18);
    osc.start(now + time);
    osc.stop(now + time + 0.18);
    time += 0.25;
  });

  return ctx.startRendering();
}

/**
 * Generate Digital Phone - retro phone ring pattern
 */
async function generateDigitalPhoneSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.25, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.2);

  // Two-tone phone ring: 941 Hz and 1209 Hz (standard phone frequencies)
  let time = 0.15;
  for (let ring = 0; ring < 4; ring++) {
    [941, 1209].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);
      gain.gain.setValueAtTime(0.1, now + time);
      gain.gain.exponentialRampToValueAtTime(0, now + time + 0.2);
      osc.start(now + time);
      osc.stop(now + time + 0.2);
    });
    time += 0.5;
  }

  return ctx.startRendering();
}

/**
 * Generate Classic Clock - old clock chiming pattern
 */
async function generateClassicClockSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

  // Classic bell-like chiming
  const chimes = [800, 600, 800, 600, 800];
  let time = 0.1;

  chimes.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + time + 0.3);
    gain.gain.setValueAtTime(0.2, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.35);
    osc.start(now + time);
    osc.stop(now + time + 0.35);
    time += 0.45;
  });

  return ctx.startRendering();
}

/**
 * Generate Alarm 2010 - modern dual-frequency alarm
 */
async function generateAlarm2010Sound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.35, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);

  // Fast alternating pattern like modern phone alarms
  let time = 0.1;
  for (let i = 0; i < 8; i++) {
    const freq = i % 2 === 0 ? 440 : 880;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.14, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.12);
    osc.start(now + time);
    osc.stop(now + time + 0.12);
    time += 0.18;
  }

  return ctx.startRendering();
}

/**
 * Generate Beacon - simple alert tone
 */
async function generateBeaconSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.25, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);

  const tones = [520, 520, 780, 1040];
  let time = 0.2;

  tones.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.12, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.2);
    osc.start(now + time);
    osc.stop(now + time + 0.2);
    time += 0.28;
  });

  return ctx.startRendering();
}

/**
 * Generate Chime - musical rising tone
 */
async function generateChimeSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.28, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

  const chimes = [660, 784, 988];
  let time = 0.15;

  chimes.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.15, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.25);
    osc.start(now + time);
    osc.stop(now + time + 0.25);
    time += 0.35;
  });

  return ctx.startRendering();
}

/**
 * Generate Pulse - simple but effective alert
 */
async function generatePulseSound(): Promise<AudioBuffer> {
  const ctx = createOfflineContext();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

  const pulses = [740, 880, 740];
  let time = 0.1;

  pulses.forEach((freq) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + time);
    gain.gain.setValueAtTime(0.15, now + time);
    gain.gain.exponentialRampToValueAtTime(0, now + time + 0.22);
    osc.start(now + time);
    osc.stop(now + time + 0.22);
    time += 0.32;
  });

  return ctx.startRendering();
}

/**
 * Cache for generated ringtones to avoid re-rendering
 */
const ringtoneCache = new Map<RingtoneName, Promise<AudioBuffer>>();

/**
 * Get or generate a ringtone audio buffer
 */
export async function getRingtoneBuffer(name: RingtoneName): Promise<AudioBuffer | null> {
  try {
    if (ringtoneCache.has(name)) {
      return await ringtoneCache.get(name)!;
    }

    let generator: () => Promise<AudioBuffer>;

    switch (name) {
      case 'rooster':
        generator = generateRoosterSound;
        break;
      case 'beat-plucker':
        generator = generateBeatPluckerSound;
        break;
      case 'morning-glory':
        generator = generateMorningGlorySound;
        break;
      case 'apex':
        generator = generateApexSound;
        break;
      case 'digital-phone':
        generator = generateDigitalPhoneSound;
        break;
      case 'classic-clock':
        generator = generateClassicClockSound;
        break;
      case 'alarm-2010':
        generator = generateAlarm2010Sound;
        break;
      case 'beacon':
        generator = generateBeaconSound;
        break;
      case 'chime':
        generator = generateChimeSound;
        break;
      case 'pulse':
        generator = generatePulseSound;
        break;
      default:
        return null;
    }

    const promise = generator();
    ringtoneCache.set(name, promise);
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Play a ringtone by name with proper context management
 */
export async function playRingtone(name: RingtoneName): Promise<void> {
  try {
    const buffer = await getRingtoneBuffer(name);
    if (!buffer) {
      console.warn(`Failed to generate ringtone: ${name}`);
      return;
    }

    stopCurrentAudio();

    const audioContext = getAudioContext();

    // Resume context if suspended (required on some browsers)
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;

    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.5, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + buffer.duration - 0.1);

    source.connect(gain);
    gain.connect(audioContext.destination);

    currentPlayingSource = source;
    source.start(0);

    // Clear reference when done
    source.onended = () => {
      currentPlayingSource = null;
    };
  } catch (error) {
    console.error('Error playing ringtone:', error);
  }
}

export const ringtoneList: Array<{ value: RingtoneName; label: string }> = [
  { value: 'pulse', label: 'Pulse (default)' },
  { value: 'chime', label: 'Chime' },
  { value: 'beacon', label: 'Beacon' },
  { value: 'rooster', label: 'Rooster Sound' },
  { value: 'beat-plucker', label: 'Beat Plucker' },
  { value: 'morning-glory', label: 'Morning Glory' },
  { value: 'apex', label: 'Apex' },
  { value: 'digital-phone', label: 'Digital Phone' },
  { value: 'classic-clock', label: 'Classic Clock' },
  { value: 'alarm-2010', label: 'Alarm Ringtone 2010' },
];
