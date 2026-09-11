import { supabase } from '../lib/supabase';

const BACKEND_URL = 'http://localhost:3001';

// In-memory cache of the Apollo key (loaded from Supabase)
let _apolloKeyCache = null;
let _keyLoadPromise = null;

// Load key from Supabase on app init
export async function loadApolloKeyFromSupabase() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('apollo_api_key')
      .eq('id', user.id)
      .single();
    if (error || !data) return null;
    _apolloKeyCache = data.apollo_api_key || null;
    // Migrate from localStorage if exists
    if (!_apolloKeyCache && typeof window !== 'undefined') {
      const oldKey = localStorage.getItem('apollo_api_key');
      if (oldKey) {
        _apolloKeyCache = oldKey;
        await saveApolloKeyToSupabase(oldKey);
        localStorage.removeItem('apollo_api_key');
      }
    }
    return _apolloKeyCache;
  } catch (err) {
    console.error('Failed to load Apollo key from Supabase:', err);
    return null;
  }
}

// Save key to Supabase
export async function saveApolloKeyToSupabase(key) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, apollo_api_key: key || null }, { onConflict: 'id' });
    if (error) throw error;
    _apolloKeyCache = key || null;
    return true;
  } catch (err) {
    console.error('Failed to save Apollo key to Supabase:', err);
    throw err;
  }
}

// Sync getter (returns from cache)
function getKey() {
  return _apolloKeyCache || '';
}

// Ensure key is loaded before first use
async function ensureKeyLoaded() {
  if (_apolloKeyCache !== null) return _apolloKeyCache;
  if (!_keyLoadPromise) {
    _keyLoadPromise = loadApolloKeyFromSupabase();
  }
  await _keyLoadPromise;
  return _apolloKeyCache || '';
}

export function getApolloKey() {
  return getKey();
}

export function isApolloConfigured() {
  if (_apolloKeyCache !== null) return !!_apolloKeyCache;
  // Trigger async load if not loaded yet
  ensureKeyLoaded();
  return false;
}

export async function isApolloConfiguredAsync() {
  const key = await ensureKeyLoaded();
  return !!key;
}

async function apolloPost(path, body) {
  const apolloKey = await ensureKeyLoaded();
  if (!apolloKey) throw new Error('Apollo API key not configured. Go to Settings to add your key.');
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, apolloKey }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Apollo API request failed');
  return data;
}

export async function enrichPerson({ apollo_id, email, first_name, last_name, linkedin_url, organization_name, title }) {
  return apolloPost('/api/apollo/enrich/person', {
    apollo_id, email, first_name, last_name, linkedin_url, organization_name, title,
  });
}

export async function enrichCompany({ domain, organization_name }) {
  return apolloPost('/api/apollo/enrich/company', {
    domain, organization_name,
  });
}

export async function searchPeople({ keywords, titles, locations, industries, employeeRanges, domains, emailStatus, page = 1, perPage = 25 }) {
  return apolloPost('/api/apollo/search/people', {
    q_keywords: keywords,
    person_titles: titles,
    person_locations: locations,
    organization_industry_tag_ids: industries,
    organization_num_employees_ranges: employeeRanges,
    q_organization_domains: domains,
    contact_email_status: emailStatus,
    page,
    per_page: perPage,
  });
}

export async function searchCompanies({ keywords, industries, employeeRanges, domainKeywords, page = 1, perPage = 25 }) {
  return apolloPost('/api/apollo/search/companies', {
    q_keywords: keywords,
    organization_industry_tag_ids: industries,
    organization_num_employees_ranges: employeeRanges,
    q_organization_domain_keywords: domainKeywords,
    page,
    per_page: perPage,
  });
}

async function apolloGet(path, params = {}) {
  const apolloKey = await ensureKeyLoaded();
  if (!apolloKey) throw new Error('Apollo API key not configured. Go to Settings to add your key.');
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${BACKEND_URL}${path}${qs ? '?' + qs : ''}`, {
    headers: { 'x-apollo-key': apolloKey },
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Apollo API request failed');
  return data;
}

export async function getApolloLists({ page = 1, perPage = 25 } = {}) {
  return apolloGet('/api/apollo/lists', { page, per_page: perPage });
}

export async function getApolloListContacts(listId, { page = 1, perPage = 100 } = {}) {
  return apolloGet(`/api/apollo/lists/${listId}/contacts`, { page, per_page: perPage });
}

export async function getEmailAccounts() {
  return apolloGet('/api/apollo/email/accounts');
}

export async function sendEmail({ email_account_id, contact_id, to_email, subject, body }) {
  return apolloPost('/api/apollo/email/send', {
    email_account_id, contact_id, to_email, subject, body,
  });
}

export async function createEmailDraft({ email_account_id, contact_ids, to_email, from_email, from_name, subject, body, reply_to }) {
  return apolloPost('/api/apollo/email/draft', {
    email_account_id, contact_ids, to_email, from_email, from_name, subject, body, reply_to,
  });
}

export async function searchSequences({ name, page = 1, perPage = 25 } = {}) {
  return apolloPost('/api/apollo/sequences/search', {
    q_name: name || undefined,
    page,
    per_page: perPage,
  });
}

export async function createSequence({ name, permissions, active, steps }) {
  return apolloPost('/api/apollo/sequences/create', {
    name, permissions, active, steps,
  });
}

async function apolloPostRaw(path, body) {
  const apolloKey = await ensureKeyLoaded();
  if (!apolloKey) throw new Error('Apollo API key not configured');
  const resp = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-apollo-key': apolloKey },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function activateSequence(sequenceId) {
  return apolloPostRaw(`/api/apollo/sequences/${sequenceId}/activate`, {});
}

export async function deactivateSequence(sequenceId) {
  return apolloPostRaw(`/api/apollo/sequences/${sequenceId}/deactivate`, {});
}

export async function addContactsToSequence(sequenceId, { contact_ids, email_account_id }) {
  return apolloPost(`/api/apollo/sequences/${sequenceId}/contacts`, {
    contact_ids, email_account_id,
  });
}

export async function getEmailSchedules() {
  return apolloGet('/api/apollo/email/schedules');
}
