// =============================================================================
// POST /api/stripe/webhook
// =============================================================================
// Receives Stripe webhook events and syncs subscription state into Supabase.
//
// Setup in Stripe dashboard AFTER deploying this route:
//   1) Stripe → Developers → Webhooks → Add endpoint
//   2) Endpoint URL: https://app.control-lens.com/api/stripe/webhook
//   3) Events to send (select these 5):
//        - checkout.session.completed
//        - customer.subscription.updated
//        - customer.subscription.deleted
//        - invoice.payment_succeeded
//        - invoice.payment_failed
//   4) Stripe generates a signing secret (whsec_...)
//   5) Paste it into Vercel env var STRIPE_WEBHOOK_SECRET
//   6) Redeploy
//
// Why service role: webhook events arrive without a user session. To update
// the organizations table we need a server-side admin client that bypasses
// RLS. We DO verify the Stripe signature first — so only Stripe-signed
// requests get this elevated access.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripeClient, getWebhookSecret } from '@/lib/stripe'
import type Stripe from 'stripe'

// Disable Next's auto body parsing — Stripe needs the raw body bytes to verify
// the signature. We read them manually below.
export const runtime = 'nodejs'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service role env vars are not set')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(req: NextRequest) {
  // 1) Verify the Stripe signature against the raw request body
  const stripe = getStripeClient()
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, getWebhookSecret())
  } catch (err: any) {
    console.error('[stripe.webhook] signature verification failed:', err?.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // 2) Dispatch by event type
  const db = getServiceClient()
  try {
    switch (event.type) {
      // Customer just completed Stripe Checkout — first payment OK.
      // Attach customer + subscription IDs to the org, flip status to active.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const orgId =
          session.client_reference_id ||
          (session.metadata && session.metadata.org_id) ||
          null

        if (!orgId) {
          console.error('[stripe.webhook] checkout.session.completed missing org_id')
          break
        }
        if (!session.subscription || !session.customer) {
          console.error('[stripe.webhook] checkout.session.completed missing subscription/customer')
          break
        }

        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : session.customer.id

        const { error } = await db
          .from('organizations')
          .update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            subscription_status: 'active',
          })
          .eq('id', orgId)

        if (error) {
          console.error('[stripe.webhook] failed to mark org active:', error)
        } else {
          console.log('[stripe.webhook] org marked active:', orgId)
        }
        break
      }

      // Subscription state changed (most common: payment failure → past_due,
      // recovery → active, cancel-at-period-end → still active until end).
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = (sub.metadata && sub.metadata.org_id) || null

        // Map Stripe status to our enum:
        //   'active' / 'trialing'        → 'active'
        //   'past_due' / 'unpaid'        → 'past_due'   (Stripe will retry)
        //   'canceled' / 'incomplete_expired' → 'canceled'
        //   anything else                → leave alone
        let nextStatus: string | null = null
        switch (sub.status) {
          case 'active':
          case 'trialing':
            nextStatus = 'active'
            break
          case 'past_due':
          case 'unpaid':
            nextStatus = 'past_due'
            break
          case 'canceled':
          case 'incomplete_expired':
            nextStatus = 'canceled'
            break
          default:
            nextStatus = null
        }

        if (!nextStatus) break

        const query = db.from('organizations').update({ subscription_status: nextStatus })
        const { error } = orgId
          ? await query.eq('id', orgId)
          : await query.eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('[stripe.webhook] failed to update subscription status:', error)
        } else {
          console.log(`[stripe.webhook] subscription ${sub.id} → ${nextStatus}`)
        }
        break
      }

      // Subscription fully canceled (period end reached, or admin canceled).
      // Hard-block the org.
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = (sub.metadata && sub.metadata.org_id) || null

        const query = db.from('organizations').update({ subscription_status: 'canceled' })
        const { error } = orgId
          ? await query.eq('id', orgId)
          : await query.eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error('[stripe.webhook] failed to mark org canceled:', error)
        } else {
          console.log(`[stripe.webhook] subscription ${sub.id} canceled`)
        }
        break
      }

      // Recurring payment succeeded — bump status back to active in case
      // we had past_due and Stripe successfully retried.
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription.id

        const { error } = await db
          .from('organizations')
          .update({ subscription_status: 'active' })
          .eq('stripe_subscription_id', subscriptionId)

        if (error) {
          console.error('[stripe.webhook] failed to mark org active on payment_succeeded:', error)
        }
        break
      }

      // Recurring payment failed. Mark past_due — Stripe will retry over the
      // next 1-2 days. If all retries fail, subscription.deleted will fire.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (!invoice.subscription) break

        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription.id

        const { error } = await db
          .from('organizations')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId)

        if (error) {
          console.error('[stripe.webhook] failed to mark org past_due:', error)
        }
        break
      }

      default:
        // No-op for events we don't care about. Stripe is happy with 200.
        console.log('[stripe.webhook] ignored event:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('[stripe.webhook] handler error:', err)
    // Return 500 so Stripe retries — better to be retried than to lose the event
    return NextResponse.json({ error: err?.message || 'Webhook handler failed' }, { status: 500 })
  }
}
