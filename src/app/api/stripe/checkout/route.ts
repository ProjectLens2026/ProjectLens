// =============================================================================
// POST /api/stripe/checkout
// =============================================================================
// Creates a Stripe Checkout Session for the calling user's organization.
// Returns { url } — the frontend redirects the browser to this URL.
//
// The session is configured for SUBSCRIPTION mode with:
//   - $99/mo recurring price
//   - LAUNCH50 coupon (50% off for 2 months)
//   - No card-on-trial — customer pays immediately on day 16+
//   - success_url returns to /dashboard?upgrade=success
//   - cancel_url returns to /dashboard/settings?tab=billing&upgrade=canceled
//
// Auth: requires a Supabase session. The user must be the admin/owner of an
// org (PMs / viewers can't kick off upgrades — only the org owner pays).
// =============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getStripeClient,
  getProPriceId,
  getLaunchCouponId,
  getAppUrl,
} from '@/lib/stripe'

export async function POST() {
  try {
    const supabase = createClient()

    // 1) Authenticate the caller
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 2) Find the user's primary org (the one they own — admin/owner role)
    const { data: membership, error: memErr } = await supabase
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .single()

    if (memErr || !membership) {
      return NextResponse.json(
        { error: 'No admin/owner org found for this user' },
        { status: 403 }
      )
    }

    const orgId = membership.org_id

    // 3) Fetch the org row — we need to know if it already has a Stripe
    //    customer ID, and to verify its status. We also pass the email
    //    so Stripe Checkout pre-fills the customer.
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, name, subscription_status, stripe_customer_id')
      .eq('id', orgId)
      .single()

    if (orgErr || !org) {
      return NextResponse.json({ error: 'Org not found' }, { status: 404 })
    }

    // 4) Block re-payment for already-active subscriptions
    if (org.subscription_status === 'active') {
      return NextResponse.json(
        { error: 'Subscription already active', redirect: '/dashboard/settings?tab=billing' },
        { status: 409 }
      )
    }

    if (org.subscription_status === 'lifetime') {
      return NextResponse.json(
        { error: 'This org has lifetime access', redirect: '/dashboard' },
        { status: 409 }
      )
    }

    // 5) Build the Checkout Session
    const stripe = getStripeClient()
    const appUrl = getAppUrl()

    const sessionParams: any = {
      mode: 'subscription' as const,
      line_items: [{ price: getProPriceId(), quantity: 1 }],
      // Apply the 50% coupon for first 2 months
      discounts: [{ coupon: getLaunchCouponId() }],
      // Identify the org in the webhook
      client_reference_id: orgId,
      metadata: {
        org_id: orgId,
        org_name: org.name,
        user_id: user.id,
      },
      // Where Stripe sends them back
      success_url: `${appUrl}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/dashboard/settings?tab=billing&upgrade=canceled`,
      // Collect tax automatically once Stripe Tax is enabled (no-op until then)
      automatic_tax: { enabled: false },
      // No free trial on the SUBSCRIPTION — they've already had 15 days on us
      subscription_data: {
        metadata: {
          org_id: orgId,
        },
      },
    }

    // Re-use the customer if we already have one (handles re-subscribe after cancel)
    if (org.stripe_customer_id) {
      sessionParams.customer = org.stripe_customer_id
    } else {
      sessionParams.customer_email = user.email
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe did not return a checkout URL' },
        { status: 500 }
      )
    }

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe.checkout] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Checkout failed' },
      { status: 500 }
    )
  }
}
