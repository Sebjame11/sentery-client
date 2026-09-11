import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export async function logActivity({ workspaceId, userId = null, user_name = null, action, entityType, entityId = null, entityName = null, summary, metadata = {} }) {
  try {
    if (!workspaceId || !summary) return;
    await sb.from('activity_log').insert({
      workspace_id: workspaceId,
      user_id: userId,
      user_name,
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_name: entityName,
      summary,
      metadata,
    });
  } catch (err) {
    console.warn('[activity] log skipped:', err.message);
  }
}

const nameCache = new Map();
export async function userNameOf(userId) {
  if (!userId) return null;
  if (nameCache.has(userId)) return nameCache.get(userId);
  let name = null;
  try {
    const { data } = await sb.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    name = data?.display_name || null;
    if (name) nameCache.set(userId, name);
  } catch { /* ignore */ }
  return name;
}

export async function firstNameOf(userId) {
  const name = await userNameOf(userId);
  if (!name) return 'Someone';
  return name.trim().split(/\s+/)[0] || name;
}

export async function pruneActivity(days = 90) {
  try {
    const { data, error } = await sb.rpc('prune_activity_log', { days });
    if (error) throw error;
    if (data > 0) console.log(`[activity] pruned ${data} old entries`);
    return data || 0;
  } catch (err) {
    console.warn('[activity] prune skipped:', err.message);
    return 0;
  }
}