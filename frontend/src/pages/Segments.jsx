import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useStore from '../store/useStore';
import { api } from '../utils/meetings';
import { esc, timeAgo, formatMoney } from '../utils/helpers';
import { STAGE_LABELS } from '../utils/constants';
import { OPERATOR_LABELS, OPERATORS_BY_TYPE, describeCondition, valueKind, emptyCondition, COMPANY_FIELDS } from '../utils/segmentFields';
import { showToast } from '../components/Toast';

const STAGE_COLORS = {
  lead: 'var(--text-tertiary)', contacted: 'var(--accent)', engaged: 'var(--accent)',
  meeting: 'var(--warning)', proposal: 'var(--warning)', negotiation: 'var(--success)',
  won: 'var(--success)', lost: 'var(--danger)',
};
const TIER_DOTS = { hot: 'var(--danger)', warm: 'var(--warning)', cold: 'var(--accent)' };

const PRESET_RULES = {
  'New Leads': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'lead' }, { field: 'created_at', op: 'within_days', value: 30 }] },
  'Hot Leads': { logic: 'ALL', conditions: [{ field: 'tier', op: 'is', value: 'hot' }, { field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }] },
  'High-Value Leads': { logic: 'ALL', conditions: [{ field: 'deal_value', op: 'gte', value: 50000 }, { field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }] },
  'No Contact 7+ Days': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 7 }] },
  'No Contact 14+ Days': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 14 }] },
  'No Contact 30+ Days': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 30 }] },
  'Active Opportunities': { logic: 'ALL', conditions: [{ field: 'stage', op: 'in', value: ['meeting', 'proposal', 'negotiation'] }, { field: 'deal_value', op: 'gt', value: 0 }] },
  'At-Risk Opportunities': { logic: 'ALL', conditions: [{ field: 'stage', op: 'in', value: ['meeting', 'proposal', 'negotiation'] }, { field: 'last_activity', op: 'older_than', value: 14 }] },
  'Recently Contacted': { logic: 'ALL', conditions: [{ field: 'last_activity', op: 'within_days', value: 7 }] },
  'Unresponsive Contacts': { logic: 'ALL', conditions: [{ field: 'email_count', op: 'gt', value: 0 }, { field: 'response_count', op: 'eq', value: 0 }, { field: 'last_email', op: 'older_than', value: 7 }] },
  'Overdue Follow-Ups': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is_not', value: 'won' }, { field: 'stage', op: 'is_not', value: 'lost' }, { field: 'last_activity', op: 'older_than', value: 5 }] },
  'Customers': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'won' }] },
  'Former Customers': { logic: 'ALL', conditions: [{ field: 'stage', op: 'is', value: 'lost' }, { field: 'deal_value', op: 'gt', value: 0 }] },
};

// rules tree ⇄ wire format (wire: {logic:'ALL'|'ANY'|'NOT', conditions})
const toWire = (node) => {
  if (!node) return { logic: 'ALL', conditions: [] };
  return {
    logic: node.not ? 'NOT' : (node.logic || 'ALL'),
    conditions: (node.conditions || []).map(c => c.conditions ? toWire(c) : { field: c.field, op: c.op, value: c.value }),
  };
};
const fromWire = (wire) => {
  if (!wire) return { logic: 'ALL', not: false, conditions: [] };
  return {
    logic: wire.logic === 'ANY' ? 'ANY' : 'ALL',
    not: wire.logic === 'NOT',
    conditions: (wire.conditions || []).map(c => c.conditions ? fromWire(c) : { field: c.field, op: c.op, value: c.value }),
  };
};
const cloneRules = (node) => JSON.parse(JSON.stringify(node || { logic: 'ALL', not: false, conditions: [] }));

