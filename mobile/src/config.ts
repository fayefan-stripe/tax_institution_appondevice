import { isAndroidEmulator } from './device';

export const BACKEND_PORT = 3000;

/**
 * Public backend URL — set after Vercel deploy, e.g. https://your-app.vercel.app
 * Leave empty to use BACKEND_HOST_LAN on physical devices (local Wi‑Fi dev).
 */
export const API_BASE_URL = '';

// Your laptop's Wi-Fi IP — fallback when API_BASE_URL is empty (same network as S710).
// Find it with: ipconfig getifaddr en0
export const BACKEND_HOST_LAN = '192.168.141.230';

export const PAYMENT_AMOUNT_LABEL = '$8.00 AUD';

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

/** Backend URL: emulator → host loopback; device → API_BASE_URL or laptop LAN IP. */
export function getApiBaseUrl(): string {
  if (isAndroidEmulator()) {
    return `http://10.0.2.2:${BACKEND_PORT}`;
  }
  if (API_BASE_URL.trim()) {
    return normalizeBaseUrl(API_BASE_URL.trim());
  }
  return `http://${BACKEND_HOST_LAN}:${BACKEND_PORT}`;
}

/** URL for simulator QR pay page (Vercel or LAN). */
export function getPublicPayBaseUrl(): string {
  if (API_BASE_URL.trim()) {
    return normalizeBaseUrl(API_BASE_URL.trim());
  }
  return `http://${BACKEND_HOST_LAN}:${BACKEND_PORT}`;
}

/** Skip Stripe reader discovery on emulator only; real S710 always connects. */
export function isSimulatorMode(): boolean {
  return isAndroidEmulator();
}
