/**
 * Utility functions for playing notification sounds
 */

export type NotificationTone = 'ding' | 'chime' | 'bell' | 'notification' | 'magic';

interface AudioSettings {
  enable_audio_alerts: boolean;
  notification_tone: NotificationTone;
  always_play_audio_alert: boolean; // If false, play only when tab is inactive
  alert_if_unread_assigned_conversation_exist: boolean;
}

// Map of tone names to audio file paths
// Files are located in /public/audio/notifications/
const TONE_FILES: Record<NotificationTone, string> = {
  ding: '/audio/notifications/ding.mp3',
  chime: '/audio/notifications/chime.mp3',
  bell: '/audio/notifications/bell.mp3',
  notification: '/audio/notifications/ping.mp3',
  magic: '/audio/notifications/magic.mp3',
};

type AudioContextClass = typeof AudioContext;

const getAudioContextClass = (): AudioContextClass | null => {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || (window as unknown as { webkitAudioContext: AudioContextClass }).webkitAudioContext || null;
};

// Shared AudioContext — created once and reused to survive browser autoplay restrictions.
// The "unlocked" flag lives on the context itself (not module-global) so that recreating
// the context after close() / HMR / suspend automatically requires a fresh unlock.
type UnlockableAudioContext = AudioContext & { __unlocked?: boolean };
let sharedAudioContext: UnlockableAudioContext | null = null;

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enable_audio_alerts: false,
  notification_tone: 'ding',
  always_play_audio_alert: false,
  alert_if_unread_assigned_conversation_exist: false,
};

const normalizeAudioSettings = (settings?: Partial<AudioSettings> | null): AudioSettings => ({
  ...DEFAULT_AUDIO_SETTINGS,
  ...settings,
  notification_tone:
    settings?.notification_tone && settings.notification_tone in TONE_FILES
      ? settings.notification_tone
      : DEFAULT_AUDIO_SETTINGS.notification_tone,
});

const getOrCreateAudioContext = (createIfMissing = true): UnlockableAudioContext | null => {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;
  if (!createIfMissing && !sharedAudioContext) return null;
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    if (!createIfMissing) return null;
    sharedAudioContext = new Ctx() as UnlockableAudioContext;
  }
  return sharedAudioContext;
};

/**
 * Must be called inside a user-gesture event handler (click, keydown, etc.).
 * Resumes the shared AudioContext so that subsequent notification sounds are
 * allowed by the browser's autoplay policy even when the tab is inactive.
 */
export const unlockAudioContext = async (
  options?: { createIfMissing?: boolean },
): Promise<boolean> => {
  const ctx = getOrCreateAudioContext(options?.createIfMissing ?? true);
  if (!ctx) return false;
  if (ctx.__unlocked) return true;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    ctx.__unlocked = true;
    return true;
  } catch {
    // Ignore — will retry on next user gesture
    return false;
  }
};

const playToneWithAudioContext = (
  tone: NotificationTone,
  options?: { allowCreate?: boolean },
): void => {
  const ctx = getOrCreateAudioContext(options?.allowCreate ?? false);
  if (!ctx) return;
  if (!ctx.__unlocked && !(options?.allowCreate ?? false)) return;

  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    const frequencies: Record<NotificationTone, number> = {
      ding: 800,
      chime: 600,
      bell: 400,
      notification: 500,
      magic: 700,
    };

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = frequencies[tone];
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  }).catch(() => {
    // AudioContext could not be resumed — browser is blocking audio
  });
};

/**
 * Close and reset the shared AudioContext. Useful for tests and hot-reload.
 */
export const closeSharedAudioContext = (): void => {
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    sharedAudioContext.close().catch(() => {
      // Ignore — context may already be closing
    });
  }
  sharedAudioContext = null;
};

/**
 * Bootstrap unlock for HTML <audio> elements.
 * Playing a silent audio inside a user-gesture handler primes the browser
 * so that subsequent Audio().play() calls succeed even without a gesture.
 * This is the standard workaround for Chrome/Safari autoplay policies.
 */
let htmlAudioUnlocked = false;

export const unlockHtmlAudio = (): void => {
  if (htmlAudioUnlocked) return;
  if (typeof window === 'undefined') return;

  try {
    // Use the first available notification tone as the bootstrap source
    const bootstrapFile = TONE_FILES.ding;
    const audio = new Audio(bootstrapFile);
    audio.volume = 0.001; // effectively silent but still valid audio
    audio.preload = 'auto';
    audio.muted = true;

    const p = audio.play();
    if (p) {
      p.then(() => {
        htmlAudioUnlocked = true;
        // Now unmute and set real volume for future plays
        audio.muted = false;
        audio.volume = 0.3;
      }).catch(() => {
        // Blocked — will retry on next gesture
      });
    }
  } catch {
    // Ignore — browser doesn't support Audio constructor
  }
};

