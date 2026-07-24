import { getApiBaseUrl, getPublicPayBaseUrl } from './config';

export type PromoReason = 'invalid_code' | 'not_yet_active' | 'expired';

export async function createPaymentIntentClientSecret(): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/api/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create payment intent');
  }
  return data.clientSecret;
}

export async function createSimulatorPaymentIntent(): Promise<{
  paymentIntentId: string;
  payUrl: string;
}> {
  const res = await fetch(`${getApiBaseUrl()}/api/create-simulator-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payBaseUrl: getPublicPayBaseUrl() }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create payment intent');
  }
  return { paymentIntentId: data.paymentIntentId, payUrl: data.payUrl };
}

export async function getSimulatorPaymentStatus(
  paymentIntentId: string,
): Promise<{ piStatus: string }> {
  const res = await fetch(`${getApiBaseUrl()}/api/simulator-payment-status/${paymentIntentId}`);
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to check payment status');
  }
  return data;
}

export async function capturePaymentIntent(paymentIntentId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/capture-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentIntentId }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to capture payment');
  }
}

export async function validatePromo(code: string): Promise<{ valid: boolean; reason?: PromoReason }> {
  const res = await fetch(`${getApiBaseUrl()}/api/validate-promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

export const PROMO_MESSAGES: Record<PromoReason, string> = {
  invalid_code: 'Invalid promo code. Please try again.',
  not_yet_active: 'This promo code is not active yet.',
  expired: 'This promo code has expired.',
};

export function getQrCodeImageUrl(payUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payUrl)}`;
}
