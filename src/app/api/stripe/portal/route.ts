// =============================================================================
// POST /api/stripe/portal
// =============================================================================
// Creates a Stripe Customer Portal session for the calling user's org.
// Returns { url } — the frontend redirects the browser there.
//
// The portal lets customers:
//   - Update payment method
//   - View invoices
//   - Cancel subscription
//   - See plan details
// All hosted by Stripe — zero UI we need to build.
//
// Prerequisite: Stripe Customer Portal must be activated in the Stripe
// dashboard (Settings → Billing → Customer portal → Activate). Configure
// allowed actions there.
// =============================================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripeClient, getAppUrl } from '@/lib/stripe'

export async function POST() {
  try {
    const supabase = createClient()

    // 1) Authenticate
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 2) Find admin/owner org
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'No admin/owner org found' }, { status: 403 })
    }

    // 3) Fetch the stripe_customer_id
    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', membership.org_id)
      .single()

    if (!org || !org.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer on file — subscribe first' },
        { status: 404 }
      )
    }

    // 4) Build the portal session
    const stripe = getStripeClient()
    const appUrl = getAppUrl()

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/dashboard/settings?tab=billing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe.portal] error:', err)
    return NextResponse.json(
      { error: err?.message || 'Portal session failed' },
      { status: 500 }
    )
  }
}
