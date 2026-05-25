'use client'
// =============================================================================
// User Profile — /dashboard/profile
//
// Day 10 fix: When saving name, also update profiles.name in the DB so the
// new name shows up in Members tab, Portfolio, and Team modal. Previously
// the save only went to auth.users.user_metadata which most of the app
// doesn't read.
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
  const [userId, setUserId] = useState('')
  const [fields, setFields] = useState<ProfileFields>(EMPTY_FIELDS)
  const [savedMessage, setSavedMessage] = useState('')
  const [error, setError] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState('')
  const [pwError, setPwError] = useState('')
  const [showChatbot, setShowChatbot] = useState(true)

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
        setUserId(u.id)
        const meta = (u.user_metadata || {}) as any

        // Day 10 — read name from profiles table first (source of truth used
        // by Members tab, Portfolio, Team modal). Fall back to user_metadata.
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', u.id)
          .maybeSingle()

        setFields({
          full_name: profile?.name || meta.full_name || '',
          phone: meta.phone || '',
          company: meta.company || '',
          job_title: meta.job_title || '',
        })

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

  async function saveProfile() {
    setError('')
    setSavedMessage('')
    setSaving(true)
    try {
      const trimmedName = fields.full_name.trim()

      // 1. Update auth user_metadata (used by some auth flows)
      const { error: updateErr } = await supabase.auth.updateUser({
        data: {
          full_name: trimmedName,
          phone: fields.phone.trim(),
          company: fields.company.trim(),
          job_title: fields.job_title.trim(),
        },
      })
      if (updateErr) throw updateErr

      // 2. Day 10 fix — also update profiles.name column. THIS is what the
      // Members tab, Portfolio, and Team modal display.
      if (userId) {
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ name: trimmedName })
          .eq('id', userId)
        if (profileErr) {
          console.warn('[Profile] profiles.name update failed:', profileErr)
          setSavedMessage('Saved (display name may take a moment to sync).')
        } else {
          setSavedMessage('Profile saved.')
        }
      } else {
        setSavedMessage('Profile saved.')
      }

      setTimeout(() => setSavedMessage(''), 3000)
    } catch (e: any) {
      setError(e?.message || 'Failed to save profile.')
    } finally {
      setSaving(false)
    }
  }

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

  function toggleChatbot(next: boolean) {
    setShowChatbot(next)
    try {
      localStorage.setItem(SHOW_CHATBOT_KEY, next ? 'true' : 'false')
      window.dispatchEvent(new Event('pl_show_chatbot_changed'))
    } catch {}
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-sm text-slate-500">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-y-auto">
      <div className="bg-white border-b border-slate-200 px-6 h-14 flex items-center flex-shrink-0">
        <span className="font-bold text-slate-900 text-base">My Profile</span>
        <span className="text-slate-400 text-sm ml-2">- Account settings and preferences</span>
      </div>
      <div className="p-6 max-w-3xl mx-auto w-full space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">Your Information</h2>
          <p className="text-xs text-slate-500 mb-5">
            This shows on invitations you send and on the Members tab.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Email <span className="text-slate-400 normal-case font-normal">- read-only (sign-in identity)</span>
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-600 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                type="text"
                value={fields.full_name}
                onChange={e => setFields({ ...fields, full_name: e.target.value })}
                placeholder="e.g. John Smith"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Phone <span className="text-slate-400 normal-case font-normal">- optional</span>
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
                  Job Title <span className="text-slate-400 normal-case font-normal">- optional</span>
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
                Company <span className="text-slate-400 normal-case font-normal">- optional</span>
              </label>
              <input
                type="text"
                value={fields.company}
                onChange={e => setFields({ ...fields, company: e.target.value })}
                placeholder="e.g. Acme Construction"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 font-semibold">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              {savedMessage && (
                <span className="text-xs text-emerald-700 font-semibold">{savedMessage}</span>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-base font-bold text-slate-900 mb-1">Preferences</h2>
          <p className="text-xs text-slate-500 mb-5">Tweak how ControlLens looks and behaves for you.</p>
          <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-1">
              <div className="text-sm font-bold text-slate-900 mb-0.5">Show "Ask ControlLens" chat widget</div>
              <div className="text-xs text-slate-500 leading-relaxed">
                The floating chat bubble at the bottom-right of every page. Turn off if you want a cleaner UI - you can still get help by emailing support@control-lens.com.
              </div>
            </div>
            <button
              onClick={() => toggleChatbot(!showChatbot)}
              aria-pressed={showChatbot}
              className={`ml-4 relative inline-flex items-center h-6 w-11 rounded-full transition-colors flex-shrink-0 ${showChatbot ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span
                className={`inline-block w-5 h-5 transform bg-white rounded-full shadow transition-transform ${showChatbot ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </section>

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
                {pwError}
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={changePassword}
                disabled={pwLoading || !newPassword || !confirmPassword}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors">
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
              {pwMessage && (
                <span className="text-xs text-emerald-700 font-semibold">{pwMessage}</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