/**
 * Fallback: play notification using an <audio> HTML element.
 * This bypasses AudioContext restrictions and works even when the
 * AudioContext is blocked by the browser's autoplay policy.
 */
const playFileWithHtmlAudio = (toneFile: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(toneFile);
      audio.volume = 0.3;
      audio.preload = 'auto';

      const cleanup = () => {
        audio.removeEventListener('ended', onEnd);
        audio.removeEventListener('error', onError);
      };

      const onEnd = () => {
        cleanup();
        resolve();
      };

      const onError = (e: Event) => {
        cleanup();
        reject(e);
      };

      audio.addEventListener('ended', onEnd);
      audio.addEventListener('error', onError);

      // play() returns a Promise that rejects if autoplay is blocked
      audio.play().catch(() => {
        cleanup();
        reject(new Error('HTMLAudio autoplay blocked'));
      });
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Play notification with multiple fallback strategies:
 * 1. AudioContext (best — pre-fetched & decoded buffer)
 * 2. HTML <audio> element (bypasses AudioContext restrictions)
 */
const playFileWithFallback = async (
  toneFile: string,
  tone: NotificationTone,
  options?: { allowCreate?: boolean },
): Promise<void> => {
  const allowCreate = options?.allowCreate ?? false;
  const ctx = getOrCreateAudioContext(allowCreate);

  // Strategy 1: Try AudioContext when available and unlocked
  if (ctx && (ctx.__unlocked || allowCreate)) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const response = await fetch(toneFile);
      if (!response.ok) {
        throw new Error(`Audio file fetch failed: ${response.status} ${toneFile}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();
      source.buffer = audioBuffer;
      gainNode.gain.value = 0.3;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
      return;
    } catch (error) {
      console.warn('AudioContext playback failed, falling back to HTMLAudio:', error);
    }
  }

  // Strategy 2: HTML <audio> fallback
  try {
    await playFileWithHtmlAudio(toneFile);
    return;
  } catch (error) {
    console.warn('HTMLAudio playback failed, falling back to oscillator:', error);
  }

  // Strategy 3: Oscillator tone as last resort
  if (ctx && (ctx.__unlocked || allowCreate)) {
    playToneWithAudioContext(tone, { allowCreate });
  }
};

let audioSettingsCache: AudioSettings | null = null;

/**
 * Load audio settings from localStorage or use defaults
 */
export const getAudioSettings = (): AudioSettings => {
  if (audioSettingsCache) {
    return audioSettingsCache;
  }

  try {
    const stored = localStorage.getItem('audio_notification_settings');
    if (stored) {
      audioSettingsCache = normalizeAudioSettings(JSON.parse(stored) as Partial<AudioSettings>);
      return audioSettingsCache;
    }
  } catch (error) {
    console.error('Error loading audio settings:', error);
  }

  audioSettingsCache = DEFAULT_AUDIO_SETTINGS;
  return DEFAULT_AUDIO_SETTINGS;
};

/**
 * Save audio settings to localStorage
 */
export const saveAudioSettings = (settings: Partial<AudioSettings>): void => {
  const current = getAudioSettings();
  const updated = normalizeAudioSettings({ ...current, ...settings });

  try {
    localStorage.setItem('audio_notification_settings', JSON.stringify(updated));
    audioSettingsCache = updated;
  } catch (error) {
    console.error('Error saving audio settings:', error);
  }
};

/**
 * Check if tab is currently active
 */
const isTabActive = (): boolean => {
  return !document.hidden;
};

/**
 * Play notification sound based on settings
 */
export const playNotificationSound = async (
  settings?: Partial<AudioSettings>,
  checkUnreadConversations?: () => boolean
): Promise<void> => {
  const audioSettings = normalizeAudioSettings(settings ? { ...getAudioSettings(), ...settings } : getAudioSettings());

  if (!audioSettings.enable_audio_alerts) {
    return;
  }

  // If always_play_audio_alert is false, only play when tab is inactive
  if (!audioSettings.always_play_audio_alert && isTabActive()) {
    return;
  }

  if (audioSettings.alert_if_unread_assigned_conversation_exist) {
    if (checkUnreadConversations) {
      if (!checkUnreadConversations()) return;
    } else {
      return;
    }
  }

  const toneFile = TONE_FILES[audioSettings.notification_tone];
  await playFileWithFallback(toneFile, audioSettings.notification_tone, { allowCreate: false });
};

/**
 * Play a preview of the notification sound (ignores conditions)
 */
export const playNotificationSoundPreview = async (tone: NotificationTone): Promise<void> => {
  await unlockAudioContext({ createIfMissing: true });
  const toneFile = TONE_FILES[tone];
  await playFileWithFallback(toneFile, tone, { allowCreate: true });
};

/**
 * Clear audio settings cache (useful when settings are updated)
 */
export const clearAudioSettingsCache = (): void => {
  audioSettingsCache = null;
};
