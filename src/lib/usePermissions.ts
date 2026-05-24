'use client'
// =============================================================================
// usePermissions — single source of truth for "who am I and what can I do?"
//
// Used by every UI surface that needs to gate actions by role:
//   - Sidebar (show user name, hide hard-delete for PMs, etc.)
//   - Project create button (admin+ only)
//   - Hard-delete buttons (admin+ only)
//   - Invitations UI (admin+ only)
//   - Settings tabs (varies)
//
// READS:
//   - supabase.auth.getUser()                — auth identity
//   - profiles                                — display name + company
//   - organization_members                    — role within active org
//
// ROLE MODEL (locked Day 8):
//   - 'owner'  — platform owner (Jawid). One per org. Manages billing.
//   - 'admin'  — operational lead. Creates projects, invites PMs, hard-deletes.
//                Owner vs Admin = billing only.
//   - 'pm'     — runs assigned projects. Uploads, soft-deletes, invites
//                viewers/sub-PMs to THEIR projects only. Cannot hard-delete.
//   - 'viewer' — read-only.
//
// NOTE on `profiles.role`: that column is free-form display text (e.g.
// "Senior Project Manager") and is NOT used for permission checks. The real
// permission role lives in organization_members.role.
// =============================================================================

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type OrgRole = 'owner' | 'admin' | 'pm' | 'viewer'

export interface CurrentUser {
  id: string                  // auth.users.id
  email: string
  displayName: string         // profiles.name || email prefix
  initials: string            // 2 chars for sidebar avatar
  company: string | null      // profiles.company OR organizations.name
  profileRoleText: string     // free-form role from profiles (e.g. "CEO / Executive")
  orgId: string | null        // active organization id
  orgName: string | null      // active organization name
  orgRole: OrgRole | null     // role within active org (the real permission role)
}

export interface Permissions {
  // Loading state — true while we're fetching from Supabase
  loading: boolean
  // Whether the user is signed in at all
  isAuthenticated: boolean
  // Full user record (null while loading or signed out)
  user: CurrentUser | null
  // Convenience role flags
  isOwner: boolean
  isAdmin: boolean
  isPM: boolean
  isViewer: boolean
  // Action gates — every UI surface should call these to decide what to render
  can: {
    // Org-level actions
    inviteUsers: boolean         // owner + admin
    inviteAdmins: boolean        // owner only
    manageBilling: boolean       // owner only
    manageWorkspace: boolean     // owner + admin
    seeAllOrgProjects: boolean   // owner + admin (PMs see only assigned)
    // Project-level actions (assumes user has access to the project)
    createProject: boolean       // owner + admin
    assignPM: boolean            // owner + admin
    uploadSchedule: boolean      // owner + admin + pm (not viewer)
    editContractDates: boolean   // owner + admin + pm
    softDeleteProject: boolean   // owner + admin + pm
    restoreProject: boolean      // owner + admin + pm
    archiveProject: boolean      // owner + admin + pm
    hardDeleteProject: boolean   // owner + admin (NOT pm)
    deleteVersion: boolean       // owner + admin + pm
    renameProject: boolean       // owner + admin + pm
    inviteToProject: boolean     // owner + admin + pm (PMs invite to THEIR project)
  }
}

const EMPTY_PERMS: Permissions = {
  loading: true,
  isAuthenticated: false,
  user: null,
  isOwner: false,
  isAdmin: false,
  isPM: false,
  isViewer: false,
  can: {
    inviteUsers: false,
    inviteAdmins: false,
    manageBilling: false,
    manageWorkspace: false,
    seeAllOrgProjects: false,
    createProject: false,
    assignPM: false,
    uploadSchedule: false,
    editContractDates: false,
    softDeleteProject: false,
    restoreProject: false,
    archiveProject: false,
    hardDeleteProject: false,
    deleteVersion: false,
    renameProject: false,
    inviteToProject: false,
  },
}

/**
 * usePermissions — call this from any client component that needs to
 * know who the user is or what they can do.
 *
 * Example:
 *   const { user, isAdmin, can } = usePermissions()
 *   if (can.hardDeleteProject) { ... }
 *   <div>Welcome, {user?.displayName}</div>
 */
