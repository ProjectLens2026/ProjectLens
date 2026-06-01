// =============================================================================
// Stripe client (server-side only)
// =============================================================================
// Shared by /api/stripe/checkout, /api/stripe/webhook, /api/stripe/portal.
//
// Required env vars (set in Vercel + .env.local):
//   STRIPE_SECRET_KEY            — sk_test_... (test) or sk_live_... (prod)
//   STRIPE_WEBHOOK_SECRET        — whsec_... (set after creating webhook endpoint)
//   STRIPE_PRO_PRICE_ID          — the recurring $99/mo price (price_...)
//   STRIPE_LAUNCH_COUPON_ID      — "LAUNCH50" coupon (50% off, 2 months)
//   NEXT_PUBLIC_APP_URL          — https://app.control-lens.com
// =============================================================================

import Stripe from 'stripe'

// Cached singleton — Stripe SDK is heavy, only instantiate once per cold start
let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set in environment')
  }
  stripeClient = new Stripe(key, {
    // Lock to a specific API version so Stripe upgrades don't break us silently.
    // Adjust this if you intentionally upgrade.
    apiVersion: '2024-06-20' as any,
    typescript: true,
  })
  return stripeClient
}

// =============================================================================
// Environment helpers
// =============================================================================

export function getProPriceId(): string {
  const id = process.env.STRIPE_PRO_PRICE_ID
  if (!id) throw new Error('STRIPE_PRO_PRICE_ID is not set')
  return id
}

export function getLaunchCouponId(): string {
  return process.env.STRIPE_LAUNCH_COUPON_ID || 'LAUNCH50'
}

export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL
  if (!url) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  return url.replace(/\/$/, '')   // strip trailing slash
}

export function getWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET
  if (!s) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return s
}
