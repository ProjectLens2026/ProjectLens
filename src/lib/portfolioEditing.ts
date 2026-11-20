import { createClient } from './supabase/client';
import { cloudId } from './controlWorkflow';
export interface PortfolioProjectDetails {
    id: string;
    code: string;
    name: string;
    address: string;
    stage: string;
    status: 'active' | 'on_hold' | 'completed';
    updated_at: string;
    can_edit: boolean;
}
export async function loadPortfolioProjectDetails(id: string): Promise<PortfolioProjectDetails> {
    const { data, error } = await createClient().rpc('cpmr_portfolio_project_details', { p_project: cloudId(id) });
    if (error)
        throw Error(error.message);
    if (!data?.id)
        throw Error('Project details are unavailable.');
    return data;
}
export async function savePortfolioProjectDetails(original: PortfolioProjectDetails, edit: PortfolioProjectDetails): Promise<PortfolioProjectDetails> {
    if (!original.can_edit)
        throw Error('Project edit permission required.');
    if (!edit.code.trim() || !edit.name.trim())
        throw Error('Enter a project number and name.');
    const { data, error } = await createClient().rpc('cpmr_edit_portfolio_project', { p_project: cloudId(original.id), p_expected: original.updated_at, p_code: edit.code.trim(), p_name: edit.name.trim(), p_address: edit.address, p_stage: edit.stage, p_status: edit.status });
    if (error)
        throw Error(error.message);
    if (!data?.id)
        throw Error('Save could not be verified. Reload the project before retrying.');
    return data;
}
