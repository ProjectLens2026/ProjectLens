/**
 * Next.js middleware. Runs on every page request.
 * Delegates to updateSession() which refreshes the Supabase session cookie.
 *
 * The matcher excludes static files (favicons, images) for performance.
 */
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, favicon-16.png, favicon-32.png, apple-touch-icon.png
     * - public SVGs (logo files)
     */
    '/((?!_next/static|_next/image|favicon.ico|favicon-16.png|favicon-32.png|apple-touch-icon.png|nobelpm-logo.svg|nobelpm-mark.svg|nobelpm-og-image.png).*)',
  ],
}