// ─── condition value editor ───
function ValueEditor({ cond, kind, options, catalog, onChange }) {
  const set = (v) => onChange({ ...cond, value: v });
  const optList = (key) => (options && options[key]) || [];

  if (kind === 'bool') {
    return (
      <div style={{ display: 'flex', gap: 4 }}>
        {[true, false].map(v => (
          <button key={String(v)} onClick={() => set(v)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid',
            background: cond.value === v ? 'var(--accent)' : 'var(--bg-surface)', color: cond.value === v ? '#fff' : 'var(--text-secondary)',
            borderColor: cond.value === v ? 'var(--accent)' : 'var(--border)',
          }}>{v ? 'Yes' : 'No'}</button>
        ))}
      </div>
    );
  }
  if (kind === 'enum') {
    const list = cond.field === 'owner' ? optList('owners') : cond.field === 'stage' ? optList('stages') : optList('tiers');
    const value = cond.value;
    if (cond.field === 'owner') {
      return (
        <select className="field-input" style={{ width: 180 }} value={value} onChange={e => set(e.target.value)}>
          <option value="">Select owner…</option>
          {list.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      );
    }
    return (
      <select className="field-input" style={{ width: 180 }} value={value} onChange={e => set(e.target.value)}>
        <option value="">Select…</option>
        {list.map(o => <option key={o} value={o}>{o[0]?.toUpperCase() + o.slice(1)}</option>)}
      </select>
    );
  }
  if (kind === 'enum-multi') {
    const list = cond.field === 'owner' ? optList('owners').map(o => ({ id: o.id, label: o.name }))
      : optList(cond.field === 'stage' ? 'stages' : 'tiers').map(s => ({ id: s, label: s[0]?.toUpperCase() + s.slice(1) }));
    const cur = Array.isArray(cond.value) ? cond.value : [];
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 320 }}>
        {list.map(o => {
          const active = cur.includes(o.id);
          return (
            <button key={o.id} onClick={() => set(active ? cur.filter(x => x !== o.id) : [...cur, o.id])} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer', border: '1px solid',
              background: active ? 'var(--accent-tint)' : 'var(--bg-surface)', color: active ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: active ? 'var(--accent)' : 'var(--border)',
            }}>{o.label}</button>
          );
        })}
      </div>
    );
  }
  if (kind === 'tags') {
    const cur = Array.isArray(cond.value) ? cond.value : [];
    const known = optList('tags');
    return (
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4, maxWidth: 320 }}>
          {cur.map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, background: 'var(--accent-tint)', color: 'var(--accent)', fontSize: 11, fontWeight: 500 }}>
              {t}
              <button onClick={() => set(cur.filter(x => x !== t))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <input className="field-input" style={{ width: 180 }} list="seg-tags" placeholder="Type tag, press Enter"
          onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { e.preventDefault(); const t = e.target.value.trim(); if (!cur.includes(t)) set([...cur, t]); e.target.value = ''; } }}
        />
        <datalist id="seg-tags">{known.map(t => <option key={t} value={t} />)}</datalist>
      </div>
    );
  }
  if (kind === 'days') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input className="field-input" type="number" min="1" style={{ width: 80 }} value={cond.value || ''} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{cond.op === 'older_than' ? 'days ago' : 'days'}</span>
      </div>
    );
  }
  if (kind === 'number-range' || kind === 'date-range') {
    const cur = Array.isArray(cond.value) ? cond.value : ['', ''];
    const type = kind === 'date-range' ? 'date' : 'number';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input className="field-input" type={type} style={{ width: 120 }} value={cur[0]} placeholder="Min"
          onChange={e => set([e.target.value, cur[1]])} />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>and</span>
        <input className="field-input" type={type} style={{ width: 120 }} value={cur[1]} placeholder="Max"
          onChange={e => set([cur[0], e.target.value])} />
      </div>
    );
  }
  if (kind === 'number') {
    return <input className="field-input" type="number" style={{ width: 120 }} value={cond.value ?? ''} onChange={e => set(Number(e.target.value))} />;
  }
  if (kind === 'date') {
    return <input className="field-input" type="date" style={{ width: 150 }} value={cond.value || ''} onChange={e => set(e.target.value)} />;
  }
  return <input className="field-input" style={{ width: 220 }} value={cond.value || ''} placeholder="Value" onChange={e => set(e.target.value)} />;
}

