import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ProjectLens — Construction Operational Visibility',
  description: 'Understand project condition, schedule health, and operational risk — in one screen, in under a minute.',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
