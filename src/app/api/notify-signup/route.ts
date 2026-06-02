// =============================================================================
// POST /api/notify-signup
// =============================================================================
// Called by the client after ensureUserHasOrg() creates a new organization.
// Sends a "new signup" email to the ControlLens owners.
//
// Auth model:
//   - Caller must be authenticated (Supabase session cookie)
//   - We look up THEIR org (not a param from the client, which could be spoofed)
//   - Only send if the org was created in the last 5 minutes — guards against
//     a logged-in user spamming the endpoint to fill our inbox
//
// Failures are silent (returns 200 even if email fails) so the client's
// fire-and-forget pattern doesn't cause console errors.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sendOwnerNotification, notificationTemplate } from '@/lib/email/notify'

export const runtime = 'nodejs'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not set')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getUserClient() {
  // Build a Supabase client that uses the caller's auth cookies
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const cookieStore = cookies()
  const accessToken = cookieStore.get('sb-access-token')?.value
    || cookieStore.getAll().find(c => c.name.endsWith('-auth-token'))?.value

  return createClient(url, anon, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    // 1) Verify caller is authenticated
    const userClient = getUserClient()
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      // Not authenticated — return 200 silently (don't leak signal)
      return NextResponse.json({ ok: true })
    }

    // 2) Look up the user's most recent org membership
    const db = getServiceClient()
    const { data: members, error: memberErr } = await db
      .from('organization_members')
      .select('org_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (memberErr || !members || members.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const orgId = members[0].org_id

    // 3) Load org details
    const { data: org, error: orgErr } = await db
      .from('organizations')
      .select('id, name, account_type, created_at, subscription_status, trial_ends_at')
      .eq('id', orgId)
      .single()
    if (orgErr || !org) {
      return NextResponse.json({ ok: true })
    }

    // 4) Guard: only notify if the org was created in the last 5 minutes.
    // Prevents abuse (a logged-in user repeatedly POSTing to spam our inbox).
    const orgAgeMs = Date.now() - new Date(org.created_at).getTime()
    if (orgAgeMs > 5 * 60 * 1000) {
      return NextResponse.json({ ok: true, skipped: 'org too old' })
    }

    // 5) Compose the email
    const userName = (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'Unknown'
    const trialEndsAt = org.trial_ends_at
      ? new Date(org.trial_ends_at).toLocaleDateString('en-US', { dateStyle: 'long' })
      : 'not set'

    const { html, text } = notificationTemplate({
      headline: 'New ControlLens signup',
      intro: `${userName} just created an account and started a 15-day free trial.`,
      rows: [
        { label: 'Name', value: userName },
        { label: 'Email', value: user.email || '(no email)' },
        { label: 'Organization', value: org.name },
        { label: 'Account type', value: String(org.account_type || 'personal') },
        { label: 'Trial ends', value: trialEndsAt },
        { label: 'Signed up', value: new Date(org.created_at).toLocaleString('en-US') },
      ],
      ctaText: 'View in Supabase',
      ctaUrl: `https://supabase.com/dashboard/project/khqwfeaubmnlndqltniw/editor`,
      footer: 'Reach out within 24 hours to welcome them and learn what they\'re hoping to use ControlLens for.',
    })

    await sendOwnerNotification({
      subject: `[ControlLens] New signup: ${user.email || userName}`,
      html,
      text,
    })

    return NextResponse.json({ ok: true, sent: true })
  } catch (err) {
    console.error('[api.notify-signup] handler error:', err)
    // Silent — never break the client flow
    return NextResponse.json({ ok: true, error: 'logged' })
  }
}
