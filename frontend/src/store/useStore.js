import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { logActivity, touchpointVerb } from '../lib/activity';
import { setCurrencyCode, getCurrencyCode, currencySymbol, convertAmount } from '../utils/currency';

const useStore = create((set, get) => ({
  // Auth state (synced from AuthContext on load)
  workspace: null,
  workspaces: [],
  workspaceLoading: true,

  // Data arrays (in-memory cache, synced to Supabase)
  prospects: [],
  companies: [],
  deals: [],
  templates: [],
  sequences: [],
  notes: [],
  calendarEvents: [],

  // UI state (stays local, no Supabase)
  theme: localStorage.getItem('vn_theme') || 'light',
  // Initialize currentPage from URL path
  currentPage: (() => {
    const path = window.location.pathname;
    if (path === '/privacy') return 'privacy';
    if (path === '/terms') return 'terms';
    if (path === '/signin') return 'signin';
    return localStorage.getItem('vn_currentPage') || 'home';
  })(),
  appPage: localStorage.getItem('vn_appPage') || 'dashboard',
  detailId: null,
  editingSegmentId: null,
  segmentsMode: 'list', // 'list' | 'edit'
  owner: '',
  defaultWorkspaceId: null,

  // ─── Theme ───
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('vn_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  setPage: (page) => {
    set({ currentPage: page });
    localStorage.setItem('vn_currentPage', page);
    // Sync URL for public pages
    const pathMap = { home: '/', privacy: '/privacy', terms: '/terms', signin: '/signin' };
    const url = pathMap[page];
    if (url && window.location.pathname !== url) {
      window.history.pushState({}, '', url);
    }
  },
  setAppPage: (page) => { set({ appPage: page }); localStorage.setItem('vn_appPage', page); },
  setDetailId: (id) => set({ detailId: id }),
  setEditingSegment: (id) => set({ editingSegmentId: id, segmentsMode: id ? 'edit' : 'list' }),
  setSegmentsMode: (mode) => set({ segmentsMode: mode, editingSegmentId: mode === 'list' ? null : get().editingSegmentId }),
  setOwner: (owner) => set({ owner }),
  setDefaultWorkspace: async (wsId) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Clear old default
    await supabase.from('workspace_members').update({ is_default: false }).eq('user_id', user.id).eq('is_default', true);
    // Set new default
    if (wsId) await supabase.from('workspace_members').update({ is_default: true }).eq('user_id', user.id).eq('workspace_id', wsId);
    set({ defaultWorkspaceId: wsId });
  },

  // ─── Workspace ───
  setCurrentWorkspace: async (workspace) => {
    setCurrencyCode(workspace?.company_profile?.currency || 'USD');
    set({ workspace, workspaceLoading: true });
    await get().loadWorkspaceData(workspace.id);
    set({ workspaceLoading: false });
  },

  renameWorkspace: async (newName) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const name = String(newName || '').trim();
    if (!name) throw new Error('Workspace name required');
    const { error } = await supabase
      .from('workspaces')
      .update({ name })
      .eq('id', ws.id);
    if (error) { console.error(error); throw error; }
    const updated = { ...ws, name };
    set(state => ({
      workspace: updated,
      workspaces: state.workspaces.map(w => w.id === ws.id ? updated : w),
    }));
    return updated;
  },

  leaveWorkspace: async () => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const { data, error } = await supabase.rpc('leave_workspace', { ws_id: ws.id });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    set(state => ({
      workspaces: state.workspaces.filter(w => w.id !== ws.id),
      workspace: null,
    }));
    const remaining = get().workspaces;
    if (remaining.length > 0) {
      await get().setCurrentWorkspace(remaining[0]);
    } else {
      set({ workspace: null, workspaceLoading: false });
    }
    return data;
  },

  removeMember: async (targetUserId) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const { data, error } = await supabase.rpc('remove_member', { ws_id: ws.id, target_user_id: targetUserId });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  },

  deleteWorkspace: async () => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const { data, error } = await supabase.rpc('delete_workspace', { ws_id: ws.id });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    set(state => ({
      workspaces: state.workspaces.filter(w => w.id !== ws.id),
      workspace: null,
    }));
    const remaining = get().workspaces;
    if (remaining.length > 0) {
      await get().setCurrentWorkspace(remaining[0]);
    } else {
      set({ workspace: null, workspaceLoading: false });
    }
    return data;
  },

  loadWorkspaces: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { set({ workspaceLoading: false }); return; }

      // Try with is_default column first; fall back if column doesn't exist yet
      let ws = [];
      const { data, error } = await supabase
        .from('workspace_members')
        .select('workspaces(id, name, slug, company_profile), is_default')
        .eq('user_id', user.id);
      if (error || !data) {
        const { data: data2 } = await supabase
          .from('workspace_members')
          .select('workspaces(id, name, slug, company_profile)')
          .eq('user_id', user.id);
        ws = (data2 || []).map(m => m.workspaces).filter(Boolean);
      } else {
        ws = data.map(m => ({ ...m.workspaces, _isDefault: m.is_default })).filter(Boolean);
      }

      // Re-fetch each workspace directly to ensure company_profile is not truncated by the join
      const enriched = await Promise.all(ws.map(async (w) => {
        const { data: full } = await supabase.from('workspaces').select('id, name, slug, company_profile').eq('id', w.id).maybeSingle();
        return full ? { ...w, company_profile: full.company_profile || w.company_profile } : w;
      }));

      set({ workspaces: enriched });
      if (enriched.length > 0 && !get().workspace) {
        const def = enriched.find(w => w._isDefault);
        await get().setCurrentWorkspace(def || enriched[0]);
        set({ defaultWorkspaceId: def?.id || null });
      } else {
        set({ workspaceLoading: false });
      }
    } catch (err) {
      console.error('loadWorkspaces exception:', err);
      set({ workspaceLoading: false });
    }
  },

  updateWorkspaceProfile: async (profile) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const merged = { ...(ws.company_profile || {}), ...profile };
    const { data, error } = await supabase.rpc('update_company_profile', {
      p_workspace_id: ws.id,
      p_profile: merged,
    });
    if (error) { console.error(error); throw error; }
    const savedProfile = data || merged;
    const updated = { ...ws, company_profile: savedProfile };
    set(state => ({
      workspace: updated,
      workspaces: state.workspaces.map(w => w.id === ws.id ? updated : w),
    }));
    logActivity({
      action: 'updated', entityType: 'settings', entityId: ws.id, entityName: 'Company profile',
      summary: `updated the company profile`,
      metadata: { company_name: merged.company_name || null },
    });
    return merged;
  },

  changeCurrency: async (newCode) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace selected');
    const oldCode = ws.company_profile?.currency || 'USD';
    if (oldCode === newCode) return;
    const factor = convertAmount(1, oldCode, newCode);
    const prospects = get().prospects;
    const updatable = prospects.filter(p => (Number(p.dealValue) || 0) > 0);
    if (updatable.length) {
      const results = await Promise.all(updatable.map(p =>
        supabase.from('prospects').update({ deal_value: Math.round((Number(p.dealValue) || 0) * factor) }).eq('id', p.id)
      ));
      const err = results.find(r => r.error);
      if (err) { console.error(err.error); throw err.error; }
    }
    const merged = { ...(ws.company_profile || {}), currency: newCode };
    const { error: wsErr } = await supabase.rpc('update_company_profile', {
      p_workspace_id: ws.id,
      p_profile: merged,
    });
    if (wsErr) { console.error(wsErr); throw wsErr; }
    setCurrencyCode(newCode);
    set(state => ({
      prospects: state.prospects.map(p => ({
        ...p,
        dealValue: Math.round((Number(p.dealValue) || 0) * factor),
      })),
      workspace: { ...state.workspace, company_profile: merged },
      workspaces: state.workspaces.map(w => w.id === ws.id ? { ...w, company_profile: merged } : w),
    }));
    logActivity({
      action: 'updated', entityType: 'settings', entityId: ws.id, entityName: 'Workspace currency',
      summary: `changed the workspace currency from ${oldCode} to ${newCode}`,
      metadata: { from: oldCode, to: newCode },
    });
  },

  loadWorkspaceData: async (workspaceId) => {
    const fetchAll = async (table, eqCol, eqVal, orderCol, orderAsc) => {
      const PAGE = 1000;
      let from = 0;
      let all = [];
      while (true) {
        const { data, error } = await supabase.from(table).select('*')
          .eq(eqCol, eqVal)
          .order(orderCol, { ascending: orderAsc })
          .range(from, from + PAGE - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return { data: all, error: null };
    };

    const [prospectsRes, companiesRes, templatesRes, sequencesRes, notesRes] = await Promise.all([
      fetchAll('prospects', 'workspace_id', workspaceId, 'created_at', false),
      fetchAll('companies', 'workspace_id', workspaceId, 'name', true),
      fetchAll('templates', 'workspace_id', workspaceId, 'created_at', false),
      fetchAll('sequences', 'workspace_id', workspaceId, 'created_at', false),
      fetchAll('notes', 'workspace_id', workspaceId, 'created_at', false),
    ]);

    let dealsRes = { data: [], error: null };
    try {
      dealsRes = await fetchAll('deals', 'workspace_id', workspaceId, 'created_at', false);
    } catch { dealsRes = { data: [], error: null }; }

    if (prospectsRes.error) console.error(prospectsRes.error);
    if (companiesRes.error) console.error(companiesRes.error);
    if (templatesRes.error) console.error(templatesRes.error);
    if (sequencesRes.error) console.error(sequencesRes.error);
    if (notesRes.error) console.error(notesRes.error);

    set({
      prospects: (prospectsRes.data || []).map(p => ({
        ...p,
        firstName: p.first_name ?? p.firstName ?? '',
        lastName: p.last_name ?? p.lastName ?? '',
        lifecycleStage: p.lifecycle_stage ?? p.lifecycleStage ?? 'lead',
        contactStatus: p.status ?? p.contactStatus ?? '',
        dealValue: p.deal_value ?? p.dealValue ?? 0,
        stageEnteredAt: p.stage_entered_at ?? p.stageEnteredAt ?? null,
        customFields: p.custom_fields ?? p.customFields ?? {},
        wonAgainstCompetitor: p.won_against_competitor ?? p.wonAgainstCompetitor ?? '',
        lostToCompetitor: p.lost_to_competitor ?? p.lostToCompetitor ?? '',
        outcomeReason: p.outcome_reason ?? p.outcomeReason ?? '',
        outcomeNotes: p.outcome_notes ?? p.outcomeNotes ?? '',
        leadSource: p.lead_source ?? p.leadSource ?? '',
        createdAt: p.created_at ?? p.createdAt ?? null,
        tags: Array.isArray(p.tags) ? p.tags : typeof p.tags === 'string' ? (() => { try { return JSON.parse(p.tags); } catch { return []; } })() : [],
        touchpoints: [],
      })),
      companies: (companiesRes.data || []).map(c => ({
        ...c,
        companySize: c.company_size ?? c.companySize ?? '',
        annualRevenue: c.annual_revenue ?? c.annualRevenue ?? '',
        companyType: c.company_type ?? c.companyType ?? 'prospect',
        customFields: c.custom_fields ?? c.customFields ?? {},
        createdAt: c.created_at ?? c.createdAt ?? null,
      })),
      templates: templatesRes.data || [],
      sequences: sequencesRes.data || [],
      notes: notesRes.data || [],
      deals: (dealsRes.data || []).map(d => ({
        ...d,
        dealValue: d.deal_value ?? d.dealValue ?? 0,
        dealType: d.deal_type ?? d.dealType ?? '',
        ownerId: d.owner_id ?? d.ownerId ?? null,
        ownerName: d.owner_name ?? d.ownerName ?? '',
        primaryContactId: d.primary_contact_id ?? d.primaryContactId ?? null,
        primaryContactName: d.primary_contact_name ?? d.primaryContactName ?? '',
        closeDate: d.close_date ?? d.closeDate ?? null,
        associatedCall: d.associated_call ?? d.associatedCall ?? '',
        closedLostReason: d.closed_lost_reason ?? d.closedLostReason ?? '',
        closedWonReason: d.closed_won_reason ?? d.closedWonReason ?? '',
        lastContacted: d.last_contacted ?? d.lastContacted ?? null,
        stageEnteredAt: d.stage_entered_at ?? d.stageEnteredAt ?? null,
        createdAt: d.created_at ?? d.createdAt ?? null,
        updatedAt: d.updated_at ?? d.updatedAt ?? null,
      })),
    });

    // Load touchpoints for all prospects
    const ids = (prospectsRes.data || []).map(p => p.id);
    if (ids.length > 0) {
      const { data: tps } = await supabase
        .from('touchpoints')
        .select('*')
        .in('prospect_id', ids)
        .order('date', { ascending: false });
      if (tps) {
        const tpMap = {};
        tps.forEach(tp => {
          if (!tpMap[tp.prospect_id]) tpMap[tp.prospect_id] = [];
          tpMap[tp.prospect_id].push(tp);
        });
        set(state => ({
          prospects: state.prospects.map(p => ({ ...p, touchpoints: tpMap[p.id] || [] })),
        }));
      }
    }

    // Load touchpoints for all deals
    const dealIds = (dealsRes.data || []).map(d => d.id);
    if (dealIds.length > 0) {
      const { data: dealTps } = await supabase
        .from('touchpoints')
        .select('*')
        .in('deal_id', dealIds)
        .order('date', { ascending: false });
      if (dealTps) {
        const dealTpMap = {};
        dealTps.forEach(tp => {
          if (!dealTpMap[tp.deal_id]) dealTpMap[tp.deal_id] = [];
          dealTpMap[tp.deal_id].push(tp);
        });
        set(state => ({
          deals: state.deals.map(d => ({ ...d, touchpoints: dealTpMap[d.id] || [] })),
        }));
      }
    }
  },

  // ─── Deals ───
  createDeal: async (deal) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace');
    const { data, error } = await supabase.from('deals').insert({
      workspace_id: ws.id,
      company_id: deal.companyId || null,
      name: deal.name,
      stage: deal.stage || 'lead',
      deal_value: deal.dealValue || 0,
      priority: deal.priority || 'medium',
      close_date: deal.closeDate || null,
      deal_type: deal.dealType || '',
      owner_id: deal.ownerId || null,
      owner_name: deal.ownerName || '',
      primary_contact_id: deal.primaryContactId || null,
      primary_contact_name: deal.primaryContactName || '',
      notes: deal.notes || '',
      associated_call: deal.associatedCall || '',
      closed_lost_reason: deal.closedLostReason || '',
      closed_won_reason: deal.closedWonReason || '',
      last_contacted: deal.lastContacted || null,
    }).select().single();
    if (error) throw error;
    set(state => ({
      deals: [{ ...data, dealValue: data.deal_value, dealType: data.deal_type, ownerId: data.owner_id, ownerName: data.owner_name, primaryContactId: data.primary_contact_id, primaryContactName: data.primary_contact_name, closeDate: data.close_date, associatedCall: data.associated_call, closedLostReason: data.closed_lost_reason, closedWonReason: data.closed_won_reason, lastContacted: data.last_contacted, createdAt: data.created_at, updatedAt: data.updated_at }, ...state.deals],
    }));
    return data;
  },

  updateDeal: async (dealId, updates) => {
    const mapped = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.stage !== undefined) mapped.stage = updates.stage;
    if (updates.dealValue !== undefined) mapped.deal_value = updates.dealValue;
    if (updates.priority !== undefined) mapped.priority = updates.priority;
    if (updates.closeDate !== undefined) mapped.close_date = updates.closeDate;
    if (updates.dealType !== undefined) mapped.deal_type = updates.dealType;
    if (updates.ownerId !== undefined) mapped.owner_id = updates.ownerId;
    if (updates.ownerName !== undefined) mapped.owner_name = updates.ownerName;
    if (updates.primaryContactId !== undefined) mapped.primary_contact_id = updates.primaryContactId;
    if (updates.primaryContactName !== undefined) mapped.primary_contact_name = updates.primaryContactName;
    if (updates.notes !== undefined) mapped.notes = updates.notes;
    if (updates.stageEnteredAt !== undefined) mapped.stage_entered_at = updates.stageEnteredAt;
    if (updates.lastContacted !== undefined) mapped.last_contacted = updates.lastContacted;
    if (updates.closedWonReason !== undefined) mapped.closed_won_reason = updates.closedWonReason;
    if (updates.closedLostReason !== undefined) mapped.closed_lost_reason = updates.closedLostReason;
    if (updates.associatedCall !== undefined) mapped.associated_call = updates.associatedCall;
    mapped.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('deals').update(mapped).eq('id', dealId).select().single();
    if (error) throw error;
    set(state => ({
      deals: state.deals.map(d => d.id === dealId ? { ...d, ...mapped, dealValue: mapped.deal_value, dealType: mapped.deal_type, ownerId: mapped.owner_id, ownerName: mapped.owner_name, primaryContactId: mapped.primary_contact_id, primaryContactName: mapped.primary_contact_name, closeDate: mapped.close_date, associatedCall: mapped.associated_call, closedLostReason: mapped.closed_lost_reason, closedWonReason: mapped.closed_won_reason, lastContacted: mapped.last_contacted, stageEnteredAt: mapped.stage_entered_at, updatedAt: data.updated_at } : d),
    }));
    return data;
  },

  deleteDeal: async (dealId) => {
    const { error } = await supabase.from('deals').delete().eq('id', dealId);
    if (error) throw error;
    set(state => ({ deals: state.deals.filter(d => d.id !== dealId) }));
  },

  deleteAllDeals: async () => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace');
    // Fetch all deal ids for this workspace (paginated), then delete in batches
    let allIds = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from('deals').select('id').eq('workspace_id', ws.id).range(from, from + 999);
      if (error) throw error;
      allIds = allIds.concat((data || []).map(r => r.id));
      if (!data || data.length < 1000) break;
      from += 1000;
    }
    // Supabase delete() with .in() works but can hit URL length limits; delete in batches of 100
    for (let i = 0; i < allIds.length; i += 100) {
      const batch = allIds.slice(i, i + 100);
      const { error } = await supabase.from('deals').delete().in('id', batch);
      if (error) throw error;
    }
    set({ deals: [] });
  },

  importDeals: async (deals) => {
    const ws = get().workspace;
    if (!ws) throw new Error('No workspace');
    const companies = get().companies;
    const prospects = get().prospects;
    const BATCH = 100;
    const parseDate = (v) => {
      if (!v) return null;
      const dt = new Date(v);
      return isNaN(dt.getTime()) ? null : dt.toISOString();
    };
    let imported = 0;
    for (let i = 0; i < deals.length; i += BATCH) {
      const batch = deals.slice(i, i + BATCH);
      // Also create prospects (only when CSV has an actual contact name) so they show in the pipeline
      const prospectRows = batch.map(d => {
        const company = companies.find(c => c.name.toLowerCase() === (d.companyName || '').toLowerCase());
        if (!d.primaryContactName) return null; // No contact in CSV — don't create a fake one
        const contactName = d.primaryContactName.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
        const contact = prospects.find(p => {
          const pName = p.name.toLowerCase();
          const pCompany = (p.company || '').toLowerCase();
          const matchesName = pName === contactName || pName.includes(contactName) || contactName.includes(pName);
          const matchesCompany = company ? pCompany === company.name.toLowerCase() : true;
          return matchesName && matchesCompany;
        });
        if (contact) return null; // Skip if contact already exists
        return {
          workspace_id: ws.id,
          name: d.primaryContactName.replace(/\s*\(.*?\)\s*/g, '').trim(),
          company: d.companyName || (company ? company.name : ''),
          stage: d.stage || 'lead',
          deal_value: d.dealValue || 0,
          title: '',
          email: '',
          phone: '',
          notes: d.notes || '',
          lifecycle_stage: 'opportunity',
          status: 'new',
          created_at: parseDate(d.createDate) || new Date().toISOString(),
        };
      }).filter(Boolean);
      // Insert new prospects
      if (prospectRows.length) {
        const { data: newProspects } = await supabase.from('prospects').insert(prospectRows).select();
        if (newProspects) {
          const mapped = newProspects.map(p => ({
            ...p, firstName: p.first_name || '', lastName: p.last_name || '',
            lifecycleStage: p.lifecycle_stage || 'lead', contactStatus: p.status || '',
            dealValue: p.deal_value || 0, stageEnteredAt: p.stage_entered_at || null,
            customFields: p.custom_fields || {}, leadSource: p.lead_source || '',
            createdAt: p.created_at, tags: Array.isArray(p.tags) ? p.tags : [], touchpoints: [],
          }));
          set(state => ({ prospects: [...mapped, ...state.prospects] }));
        }
      }
      const rows = batch.map(d => {
        const company = companies.find(c => c.name.toLowerCase() === (d.companyName || '').toLowerCase());
        let contact = null;
        if (d.primaryContactName) {
          const contactName = d.primaryContactName.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
          contact = prospects.find(p => {
            const pName = p.name.toLowerCase();
            const pCompany = (p.company || '').toLowerCase();
            const matchesName = pName === contactName || pName.includes(contactName) || contactName.includes(pName);
            const matchesCompany = company ? pCompany === company.name.toLowerCase() : true;
            return matchesName && matchesCompany;
          });
        }
        return {
          workspace_id: ws.id,
          company_id: company ? company.id : null,
          name: d.name,
          stage: d.stage || 'lead',
          deal_value: d.dealValue || 0,
          priority: d.priority || 'medium',
          close_date: d.closeDate || null,
          deal_type: d.dealType || '',
          primary_contact_id: contact ? contact.id : null,
          primary_contact_name: d.primaryContactName ? d.primaryContactName.replace(/\s*\(.*?\)\s*/g, '').trim() : '',
          notes: d.notes || '',
          associated_call: d.associatedCall || '',
          closed_lost_reason: d.closedLostReason || '',
          closed_won_reason: d.closedWonReason || '',
          last_contacted: d.lastContacted || null,
          created_at: parseDate(d.createDate) || new Date().toISOString(),
          stage_entered_at: parseDate(d.createDate) || new Date().toISOString(),
        };
      });
      const { data, error } = await supabase.from('deals').insert(rows).select();
      if (error) {
        for (const row of rows) {
          try {
            const { data: single } = await supabase.from('deals').insert(row).select();
            if (single) imported++;
          } catch (e) { console.error('Deal import error:', e); }
        }
      } else {
        imported += data.length;
      }
    }
    // Reload deals
    const { data: allDeals } = await supabase.from('deals').select('*').eq('workspace_id', ws.id).order('created_at', { ascending: false });
    if (allDeals) {
      set({ deals: allDeals.map(d => ({
        ...d,
        dealValue: d.deal_value, dealType: d.deal_type, ownerId: d.owner_id, ownerName: d.owner_name,
        primaryContactId: d.primary_contact_id, primaryContactName: d.primary_contact_name,
        closeDate: d.close_date, associatedCall: d.associated_call,
        closedLostReason: d.closed_lost_reason, closedWonReason: d.closed_won_reason,
        lastContacted: d.last_contacted, stageEnteredAt: d.stage_entered_at,
        createdAt: d.created_at, updatedAt: d.updated_at,
      }))});
    }
    return imported;
  },

  // ─── Prospects ───
  addProspect: async (p) => {
    const ws = get().workspace;
    if (!ws) return;
    const firstName = p.firstName || '';
    const lastName = p.lastName || '';
    const fullName = p.name || ((firstName + ' ' + lastName).trim());
    const { data, error } = await supabase.from('prospects').insert({
      workspace_id: ws.id,
      name: fullName, first_name: firstName, last_name: lastName,
      title: p.title, company: p.company, email: p.email,
      phone: p.phone, linkedin: p.linkedin, tier: p.tier || 'cold',
      stage: p.stage || 'lead', deal_value: p.dealValue || 0,
      lifecycle_stage: p.lifecycleStage || 'lead',
      status: p.contactStatus || '',
      stage_entered_at: p.stageEnteredAt || new Date().toISOString().slice(0, 10),
      angle: p.angle, notes: p.notes, tags: p.tags || [],
      lead_source: p.leadSource || '',
      custom_fields: p.customFields || {}, countries: p.countries || [],
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ prospects: [{ ...data, firstName, lastName, lifecycleStage: data.lifecycle_stage, contactStatus: data.status, leadSource: data.lead_source, touchpoints: [] }, ...state.prospects] }));
    logActivity({
      action: 'added', entityType: 'prospect', entityId: data.id, entityName: fullName,
      summary: `added ${fullName}${data.company ? ` from ${data.company}` : ''} as a new prospect`,
      metadata: { company: data.company || null, tier: p.tier, stage: p.stage },
    });
    return data;
  },

  updateProspect: async (id, updates) => {
    const before = get().prospects.find(p => p.id === id);
    const mapped = {};
    if (updates.dealValue !== undefined) mapped.deal_value = updates.dealValue;
    if (updates.stageEnteredAt !== undefined) mapped.stage_entered_at = updates.stageEnteredAt;
    if (updates.customFields !== undefined) mapped.custom_fields = updates.customFields;
    if (updates.wonAgainstCompetitor !== undefined) mapped.won_against_competitor = updates.wonAgainstCompetitor;
    if (updates.lostToCompetitor !== undefined) mapped.lost_to_competitor = updates.lostToCompetitor;
    if (updates.outcomeReason !== undefined) mapped.outcome_reason = updates.outcomeReason;
    if (updates.outcomeNotes !== undefined) mapped.outcome_notes = updates.outcomeNotes;
    if (updates.leadSource !== undefined) mapped.lead_source = updates.leadSource;
    if (updates.firstName !== undefined) mapped.first_name = updates.firstName;
    if (updates.lastName !== undefined) mapped.last_name = updates.lastName;
    if (updates.lifecycleStage !== undefined) mapped.lifecycle_stage = updates.lifecycleStage;
    if (updates.contactStatus !== undefined) mapped.status = updates.contactStatus;
    if (updates.name !== undefined) mapped.name = updates.name;
    // Auto-sync name when firstName/lastName change
    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const fn = updates.firstName ?? before?.firstName ?? before?.first_name ?? '';
      const ln = updates.lastName ?? before?.lastName ?? before?.last_name ?? '';
      mapped.name = ((fn + ' ' + ln).trim()) || before?.name || '';
    }
    Object.keys(updates).forEach(k => {
      if (!['dealValue','stageEnteredAt','customFields','wonAgainstCompetitor','lostToCompetitor','outcomeReason','outcomeNotes','firstName','lastName','lifecycleStage','contactStatus','leadSource'].includes(k)) {
        mapped[k] = updates[k];
      }
    });
    const { error } = await supabase.from('prospects').update(mapped).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => {
        const normalized = { ...updates };
        if (normalized.tags !== undefined) {
            normalized.tags = Array.isArray(normalized.tags) ? normalized.tags : typeof normalized.tags === 'string' ? (() => { try { return JSON.parse(normalized.tags); } catch { return []; } })() : [];
        }
        return {
          prospects: state.prospects.map(p => p.id === id ? { ...p, ...normalized } : p),
        };
      });
    const name = before?.name || updates.name || 'a prospect';
    const companyText = (before?.company || updates.company) ? ` from ${before?.company || updates.company}` : '';
    const dealValue = Number(updates.dealValue ?? before?.dealValue ?? 0) || 0;
    const money = v => `${currencySymbol(getCurrencyCode())}${Math.round(Number(v || 0)).toLocaleString()}`;
    (async () => {
      if (updates.stage && before?.stage && updates.stage !== before.stage) {
        if (updates.stage === 'won') {
          logActivity({
            action: 'won', entityType: 'prospect', entityId: id, entityName: name,
            summary: `closed ${name}${companyText} as won${dealValue > 0 ? ` for ${money(dealValue)}` : ''}`,
            metadata: { stage: 'won', deal_value: dealValue },
          });
        } else if (updates.stage === 'lost') {
          logActivity({
            action: 'lost', entityType: 'prospect', entityId: id, entityName: name,
            summary: `moved ${name}${companyText} to lost${updates.outcomeReason ? ` — ${updates.outcomeReason}` : ''}`,
            metadata: { stage: 'lost', outcome_reason: updates.outcomeReason || null },
          });
        } else {
          logActivity({
            action: 'moved', entityType: 'prospect', entityId: id, entityName: name,
            summary: `moved ${name}${companyText} from ${before.stage} to ${updates.stage}`,
            metadata: { from: before.stage, to: updates.stage },
          });
        }
      } else if (updates.dealValue !== undefined && before && updates.dealValue !== before.dealValue) {
        logActivity({
          action: 'updated', entityType: 'prospect', entityId: id, entityName: name,
          summary: `set the deal value for ${name}${companyText} to ${money(updates.dealValue)}`,
          metadata: { deal_value: updates.dealValue },
        });
      } else {
        const fields = Object.keys(mapped).filter(f => f !== 'stage_entered_at');
        logActivity({
          action: 'updated', entityType: 'prospect', entityId: id, entityName: name,
          summary: `updated ${name}${companyText}${fields.length ? ` (${fields.join(', ')})` : ''}`,
          metadata: { fields: Object.keys(mapped) },
        });
      }
    })();
  },

  deleteProspect: async (id) => {
    const before = get().prospects.find(p => p.id === id);
    await supabase.from('touchpoints').delete().eq('prospect_id', id);
    const { error } = await supabase.from('prospects').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ prospects: state.prospects.filter(p => p.id !== id) }));
    if (before) {
      logActivity({
        action: 'deleted', entityType: 'prospect', entityId: id, entityName: before.name,
        summary: `removed ${before.name}${before.company ? ` from ${before.company}` : ''} from the pipeline`,
        metadata: { company: before.company || null },
      });
    }
  },

  importProspects: async (newProspects) => {
    const ws = get().workspace;
    if (!ws) return;
    const seen = new Set();
    const existingEmails = new Set((get().prospects || []).map(p => (p.email || '').toLowerCase()).filter(Boolean));
    const rows = [];
    for (const p of newProspects) {
      const firstName = p.firstName || '';
      const lastName = p.lastName || '';
      const fullName = p.name || ((firstName + ' ' + lastName).trim());
      if (!fullName) continue;
      const email = (p.email || '').trim().toLowerCase();
      const dedupKey = email || fullName.toLowerCase();
      if (seen.has(dedupKey)) continue;
      if (email && existingEmails.has(email)) continue;
      seen.add(dedupKey);
      rows.push({
        workspace_id: ws.id, name: fullName, first_name: firstName, last_name: lastName,
        title: p.title, company: p.company,
        email: p.email, phone: p.phone, linkedin: p.linkedin, tier: p.tier || 'cold',
        stage: p.stage || 'lead', deal_value: p.dealValue || 0,
        lifecycle_stage: p.lifecycleStage || 'lead',
        status: p.contactStatus || '',
        lead_source: p.leadSource || '',
        stage_entered_at: p.stageEnteredAt || new Date().toISOString().slice(0, 10),
        angle: p.angle, notes: p.notes, tags: p.tags || [],
        custom_fields: p.customFields || {}, countries: p.countries || [],
      });
    }
    const BATCH_SIZE = 100;
    let allData = [];
    let skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.from('prospects').insert(batch).select();
      if (error) {
        console.error('Import batch error at offset', i, ':', error);
        for (const row of batch) {
          const { data: single, error: singleErr } = await supabase.from('prospects').insert([row]).select();
          if (singleErr) {
            console.error('Skipping prospect:', row.name, singleErr.message);
            skipped++;
          } else if (single) {
            allData.push(...single);
          }
        }
      } else if (data) {
        allData = allData.concat(data);
      }
    }
    set(state => ({
      prospects: [...state.prospects, ...allData.map(d => ({
        ...d,
        firstName: d.first_name ?? d.firstName ?? '',
        lastName: d.last_name ?? d.lastName ?? '',
        dealValue: d.deal_value ?? d.dealValue ?? 0,
        stageEnteredAt: d.stage_entered_at ?? d.stageEnteredAt ?? null,
        customFields: d.custom_fields ?? d.customFields ?? {},
        wonAgainstCompetitor: d.won_against_competitor ?? d.wonAgainstCompetitor ?? '',
        lostToCompetitor: d.lost_to_competitor ?? d.lostToCompetitor ?? '',
        outcomeReason: d.outcome_reason ?? d.outcomeReason ?? '',
        outcomeNotes: d.outcome_notes ?? d.outcomeNotes ?? '',
        leadSource: d.lead_source ?? d.leadSource ?? '',
        lifecycleStage: d.lifecycle_stage ?? d.lifecycleStage ?? 'lead',
        contactStatus: d.status ?? d.contactStatus ?? '',
        createdAt: d.created_at ?? d.createdAt ?? null,
        touchpoints: [],
      }))],
    }));
    const imported = allData.length;
    if (imported > 0) {
      logActivity({
        action: 'imported', entityType: 'prospect', entityName: null,
        summary: `imported ${allData.length} new prospects`,
        metadata: { count: allData.length },
      });
    }
    return allData;
  },

  // ─── Companies ───
  refreshCompanies: async () => {
    const ws = get().workspace;
    if (!ws) return;
    const PAGE = 1000;
    let from = 0;
    let all = [];
    while (true) {
      const { data, error } = await supabase.from('companies').select('*').eq('workspace_id', ws.id).order('name', { ascending: true }).range(from, from + PAGE - 1);
      if (error) { console.error(error); break; }
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    set({
      companies: all.map(c => ({
        ...c,
        companySize: c.company_size ?? c.companySize ?? '',
        annualRevenue: c.annual_revenue ?? c.annualRevenue ?? '',
        companyType: c.company_type ?? c.companyType ?? 'prospect',
        customFields: c.custom_fields ?? c.customFields ?? {},
        createdAt: c.created_at ?? c.createdAt ?? null,
      })),
    });
  },

  addCompany: async (c) => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('companies').insert({
      workspace_id: ws.id,
      name: c.name,
      domain: c.domain || '',
      industry: c.industry || '',
      company_size: c.companySize || '',
      annual_revenue: c.annualRevenue || '',
      phone: c.phone || '',
      address: c.address || '',
      city: c.city || '',
      region: c.region || '',
      country: c.country || '',
      description: c.description || '',
      logo_url: c.logoUrl || '',
      linkedin_url: c.linkedinUrl || '',
      company_type: c.companyType || 'prospect',
      tags: c.tags || [],
      custom_fields: c.customFields || {},
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ companies: [{ ...data, companySize: data.company_size, annualRevenue: data.annual_revenue, companyType: data.company_type, customFields: data.custom_fields || {}, createdAt: data.created_at }, ...state.companies] }));
    logActivity({
      action: 'added', entityType: 'company', entityId: data.id, entityName: data.name,
      summary: `added ${data.name} to the company list`,
      metadata: { industry: data.industry || null },
    });
  },

  importCompanies: async (newCompanies) => {
    const ws = get().workspace;
    if (!ws) return;
    const seen = new Set();
    const existingNames = new Set((get().companies || []).map(c => c.name.toLowerCase()));
    const rows = [];
    for (const c of newCompanies) {
      const name = (c.name || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key) || existingNames.has(key)) continue;
      seen.add(key);
      rows.push({
        workspace_id: ws.id,
        name: name,
        domain: c.domain || '',
        industry: c.industry || '',
        company_size: c.companySize || '',
        annual_revenue: c.annualRevenue || '',
        phone: c.phone || '',
        address: c.address || '',
        city: c.city || '',
        region: c.region || '',
        country: c.country || '',
        description: c.description || '',
        linkedin_url: c.linkedinUrl || '',
        company_type: c.companyType || 'prospect',
        tags: c.tags || [],
        custom_fields: c.outboundType ? { outboundType: c.outboundType } : {},
      });
    }
    const BATCH_SIZE = 100;
    let allData = [];
    let skipped = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase.from('companies').insert(batch).select();
      if (error) {
        console.error('Import batch error at offset', i, ':', error);
        for (const row of batch) {
          const { data: single, error: singleErr } = await supabase.from('companies').insert([row]).select();
          if (singleErr) {
            console.error('Skipping company:', row.name, singleErr.message);
            skipped++;
          } else if (single) {
            allData.push(...single);
          }
        }
      } else if (data) {
        allData = allData.concat(data);
      }
    }
    set(state => ({
      companies: [...state.companies, ...allData.map(d => ({
        ...d,
        companySize: d.company_size ?? d.companySize ?? '',
        annualRevenue: d.annual_revenue ?? d.annualRevenue ?? '',
        companyType: d.company_type ?? d.companyType ?? 'prospect',
        customFields: d.custom_fields ?? d.customFields ?? {},
        createdAt: d.created_at ?? d.createdAt ?? null,
      }))],
    }));
    const imported = allData.length;
    if (imported > 0) {
      logActivity({
        action: 'imported', entityType: 'company', entityName: null,
        summary: `imported ${imported} new companies` + (skipped > 0 ? ` (${skipped} skipped)` : ''),
        metadata: { count: imported, skipped },
      });
    }
    return { imported, skipped };
  },

  updateCompany: async (id, updates) => {
    const mapped = {};
    if (updates.name !== undefined) mapped.name = updates.name;
    if (updates.domain !== undefined) mapped.domain = updates.domain;
    if (updates.industry !== undefined) mapped.industry = updates.industry;
    if (updates.companySize !== undefined) mapped.company_size = updates.companySize;
    if (updates.annualRevenue !== undefined) mapped.annual_revenue = updates.annualRevenue;
    if (updates.phone !== undefined) mapped.phone = updates.phone;
    if (updates.address !== undefined) mapped.address = updates.address;
    if (updates.city !== undefined) mapped.city = updates.city;
    if (updates.region !== undefined) mapped.region = updates.region;
    if (updates.country !== undefined) mapped.country = updates.country;
    if (updates.description !== undefined) mapped.description = updates.description;
    if (updates.logoUrl !== undefined) mapped.logo_url = updates.logoUrl;
    if (updates.linkedinUrl !== undefined) mapped.linkedin_url = updates.linkedinUrl;
    if (updates.companyType !== undefined) mapped.company_type = updates.companyType;
    if (updates.tags !== undefined) mapped.tags = updates.tags;
    if (updates.customFields !== undefined) mapped.custom_fields = updates.customFields;
    const { error } = await supabase.from('companies').update(mapped).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({
      companies: state.companies.map(c => c.id === id ? { ...c, ...updates } : c),
    }));
    const before = get().companies.find(c => c.id === id);
    (async () => {
      
      const oldName = before?.name || 'a company';
      const newName = updates.name || oldName;
      if (updates.name && updates.name !== oldName) {
        logActivity({
          action: 'renamed', entityType: 'company', entityId: id, entityName: newName,
          summary: `${actor} renamed ${oldName} to ${newName}`,
          metadata: { from: oldName, to: newName },
        });
      } else {
        logActivity({
          action: 'updated', entityType: 'company', entityId: id, entityName: newName,
          summary: `${actor} updated ${newName}'s profile`,
          metadata: { fields: Object.keys(mapped) },
        });
      }
    })();
  },

  deleteCompany: async (id) => {
    const before = get().companies.find(c => c.id === id);
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ companies: state.companies.filter(c => c.id !== id) }));
    if (before) {
      logActivity({
        action: 'deleted', entityType: 'company', entityId: id, entityName: before.name,
        summary: `removed ${before.name} from the company list`,
      });
    }
  },

  // ─── Touchpoints ───
  addTouchpoint: async (prospectId, touchpoint) => {
    const insertData = {
      channel: touchpoint.channel,
      note: touchpoint.note,
      outcome: touchpoint.outcome,
      date: touchpoint.date || new Date().toISOString().slice(0, 10),
      created_by: (await supabase.auth.getUser()).data.user?.id,
    };
    // Support both prospect touchpoints and deal touchpoints
    if (touchpoint.dealId) {
      insertData.deal_id = touchpoint.dealId;
    } else {
      insertData.prospect_id = prospectId;
    }
    let data;
    const { data: inserted, error } = await supabase.from('touchpoints').insert(insertData).select().single();
    if (error) {
      // If deal_id column doesn't exist, store touchpoint on the deal directly as a fallback
      if (touchpoint.dealId && error.code === '42703') {
        const localTp = { id: Date.now().toString(), channel: touchpoint.channel, note: touchpoint.note, outcome: touchpoint.outcome, date: insertData.date, created_at: new Date().toISOString(), deal_id: touchpoint.dealId };
        set(state => ({
          deals: state.deals.map(d => {
            if (d.id !== touchpoint.dealId) return d;
            return { ...d, touchpoints: [...(d.touchpoints || []), localTp] };
          }),
        }));
        logActivity({
          action: 'touchpoint', entityType: 'touchpoint', entityId: localTp.id, entityName: (get().deals.find(d => d.id === touchpoint.dealId)?.name) || 'a deal',
          summary: `logged ${touchpoint.channel} on deal`,
          metadata: { channel: touchpoint.channel, outcome: touchpoint.outcome || null },
        });
        return;
      }
      console.error(error);
      throw error;
    }
    data = inserted;
    // Update prospects if it's a prospect touchpoint
    if (!touchpoint.dealId) {
      set(state => ({
        prospects: state.prospects.map(p => {
          if (p.id !== prospectId) return p;
          return { ...p, touchpoints: [...p.touchpoints, data], lastTouch: data.created_at || data.date, lastChannel: data.channel };
        }),
      }));
    }
    // Update deals if it's a deal touchpoint
    if (touchpoint.dealId) {
      set(state => ({
        deals: state.deals.map(d => {
          if (d.id !== touchpoint.dealId) return d;
          return { ...d, touchpoints: [...(d.touchpoints || []), data] };
        }),
      }));
    }
    const entityName = touchpoint.dealId
      ? (get().deals.find(d => d.id === touchpoint.dealId)?.name || 'a deal')
      : (get().prospects.find(p => p.id === prospectId)?.name || 'a contact');
    (async () => {
      
      logActivity({
        action: 'touchpoint', entityType: 'touchpoint', entityId: data.id, entityName,
        summary: `${actor} ${touchpointVerb(data.channel)} ${entityName}`,
        metadata: { channel: data.channel, outcome: data.outcome || null },
      });
    })();
  },

  // ─── Templates ───
  addTemplate: async (t) => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('templates').insert({
      workspace_id: ws.id, name: t.name, subject: t.subject, body: t.body,
      category: t.category || 'Cold Email', use_count: t.useCount || 0,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ templates: [...state.templates, data] }));
  },

  updateTemplate: async (id, updates) => {
    const mapped = {};
    if (updates.useCount !== undefined) mapped.use_count = updates.useCount;
    Object.keys(updates).forEach(k => {
      if (k !== 'useCount') mapped[k] = updates[k];
    });
    const { error } = await supabase.from('templates').update(mapped).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({
      templates: state.templates.map(t => t.id === id ? { ...t, ...updates } : t),
    }));
  },

  deleteTemplate: async (id) => {
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ templates: state.templates.filter(t => t.id !== id) }));
  },

  // ─── Sequences ───
  addSequence: async (s) => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('sequences').insert({
      workspace_id: ws.id, name: s.name, steps: s.steps || [],
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ sequences: [...state.sequences, data] }));
  },

  updateSequence: async (id, updates) => {
    const { error } = await supabase.from('sequences').update(updates).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({
      sequences: state.sequences.map(s => s.id === id ? { ...s, ...updates } : s),
    }));
  },

  deleteSequence: async (id) => {
    const { error } = await supabase.from('sequences').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ sequences: state.sequences.filter(s => s.id !== id) }));
  },

  setSequences: async (sequences) => {
    const ws = get().workspace;
    if (!ws) return;
    for (const s of sequences) {
      if (s.id) {
        await supabase.from('sequences').update(s).eq('id', s.id);
      } else {
        await supabase.from('sequences').insert({ ...s, workspace_id: ws.id });
      }
    }
    set({ sequences });
  },

  // ─── Notes ───
  addNote: async (note) => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('notes').insert({
      workspace_id: ws.id, title: note.title, content: note.content,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ notes: [...state.notes, data] }));
  },

  updateNote: async (id, updates) => {
    const { error } = await supabase.from('notes').update(updates).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({
      notes: state.notes.map(n => n.id === id ? { ...n, ...updates } : n),
    }));
  },

  deleteNote: async (id) => {
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ notes: state.notes.filter(n => n.id !== id) }));
  },

  // ─── Calendar Events ───
  loadCalendarEvents: async () => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('calendar_events').select('*').eq('workspace_id', ws.id).order('starts_at', { ascending: true });
    if (error) { console.error(error); return; }
    set({ calendarEvents: data || [] });
  },

  createCalendarEvent: async (event) => {
    const ws = get().workspace;
    if (!ws) return;
    const { data, error } = await supabase.from('calendar_events').insert({
      workspace_id: ws.id,
      title: event.title,
      description: event.description || '',
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      all_day: event.all_day || false,
      color: event.color || '#4B7B5B',
      linked_prospect_id: event.linked_prospect_id || null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { console.error(error); throw error; }
    set(state => ({ calendarEvents: [...state.calendarEvents, data] }));
  },

  updateCalendarEvent: async (id, updates) => {
    const { error } = await supabase.from('calendar_events').update(updates).eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({
      calendarEvents: state.calendarEvents.map(e => e.id === id ? { ...e, ...updates } : e),
    }));
  },

  deleteCalendarEvent: async (id) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    set(state => ({ calendarEvents: state.calendarEvents.filter(e => e.id !== id) }));
  },
}));

export default useStore;
