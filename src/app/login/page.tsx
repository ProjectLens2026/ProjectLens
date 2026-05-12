'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', company: '', email: '', password: '', role: 'Project Manager' })

  const roles = ['Project Manager', 'Senior PM', 'Owner Representative', 'Scheduler', 'Project Executive', 'Superintendent', 'CEO / Executive']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    // Store user in localStorage for demo
    localStorage.setItem('pl_user', JSON.stringify({
      name: form.name || 'Name',
      company: form.company || 'ProjectLens',
      email: form.email,
      role: form.role || 'Project Manager',
      initials: (form.name || 'N').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }))
    setTimeout(() => router.push('/dashboard'), 800)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <circle cx="11" cy="11" r="4"/><circle cx="11" cy="11" r="8.5"/>
                <line x1="2.5" y1="11" x2="5" y2="11"/><line x1="17" y1="11" x2="19.5" y2="11"/>
                <line x1="11" y1="2.5" x2="11" y2="5"/><line x1="11" y1="17" x2="11" y2="19.5"/>
              </svg>
            </div>
            <span className="text-2xl font-extrabold text-white">ProjectLens</span>
          </div>
          <p className="text-slate-400 text-sm">Visibility. Insight. Control.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Sign In</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Create Account</button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
                  <input type="text" required placeholder="Ahmed Al-Rashidi" value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Company</label>
                  <input type="text" required placeholder="Nobel Construction" value={form.company}
                    onChange={e => setForm({...form, company: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Your Role</label>
                  <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 bg-white">
                    {roles.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" required placeholder="you@company.com" value={form.email}
                onChange={e => setForm({...form, email: e.target.value})}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
              <input type="password" required placeholder="••••••••" value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-60 mt-2">
              {loading ? 'Opening your workspace...' : mode === 'login' ? 'Sign In to ProjectLens' : 'Create My Account'}
            </button>
          </form>

          {mode === 'login' && (
            <p className="text-center text-xs text-slate-400 mt-4">
              Demo: use any email/password to explore the platform.
            </p>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          <Link href="/" className="hover:text-white transition-colors">← Back to projectlens.app</Link>
        </p>
      </div>
    </div>
  )
}