export function usePermissions(): Permissions {
  const [perms, setPerms] = useState<Permissions>(EMPTY_PERMS)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      try {
        // 1. Who's signed in?
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr || !authData?.user) {
          if (!cancelled) setPerms({ ...EMPTY_PERMS, loading: false, isAuthenticated: false })
          return
        }
        const u = authData.user

        // 2. Read profile row (name + company)
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, company, role')
          .eq('id', u.id)
          .maybeSingle()

        // 3. Read org membership (pick first if multiple — we don't have
        //    a workspace switcher yet, single-org per user is the norm)
        const { data: membership } = await supabase
          .from('organization_members')
          .select('org_id, role')
          .eq('user_id', u.id)
          .limit(1)
          .maybeSingle()

        // 4. Read org name for display
        let orgName: string | null = null
        if (membership?.org_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', membership.org_id)
            .maybeSingle()
          orgName = org?.name || null
        }

        // 5. Build the CurrentUser record
        const email = u.email || ''
        const displayName = profile?.name?.trim() || email.split('@')[0] || 'User'
        const initials = makeInitials(displayName)
        const orgRole = normalizeRole(membership?.role)

        const current: CurrentUser = {
          id: u.id,
          email,
          displayName,
          initials,
          company: profile?.company || orgName,
          profileRoleText: profile?.role || '',
          orgId: membership?.org_id || null,
          orgName,
          orgRole,
        }

        if (cancelled) return

        // 6. Compute permission flags from role
        const isOwner = orgRole === 'owner'
        const isAdmin = orgRole === 'admin'
        const isPM = orgRole === 'pm'
        const isViewer = orgRole === 'viewer'
        const ownerOrAdmin = isOwner || isAdmin
        const ownerOrAdminOrPM = ownerOrAdmin || isPM

        setPerms({
          loading: false,
          isAuthenticated: true,
          user: current,
          isOwner, isAdmin, isPM, isViewer,
          can: {
            inviteUsers: ownerOrAdmin,
            inviteAdmins: isOwner,
            manageBilling: isOwner,
            manageWorkspace: ownerOrAdmin,
            seeAllOrgProjects: ownerOrAdmin,
            createProject: ownerOrAdmin,
            assignPM: ownerOrAdmin,
            uploadSchedule: ownerOrAdminOrPM,
            editContractDates: ownerOrAdminOrPM,
            softDeleteProject: ownerOrAdminOrPM,
            restoreProject: ownerOrAdminOrPM,
            archiveProject: ownerOrAdminOrPM,
            hardDeleteProject: ownerOrAdmin,
            deleteVersion: ownerOrAdminOrPM,
            renameProject: ownerOrAdminOrPM,
            inviteToProject: ownerOrAdminOrPM,
          },
        })
      } catch (e) {
        console.error('[usePermissions] load failed:', e)
        if (!cancelled) setPerms({ ...EMPTY_PERMS, loading: false })
      }
    }

    load()

    // Re-load if auth state changes (sign in / sign out / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        load()
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return perms
}

// =============================================================================
// Helpers
// =============================================================================

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function normalizeRole(raw: string | null | undefined): OrgRole | null {
  if (!raw) return null
  const v = raw.toLowerCase().trim()
  // Direct matches
  if (v === 'owner' || v === 'admin' || v === 'pm' || v === 'viewer') return v as OrgRole
  // Tolerated aliases — older accounts may have free-form roles
  if (v === 'project manager' || v === 'project_manager' || v === 'projectmanager') return 'pm'
  if (v === 'administrator') return 'admin'
  if (v === 'read-only' || v === 'readonly' || v === 'read_only') return 'viewer'
  // Unknown role — fall back to PM (safest mid-tier)
  console.warn('[usePermissions] unrecognized role value, defaulting to pm:', raw)
  return 'pm'
}

/**
 * roleLabel — human-readable badge text for a role.
 * Used by the Sidebar header next to the user's name.
 */
export function roleLabel(role: OrgRole | null): string {
  switch (role) {
    case 'owner': return 'Owner'
    case 'admin': return 'Admin'
    case 'pm': return 'Project Manager'
    case 'viewer': return 'Viewer'
    default: return 'Member'
  }
}

/**
 * roleBadgeColor — color hint for the role badge in the Sidebar.
 */
export function roleBadgeColor(role: OrgRole | null): string {
  switch (role) {
    case 'owner': return 'bg-blue-600/30 text-blue-200'
    case 'admin': return 'bg-emerald-600/30 text-emerald-200'
    case 'pm': return 'bg-amber-600/30 text-amber-200'
    case 'viewer': return 'bg-slate-600/30 text-slate-300'
    default: return 'bg-slate-600/30 text-slate-300'
  }
}
