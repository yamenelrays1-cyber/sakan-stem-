/**
 * Distinct custom audio synthesizer & system notification dispatcher
 * for when the Supervisor (المشرف) locks or unlocks orders.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Generates a fallback inline WAV data URI with a distinct multi-tone sequence
 * so even if Web Audio API is restricted, HTML5 <audio> plays a unique sound.
 */
function createDistinctWavDataUri(locked: boolean): string {
  const sampleRate = 22050;
  const durationSeconds = 1.15;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Distinct note sequences:
  // Unlock (فتح الطلبات): Bright ascending 4-note fanfare (C5 -> E5 -> G5 -> C6)
  // Lock (قفل الطلبات): Urgent double-chime descending alert (A5 -> F5 -> D5 -> A4)
  const notes = locked
    ? [
        { freq: 880, start: 0.0, end: 0.22 },
        { freq: 698.46, start: 0.24, end: 0.46 },
        { freq: 587.33, start: 0.48, end: 0.72 },
        { freq: 440, start: 0.75, end: 1.12 },
      ]
    : [
        { freq: 523.25, start: 0.0, end: 0.2 },
        { freq: 659.25, start: 0.22, end: 0.42 },
        { freq: 783.99, start: 0.44, end: 0.66 },
        { freq: 1046.5, start: 0.68, end: 1.12 },
      ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (const n of notes) {
      if (t >= n.start && t <= n.end) {
        const localT = t - n.start;
        const noteLen = n.end - n.start;
        const env =
          Math.min(1, localT / 0.015) * Math.pow(1 - localT / noteLen, 0.7);
        // Fundamental + octave harmonic + fifth overtone for a rich bell/marimba timbre
        const wave =
          0.65 * Math.sin(2 * Math.PI * n.freq * t) +
          0.25 * Math.sin(2 * Math.PI * n.freq * 2 * t) +
          0.1 * Math.sin(2 * Math.PI * n.freq * 3 * t);
        sample = wave * env * 0.55;
        break;
      }
    }
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Plays a distinct, unmistakable custom sound when the Supervisor locks or unlocks orders.
 */
export function playDistinctSupervisorLockSound(locked: boolean): void {
  if (typeof window === 'undefined') return;

  // Trigger distinct vibration pattern on supported mobile devices
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(locked ? [220, 90, 220, 90, 380] : [140, 70, 140, 70, 280]);
    }
  } catch {
    // ignore
  }

  // Try Web Audio API first for crystal-clear harmonic chime
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'running') {
    try {
      const now = ctx.currentTime;
      const sequence = locked
        ? [
            { freq: 880, offset: 0.0, duration: 0.22, type: 'triangle' as OscillatorType },
            { freq: 698.46, offset: 0.24, duration: 0.22, type: 'triangle' as OscillatorType },
            { freq: 587.33, offset: 0.48, duration: 0.24, type: 'triangle' as OscillatorType },
            { freq: 440, offset: 0.74, duration: 0.38, type: 'sawtooth' as OscillatorType },
          ]
        : [
            { freq: 523.25, offset: 0.0, duration: 0.19, type: 'sine' as OscillatorType },
            { freq: 659.25, offset: 0.21, duration: 0.19, type: 'sine' as OscillatorType },
            { freq: 783.99, offset: 0.42, duration: 0.21, type: 'triangle' as OscillatorType },
            { freq: 1046.5, offset: 0.65, duration: 0.45, type: 'triangle' as OscillatorType },
          ];

      for (const note of sequence) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = note.type;
        osc1.frequency.setValueAtTime(note.freq, now + note.offset);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(note.freq * 2, now + note.offset);

        gain.gain.setValueAtTime(0.0001, now + note.offset);
        gain.gain.exponentialRampToValueAtTime(0.32, now + note.offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now + note.offset + note.duration
        );

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + note.offset);
        osc2.start(now + note.offset);
        osc1.stop(now + note.offset + note.duration + 0.02);
        osc2.stop(now + note.offset + note.duration + 0.02);
      }
      return;
    } catch {
      // fall through to HTML5 Audio WAV
    }
  }

  // Fallback HTML5 Audio element with synthesized WAV data URI
  try {
    const audio = new Audio(createDistinctWavDataUri(locked));
    audio.volume = 0.95;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Unlocks browser audio & requests Notification permission on user interaction.
 */
export async function requestSupervisorNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined') return 'unsupported';
  getAudioContext();
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

/**
 * Sends a browser/mobile system notification AND plays the distinct supervisor sound
 * when orders are locked or unlocked.
 */
export async function triggerSupervisorLockNotification(locked: boolean): Promise<void> {
  playDistinctSupervisorLockSound(locked);

  if (typeof window === 'undefined' || !('Notification' in window)) return;

  const title = locked
    ? '🔒 المشرف قفل الطلبات الآن'
    : '🔓 المشرف فتح الطلبات الآن!';
  const body = locked
    ? 'انتهى وقت تسجيل الطلبات لهذا الأوردر من قِبل المشرف.'
    : 'يمكنك الآن الدخول وتسجيل طلبك علشان يوصل للمشرف فوراً.';

  if (Notification.permission !== 'granted') {
    try {
      await Notification.requestPermission();
    } catch {
      // ignore
    }
  }

  if (Notification.permission === 'granted') {
    const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'sakan-supervisor-lock-status',
      renotify: true,
      silent: true, // We play our own custom distinct sound so the OS doesn't play the generic default ding
      vibrate: locked ? [220, 90, 220, 90, 380] : [140, 70, 140, 70, 280],
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, options);
          return;
        }
      }
    } catch {
      // fallback to window.Notification
    }

    try {
      new Notification(title, options);
    } catch {
      // ignore
    }
  }
}