// ─── one condition row ───
function ConditionRow({ cond, catalog, options, onChange, onRemove, showRemove }) {
  const { fields = [], custom_fields = [] } = catalog || {};
  const allFields = [
    ...fields.map(f => ({ value: f.field, label: f.label, group: f.group, type: f.type })),
    ...custom_fields.map(f => ({ value: 'cf:' + f.id, label: f.name, group: 'Custom Fields', type: f.type })),
  ];
  const def = allFields.find(f => f.value === cond.field);
  const type = def?.type || 'text';
  const ops = OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text;
  const kind = valueKind(type, cond.op);

  const grouped = useMemo(() => {
    const groups = {};
    allFields.forEach(f => { (groups[f.group] = groups[f.group] || []).push(f); });
    return groups;
  }, [allFields]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
      <select className="field-input" style={{ width: 180, flexShrink: 0 }} value={cond.field} onChange={e => {
        const f = allFields.find(x => x.value === e.target.value);
        const op = (OPERATORS_BY_TYPE[f?.type || 'text'] || [])[0];
        onChange({ field: e.target.value, op, value: f?.type === 'number' ? 0 : f?.type === 'bool' ? true : f?.type === 'multienum' ? [] : '' });
      }}>
        {Object.entries(grouped).map(([g, list]) => (
          <optgroup key={g} label={g}>
            {list.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>
      <select className="field-input" style={{ width: 170, flexShrink: 0 }} value={cond.op} onChange={e => onChange({ ...cond, op: e.target.value })}>
        {ops.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o] || o}</option>)}
      </select>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ValueEditor cond={cond} kind={kind} options={options} catalog={catalog} onChange={onChange} />
      </div>
      {showRemove && (
        <button onClick={onRemove} title="Remove condition" style={{
          width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0,
          background: 'var(--danger-tint)', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      )}
    </div>
  );
}

// ─── recursive group ───
function GroupNode({ node, onChange, depth, catalog, options, onRemove }) {
  const updateCondition = (i, c) => {
    const conditions = [...node.conditions];
    conditions[i] = c;
    onChange({ ...node, conditions });
  };
  const removeCondition = (i) => onChange({ ...node, conditions: node.conditions.filter((_, j) => j !== i) });
  const addCondition = () => onChange({ ...node, conditions: [...node.conditions, emptyCondition(catalog)] });
  const addGroup = () => onChange({ ...node, conditions: [...node.conditions, { logic: 'ALL', not: false, conditions: [] }] });

  return (
    <div style={{ paddingLeft: depth > 0 ? 14 : 0 }}>
      <div style={{
        borderLeft: depth > 0 ? '2px solid var(--border)' : 'none',
        marginLeft: depth > 0 ? 0 : 0,
        paddingLeft: depth > 0 ? 14 : 0,
        marginBottom: 10,
      }}>
        {node.conditions.map((c, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
                  {node.logic === 'ANY' ? 'Or' : 'And'}
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}
            {c.conditions ? (
              <div style={{ position: 'relative', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {node.logic === 'ANY' ? 'Or group' : 'And group'}
                  </span>
                  <button onClick={() => { const next = node.conditions.filter((_, j) => j !== i); onChange({ ...node, conditions: next }); }} title="Remove group"
                    style={{ width: 20, height: 20, borderRadius: 5, border: 'none', cursor: 'pointer', background: 'var(--danger-tint)', color: 'var(--danger)', fontSize: 11, lineHeight: 1 }}>
                    ×
                  </button>
                </div>
                <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <GroupNode node={c} onChange={v => updateCondition(i, v)} depth={depth + 1} catalog={catalog} options={options} />
                </div>
              </div>
            ) : (
              <ConditionRow cond={c} catalog={catalog} options={options} onChange={v => updateCondition(i, v)} onRemove={() => removeCondition(i)} showRemove={node.conditions.length > 1 || depth > 0} />
            )}
          </div>
        ))}

        {node.conditions.length === 0 && (
          <div style={{ padding: '14px 0', fontSize: 12, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No conditions — every contact matches.</div>
        )}

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={addCondition} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: 'var(--accent-tint)', color: 'var(--accent)', border: '1px solid transparent', cursor: 'pointer',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add condition
          </button>
          <button onClick={addGroup} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 500,
            background: 'var(--bg-sunken)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Add condition group
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── builder header logic pills ───
function LogicBar({ node, onChange, entity = 'contact' }) {
  const subject = entity === 'company' ? 'Companies where' : 'Contacts where';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{subject}</span>
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, background: 'var(--bg-sunken)' }}>
        {['ALL', 'ANY'].map(l => (
          <button key={l} onClick={() => onChange({ ...node, logic: l })} style={{
            padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, border: 'none', cursor: 'pointer',
            background: node.logic === l ? 'var(--bg-surface)' : 'transparent', color: node.logic === l ? 'var(--accent)' : 'var(--text-tertiary)',
            boxShadow: node.logic === l ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{l === 'ALL' ? 'ALL match' : 'ANY match'}</button>
        ))}
      </div>
      <button onClick={() => onChange({ ...node, not: !node.not })} style={{
        padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px solid',
        background: node.not ? 'var(--danger-tint)' : 'var(--bg-surface)', color: node.not ? 'var(--danger)' : 'var(--text-secondary)',
        borderColor: node.not ? 'var(--danger)' : 'var(--border)',
      }}>
        {node.not ? '✓ Exclude (NOT)' : 'Exclude (NOT)'}
      </button>
      {node.not && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>— excludes contacts who match everything below</span>}
    </div>
  );
}

// ─── main page ───
export default function Segments() {
  const workspace = useStore(s => s.workspace);
  const wsId = workspace?.id;
  const setDetailId = useStore(s => s.setDetailId);
  const editingSegmentId = useStore(s => s.editingSegmentId);
  const setEditingSegment = useStore(s => s.setEditingSegment);

  const [mode, setMode] = useState('list'); // list | edit
  const [entity, setEntity] = useState('contact'); // contact | company
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [catalog, setCatalog] = useState(null);

  // builder state
  const [editing, setEditing] = useState(null); // segment row or null (new)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState({ logic: 'ALL', not: false, conditions: [] });
  const [dirty, setDirty] = useState(false);

  // live preview
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const debounceRef = useRef(null);

  // modals
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [emailModal, setEmailModal] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' });
  const [taskModal, setTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', due_date: '' });
  const [ownerAction, setOwnerAction] = useState('');
  const [stageAction, setStageAction] = useState('');
  const [tagAction, setTagAction] = useState({ mode: '', tag: '' });

  const refresh = useCallback(async () => {
    if (!wsId) return;
    setLoading(true);
    setError('');
    try {
      const { segments: list } = await api(`/segments?workspace_id=${wsId}`, { auth: true });
      setSegments(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [wsId]);

  const loadCatalog = useCallback(async () => {
    if (!wsId) return;
    try {
      const data = await api(`/segments/fields?workspace_id=${wsId}`, { auth: true });
      setCatalog(data);
      // migrate legacy localStorage custom field definitions into the DB once
      try {
        const legacy = JSON.parse(localStorage.getItem('vn_customFields') || '[]');
        if (Array.isArray(legacy) && legacy.length > 0 && (!data.custom_fields || data.custom_fields.length === 0)) {
          const res = await api('/custom-fields', {
            method: 'PUT',
            auth: true,
            body: { workspace_id: wsId, fields: legacy.map((f, i) => ({ id: f.id, name: f.name, type: f.type, options: f.options || [], required: !!f.required, position: i })) },
          });
          if (res.custom_fields) {
            setCatalog({ ...data, custom_fields: res.custom_fields });
            showToast('Migrated your custom fields to the shared workspace');
          }
        }
      } catch { /* migration is best-effort */ }
    } catch (e) {
      console.error('fields load error:', e.message);
    }
  }, [wsId]);

  useEffect(() => { refresh(); loadCatalog(); }, [refresh, loadCatalog]);

  // Restore the segment builder when returning from ProspectDetail (the Segments
  // component unmounts while a contact card is open, losing local state — the
  // store-backed id survives so we can re-open the right segment here).
  useEffect(() => {
    if (!editingSegmentId || segments.length === 0) return;
    if (editingSegmentId === 'new') { startNew(); return; }
    const seg = segments.find(s => String(s.id) === String(editingSegmentId));
    if (seg && mode !== 'edit') startEdit(seg);
  }, [editingSegmentId, segments]);

  const runPreview = useCallback(async (r, p = page, ent = entity) => {
    if (!wsId) return;
    setPreviewLoading(true);
    try {
      const res = ent === 'company'
        ? await api('/segments/companies/preview', {
            method: 'POST', auth: true,
            body: { workspace_id: wsId, rules: toWire(r), page: p, perPage: 10 },
          })
        : await api('/segments/preview', {
            method: 'POST', auth: true,
            body: { workspace_id: wsId, rules: toWire(r), page: p, perPage: 10 },
          });
      setPreview(res);
      setPage(res.page || p);
      setSelected(new Set());
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  }, [wsId, page, entity]);

  // debounced live count + preview whenever rules change
  useEffect(() => {
    if (mode !== 'edit') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runPreview(rules, page, entity), 500);
    return () => clearTimeout(debounceRef.current);
  }, [rules, mode, entity]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!name.trim()) { showToast('Segment name required'); return; }
    setError('');
    try {
      const body = { workspace_id: wsId, name: name.trim(), description: description.trim(), rules: toWire(rules), entity };
      if (editing?.id) {
        await api(`/segments/${editing.id}`, { method: 'PATCH', auth: true, body });
      } else {
        await api('/segments', { method: 'POST', auth: true, body });
      }
      showToast(editing?.id ? 'Segment updated' : 'Segment created');
      setDirty(false);
      setMode('list');
      setEditingSegment(null);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const startEdit = (seg) => {
    setEditing(seg || null);
    setName(seg?.name || '');
    setDescription(seg?.description || '');
    setEntity(seg?.entity === 'company' ? 'company' : 'contact');
    setRules(fromWire(seg?.rules) || { logic: 'ALL', not: false, conditions: [] });
    setError('');
    setPreview(null);
    setPage(1);
    setSelected(new Set());
    setMode('edit');
    setEditingSegment(seg?.id || null);
  };

  const startNew = (ent = 'contact') => {
    setEditing(null);
    setName('');
    setDescription('');
    setEntity(ent);
    setRules({ logic: 'ALL', not: false, conditions: [] });
    setError('');
    setPreview(null);
    setPage(1);
    setSelected(new Set());
    setMode('edit');
    setEditingSegment('new');
  };

  const patchSeg = async (id, body) => {
    try {
      const { segment } = await api(`/segments/${id}`, { method: 'PATCH', auth: true, body: { workspace_id: wsId, ...body } });
      setSegments(list => list.map(s => s.id === id ? { ...s, ...segment } : s));
      return segment;
    } catch (e) {
      showToast('Failed: ' + e.message);
      return null;
    }
  };

  const toggleFavorite = async (s) => {
    const res = await patchSeg(s.id, { is_favorite: !s.is_favorite });
    if (res) showToast(res.is_favorite ? 'Added to favorites' : 'Removed from favorites');
  };

  const archive = async (s) => {
    if (!window.confirm(`Archive “${s.name}”? It stays hidden but can be recreated anytime.`)) return;
    await patchSeg(s.id, { archived: true });
    refresh();
  };

  const remove = async (s) => {
    if (!window.confirm(`Permanently delete “${s.name}”? This cannot be undone.`)) return;
    try {
      await api(`/segments/${s.id}`, { method: 'DELETE', auth: true, body: { workspace_id: wsId } });
      showToast('Segment deleted');
      refresh();
    } catch (e) { showToast('Failed: ' + e.message); }
  };

  const duplicate = async (s) => {
    try {
      await api(`/segments/${s.id}/duplicate`, { method: 'POST', auth: true, body: { workspace_id: wsId } });
      showToast('Duplicated');
      refresh();
    } catch (e) { showToast('Failed: ' + e.message); }
  };

  const doRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    await patchSeg(renameTarget.id, { name: renameValue.trim() });
    setRenameTarget(null);
  };

  // ─── bulk actions ───
  const bulkAction = async (action, payload, confirmMsg) => {
    if (!preview) return;
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError('');
    try {
      const res = await api('/segments/actions', {
        method: 'POST', auth: true,
        body: { workspace_id: wsId, segment_id: editing?.id || undefined, rules: toWire(rules), action, payload },
      });
      showToast(`Done — ${res.affected} of ${res.matched} contacts updated`);
      setSelected(new Set());
      runPreview(rules, page);
    } catch (e) {
      setError(e.message);
    }
  };

  const exportCSV = async () => {
    if (!preview || !preview.count) return;
    setError('');
    const rows = [];
    const per = 100;
    const pages = Math.ceil(preview.count / per);
    try {
      if (entity === 'company') {
        for (let p = 1; p <= Math.min(pages, 50); p++) {
          const res = await api('/segments/companies/preview', {
            method: 'POST', auth: true,
            body: { workspace_id: wsId, rules: toWire(rules), page: p, perPage: per },
          });
          rows.push(...(res.companies || []));
          if (!(res.companies || []).length) break;
        }
      } else {
        for (let p = 1; p <= Math.min(pages, 50); p++) {
          const res = await api('/segments/preview', {
            method: 'POST', auth: true,
            body: { workspace_id: wsId, rules: toWire(rules), page: p, perPage: per },
          });
          rows.push(...(res.contacts || []));
          if (!(res.contacts || []).length) break;
        }
      }
    } catch (e) { setError(e.message); return; }
    if (entity === 'company') {
      const header = ['Company', 'Domain', 'Industry', 'Size', 'City', 'Region', 'Country', 'Revenue', 'Open Deals', 'Pipeline Value'];
      const csv = [header.join(','), ...rows.map(r => [
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.domain || '').replace(/"/g, '""')}"`,
        `"${(r.industry || '').replace(/"/g, '""')}"`,
        `"${(r.company_size || '').replace(/"/g, '""')}"`,
        `"${(r.city || '').replace(/"/g, '""')}"`,
        `"${(r.region || '').replace(/"/g, '""')}"`,
        `"${(r.country || '').replace(/"/g, '""')}"`,
        r.annual_revenue || '',
        r.open_deals || 0,
        r.total_deal_value || 0,
      ].join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (name.trim() || 'segment') + '-companies.csv';
      a.click();
      showToast(`Exported ${rows.length} companies`);
      return;
    }
    const header = ['Name', 'Email', 'Company', 'Title', 'Stage', 'Tier', 'Deal Value', 'Owner', 'Last Contacted'];
    const csv = [header.join(','), ...rows.map(r => [
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${(r.email || '').replace(/"/g, '""')}"`,
      `"${(r.company || '').replace(/"/g, '""')}"`,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      r.stage, r.tier, r.deal_value, `"${(r.owner_name || '').replace(/"/g, '""')}"`,
      r.last_activity || '',
    ].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (name.trim() || 'segment') + '.csv';
    a.click();
    showToast(`Exported ${rows.length} contacts`);
  };

  const filteredSegments = useMemo(() => {
    let list = segments;
    if (favOnly) list = list.filter(s => s.is_favorite);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    }
    return list;
  }, [segments, search, favOnly]);

  const selectedCount = selected.size;

  // catalog for the active entity — company segments use company_fields
  // (falls back to the built-in mirror when the loaded catalog predates company support)
  const builderCatalog = useMemo(() => {
    if (entity !== 'company') return catalog;
    const fields = (catalog?.company_fields?.length ? catalog.company_fields : COMPANY_FIELDS);
    return { fields, custom_fields: [], options: { tags: (catalog?.company_options?.tags) || [] } };
  }, [catalog, entity]);
  const builderOptions = entity === 'company' ? { tags: catalog?.company_options?.tags || [] } : (catalog?.options || {});

  // ── list view ──
  if (mode === 'list') {
    return (
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeSlideUp 0.3s ease-out', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: -0.4, margin: 0 }}>Segments</h1>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Dynamic contact lists that update themselves as your CRM data changes
            </div>
          </div>
          <button className="btn-primary" onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Segment
          </button>
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-tint)', color: 'var(--danger)', fontSize: 12, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search segments..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>
          <button onClick={() => setFavOnly(v => !v)} style={{
            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: '1px solid',
            background: favOnly ? 'var(--warning-tint)' : 'var(--bg-surface)', color: favOnly ? 'var(--warning)' : 'var(--text-secondary)',
            borderColor: favOnly ? 'var(--warning)' : 'var(--border)', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            ★ {favOnly ? 'Favorites only' : 'Favorites'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{filteredSegments.length} segments</span>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} style={{ height: 150, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border)', animation: 'pulse 1.2s ease-in-out infinite' }} />
            ))}
          </div>
        ) : filteredSegments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '70px 20px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="40" height="40" style={{ opacity: 0.25, marginBottom: 10 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 14l2 2 4-4"/></svg>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>No segments {search || favOnly ? 'match your filters' : 'yet'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
              {search || favOnly ? 'Try clearing your search or filters' : 'Build a dynamic list of contacts — it updates itself as your data changes'}
            </div>
            {!search && !favOnly && <button className="btn-primary" onClick={startNew} style={{ fontSize: 12 }}>+ Create your first segment</button>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {filteredSegments.map(s => {
              const isPreset = s.is_preset;
              return (
                <div key={s.id} onClick={() => startEdit(s)} style={{
                  padding: '16px', borderRadius: 12, cursor: 'pointer', background: 'var(--bg-surface)',
                  border: '1px solid var(--border)', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', position: 'relative',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="18" height="18"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 14l2 2 4-4"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {esc(s.name)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {esc(s.description) || 'No description'}
                      </div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleFavorite(s); }} title="Favorite"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: s.is_favorite ? 'var(--warning)' : 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
                      {s.is_favorite ? '★' : '☆'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 14 }}>
                    <span style={{ fontSize: 26, fontWeight: 300, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.match_count ?? '…'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>contacts match now</span>
                  </div>

                  {isPreset && <span style={{ position: 'absolute', top: 14, right: 38, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: 'var(--bg-sunken)', color: 'var(--text-tertiary)' }}>Preset</span>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 14 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.created_by_name ? `By ${s.created_by_name}` : 'System'} · Updated {timeAgo(s.updated_at)}
                    </span>
                    <button onClick={e => { e.stopPropagation(); startEdit(s); }} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Edit</button>
                    <button onClick={e => { e.stopPropagation(); duplicate(s); }} title="Duplicate" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>⧉</button>
                    <button onClick={e => { e.stopPropagation(); setRenameTarget(s); setRenameValue(s.name); }} title="Rename" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11" style={{ verticalAlign: 'middle' }}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); archive(s); }} title="Archive" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11" style={{ verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); remove(s); }} title="Delete" style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--danger-tint)', background: 'var(--danger-tint)', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11" style={{ verticalAlign: 'middle' }}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {renameTarget && (
          <div className="modal-overlay active" onClick={e => { if (e.target === e.currentTarget) setRenameTarget(null); }}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <div className="modal-title">Rename segment</div>
                <button className="modal-close" onClick={() => setRenameTarget(null)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="modal-body">
                <div className="field"><label className="field-label">Name</label><input className="field-input" value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus /></div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                  <button className="btn-secondary" onClick={() => setRenameTarget(null)}>Cancel</button>
                  <button className="btn-primary" onClick={doRename}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── builder view ──
  const previewMatchesEntity = !preview || (entity === 'company' ? Array.isArray(preview.companies) : Array.isArray(preview.contacts));
  const contacts = previewMatchesEntity && entity !== 'company' ? (preview?.contacts || []) : [];
  const companies = previewMatchesEntity && entity === 'company' ? (preview?.companies || []) : [];
  const safeCount = previewMatchesEntity ? (preview?.count ?? 0) : 0;
  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeSlideUp 0.3s ease-out', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => { setMode('list'); setEditingSegment(null); refresh(); }} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex: 1 }}>
          <input value={name} onChange={e => { setName(e.target.value); setDirty(true); }} placeholder="Segment name"
            style={{ width: '100%', fontSize: 20, fontWeight: 650, color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none', letterSpacing: -0.4, fontFamily: 'inherit' }} />
          <input value={description} onChange={e => { setDescription(e.target.value); setDirty(true); }} placeholder="Short description (optional)"
            style={{ width: '100%', fontSize: 12, color: 'var(--text-tertiary)', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {preview && !previewLoading && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'var(--success-tint)', color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              {safeCount.toLocaleString()} {entity === 'company' ? (safeCount === 1 ? 'company' : 'companies') : (safeCount === 1 ? 'contact' : 'contacts')} match
            </span>
          )}
          {previewLoading && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Counting…</span>}
          <button className="btn-secondary" onClick={() => { setMode('list'); setEditingSegment(null); }}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!dirty && !editing?.id} style={{ opacity: (!dirty && !editing?.id) ? 0.5 : 1 }}>
            {editing?.id ? 'Save changes' : 'Create segment'}
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-tint)', color: 'var(--danger)', fontSize: 12, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16, flex: 1, minHeight: 0 }}>
        {/* ── builder ── */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Segmenting</span>
            <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 8, background: 'var(--bg-sunken)' }}>
              {[['contact', 'Contacts'], ['company', 'Companies']].map(([val, label]) => (
                <button key={val} onClick={() => { if (entity !== val) { setEntity(val); setRules({ logic: 'ALL', not: false, conditions: [] }); setPreview(null); setPage(1); setSelected(new Set()); setDirty(true); } }} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, border: 'none', cursor: 'pointer',
                  background: entity === val ? 'var(--bg-surface)' : 'transparent', color: entity === val ? 'var(--accent)' : 'var(--text-tertiary)',
                  boxShadow: entity === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{label}</button>
              ))}
            </div>
            {entity === 'company' && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>conditions match companies; contacts under them come along</span>}
          </div>
          <LogicBar node={rules} onChange={v => { setRules(v); setDirty(true); }} entity={entity} />
          <div style={{ marginTop: 14 }}>
            <GroupNode node={rules} onChange={v => { setRules(v); setDirty(true); }} depth={0} catalog={builderCatalog} options={builderOptions} />
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>What this means</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              {(() => {
                const parts = [];
                const walk = (n, logic) => {
                  const items = (n.conditions || []).filter(c => !c.conditions).map(c => describeCondition(c, catalog));
                  items.forEach((it, i) => {
                    if (i > 0) parts.push(logic === 'ANY' ? ' or ' : ' and ');
                    const val = it.val !== '' && it.val !== undefined ? ` “${it.val}”` : '';
                    parts.push(`${it.label} ${it.opLabel.toLowerCase()}${val}`);
                  });
                  (n.conditions || []).filter(c => c.conditions).forEach((g, i) => {
                    if (items.length > 0 || i > 0) parts.push(logic === 'ANY' ? ' and ' : ' and ');
                    walk(g, g.not ? 'ALL' : g.logic || 'ALL');
                  });
                };
                if (rules.not) parts.push('Exclude ');
                walk(rules, rules.logic);
                if (rules.logic === 'ANY' && rules.not) parts.unshift('Show contacts matching any of: ');
                else if (rules.logic === 'ANY') parts.unshift('Show contacts matching any of: ');
                else if (rules.not) parts.unshift('Show all contacts except those where: ');
                else parts.unshift('Show contacts where all of these are true: ');
                return parts.join('');
              })()}
            </div>
          </div>
        </div>

        {/* ── live preview ── */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-primary)' }}>Matching contacts</span>
            {preview && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{safeCount.toLocaleString()} total</span>}
            <div style={{ flex: 1 }} />
            {safeCount > 0 && (
              <button className="btn-xs" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export CSV
              </button>
            )}
          </div>

          {previewLoading && !preview ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading matching contacts…</div>
          ) : !preview || safeCount === 0 ? (
            <div style={{ padding: '50px 20px', textAlign: 'center' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="34" height="34" style={{ opacity: 0.25, marginBottom: 8 }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{preview ? 'No contacts match yet' : 'Waiting for rules…'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{preview ? 'Loosen a condition to widen the list.' : 'Add a condition to see matching contacts live.'}</div>
            </div>
          ) : (
            <>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {entity === 'company' ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 28 }}>
                        <input type="checkbox" checked={selectedCount === companies.length && companies.length > 0}
                          onChange={e => setSelected(e.target.checked ? new Set(companies.map(c => c.id)) : new Set())} />
                      </th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Company</th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Industry</th>
                      <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Open deals</th>
                      <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Pipeline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map(co => {
                      const ctags = (Array.isArray(co.tags) ? co.tags : []).map(t => typeof t === 'object' ? t.name : t).filter(Boolean);
                      return (
                        <tr key={co.id} style={{ borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '8px 12px' }}>
                            <input type="checkbox" checked={selected.has(String(co.id))} onChange={() => {}} onClick={e => e.stopPropagation()} />
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: 'var(--accent-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                {co.name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(co.name)}</div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {[co.domain, co.country].filter(Boolean).join(' \u00b7 ') || ctags.slice(0, 2).join(' \u00b7 ') || '\u2014'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 8px', color: 'var(--text-secondary)' }}>
                            {co.industry || co.company_size || '\u2014'}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                            {co.open_deals > 0 ? <span style={{ fontWeight: 650, color: 'var(--accent)' }}>{co.open_deals}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                            {co.total_deal_value > 0 ? <span style={{ fontWeight: 650, color: 'var(--accent)' }}>{formatMoney(co.total_deal_value)}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                ) : (                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: 'var(--text-tertiary)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, borderBottom: '1px solid var(--border)', width: 28 }}>
                        <input type="checkbox" checked={selectedCount === contacts.length && contacts.length > 0}
                          onChange={e => setSelected(e.target.checked ? new Set(contacts.map(c => c.id)) : new Set())} />
                      </th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Contact</th>
                      <th style={{ textAlign: 'left', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '8px 8px', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Deal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => {
                      const tier = TIER_DOTS[c.tier] || TIER_DOTS.cold;
                      return (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={(e) => {
                            if (e.target.closest('input[type=checkbox]')) return;
                            setDetailId(c.id);
                          }}
                        >
                          <td style={{ padding: '8px 12px' }}>
                            <input type="checkbox" checked={selected.has(String(c.id))} onChange={() => {}} onClick={e => e.stopPropagation()} />
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: `linear-gradient(135deg, ${tier}, color-mix(in srgb, ${tier} 55%, #fff))`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                {c.name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{esc(c.name)}</div>
                                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {[c.title, c.company].filter(Boolean).join(' · ') || c.email || '—'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 8px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: `color-mix(in srgb, ${STAGE_COLORS[c.stage]} 12%, transparent)`, color: STAGE_COLORS[c.stage] }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }}></span>
                              {STAGE_LABELS[c.stage] || c.stage}
                            </span>
                            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{c.owner_name ? '· ' + c.owner_name : ''}{c.last_activity ? ' · ' + timeAgo(c.last_activity) : ''}</div>
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                            {c.deal_value > 0 ? <span style={{ fontWeight: 650, color: 'var(--accent)' }}>{formatMoney(c.deal_value)}</span> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                )}
              </div>

              {safeCount > 10 && (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Page {preview.page} of {Math.ceil(safeCount / 10)}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-xs" disabled={preview.page <= 1} onClick={() => runPreview(rules, preview.page - 1, entity)}>← Prev</button>
                    <button className="btn-xs" disabled={preview.page * 10 >= safeCount} onClick={() => runPreview(rules, preview.page + 1, entity)}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* bulk action bar */}
          {selectedCount > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', background: 'var(--bg-sunken)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{selectedCount} selected</span>
                <select className="field-input" style={{ width: 140, padding: '5px 8px', fontSize: 11 }} value={ownerAction} onChange={e => { setOwnerAction(e.target.value); bulkAction('assign_owner', { user_id: e.target.value }); setOwnerAction(''); }}>
                  <option value="">Assign owner…</option>
                  {(catalog?.options?.owners || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select className="field-input" style={{ width: 130, padding: '5px 8px', fontSize: 11 }} value={stageAction} onChange={e => { setStageAction(e.target.value); bulkAction('change_stage', { stage: e.target.value }, `Change status of ${selectedCount} contacts to “${STAGE_LABELS[e.target.value] || e.target.value}”?`); setStageAction(''); }}>
                  <option value="">Change status…</option>
                  {(catalog?.options?.stages || []).map(s => <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>)}
                </select>
                <input className="field-input" style={{ width: 130, padding: '5px 8px', fontSize: 11 }} placeholder="Add tag…" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { bulkAction('add_tag', { tag: e.target.value.trim() }); e.target.value = ''; } }} />
                <input className="field-input" style={{ width: 130, padding: '5px 8px', fontSize: 11 }} placeholder="Remove tag…" onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { bulkAction('remove_tag', { tag: e.target.value.trim() }); e.target.value = ''; } }} />
                <button className="btn-xs" onClick={() => setTaskModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>
                  Tasks
                </button>
                <button className="btn-xs" onClick={() => setEmailModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  Email
                </button>
                <button className="btn-xs" onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export
                </button>
                <button onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11 }}>Clear</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* send email modal */}
      {emailModal && (
        <div className="modal-overlay active" onClick={e => { if (e.target === e.currentTarget) setEmailModal(false); }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Email {selectedCount} contacts</div>
              <button className="modal-close" onClick={() => setEmailModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field"><label className="field-label">Subject</label><input className="field-input" value={emailForm.subject} onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })} /></div>
              <div className="field"><label className="field-label">Body</label><textarea className="field-input" rows={6} value={emailForm.body} onChange={e => setEmailForm({ ...emailForm, body: e.target.value })} placeholder="Plain text — sent to every selected contact with an email address (max 200 recipients)" /></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setEmailModal(false)}>Cancel</button>
                <button className="btn-primary" disabled={!emailForm.subject || !emailForm.body} onClick={() => { bulkAction('send_email', emailForm); setEmailModal(false); setEmailForm({ subject: '', body: '' }); }}>Send</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* create tasks modal */}
      {taskModal && (
        <div className="modal-overlay active" onClick={e => { if (e.target === e.currentTarget) setTaskModal(false); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">Create task for {selectedCount} contacts</div>
              <button className="modal-close" onClick={() => setTaskModal(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field"><label className="field-label">Task title</label><input className="field-input" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="e.g. Follow up with intro email" autoFocus /></div>
              <div className="field"><label className="field-label">Due date</label><input className="field-input" type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setTaskModal(false)}>Cancel</button>
                <button className="btn-primary" disabled={!taskForm.title.trim()} onClick={() => { bulkAction('create_tasks', { title: taskForm.title.trim(), due_date: taskForm.due_date || null }); setTaskModal(false); setTaskForm({ title: '', due_date: '' }); }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}