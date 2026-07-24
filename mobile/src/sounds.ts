import { Platform } from 'react-native';
import SoundPlayer from 'react-native-sound-player';

function playAndroidRaw(name: string, type: string) {
  try {
    SoundPlayer.playSoundFile(name, type);
  } catch (error) {
    console.warn('[sounds] Android playback failed:', error);
  }
}

function playBundledAsset(asset: number) {
  SoundPlayer.playAsset(asset).catch((error: unknown) => {
    console.warn('[sounds] Asset playback failed:', error);
  });
}

export function playPromoSuccess() {
  if (Platform.OS === 'android') {
    // Bundled in android/app/src/main/res/raw/promo_success.wav
    playAndroidRaw('promo_success', 'wav');
    return;
  }
  playBundledAsset(require('./assets/sounds/promo-success.mp3'));
}

export function playPromoFailed() {
  if (Platform.OS === 'android') {
    playAndroidRaw('promo_failed', 'wav');
    return;
  }
  playBundledAsset(require('./assets/sounds/promo-failed.mp3'));
}
