import { supabase } from './supabase';

let cachedMe = null;

export async function currentUser() {
  if (cachedMe) return cachedMe;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) cachedMe = { id: user.id, name: displayName(user) };
  return cachedMe || { id: null, name: 'Team member' };
}

export function displayName(user) {
  const meta = user?.user_metadata || {};
  return meta?.display_name || meta?.name || (user?.email || '').split('@')[0] || 'Team member';
}

export function firstName(name) {
  const n = (name || '').trim();
  return n.split(/\s+/)[0] || n || 'Someone';
}

export async function logActivity({ action, entityType, entityId, entityName, summary, metadata = {}, user }) {
  try {
    const me = user || await currentUser();
    const ws = (await import('../store/useStore')).default.getState().workspace;
    if (!ws) return;
    await supabase.from('activity_log').insert({
      workspace_id: ws.id,
      user_id: me.id,
      user_name: me.name,
      action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_name: entityName || null,
      summary,
      metadata,
    });
  } catch (e) {
    console.warn('activity log skipped:', e.message);
  }
}

const CHANNEL_VERBS = {
  Email: 'emailed',
  LinkedIn: 'sent a LinkedIn message to',
  Call: 'called',
  SMS: 'texted',
  Calendar: 'booked a meeting with',
  Other: 'followed up with',
};

export function contactSentence(verb, prospect) {
  const name = prospect?.name || 'a contact';
  const company = prospect?.company ? ` from ${prospect.company}` : '';
  return `${verb} ${name}${company}`;
}

export function touchpointVerb(channel) {
  return CHANNEL_VERBS[channel] || 'followed up with';
}