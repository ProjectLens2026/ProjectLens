'use client'
// =============================================================================
// User Profile — /dashboard/profile
//
// Day 8, Phase 1 build.
//
// Lets the signed-in user edit:
//   - Full name, phone, company, job title (saved into Supabase user_metadata)
//   - Password (Supabase Auth updateUser)
//   - Whether the "Ask ControlLens" chat widget shows (localStorage flag,
//     read by HelpWidget; fires `pl_show_chatbot_changed` event so the widget
//     hides/shows immediately without a page reload).
//
// Email is read-only (it's the auth identity).
// =============================================================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const SHOW_CHATBOT_KEY = 'pl_show_chatbot'

interface ProfileFields {
  full_name: string
  phone: string
  company: string
  job_title: string
}

const EMPTY_FIELDS: ProfileFields = { full_name: '', phone: '', company: '', job_title: '' }

export default function ProfilePage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState('')
  const [fields, setFields] = useState<ProfileFields>(EMPTY_FIELDS)
  const [savedMessage, setSavedMessage] = useState('')
  const [error, setError] = useState('')

  // Password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState('')
  const [pwError, setPwError] = useState('')

  // Chatbot toggle state
  const [showChatbot, setShowChatbot] = useState(true)

  // -------- Load user + metadata --------
  useEffect(() => {
    (async () => {
      try {
        const { data, error: authErr } = await supabase.auth.getUser()
        if (authErr || !data?.user) {
          setError('Not signed in. Please log in again.')
          setLoading(false)
          return
        }
        const u = data.user
        setEmail(u.email || '')
        const meta = (u.user_metadata || {}) as any
        setFields({
          full_name: meta.full_name || '',
          phone: meta.phone || '',
          company: meta.company || '',
          job_title: meta.job_title || '',
        })
        // Chatbot flag — default true
        try {
          const v = localStorage.getItem(SHOW_CHATBOT_KEY)
          setShowChatbot(v === null ? true : v !== 'false')
        } catch {}
      } catch (e: any) {
        setError(e?.message || 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // -------- Save profile fields --------
  async function saveProfile() {
    setError('')
    setSavedMessage('')
    setSaving(true)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        data: {
          full_name: fields.full_name.trim(),
          phone: fields.phone.trim(),
          company: fields.company.trim(),
          job_title: fields.job_title.trim(),
        },
      })
      if (updateErr) throw updateErr
      setSavedMessage('Profile saved.')
      setTimeout(() => setSavedMessage(''), 3000)
    } catch (e: any) {
      setError(e?.message || 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

  // -------- Change password --------
  async function changePassword() {
    setPwError('')
    setPwMessage('')
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.')
      return
    }
    setPwLoading(true)
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword })
      if (pwErr) throw pwErr
      setPwMessage('Password updated.')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPwMessage(''), 4000)
    } catch (e: any) {
      setPwError(e?.message || 'Failed to update password.')
    } finally {
      setPwLoading(false)
    }
  }

  // -------- Toggle chatbot --------
  function toggleChatbot(next: boolean) {
    setShowChatbot(next)
    try {
      localStorage.setItem(SHOW_CHATBOT_KEY, next ? 'true' : 'false')
      // Tell HelpWidget to re-read immediately
      window.dispatchEvent(new Event('pl_show_chatbot_changed'))
    } catch {}
  }

  // -------- Render --------
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-sm text-slate-500">Loading profile…</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <span className="font-bold text-slate-900 text-base">My Profile</span>
        <span className="text-slate-400 text-sm ml-2">· Account settings and preferences</span>
      </div>

      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">

        {/* ---------- Profile card ---------- */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">Your Information</h2>
          <p className="text-xs text-slate-500 mb-5">
            This shows on invitations you send and on the Help page when other team members reach out.
          </p>

          <div className="space-y-4">
            {/* Email (read-only) */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Email <span className="text-slate-400 normal-case font-normal">· read-only (sign-in identity)</span>
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
            </div>

            {/* Full name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text"
                value={fields.full_name}
                onChange={e => setFields({ ...fields, full_name: e.target.value })}
                placeholder="e.g. Jawid Noorzai"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Phone <span className="text-slate-400 normal-case font-normal">· optional</span>
                </label>
                <input
                  type="tel"
                  value={fields.phone}
                  onChange={e => setFields({ ...fields, phone: e.target.value })}
                  placeholder="e.g. +1 (555) 123-4567"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Job Title <span className="text-slate-400 normal-case font-normal">· optional</span>
                </label>
                <input
                  type="text"
                  value={fields.job_title}
                  onChange={e => setFields({ ...fields, job_title: e.target.value })}
                  placeholder="e.g. Senior Project Manager"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Company <span className="text-slate-400 normal-case font-normal">· optional</span>
              </label>
              <input
                type="text"
                value={fields.company}
                onChange={e => setFields({ ...fields, company: e.target.value })}
                placeholder="e.g. Nobel Project Management Services"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
                ⚠ {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              {savedMessage && (
                <span className="text-xs text-emerald-700 font-semibold">✓ {savedMessage}</span>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Preferences card ---------- */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">Preferences</h2>
          <p className="text-xs text-slate-500 mb-5">Tweak how ControlLens looks and behaves for you.</p>

          <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-bold text-slate-900 mb-0.5">Show "Ask ControlLens" chat widget</div>
              <div className="text-xs text-slate-500 leading-relaxed">
                The floating chat bubble at the bottom-right of every page. Turn off if you want a cleaner UI —
                you can still get help from the Help page or by emailing support@control-lens.com.
              </div>
            </div>
            <button
              onClick={() => toggleChatbot(!showChatbot)}
              aria-pressed={showChatbot}
              className={`ml-4 relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0
                ${showChatbot ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span
                className={`inline-block w-5 h-5 transform bg-white rounded-full shadow transition-transform
                  ${showChatbot ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

        {/* ---------- Password card ---------- */}
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">Change Password</h2>
          <p className="text-xs text-slate-500 mb-5">
            Minimum 8 characters. You'll stay signed in on this device after the change.
          </p>

          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>

            {pwError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
                ⚠ {pwError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={changePassword}
                disabled={pwLoading || !newPassword || !confirmPassword}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors">
                {pwLoading ? 'Updating…' : 'Update Password'}
              </button>
              {pwMessage && (
                <span className="text-xs text-emerald-700 font-semibold">✓ {pwMessage}</span>
              )}
            </div>
          </div>
        </section>

        {/* ---------- Help / support hint ---------- */}
        <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-xl">💬</div>
            <div className="flex-1">
              <div className="text-sm font-bold text-blue-900 mb-1">Need help?</div>
              <div className="text-xs text-blue-800 leading-relaxed">
                Visit the <Link href="/dashboard/help" className="underline font-semibold">Help page</Link> for
                feature walkthroughs and contact info. Or email
                <a href="mailto:support@control-lens.com" className="underline font-semibold ml-1">support@control-lens.com</a> —
                we reply within 24 hours.
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
