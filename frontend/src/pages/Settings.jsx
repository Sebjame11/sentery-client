import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { showToast } from '../components/Toast';
import { SenteryWordmark } from '../components/SenteryLogo';
import { parseCSV } from '../utils/csv';
import { isAiConfigured, aiChat, detectCompetitors } from '../utils/ai';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/activity';
import { isApolloConfigured, getApolloKey, saveApolloKeyToSupabase, loadApolloKeyFromSupabase } from '../utils/apollo';
import EmailIntegrationCard from '../components/EmailIntegrationCard';
import { CURRENCIES } from '../utils/currency';
import UserAvatar, { AVATAR_STYLES, dicebearUrl, randomAvatarStyle, randomSeed } from '../components/UserAvatar';
import PipelineStagesEditor from '../components/PipelineStagesEditor';
import LeadSourcesEditor from '../components/LeadSourcesEditor';

export default function Settings() {
    const { owner, setOwner, theme, setTheme, prospects, importProspects, setPage, workspace, updateWorkspaceProfile, changeCurrency, deleteAllDeals, deals } = useStore();
    const [localGoal, setLocalGoal] = useState(localStorage.getItem('vn_dailyGoal') || '10');
    const [localFollowUp, setLocalFollowUp] = useState(localStorage.getItem('vn_followUpDays') || '5');
    const [testing, setTesting] = useState(false);
    const [wsName, setWsName] = useState('');
    const [wsRename, setWsRename] = useState('');
    const [renamingWs, setRenamingWs] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [creatingWs, setCreatingWs] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [wsMembers, setWsMembers] = useState([]);
    const [ownerDirty, setOwnerDirty] = useState(false);
    const [savedName, setSavedName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [avatarStyle, setAvatarStyle] = useState('adventurer');
    const [avatarSeed, setAvatarSeed] = useState('');
    const [avatarPreview, setAvatarPreview] = useState('');
    const [avatarSaved, setAvatarSaved] = useState('');
    const [avatarChanged, setAvatarChanged] = useState(false);
    const [avatarSaving, setAvatarSaving] = useState(false);

    const profile = workspace?.company_profile || {};

    const [companyName, setCompanyName] = useState(profile.company_name || '');
    const [website, setWebsite] = useState(profile.website || '');
    const [industry, setIndustry] = useState(profile.industry || '');
    const [description, setDescription] = useState(profile.description || '');
    const [products, setProducts] = useState((profile.products || []).join('\n'));
    const [logoUrl, setLogoUrl] = useState(profile.logo_url || '');
    const [currency, setCurrency] = useState(profile.currency || 'USD');
    const [myRole, setMyRole] = useState(null);
    const [saving, setSaving] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [competitors, setCompetitors] = useState(profile.competitors || []);
    const [marketPosition, setMarketPosition] = useState(profile.market_position || '');
    const [apolloKey, setApolloKeyState] = useState(getApolloKey());
    const [apolloTesting, setApolloTesting] = useState(false);
    const [apolloConnected, setApolloConnected] = useState(isApolloConfigured());
    const [apolloSaving, setApolloSaving] = useState(false);
    const [mcpInfo, setMcpInfo] = useState(null);
    const [mcpConnections, setMcpConnections] = useState([]);
    const [mcpLoading, setMcpLoading] = useState(true);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [leaving, setLeaving] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [dupCompanies, setDupCompanies] = useState([]);
    const [dupContacts, setDupContacts] = useState([]);
    const [cleaningDups, setCleaningDups] = useState(false);
    const [deletingAllDeals, setDeletingAllDeals] = useState(false);

    const findDuplicates = () => {
        const companies = useStore.getState().companies;
        const prospects = useStore.getState().prospects;
        const compMap = {};
        companies.forEach(c => {
            const key = c.name.toLowerCase().trim();
            if (!compMap[key]) compMap[key] = [];
            compMap[key].push(c);
        });
        const dups = Object.values(compMap).filter(arr => arr.length > 1).flat();
        setDupCompanies(dups);

        const propMap = {};
        prospects.forEach(p => {
            const key = (p.email || '').toLowerCase().trim() || p.name.toLowerCase().trim();
            if (!key) return;
            if (!propMap[key]) propMap[key] = [];
            propMap[key].push(p);
        });
        const propDups = Object.values(propMap).filter(arr => arr.length > 1).flat();
        setDupContacts(propDups);
    };

    const deleteDuplicateCompanies = async () => {
        if (!dupCompanies.length) return;
        const nameGroups = {};
        dupCompanies.forEach(c => {
            const key = c.name.toLowerCase().trim();
            if (!nameGroups[key]) nameGroups[key] = [];
            nameGroups[key].push(c);
        });
        const toDelete = [];
        Object.values(nameGroups).forEach(group => {
            group.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            for (let i = 1; i < group.length; i++) toDelete.push(group[i].id);
        });
        if (!toDelete.length) return;
        if (!confirm('Delete ' + toDelete.length + ' duplicate companies? This cannot be undone.')) return;
        setCleaningDups(true);
        try {
            for (const id of toDelete) {
                await supabase.from('companies').delete().eq('id', id);
            }
            await useStore.getState().refreshCompanies();
            showToast(toDelete.length + ' duplicate companies deleted');
            findDuplicates();
        } catch (err) { showToast('Error: ' + err.message); }
        finally { setCleaningDups(false); }
    };

    const deleteDuplicateContacts = async () => {
        if (!dupContacts.length) return;
        const keyGroups = {};
        dupContacts.forEach(p => {
            const key = (p.email || '').toLowerCase().trim() || p.name.toLowerCase().trim();
            if (!key) return;
            if (!keyGroups[key]) keyGroups[key] = [];
            keyGroups[key].push(p);
        });
        const toDelete = [];
        Object.values(keyGroups).forEach(group => {
            group.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
            for (let i = 1; i < group.length; i++) toDelete.push(group[i].id);
        });
        if (!toDelete.length) return;
        if (!confirm('Delete ' + toDelete.length + ' duplicate contacts? This cannot be undone.')) return;
        setCleaningDups(true);
        try {
            for (const id of toDelete) {
                await supabase.from('prospects').delete().eq('id', id);
            }
            useStore.setState(state => ({
                prospects: state.prospects.filter(p => !toDelete.includes(p.id)),
            }));
            showToast(toDelete.length + ' duplicate contacts deleted');
            findDuplicates();
        } catch (err) { showToast('Error: ' + err.message); }
        finally { setCleaningDups(false); }
    };

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch('/api/mcp/info');
                if (r.ok) setMcpInfo(await r.json());
            } catch { /* backend offline */ }
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    const r = await fetch('/api/mcp/connections', {
                        headers: { 'Authorization': `Bearer ${session.access_token}` },
                    });
                    if (r.ok) setMcpConnections((await r.json()).data || []);
                }
            } catch { /* ignore */ }
            setMcpLoading(false);
        })();
    }, []);

    const revokeMcp = async (clientName) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const r = await fetch('/api/mcp/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify(clientName ? { client_name: clientName } : {}),
        });
        if (!r.ok) { showToast('Failed to revoke'); return; }
        setMcpConnections(clientName ? mcpConnections.filter(c => c.client_name !== clientName) : []);
        showToast(clientName ? 'App disconnected' : 'All MCP connections revoked');
    };

    useEffect(() => {
        loadApolloKeyFromSupabase().then(key => {
            if (key) {
                setApolloKeyState(key);
                setApolloConnected(true);
            }
        });
    }, []);

    useEffect(() => {
        const p = workspace?.company_profile || {};
        setCompanyName(p.company_name || '');
        setWebsite(p.website || '');
        setIndustry(p.industry || '');
        setDescription(p.description || '');
        setProducts((p.products || []).join('\n'));
        setLogoUrl(p.logo_url || '');
        setCurrency(p.currency || 'USD');
        setCompetitors(p.competitors || []);
        setMarketPosition(p.market_position || '');
    }, [workspace?.id, workspace?.company_profile]);

    // Load the current user's display name into the "Your Name" field
    useEffect(() => {
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);
            setUserEmail(user.email || '');
            const metaName = user.user_metadata?.display_name || user.user_metadata?.full_name || '';
            if (metaName) {
                useStore.setState({ owner: metaName });
                setSavedName(metaName);
            } else {
                const { data } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
                if (data?.display_name) { useStore.setState({ owner: data.display_name }); setSavedName(data.display_name); }
            }
            // Load avatar (metadata first, fall back to profiles table)
            let avatar = user.user_metadata?.avatar_url || '';
            if (!avatar) {
                const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
                avatar = data?.avatar_url || '';
            }
            if (avatar) {
                const m = avatar.match(/\/9\.x\/([a-z-]+)\/svg\?seed=([^&]+)/);
                if (m) {
                    setAvatarStyle(m[1]);
                    setAvatarSeed(decodeURIComponent(m[2]));
                }
                setAvatarPreview(avatar);
                setAvatarSaved(avatar);
            }
        })();
    }, []);

    // Track whether the name differs from what's saved
    useEffect(() => {
        setOwnerDirty(Boolean(owner.trim()) && owner.trim() !== savedName);
    }, [owner, savedName]);

    const createWorkspace = async () => {
        if (!wsName.trim()) { showToast('Workspace name required'); return; }
        setCreatingWs(true);
        try {
            const { data, error } = await supabase.rpc('create_workspace', { ws_name: wsName.trim() });
            if (error) throw error;
            if (data?.error) { showToast(data.error); return; }
            await useStore.getState().loadWorkspaces();
            showToast('Workspace created & switched');
            setWsName('');
        } catch (err) { showToast('Create failed: ' + (err.message || err)); }
        finally { setCreatingWs(false); }
    };

    const renameWorkspace = async () => {
        if (!wsRename.trim()) { showToast('Workspace name required'); return; }
        setRenamingWs(true);
        try {
            await useStore.getState().renameWorkspace(wsRename.trim());
            showToast('Workspace renamed');
            setWsRename('');
        } catch (err) {
            showToast('Rename failed: ' + (err.message || err));
            console.error('[settings] renameWorkspace failed:', err);
        }
        finally { setRenamingWs(false); }
    };

    const saveOwnerName = async () => {
        const name = owner.trim();
        if (!name) { showToast('Name required'); return; }
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not signed in');
            // 1) Persist to profiles table (used by activity log / sync)
            await supabase.from('profiles').upsert({ id: user.id, display_name: name });
            // 2) Update auth user metadata so the layout header shows it too
            await supabase.auth.updateUser({ data: { display_name: name } });
            setSavedName(name);
            setOwnerDirty(false);
            showToast('Name saved');
        } catch (err) {
            showToast('Save failed: ' + (err.message || err));
            console.error('[settings] saveOwnerName failed:', err);
        }
    };

    const generateAvatar = () => {
        const seed = randomSeed();
        setAvatarSeed(seed);
        setAvatarPreview(dicebearUrl(avatarStyle, seed));
        setAvatarChanged(true);
    };

    const saveAvatar = async () => {
        if (!avatarPreview) { showToast('Generate an avatar first'); return; }
        setAvatarSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not signed in');
            // 1) Persist to profiles table (used by member lists / RPC)
            const { error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: avatarPreview });
            if (error) throw error;
            // 2) Update auth user metadata so the sidebar header shows it too
            const { error: metaErr } = await supabase.auth.updateUser({ data: { ...(user.user_metadata || {}), avatar_url: avatarPreview } });
            if (metaErr) throw metaErr;
            setAvatarSaved(avatarPreview);
            setAvatarChanged(false);
            showToast('Avatar saved');
        } catch (err) {
            showToast('Save failed: ' + (err.message || err));
            console.error('[settings] saveAvatar failed:', err);
        }
        finally { setAvatarSaving(false); }
    };

    const loadMembers = async () => {
        const ws = useStore.getState().workspace;
        if (!ws) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.rpc('get_workspace_members', { ws_id: ws.id });
        if (error) { console.error(error); return; }
        setWsMembers(data || []);
        const me = (data || []).find(m => m.user_id === user?.id);
        setMyRole(me?.role || null);
    };

    const inviteMember = async () => {
        if (!inviteEmail.trim()) { showToast('Email required'); return; }
        const ws = useStore.getState().workspace;
        if (!ws) return;
        setInviting(true);
        try {
            const { data, error } = await supabase.rpc('add_workspace_member', { ws_id: ws.id, target_email: inviteEmail.trim() });
            if (error) throw error;
            if (data?.error) { showToast(data.error); return; }
            showToast('Invited ' + inviteEmail.trim());
            setInviteEmail('');
            loadMembers();
            logActivity({
                action: 'invited', entityType: 'member', entityName: inviteEmail.trim(),
                summary: `invited ${inviteEmail.trim()} to the workspace`,
                metadata: { email: inviteEmail.trim() },
            });
        } catch (err) { showToast(err.message); }
        finally { setInviting(false); }
    };

    const changeRole = async (userId, newRole) => {
        if (myRole !== 'admin') { showToast('Only admins can change roles'); return; }
        const ws = useStore.getState().workspace;
        if (!ws) return;
        const { data, error } = await supabase.rpc('update_member_role', { target_user_id: userId, ws_id: ws.id, new_role: newRole });
        if (error) { showToast(error.message); return; }
        if (data?.error) { showToast(data.error); return; }
        showToast('Role updated');
        loadMembers();
        const member = wsMembers.find(m => m.user_id === userId);
        logActivity({
            action: 'role_changed', entityType: 'member', entityId: userId, entityName: member?.email || userId,
            summary: `made ${member?.email || 'a member'} a ${newRole}`,
            metadata: { role: newRole, email: member?.email || null },
        });
    };

    const leaveWorkspace = async () => {
        if (!confirm('Are you sure you want to leave this workspace? You will lose access to all data.')) return;
        setLeaving(true);
        try {
            await useStore.getState().leaveWorkspace();
            showToast('Left workspace');
        } catch (err) { showToast(err.message); }
        finally { setLeaving(false); }
    };

    const removeMember = async (userId, email) => {
        if (!confirm('Remove ' + email + ' from this workspace?')) return;
        setRemoving(userId);
        try {
            await useStore.getState().removeMember(userId);
            showToast(email + ' removed');
            loadMembers();
        } catch (err) { showToast(err.message); }
        finally { setRemoving(null); }
    };

    const deleteWorkspace = async () => {
        if (!confirm('DELETE this workspace and ALL its data? This cannot be undone.')) return;
        if (!confirm('Are you absolutely sure? All prospects, companies, deals, and activity will be permanently deleted.')) return;
        try {
            await useStore.getState().deleteWorkspace();
            showToast('Workspace deleted');
        } catch (err) { showToast(err.message); }
    };

    const saveProfile = async () => {
        if (!companyName.trim()) { showToast('Company name is required'); return; }
        if (!workspace) { showToast('No workspace selected'); return; }
        setSaving(true);
        try {
            const prodList = products.split('\n').map(s => s.trim()).filter(Boolean);
            const merged = await updateWorkspaceProfile({
                company_name: companyName.trim(),
                website: website.trim(),
                industry: industry.trim(),
                description: description.trim(),
                products: prodList,
                logo_url: logoUrl.trim(),
                competitors: competitors || [],
                market_position: marketPosition || '',
            });
            if (merged) {
                setCompetitors(merged.competitors || []);
                setMarketPosition(merged.market_position || '');
            }
            showToast('Company profile saved');
        } catch (err) { showToast('Save failed: ' + (err.message || err)); }
        finally { setSaving(false); }
    };

    const runAnalysis = async () => {
        if (!companyName.trim()) { showToast('Enter a company name first'); return; }
        if (!workspace) { showToast('No workspace selected'); return; }
        setAnalyzing(true);
        try {
            const result = await detectCompetitors({
                company_name: companyName.trim(),
                website: website.trim(),
                industry: industry.trim(),
                description: description.trim(),
                products: products.split('\n').map(s => s.trim()).filter(Boolean),
            });
            if (result?.competitors?.length) {
                setCompetitors(result.competitors);
                await updateWorkspaceProfile({
                    company_name: companyName.trim(),
                    website: website.trim(),
                    industry: industry.trim(),
                    description: description.trim(),
                    products: products.split('\n').map(s => s.trim()).filter(Boolean),
                    logo_url: logoUrl.trim(),
                    competitors: result.competitors,
                    market_position: result.market_position || '',
                    last_analyzed: new Date().toISOString(),
                });
                setMarketPosition(result.market_position || '');
                showToast(`Found ${result.competitors.length} competitors`);
            } else {
                showToast('AI could not detect competitors. Add them manually.');
            }
        } catch (err) { showToast('Analysis failed: ' + (err.message || err)); }
        finally { setAnalyzing(false); }
    };

    const removeCompetitor = (idx) => {
        const updated = competitors.filter((_, i) => i !== idx);
        setCompetitors(updated);
    };

    const handleCurrencyChange = async (newCode) => {
        if (!newCode || newCode === currency) return;
        const isAdmin = myRole === 'admin' || myRole === 'owner';
        if (!isAdmin) { showToast('Only admins can change the currency'); return; }
        const oldCode = currency;
        if (!confirm(`Change workspace currency from ${oldCode} to ${newCode}?\n\nAll deal values will be converted at current exchange rates.`)) return;
        try {
            await changeCurrency(newCode);
            setCurrency(newCode);
            showToast(`Currency changed to ${newCode}`);
        } catch (err) { showToast('Change failed: ' + (err.message || err)); }
    };

    const testConnection = async () => {
        setTesting(true);
        try {
            const reply = await aiChat([{ role: 'user', content: 'Say "Connection successful" in exactly those words.' }], { maxTokens: 50 });
            showToast(`Connected! Response: ${reply.slice(0, 80)}`);
        } catch (err) {
            showToast(`Failed: ${err.message}`);
        } finally {
            setTesting(false);
        }
    };

    const saveApolloKey = async () => {
        const trimmed = apolloKey.trim();
        setApolloSaving(true);
        try {
            await saveApolloKeyToSupabase(trimmed);
            setApolloConnected(!!trimmed);
            showToast(trimmed ? 'Apollo API key saved to your account' : 'Apollo API key removed');
        } catch (err) {
            showToast('Failed to save: ' + err.message);
        } finally {
            setApolloSaving(false);
        }
    };

    const testApollo = async () => {
        if (!apolloKey.trim()) { showToast('Enter an API key first'); return; }
        setApolloTesting(true);
        try {
            const resp = await fetch('http://localhost:3001/api/apollo/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apolloKey: apolloKey.trim() }),
            });
            const data = await resp.json();
            console.log('Apollo test:', data);
            if (data.success) {
                setApolloConnected(true);
                showToast(data.message || 'Apollo connected!');
            } else {
                showToast('Apollo error: ' + (data.error || 'Unknown error'));
                setApolloConnected(false);
            }
        } catch (err) {
            showToast('Connection failed: ' + err.message);
            setApolloConnected(false);
        } finally {
            setApolloTesting(false);
        }
    };

    const exportProspects = () => {
        const b = new Blob([JSON.stringify(prospects, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'vaulty-nodey-prospects-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        showToast('Prospects exported');
    };

    const importProspectsJSON = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = (ev) => {
            try {
                const d = JSON.parse(ev.target.result);
                if (!Array.isArray(d)) throw 0;
                const current = useStore.getState().prospects;
                const newOnes = d.filter(p => p.id && p.name && !current.find(x => x.id === p.id));
                if (newOnes.length) { importProspects(newOnes); showToast(newOnes.length + ' imported'); }
                else showToast('No new prospects');
            } catch { showToast('Invalid file'); }
        };
        r.readAsText(f);
        e.target.value = '';
    };

    useEffect(() => { if (workspace) loadMembers(); }, [workspace?.id]);

    const importCSVSettings = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = parseCSV(ev.target.result);
            if (rows.length) { importProspects(rows); showToast(rows.length + ' imported'); }
            else showToast('No valid rows');
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const inputStyle = {
        width:'100%',padding:'10px 12px',fontSize:13,fontWeight:400,
        background:'var(--bg-surface)',color:'var(--text-primary)',
        border:'1.5px solid var(--border)',borderRadius:10,
        outline:'none',transition:'border-color 0.15s',
        boxSizing:'border-box',
    };

    return (
        <div style={{animation:'fadeSlideUp 0.3s ease-out',width:'100%'}}>
            <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:'0 0 16px'}}>Settings</h1>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,alignItems:'start'}}>

                {/* Left Column — Company Profile + Integrations */}
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div className="settings-section">
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                            <h3 style={{margin:0}}>Company Profile</h3>
                            <div style={{display:'flex',gap:8}}>
                                <button className="btn-secondary" onClick={runAnalysis} disabled={analyzing}>
                                    {analyzing ? 'Analyzing...' : 'AI Detect Competitors'}
                                </button>
                                <button className="btn-primary" onClick={saveProfile} disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Profile'}
                                </button>
                            </div>
                        </div>
                    <div style={{display:'flex',flexDirection:'column',gap:14}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                            <div>
                                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Company Name</label>
                                <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corp" />
                            </div>
                            <div>
                                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Website</label>
                                <input style={inputStyle} value={website} onChange={e => setWebsite(e.target.value)} placeholder="acme.com" />
                            </div>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                            <div>
                                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Industry</label>
                                <input style={inputStyle} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Enterprise SaaS, Fintech, etc." />
                            </div>
                            <div>
                                <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Logo URL</label>
                                <input style={inputStyle} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                            </div>
                        </div>
                        <div>
                            <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>
                                Workspace Currency
                                {(myRole !== 'admin' && myRole !== 'owner') && <span style={{fontWeight:400,color:'var(--text-tertiary)'}}> — only admins can change</span>}
                            </label>
                            <select
                                style={{...inputStyle,width:'100%',cursor:(myRole === 'admin' || myRole === 'owner') ? 'pointer' : 'not-allowed',opacity:(myRole === 'admin' || myRole === 'owner') ? 1 : 0.6}}
                                value={currency}
                                onChange={e => handleCurrencyChange(e.target.value)}
                                disabled={myRole !== 'admin' && myRole !== 'owner'}
                            >
                                {CURRENCIES.map(c => (
                                    <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Description</label>
                            <textarea style={{...inputStyle,resize:'vertical',minHeight:60}} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your company, mission, target market..." rows={3} />
                        </div>
                        <div>
                            <label style={{display:'block',fontSize:12,fontWeight:600,marginBottom:4,color:'var(--text-secondary)'}}>Products / Services <span style={{fontWeight:400,color:'var(--text-tertiary)'}}>(one per line)</span></label>
                            <textarea style={{...inputStyle,resize:'vertical',minHeight:60}} value={products} onChange={e => setProducts(e.target.value)} placeholder="Product A&#10;Product B&#10;Service C" rows={3} />
                        </div>
                    </div>

                    {marketPosition && (
                        <div style={{marginTop:16,padding:'12px 16px',background:'var(--bg-sunken)',borderRadius:10,fontSize:12,lineHeight:1.6,color:'var(--text-secondary)'}}>
                            <div style={{fontWeight:600,marginBottom:4,color:'var(--text-primary)'}}>Market Position</div>
                            {marketPosition}
                        </div>
                    )}

                    {competitors.length > 0 && (
                        <div style={{marginTop:16}}>
                            <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:'var(--text-secondary)'}}>Competitors ({competitors.length})</div>
                            <div style={{display:'flex',flexDirection:'column',gap:4}}>
                                {competitors.map((c, i) => (
                                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}>
                                        <div style={{flex:1,display:'flex',alignItems:'center',gap:8}}>
                                            <span style={{fontWeight:500,color:'var(--text-primary)'}}>{c.name}</span>
                                            {c.category && <span style={{color:'var(--text-tertiary)'}}>{c.category}</span>}
                                            <span style={{
                                                fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,textTransform:'uppercase',
                                                background: c.threat === 'high' ? 'var(--danger-tint)' : c.threat === 'medium' ? 'var(--warning-tint)' : 'var(--bg-sunken)',
                                                color: c.threat === 'high' ? 'var(--danger)' : c.threat === 'medium' ? 'var(--warning)' : 'var(--text-tertiary)',
                                            }}>{c.threat || 'unknown'}</span>
                                        </div>
                                        <button className="btn-icon-sm" style={{color:'var(--text-tertiary)',flexShrink:0}} onClick={() => removeCompetitor(i)} title="Remove">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    </div>

                    <div className="settings-section">
                        <h3>AI Configuration</h3>
                        <div className="settings-row">
                            <div><div className="settings-label">AI Status</div><div className="settings-desc">OpenCode Zen</div></div>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                <span style={{fontSize:11,color:'var(--color-success)',fontWeight:600}}>{isAiConfigured() ? 'Active' : 'Off'}</span>
                                <button className="btn-secondary" onClick={testConnection} disabled={testing} style={{fontSize:11,padding:'4px 10px'}}>
                                    {testing ? '...' : 'Test'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3 style={{display:'flex',alignItems:'center',gap:8}}>
                            AI &amp; MCP
                            <span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:'var(--accent-tint)',color:'var(--accent)'}}>AI-native</span>
                        </h3>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
                            <div className="settings-label">Connect your CRM to ChatGPT, Claude, Cursor &amp; more</div>
                            <div style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>
                                Any AI assistant can query your pipeline, log touchpoints, move deals, and book meetings — with your explicit permission.
                            </div>
                            {mcpInfo && (
                                <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,fontFamily:'var(--font-mono)',color:'var(--text-secondary)',background:'var(--bg-sunken)',borderRadius:8,padding:'8px 10px'}}>
                                    <span style={{color:'var(--success)',fontWeight:700}}>●</span>
                                    {mcpInfo.server_url}
                                </div>
                            )}
                        </div>

                        {mcpConnections.length > 0 && (
                            <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
                                <div style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)'}}>Connected apps</div>
                                {mcpConnections.map(c => (
                                    <div key={c.client_name} style={{display:'flex',alignItems:'center',gap:8}}>
                                        <div style={{flex:1,fontSize:12,color:'var(--text-primary)'}}>{c.client_name}{c.count > 1 ? ` (${c.count} connections)` : ''}</div>
                                        <button className="btn-xs" style={{fontSize:10.5}} onClick={() => revokeMcp(c.client_name)}>Disconnect</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        {mcpConnections.length > 0 && (
                            <div style={{marginTop:6}}>
                                <button className="btn-xs" style={{fontSize:10.5,color:'var(--danger)',borderColor:'var(--danger)'}} onClick={() => { if (confirm('Revoke access for ALL connected AI apps?')) revokeMcp(null); }}>
                                    Revoke all
                                </button>
                            </div>
                        )}

                        <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:10}}>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)',marginBottom:2}}>How to connect:</div>
                            {[
                                ['ChatGPT / Claude / Cursor', 'In the app\u2019s MCP / connectors settings, add a server with the URL above. You\u2019ll be asked to sign in and approve access.'],
                                ['opencode / Claude Code (CLI)', 'Set the remote server URL to the address above; OAuth opens in your browser automatically.'],
                            ].map(([app, how], i) => (
                                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:6,fontSize:11,color:'var(--text-tertiary)'}}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" width="12" height="12" style={{marginTop:2,flexShrink:0}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    <span><strong style={{color:'var(--text-secondary)'}}>{app}</strong> — {how}</span>
                                </div>
                            ))}
                            {mcpLoading && <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Checking connections…</div>}
                            {!mcpInfo && !mcpLoading && (
                                <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Backend offline — start it to see the server URL.</div>
                            )}
                        </div>
                    </div>

                    <EmailIntegrationCard />

                    <div className="settings-section">
                        <h3 style={{display:'flex',alignItems:'center',gap:8}}>
                            Apollo.io Integration
                            <span style={{fontSize:10,fontWeight:500,padding:'2px 8px',borderRadius:4,background:apolloConnected ? 'var(--success-tint)' : 'var(--bg-sunken)',color:apolloConnected ? 'var(--success)' : 'var(--text-tertiary)'}}>{apolloConnected ? 'Connected' : 'Not connected'}</span>
                        </h3>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
                            <div className="settings-label">API Key <span style={{fontWeight:400,color:'var(--text-tertiary)'}}>(from apollo.io/settings/integrations)</span></div>
                            <div style={{display:'flex',gap:6}}>
                                <input className="settings-input" type="password" value={apolloKey} onChange={e => setApolloKeyState(e.target.value)} placeholder="Paste your Apollo API key" style={{flex:1,fontFamily:'var(--font-mono)',fontSize:12}} />
                                <button className="btn-secondary" onClick={saveApolloKey} disabled={apolloSaving} style={{fontSize:11}}>
                                    {apolloSaving ? '...' : 'Save'}
                                </button>
                                <button className="btn-secondary" onClick={testApollo} disabled={apolloTesting} style={{fontSize:11}}>
                                    {apolloTesting ? '...' : 'Test'}
                                </button>
                            </div>
                            <div style={{fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>
                                Get your free API key at <a href="https://apollo.io/settings/integrations" target="_blank" rel="noopener" style={{color:'var(--accent)'}}>apollo.io/settings/integrations</a>. Required plan: Basic ($49/mo) or higher.
                            </div>
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                            <div style={{fontSize:11,fontWeight:600,color:'var(--text-secondary)',marginBottom:2}}>What you can do:</div>
                            {['Enrich contacts with email, phone, LinkedIn, title','Enrich companies with industry, size, revenue, description','Search Apollo\'s 275M+ contact database','Import prospects directly into Sentery'].map((f, i) => (
                                <div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-tertiary)'}}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="settings-section">
                        <PipelineStagesEditor />
                    </div>

                    <div className="settings-section">
                        <LeadSourcesEditor />
                    </div>
                </div>

                {/* Right Column — Workspace + Account */}
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    <div className="settings-section">
                        <h3>Workspace</h3>
                        <div className="settings-row">
                            <div><div className="settings-label">Current Workspace</div><div className="settings-desc">Rename or manage this workspace</div></div>
                        </div>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
                            <div style={{display:'flex',gap:6}}>
                                <input className="settings-input" value={wsRename} onChange={e => setWsRename(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') renameWorkspace(); }}
                                    placeholder={workspace?.name || 'Workspace name'} style={{flex:1}} />
                                <button className="btn-secondary" onClick={renameWorkspace} disabled={renamingWs} style={{fontSize:11}}>{renamingWs ? '...' : 'Rename'}</button>
                            </div>
                        </div>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
                            <div className="settings-label">Create New Workspace</div>
                            <div style={{display:'flex',gap:6}}>
                                <input className="settings-input" value={wsName} onChange={e => setWsName(e.target.value)} placeholder="e.g. Enterprise Team" style={{flex:1}} />
                                <button className="btn-secondary" onClick={createWorkspace} disabled={creatingWs}>{creatingWs ? '...' : 'Create'}</button>
                            </div>
                        </div>
                        {workspace && myRole === 'admin' && (
                            <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:6}}>
                                <div className="settings-label">Invite Member</div>
                                <div style={{display:'flex',gap:6}}>
                                    <input className="settings-input" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" style={{flex:1}} />
                                    <button className="btn-secondary" onClick={inviteMember} disabled={inviting}>{inviting ? '...' : 'Invite'}</button>
                                </div>
                            </div>
                        )}
                        {wsMembers.length > 0 && (
                            <div style={{marginTop:4,borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                                <div style={{padding:'6px 10px',background:'var(--bg-sunken)',fontSize:11,fontWeight:600,color:'var(--text-secondary)',borderBottom:'1px solid var(--border)'}}>
                                    {wsMembers.length} member{wsMembers.length > 1 ? 's' : ''}
                                </div>
                                {wsMembers.map(m => (
                                    <div key={m.user_id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderBottom:'1px solid var(--border)',fontSize:12}}>
                                        <span style={{flex:1,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.email}</span>
                                        {m.user_id === currentUserId ? (
                                            <span style={{fontSize:10,color:'var(--text-tertiary)',fontStyle:'italic'}}>you</span>
                                        ) : myRole === 'admin' ? (
                                            <>
                                                <select className="settings-input" style={{width:80,fontSize:10,padding:'2px 4px'}} value={m.role} onChange={e => changeRole(m.user_id, e.target.value)}>
                                                    <option value="admin">admin</option>
                                                    <option value="member">member</option>
                                                    <option value="viewer">viewer</option>
                                                </select>
                                                <button className="btn-xs" style={{fontSize:10,color:'var(--danger)',borderColor:'var(--danger)',padding:'2px 6px'}} onClick={() => removeMember(m.user_id, m.email)} disabled={removing === m.user_id}>
                                                    {removing === m.user_id ? '...' : 'Remove'}
                                                </button>
                                            </>
                                        ) : (
                                            <span style={{fontSize:10,color:'var(--text-tertiary)',background:'var(--bg-sunken)',padding:'2px 6px',borderRadius:4}}>{m.role}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {workspace && (
                            <div style={{marginTop:12,display:'flex',gap:8}}>
                                <button className="btn-secondary" style={{fontSize:11,color:'var(--danger)',borderColor:'var(--danger)'}} onClick={leaveWorkspace} disabled={leaving}>
                                    {leaving ? 'Leaving...' : 'Leave Workspace'}
                                </button>
                                {myRole === 'admin' && (
                                    <button className="btn-secondary" style={{fontSize:11,color:'var(--danger)',borderColor:'var(--danger)'}} onClick={deleteWorkspace}>
                                        Delete Workspace
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="settings-section">
                        <h3>Profile</h3>
                        <div className="settings-row">
                            <div><div className="settings-label">Your Name</div><div className="settings-desc">Sender name</div></div>
                            <div style={{display:'flex',gap:6,alignItems:'center'}}>
                                <input className="settings-input" value={owner} placeholder="Your name"
                                    onChange={e => setOwner(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveOwnerName(); }}
                                    onBlur={() => { if (owner.trim()) saveOwnerName(); }}
                                    style={{width:140}} />
                                {ownerDirty && <button className="btn-secondary" onClick={saveOwnerName} style={{fontSize:11,padding:'4px 10px'}}>Save</button>}
                            </div>
                        </div>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:10,marginTop:4}}>
                            <div><div className="settings-label">Avatar</div><div className="settings-desc">Pick a style and generate one</div></div>
                            <div style={{display:'flex',alignItems:'center',gap:14}}>
                                <UserAvatar src={avatarPreview} name={owner} email={userEmail} size={52} radius={12} />
                                <div style={{display:'flex',flexDirection:'column',gap:6,flex:1}}>
                                    <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                                        {AVATAR_STYLES.map(s => (
                                            <button key={s.id} className={'btn-xs' + (avatarStyle === s.id ? ' avatar-style-active' : '')}
                                                style={{fontSize:10,background:avatarStyle === s.id ? 'var(--accent-tint)' : undefined,color:avatarStyle === s.id ? 'var(--accent)' : undefined,borderColor:avatarStyle === s.id ? 'var(--accent)' : undefined}}
                                                onClick={() => setAvatarStyle(s.id)}>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{display:'flex',gap:6}}>
                                        <button className="btn-primary" onClick={generateAvatar} style={{fontSize:11,padding:'6px 14px',display:'inline-flex',alignItems:'center',gap:6}}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
                                            Generate
                                        </button>
                                        <button className="btn-primary" onClick={saveAvatar} disabled={!avatarChanged || avatarSaving} style={{fontSize:11,padding:'6px 14px',background:avatarChanged ? 'var(--text-primary)' : 'var(--bg-sunken)',color:avatarChanged ? 'var(--bg-canvas)' : 'var(--text-tertiary)',cursor:avatarChanged ? 'pointer' : 'not-allowed',border:'none'}}>{avatarSaving ? 'Saving…' : 'Save'}</button>
                                        {avatarChanged && <span style={{fontSize:10.5,color:'var(--text-tertiary)',alignSelf:'center'}}>unsaved changes</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>Preferences</h3>
                        <div className="settings-row">
                            <div><div className="settings-label">Theme</div></div>
                            <button className="btn-secondary" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{fontSize:11,padding:'4px 10px'}}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
                        </div>
                        <div className="settings-row">
                            <div><div className="settings-label">Daily Goal</div></div>
                            <input className="settings-input" style={{width:60}} type="number" min="1" max="100" value={localGoal} onChange={e => { setLocalGoal(e.target.value); localStorage.setItem('vn_dailyGoal', e.target.value); }} />
                        </div>
                        <div className="settings-row">
                            <div><div className="settings-label">Follow-up Days</div></div>
                            <input className="settings-input" style={{width:60}} type="number" min="1" max="60" value={localFollowUp} onChange={e => { setLocalFollowUp(e.target.value); localStorage.setItem('vn_followUpDays', e.target.value); }} />
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>Data</h3>
                        <div className="settings-row">
                            <div><div className="settings-label">Export</div><div className="settings-desc">JSON backup</div></div>
                            <button className="btn-secondary" onClick={exportProspects} style={{fontSize:11}}>Export</button>
                        </div>
                        <div className="settings-row">
                            <div><div className="settings-label">Import</div><div className="settings-desc">JSON or CSV</div></div>
                            <div style={{display:'flex',gap:4}}>
                                <button className="btn-secondary" onClick={() => document.getElementById('importJsonFile').click()} style={{fontSize:11}}>JSON</button>
                                <button className="btn-secondary" onClick={() => document.getElementById('importCsvSettings').click()} style={{fontSize:11}}>CSV</button>
                            </div>
                            <input type="file" id="importJsonFile" accept=".json" style={{display:'none'}} onChange={importProspectsJSON} />
                            <input type="file" id="importCsvSettings" accept=".csv" style={{display:'none'}} onChange={importCSVSettings} />
                        </div>
                        <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:8}}>
                            <div><div className="settings-label">Duplicate Cleanup</div><div className="settings-desc">Find and remove duplicate companies and contacts</div></div>
                            <button className="btn-secondary" onClick={findDuplicates} style={{fontSize:11,alignSelf:'flex-start'}}>Scan for Duplicates</button>
                            {(dupCompanies.length > 0 || dupContacts.length > 0) && (
                                <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
                                    {dupCompanies.length > 0 && (
                                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--warning-tint)',borderRadius:8,border:'1px solid var(--warning)',fontSize:12}}>
                                            <span style={{flex:1,color:'var(--text-primary)'}}><b>{dupCompanies.length}</b> duplicate companies found</span>
                                            <button className="btn-xs" style={{color:'var(--danger)',borderColor:'var(--danger)',fontSize:10}} onClick={deleteDuplicateCompanies} disabled={cleaningDups}>
                                                {cleaningDups ? '...' : 'Delete Duplicates'}
                                            </button>
                                        </div>
                                    )}
                                    {dupContacts.length > 0 && (
                                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'var(--warning-tint)',borderRadius:8,border:'1px solid var(--warning)',fontSize:12}}>
                                            <span style={{flex:1,color:'var(--text-primary)'}}><b>{dupContacts.length}</b> duplicate contacts found</span>
                                            <button className="btn-xs" style={{color:'var(--danger)',borderColor:'var(--danger)',fontSize:10}} onClick={deleteDuplicateContacts} disabled={cleaningDups}>
                                                {cleaningDups ? '...' : 'Delete Duplicates'}
                                            </button>
                                        </div>
                                    )}
                                    <div style={{fontSize:10,color:'var(--text-tertiary)'}}>Keeps the oldest record, deletes newer duplicates.</div>
                                </div>
                            )}
                            {dupCompanies.length === 0 && dupContacts.length === 0 && (
                                <div style={{fontSize:11,color:'var(--success)'}}>No duplicates found</div>
                            )}
                        </div>
                        <div className="settings-row">
                            <div><div className="settings-label">Delete All Deals</div><div className="settings-desc">Temporary tool — permanently deletes every deal in this workspace</div></div>
                            <button className="btn-xs" style={{color:'var(--danger)',borderColor:'var(--danger)',fontSize:11}} disabled={deletingAllDeals} onClick={async () => {
                                if (!confirm('Delete ALL ' + deals.length + ' deals? This cannot be undone.')) return;
                                if (!confirm('Are you sure? This permanently removes every deal from the pipeline.')) return;
                                setDeletingAllDeals(true);
                                try {
                                    await deleteAllDeals();
                                    showToast('All deals deleted');
                                } catch (e) { showToast('Failed: ' + e.message); }
                                setDeletingAllDeals(false);
                            }}>{deletingAllDeals ? 'Deleting...' : 'Delete All Deals'}</button>
                        </div>
                        <div className="settings-row">
                            <div><div className="settings-label">Clear All</div></div>
                            <button className="btn-xs" style={{color:'var(--danger)',borderColor:'var(--danger)',fontSize:11}} onClick={() => { if(confirm('Delete ALL data?')) { localStorage.clear(); location.reload(); } }}>Clear</button>
                        </div>
                    </div>

                    <div className="settings-section" style={{marginBottom:0}}>
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                            <div><SenteryWordmark height={18} className="settings-label" /><div className="settings-desc">v2.0.0</div></div>
                        </div>
                        <div className="legal-footer-links" style={{marginTop:10,justifyContent:'flex-start'}}>
                            <a href="/privacy" onClick={(e) => { e.preventDefault(); setPage('privacy'); }}>Privacy Policy</a>
                            <span className="legal-footer-sep">·</span>
                            <a href="/terms" onClick={(e) => { e.preventDefault(); setPage('terms'); }}>Terms of Service</a>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
