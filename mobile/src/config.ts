import { isAndroidEmulator } from './device';

export const BACKEND_PORT = 3000;

// Your laptop's Wi-Fi IP — used on physical S710 (same network as the reader).
// Find it with: ipconfig getifaddr en0
export const BACKEND_HOST_LAN = '192.168.141.230';

export const PAYMENT_AMOUNT_LABEL = '$8.00 AUD';

/** Backend URL: emulator → host loopback; physical device → laptop LAN IP. */
export function getApiBaseUrl(): string {
  if (isAndroidEmulator()) {
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }
  return `http://${BACKEND_HOST_LAN}:${BACKEND_PORT}`;
}

/** URL phones can reach when scanning the simulator QR code (laptop Wi‑Fi IP). */
export function getPublicPayBaseUrl(): string {
  return `http://${BACKEND_HOST_LAN}:${BACKEND_PORT}`;
}

/** Skip Stripe reader discovery on emulator only; real S710 always connects. */
export function isSimulatorMode(): boolean {
  return isAndroidEmulator();
}
