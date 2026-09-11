// ─── Due Diligence Supabase service ───
// Isolated data access for the Due Diligence feature. Does not touch the main store.

import { supabase } from '../lib/supabase';

const TABLE = 'due_diligence_investigations';

/** Fetch recent investigations for the current workspace. */
export async function fetchRecentInvestigations(workspaceId, limit = 20) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, entity_type, entity_name, status, overall_risk, created_at, updated_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

/** Create a new investigation row (status 'queued'). Returns the inserted row. */
export async function createInvestigation({ workspaceId, userId, entityType, entityName }) {
    const { data, error } = await supabase
        .from(TABLE)
        .insert({ workspace_id: workspaceId, user_id: userId, entity_type: entityType, entity_name: entityName, status: 'queued' })
        .select()
        .single();
    if (error) throw error;
    return data;
}

/** Update an investigation (status, risk, summary, research_result). */
export async function updateInvestigation(id, updates) {
    const { data, error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

/** Fetch a single investigation with full research_result. */
export async function fetchInvestigation(id) {
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

/** Delete an investigation. */
export async function deleteInvestigation(id) {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
}

// ─── Edge Function integration (real research backend) ───

async function extractFnError(err) {
    try {
        const ctx = err?.context;
        if (ctx) {
            const body = await ctx.json?.();
            if (body?.error) return body.error;
        }
    } catch { /* fall through */ }
    return err?.message || 'Request failed';
}

/** Start a real investigation via the due-diligence Edge Function. */
export async function startResearchInvestigation({ workspaceId, entityType, entityName }) {
    const { data, error } = await supabase.functions.invoke('due-diligence', {
        body: { action: 'start', workspaceId, entityType, entityName },
    });
    if (error) throw new Error(await extractFnError(error));
    if (data?.error) throw new Error(data.error);
    return data; // { investigationId, status, investigation? }
}

/** Poll an in-flight investigation; the Edge Function saves the result when done. */
export async function pollResearchInvestigation(investigationId) {
    const { data, error } = await supabase.functions.invoke('due-diligence', {
        body: { action: 'poll', investigationId },
    });
    if (error) throw new Error(await extractFnError(error));
    return data; // { investigationId, status, investigation?, done, error? }
}
