import { getAuthUrl } from '../config';
import { authedFetch, safeJson } from './core';

// ── Stripe / Payments ─────────────────────────────────────────────────────────

export async function fetchStripePublishableKey(): Promise<string | null> {
  try {
    const res = await fetch(`${getAuthUrl()}/stripe/config`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json() as { publishable_key?: string };
    return data.publishable_key ?? null;
  } catch { return null; }
}

export async function createCheckoutSession(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/checkout`, { method: 'POST' });
    const data = await safeJson(res);
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Failed to create checkout session' };
    }
    return { ok: true, url: data.url as string };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function createSubscription(): Promise<{
  ok: boolean;
  clientSecret?: string;
  invoiceId?: string;
  subscriptionId?: string;
  error?: string;
}> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/subscribe`, { method: 'POST' });
    const data = await safeJson(res);
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Failed to create subscription' };
    }
    return {
      ok: true,
      clientSecret: data.client_secret as string,
      invoiceId: data.invoice_id as string,
      subscriptionId: data.subscription_id as string,
    };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function confirmSubscriptionPayment(
  invoiceId: string,
  paymentMethodId: string,
): Promise<{ ok: boolean; requiresAction?: boolean; clientSecret?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoiceId, payment_method_id: paymentMethodId }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Payment failed' };
    }
    if (data.requires_action) {
      return { ok: true, requiresAction: true, clientSecret: data.client_secret as string };
    }
    return { ok: true };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function startIdentityVerification(): Promise<{
  ok: boolean;
  clientSecret?: string;
  url?: string;
  sessionId?: string;
  error?: string;
}> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/identity/start`, { method: 'POST' });
    const data = await safeJson(res);
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Failed to start verification' };
    }
    return {
      ok: true,
      clientSecret: data.client_secret as string,
      url: data.url as string,
      sessionId: data.session_id as string,
    };
  } catch { return { ok: false, error: 'Network error' }; }
}

export async function getIdentityStatus(): Promise<{ ageVerified: boolean }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/stripe/identity/status`);
    if (!res.ok) return { ageVerified: false };
    const data = await safeJson(res);
    return { ageVerified: data.age_verified === true };
  } catch { return { ageVerified: false }; }
}

export async function redeemPromoCode(code: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await authedFetch(`${getAuthUrl()}/promo/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      const err = data.error;
      return { ok: false, error: typeof err === 'string' ? err : 'Invalid or expired promo code.' };
    }
    return { ok: true, message: typeof data.message === 'string' ? data.message : 'Promo code redeemed!' };
  } catch { return { ok: false, error: 'Network error' }; }
}
