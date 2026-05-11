'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const stored = localStorage.getItem('pl_user')
    if (!stored) { router.push('/login'); return }
    setUser(JSON.parse(stored))
  }, [])

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-white text-sm animate-pulse">Opening your workspace...</div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      <Sidebar user={user} />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}
