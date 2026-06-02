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
import { sendOwnerNotification, notificationTemplate } from '@/lib/email/notify'
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

        // Day 13 — Detect "customer just clicked cancel in Stripe Portal."
        // Stripe fires subscription.updated with cancel_at_period_end now true
        // AND previous_attributes showing it WAS false before this event.
        // We email the owners with the feedback Stripe collected.
        try {
          const prev = (event.data as any).previous_attributes || {}
          const justScheduledCancel = (sub as any).cancel_at_period_end === true
            && prev.cancel_at_period_end === false
          if (justScheduledCancel) {
            await sendCancellationEmail(db, sub, 'scheduled')
          }
          // Also: customer un-canceled (toggled back). Worth knowing about too.
          const justResumed = (sub as any).cancel_at_period_end === false
            && prev.cancel_at_period_end === true
          if (justResumed) {
            await sendResumeEmail(db, sub)
          }
        } catch (notifyErr) {
          console.error('[stripe.webhook] cancel notification failed (non-fatal):', notifyErr)
        }

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

        // Day 13 — Subscription truly ended. Send the final "they're gone" email.
        try {
          await sendCancellationEmail(db, sub, 'ended')
        } catch (notifyErr) {
          console.error('[stripe.webhook] ended-email failed (non-fatal):', notifyErr)
        }
        break
      }

      // Recurring payment succeeded — bump status back to active in case
      // we had past_due and Stripe successfully retried.
      case 'invoice.payment_succeeded': {
        // Cast to any: newer Stripe SDK tightened the Invoice type and removed
        // the top-level `subscription` field from the public types, but the
        // runtime payload from Stripe still includes it. Cast bypasses the
        // type check; runtime behavior unchanged.
        const invoice = event.data.object as any
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
        const invoice = event.data.object as any
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

// =============================================================================
// Owner notification helpers — Day 13
// =============================================================================
// All three of these wrap the email send in their own try/catch. If anything
// inside fails we log and return — never let an email failure break webhook
// acknowledgement, which would cause Stripe to retry endlessly.
// =============================================================================

async function sendCancellationEmail(
  db: ReturnType<typeof getServiceClient>,
  sub: Stripe.Subscription,
  phase: 'scheduled' | 'ended'
): Promise<void> {
  try {
    // Look up the org so we can include name and customer context
    const orgId = (sub.metadata && sub.metadata.org_id) || null
    let orgName = 'Unknown'
    let orgCreatedAt: string | null = null
    let customerEmail: string | null = null

    if (orgId) {
      const { data: org } = await db
        .from('organizations')
        .select('name, created_at')
        .eq('id', orgId)
        .single()
      if (org) {
        orgName = org.name
        orgCreatedAt = org.created_at
      }

      // Try to pull the user's email via the first member of the org
      const { data: members } = await db
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (members && members[0]) {
        const { data: { user } } = await db.auth.admin.getUserById(members[0].user_id)
        customerEmail = user?.email ?? null
      }
    }

    // Cancellation reason + comment from Stripe Portal feedback collection
    const details = (sub as any).cancellation_details || {}
    const reason = details.feedback || details.reason || '—'
    const comment = details.comment || '—'

    // Cancellation feedback codes from Stripe map to friendly labels
    const reasonLabel = ({
      customer_service: 'Customer service issue',
      low_quality: 'Low quality',
      missing_features: 'Missing features',
      other: 'Other',
      switched_service: 'Switched to a competitor',
      too_complex: 'Too complex to use',
      too_expensive: 'Too expensive',
      unused: 'Not using it enough',
    } as Record<string, string>)[reason] || reason

    // Customer-for-N-days calculation
    const customerDays = orgCreatedAt
      ? Math.floor((Date.now() - new Date(orgCreatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null

    // Period end date (when access actually stops)
    const periodEndUnix = (sub as any).current_period_end as number | undefined
    const periodEnd = periodEndUnix
      ? new Date(periodEndUnix * 1000).toLocaleDateString('en-US', { dateStyle: 'long' })
      : '—'

    const isScheduled = phase === 'scheduled'
    const headline = isScheduled
      ? 'Subscription canceled (access continues until period end)'
      : 'Subscription ended'
    const intro = isScheduled
      ? `${customerEmail || orgName} just clicked Cancel in the Stripe Customer Portal. They keep access until ${periodEnd}. Reach out now while it might still be recoverable.`
      : `${customerEmail || orgName}'s subscription has officially ended. They no longer have access. Send a "we'd love to have you back" email if appropriate.`

    const rows: Array<{ label: string; value: string }> = [
      { label: 'Customer', value: customerEmail || '(unknown)' },
      { label: 'Organization', value: orgName },
      { label: 'Was a customer for', value: customerDays !== null ? `${customerDays} days` : '—' },
      { label: 'Reason given', value: reasonLabel },
      { label: 'Comment', value: comment },
      { label: 'Access ends', value: periodEnd },
      { label: 'Stripe subscription', value: sub.id },
    ]

    const { html, text } = notificationTemplate({
      headline,
      intro,
      rows,
      ctaText: 'View in Stripe Dashboard',
      ctaUrl: `https://dashboard.stripe.com/subscriptions/${sub.id}`,
      footer: isScheduled
        ? 'Tip: A "what could we do better?" email within 24 hours recovers 10-30% of cancellations.'
        : 'They paid for a full month and used it. Consider a "come back" offer in 30 days.',
    })

    await sendOwnerNotification({
      subject: isScheduled
        ? `[ControlLens] Cancellation scheduled: ${customerEmail || orgName}`
        : `[ControlLens] Subscription ended: ${customerEmail || orgName}`,
      html,
      text,
    })
  } catch (err) {
    console.error('[notify.cancel] failed:', err)
  }
}

async function sendResumeEmail(
  db: ReturnType<typeof getServiceClient>,
  sub: Stripe.Subscription
): Promise<void> {
  try {
    const orgId = (sub.metadata && sub.metadata.org_id) || null
    let orgName = 'Unknown'
    let customerEmail: string | null = null

    if (orgId) {
      const { data: org } = await db
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single()
      if (org) orgName = org.name

      const { data: members } = await db
        .from('organization_members')
        .select('user_id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (members && members[0]) {
        const { data: { user } } = await db.auth.admin.getUserById(members[0].user_id)
        customerEmail = user?.email ?? null
      }
    }

    const { html, text } = notificationTemplate({
      headline: 'Customer reactivated subscription 🎉',
      intro: `${customerEmail || orgName} had scheduled a cancellation but then clicked "Don't cancel" in the Stripe Customer Portal. They're back on the active list.`,
      rows: [
        { label: 'Customer', value: customerEmail || '(unknown)' },
        { label: 'Organization', value: orgName },
        { label: 'Stripe subscription', value: sub.id },
      ],
      ctaText: 'View in Stripe',
      ctaUrl: `https://dashboard.stripe.com/subscriptions/${sub.id}`,
    })

    await sendOwnerNotification({
      subject: `[ControlLens] Reactivated: ${customerEmail || orgName}`,
      html,
      text,
    })
  } catch (err) {
    console.error('[notify.resume] failed:', err)
  }
}
