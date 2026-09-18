import { getApiBaseUrl, getPublicPayBaseUrl } from './config';
import { VERCEL_PROTECTION_BYPASS } from './secrets';

export type StripeCustomer = {
  id: string;
  name: string;
  email: string | null;
};

export type StripeProduct = {
  id: string;
  name: string;
  priceId: string | null;
  unitAmount: number | null;
  currency: string;
};

function usesVercelBackend(): boolean {
  const base = getApiBaseUrl();
  return base.includes('vercel.app') || base.includes('vercelapp.stripe.dev');
}

/** Headers for backend fetch — includes Vercel deployment protection bypass when needed. */
export function getApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (usesVercelBackend() && VERCEL_PROTECTION_BYPASS.trim()) {
    headers['x-vercel-protection-bypass'] = VERCEL_PROTECTION_BYPASS.trim();
  }
  return headers;
}

export async function listCustomers(query?: string): Promise<StripeCustomer[]> {
  const params = new URLSearchParams();
  if (query?.trim()) {
    params.set('q', query.trim());
  }
  const qs = params.toString();
  const res = await fetch(`${getApiBaseUrl()}/api/customers${qs ? `?${qs}` : ''}`, {
    headers: getApiHeaders(),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to load customers');
  }
  return data.customers;
}

export async function createCustomer(input: {
  name: string;
  email?: string;
}): Promise<StripeCustomer> {
  const res = await fetch(`${getApiBaseUrl()}/api/customers`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create customer');
  }
  return data.customer;
}

export async function listProducts(): Promise<StripeProduct[]> {
  const res = await fetch(`${getApiBaseUrl()}/api/products`, { headers: getApiHeaders() });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to load products');
  }
  return data.products;
}

export async function createProduct(input: {
  name: string;
  unitAmount: number;
  currency?: string;
}): Promise<StripeProduct> {
  const res = await fetch(`${getApiBaseUrl()}/api/products`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create product');
  }
  return data.product;
}

export type CheckoutSelection = {
  customerId: string;
  priceId: string;
};

export async function createPaymentIntentClientSecret(
  checkout: CheckoutSelection,
): Promise<{ clientSecret: string; amount: number; currency: string }> {
  const res = await fetch(`${getApiBaseUrl()}/api/create-payment-intent`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify(checkout),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create payment intent');
  }
  return {
    clientSecret: data.clientSecret,
    amount: data.amount,
    currency: data.currency,
  };
}

export async function createSimulatorPaymentIntent(
  checkout: CheckoutSelection,
): Promise<{
  paymentIntentId: string;
  payUrl: string;
  amount: number;
  currency: string;
}> {
  const res = await fetch(`${getApiBaseUrl()}/api/create-simulator-payment-intent`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({ ...checkout, payBaseUrl: getPublicPayBaseUrl() }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to create payment intent');
  }
  return {
    paymentIntentId: data.paymentIntentId,
    payUrl: data.payUrl,
    amount: data.amount,
    currency: data.currency,
  };
}

export async function getSimulatorPaymentStatus(
  paymentIntentId: string,
): Promise<{ piStatus: string }> {
  const res = await fetch(`${getApiBaseUrl()}/api/simulator-payment-status/${paymentIntentId}`, {
    headers: getApiHeaders(),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to check payment status');
  }
  return data;
}

export async function capturePaymentIntent(paymentIntentId: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/capture-payment-intent`, {
    method: 'POST',
    headers: getApiHeaders(),
    body: JSON.stringify({ paymentIntentId }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || 'Failed to capture payment');
  }
}

export function getQrCodeImageUrl(payUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payUrl)}`;
}
