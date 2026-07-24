import { Platform } from 'react-native';

/** True when running on the Android emulator (not a physical S710). */
export function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }

  const constants = Platform.constants as {
    Brand?: string;
    Manufacturer?: string;
    Model?: string;
    Fingerprint?: string;
  };

  const fingerprint = constants.Fingerprint ?? '';
  const model = constants.Model ?? '';

  return (
    fingerprint.includes('generic') ||
    fingerprint.includes('unknown') ||
    model.includes('sdk_gphone') ||
    model.includes('Emulator') ||
    model.includes('Android SDK built for') ||
    (constants.Brand === 'google' &&
      constants.Manufacturer === 'Google' &&
      model.startsWith('sdk_'))
  );
}
