'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import HelpWidget from '@/components/HelpWidget'
import { migrateLegacyData, loadProjects, getActiveProjectId, setActiveProjectId } from '@/lib/projectStore'
import { createClient } from '@/lib/supabase/client'
import { getOrgPlanInfo, OrgPlanInfo } from '@/lib/supabase/db'

interface AppUser {
  name: string
  email: string
  company: string
  role: string
  initials: string
}

// Phase B.1 — Paywall whitelist. Hard-blocked users CAN still access these
// paths, so they can manage billing, view their account, or sign out. Every
// other dashboard route gets the paywall screen instead of its content.
const PAYWALL_ALLOWED_PATHS = [
  '/dashboard/settings',          // Billing tab lives here
  '/dashboard/billing-required',  // The paywall page itself
]

function isPathAllowedDuringPaywall(pathname: string): boolean {
  return PAYWALL_ALLOWED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [planInfo, setPlanInfo] = useState<OrgPlanInfo | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }

      // Email must be verified before they can access the dashboard
      if (!session.user.email_confirmed_at) {
        await supabase.auth.signOut()
        router.replace('/login?error=email_not_verified')
        return
      }

      // Load profile data (name, company, role) from the profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      const name = profile?.name || session.user.email || 'User'
      const initials = name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      setUser({
        name,
        email: session.user.email || '',
        company: profile?.company || '',
        role: profile?.role || 'Project Manager',
        initials,
      })

      // Local project data setup. Phase 3 will migrate these to Supabase.
      migrateLegacyData()
      const projects = loadProjects()
      if (projects.length > 0 && !getActiveProjectId()) {
        setActiveProjectId(projects[0].id)
      }

      // Phase B.1 — fetch plan info for the paywall gate. If this fails the
      // user still gets in (fail-open) — we'd rather degrade gracefully than
      // lock everyone out due to a Supabase blip.
      try {
        const plan = await getOrgPlanInfo()
        setPlanInfo(plan)
      } catch (err) {
        console.error('[dashboard.layout] getOrgPlanInfo failed:', err)
        setPlanInfo(null)
      }

      setChecking(false)
    }

    checkAuth()

    // React to sign-out from any tab
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        router.replace('/login')
      }
    })

    return () => {
      subscription.subscription.unsubscribe()
    }
  }, [router])

  if (checking || !user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-3">
        {/* Loading mark — ControlLens 4-bar mark, pulsing.
            44x32 dimensions match the other inline marks across the app
            (login, auth pages, sidebar). The animate-pulse class gives the
            soft fade in/out during the brief auth-check window. */}
        <svg width="44" height="32" viewBox="0 0 44 32" xmlns="http://www.w3.org/2000/svg" className="animate-pulse" aria-label="ControlLens mark">
          <rect x="0" y="0" width="32" height="5" rx="1" fill="#2563eb"/>
          <rect x="0" y="9" width="44" height="5" rx="1" fill="#dc2626"/>
          <rect x="0" y="18" width="26" height="5" rx="1" fill="#16a34a"/>
          <rect x="0" y="27" width="36" height="5" rx="1" fill="#1f2937"/>
        </svg>
        <div className="text-white/40 text-sm">Loading ControlLens...</div>
      </div>
    </div>
  )

  // Phase B.1 — Paywall gate. Hard-block users who need to pay.
  // Replaces the page content with a BillingRequired screen UNLESS they're
  // on /dashboard/settings (so they can reach Billing → cancel / sign out).
  // Sidebar stays visible so they don't feel trapped.
  const showPaywall = planInfo?.requiresPayment && !isPathAllowedDuringPaywall(pathname || '')

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {showPaywall ? <PaywallScreen planInfo={planInfo!} /> : children}
      </div>
      <HelpWidget />
    </div>
  )
}

// =============================================================================
// PaywallScreen — shown when the user is hard-blocked (trial expired or
// canceled subscription). Single CTA: "Pay $99/month — Subscribe to Pro".
// Customers click → POST /api/stripe/checkout → redirected to Stripe Checkout.
// =============================================================================

function PaywallScreen({ planInfo }: { planInfo: OrgPlanInfo }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error || 'Could not start checkout. Please try again.')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch (err: any) {
      setError(err?.message || 'Network error — please try again.')
      setLoading(false)
    }
  }

  const headline = planInfo.subscriptionStatus === 'canceled'
    ? 'Your subscription has ended'
    : 'Your 15-day free trial has ended'

  const subhead = planInfo.subscriptionStatus === 'canceled'
    ? 'Re-subscribe to ControlLens Pro to regain access to your projects, TIA, Trend, and EVM.'
    : "You used the full 15 days. Subscribe to ControlLens Pro to keep your projects, TIA, Trend, and EVM."

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">{headline}</h1>
          <p className="text-slate-600 text-sm mb-8 max-w-md mx-auto leading-relaxed">
            {subhead}
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 text-left">
            <div className="text-xs font-bold text-blue-900 uppercase tracking-wider mb-3">
              ControlLens Pro
            </div>
            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-3xl font-extrabold text-slate-900">$99</span>
              <span className="text-sm text-slate-500">/month</span>
            </div>
            <ul className="text-sm text-slate-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>First 2 months: <strong>$49.50/month</strong> (50% off)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>5 active projects · unlimited XER uploads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>TIA, Trend, EVM, white-label reports</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-600 mt-0.5">✓</span>
                <span>Cancel anytime from Settings → Billing</span>
              </li>
            </ul>
          </div>

          <button
            onClick={startCheckout}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Opening checkout…' : 'Subscribe to Pro — Pay $49.50 today'}
          </button>

          {error && (
            <div className="mt-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          <p className="text-[11px] text-slate-400 mt-4">
            Need more than 5 projects? <a href="mailto:sales@control-lens.com" className="text-blue-600 hover:underline">Contact sales</a>
          </p>
        </div>
      </div>
    </div>
  )
}
