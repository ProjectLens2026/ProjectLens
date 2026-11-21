import type { Project, ProjectStatus } from './projectStore';
import { insertProjectToSupabase } from './supabase/db';
import { cloudId } from './controlWorkflow';
export interface NewPortfolioProject {
    groupId?: string | null;
    code: string;
    name: string;
    address: string;
    stage: string;
    status: 'Active' | 'On Hold' | 'Completed';
}
/** Reuses current plan checks and RLS. No local success state is published before the cloud write. */
export async function createPortfolioProject(input: NewPortfolioProject): Promise<string> {
    const code = input.code.trim(), name = input.name.trim();
    if (!code || !name || code.length > 50 || name.length > 160)
        throw Error('Enter a project number (up to 50 characters) and name (up to 160).');
    if (!['Active', 'On Hold', 'Completed'].includes(input.status))
        throw Error('Select a valid project status.');
    const stamp = new Date().toISOString();
    const project: Project & {portfolioGroupId?: string} = { id: crypto.randomUUID(), projectId: code, name, status: input.status as ProjectStatus, createdAt: stamp, updatedAt: stamp, versions: [], rfis: [], changeOrders: [], controlBasis: { projectProfile: { address: input.address.trim().slice(0, 500), stage: input.stage.trim().slice(0, 100) } } };
    if (input.groupId) project.portfolioGroupId = cloudId(input.groupId);
    if (!await insertProjectToSupabase(project))
        throw Error('Project was not saved. Check your project limit, access and connection before retrying.');
    return project.id;
}
