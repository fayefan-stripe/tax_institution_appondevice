import { isAndroidEmulator } from './device';

export const BACKEND_PORT = 3000;

export const APP_TITLE = 'Tax Institution';

/**
 * Public backend URL — production deployment.
 * Leave empty to fall back to BACKEND_HOST_LAN (local Wi‑Fi dev only).
 */
export const API_BASE_URL = 'https://tax-institution-appondevice.vercelapp.stripe.dev';

// Your laptop's Wi-Fi IP — fallback when API_BASE_URL is empty (same network as S710).
// Find it with: ipconfig getifaddr en0
export const BACKEND_HOST_LAN = '192.168.141.230';

export const DEFAULT_CURRENCY = 'aud';

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

export function formatMoney(amountCents: number, currency = DEFAULT_CURRENCY): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)} ${currency.toUpperCase()}`;
  }
}
