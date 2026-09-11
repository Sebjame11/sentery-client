import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from './store/useStore';
import { useAuth } from './store/AuthContext';
import AuthGuard from './components/AuthGuard';
import LoadingScreen from './components/LoadingScreen';
import { AppSkeleton } from './components/Skeleton';
import Modal from './components/Modal';
import Toast from './components/Toast';
import Layout from './components/Layout';
import CommandPalette from './components/CommandPalette';
import ShortcutsHelp from './components/ShortcutsHelp';
import CountrySelect from './components/CountrySelect';
import CompanyPicker from './components/CompanyPicker';
import { currencySymbol, getCurrencyCode } from './utils/currency';
import { LIFECYCLE_STAGES, LIFECYCLE_LABELS, getStageIds, getStageLabels, getLeadSources } from './utils/constants';
import Home from './pages/Home';
import SignIn from './pages/SignIn';
import Legal from './pages/Legal';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Prospects from './pages/Prospects';
import Outreach from './pages/Outreach';
import Analytics from './pages/Analytics';
import Activity from './pages/Activity';
import Reminders from './pages/Reminders';
import Notes from './pages/Notes';
import Settings from './pages/Settings';
import ProspectDetail from './pages/ProspectDetail';
import WinLoss from './pages/WinLoss';
import Playbooks from './pages/Playbooks';
import DealRooms from './pages/DealRooms';
import Territory from './pages/Territory';
import Competitors from './pages/Competitors';
import Sequences from './pages/Sequences';
import ApolloSequences from './pages/ApolloSequences';
import DailyDigest from './pages/DailyDigest';
import ActivityGoals from './pages/ActivityGoals';
import CustomFields from './pages/CustomFields';
import ContactsPage from './pages/ContactsPage';
import CompaniesPage from './pages/CompaniesPage';
import Meetings from './pages/Meetings';
import EmailsPage from './pages/EmailsPage';
import Segments from './pages/Segments';
import DueDiligence from './pages/DueDiligence';
import CalendarPage from './pages/CalendarPage';
import BookingPage from './pages/BookingPage';
import McpConsent from './pages/McpConsent';
import { openModalFn } from './components/Modal';
import { showToast } from './components/Toast';
import { loadApolloKeyFromSupabase } from './utils/apollo';

export default function App() {
    const currentPage = useStore(s => s.currentPage);
    const appPage = useStore(s => s.appPage);
    const theme = useStore(s => s.theme);
    const detailId = useStore(s => s.detailId);
    const setDetailId = useStore(s => s.setDetailId);
    const workspace = useStore(s => s.workspace);
    const [cmdOpen, setCmdOpen] = useState(false);
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addForm, setAddForm] = useState({ name: '', firstName: '', lastName: '', title: '', company: '', email: '', phone: '', linkedin: '', tier: 'cold', stage: 'lead', dealValue: 0, angle: '', notes: '', countries: [], leadSource: '' });

    const { user } = useAuth();
    const setCurrentWorkspace = useStore(s => s.setCurrentWorkspace);
    const loadWorkspaces = useStore(s => s.loadWorkspaces);
    const workspaceLoading = useStore(s => s.workspaceLoading);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        if (user) {
            loadWorkspaces();
            loadApolloKeyFromSupabase();
        }
    }, [user?.id]);

    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(v => !v); }
            if (e.key === '?' && !e.target.matches('input,textarea,select')) { e.preventDefault(); setShortcutsOpen(true); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        const viewHandler = (e) => setDetailId(e.detail);
        document.addEventListener('viewProspectId', viewHandler);
        return () => document.removeEventListener('viewProspectId', viewHandler);
    }, []);

    // Handle browser back/forward for public pages
    useEffect(() => {
        const onPopState = () => {
            const path = window.location.pathname;
            const setPage = useStore.getState().setPage;
            if (path === '/privacy') setPage('privacy');
            else if (path === '/terms') setPage('terms');
            else if (path === '/signin') setPage('signin');
            else if (path === '/') setPage('home');
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    useEffect(() => {
        const handleConfirmOutcome = async (e) => {
            const { id, stage } = e.detail || {};
            const state = useStore.getState();
            const p = state.prospects.find(x => x.id === id);
            const deal = !p ? state.deals.find(d => d.id === id) : null;
            const reason = document.getElementById('outcomeReason')?.value || '';
            const notes = document.getElementById('outcomeNotes')?.value?.trim() || '';
            const closeVal = document.getElementById('dealCloseValue')?.value;
            document.getElementById('modal').classList.remove('active');
            const updates = { stage, stageEnteredAt: new Date().toISOString().slice(0, 10), outcomeReason: reason, outcomeNotes: notes };
            if (stage === 'won' && closeVal !== undefined && closeVal !== '') {
                updates.dealValue = Number(closeVal) || 0;
            }
            try {
                if (deal) {
                    await state.updateDeal(id, updates);
                } else if (p) {
                    await state.updateProspect(id, updates);
                } else {
                    return;
                }
                const name = (p || deal)?.name || 'Deal';
                showToast(name + ' moved to ' + (stage === 'won' ? 'Won' : 'Lost'));
            } catch (err) {
                console.error('confirmOutcome error:', err);
                showToast('Update failed: ' + (err.message || 'Unknown error'));
            }
        };
        const handleSaveTemplate = () => {
            const name = document.getElementById('tplName')?.value?.trim();
            const subject = document.getElementById('tplSubject')?.value?.trim() || '';
            const body = document.getElementById('tplBody')?.value?.trim() || '';
            if (!name) return;
            useStore.getState().addTemplate({ name, subject, body });
            document.getElementById('modal').classList.remove('active');
        };
        const handleConfirmCSV = () => {
            const rows = window._pendingCSVImport;
            if (!rows || !rows.length) return;
            window._pendingCSVImport = null;
            useStore.getState().importProspects(rows).then(() => {
                document.getElementById('modal').classList.remove('active');
                showToast(rows.length + ' contacts imported');
            }).catch(err => {
                console.error('Import error:', err);
                showToast('Import failed: ' + err.message);
            });
        };
        const handleAddSeqStep = () => {
            if (!window._seqSteps) window._seqSteps = [];
            window._seqSteps.push({ day: 1, channel: 'Email', action: '' });
            const i = window._seqSteps.length - 1;
            const container = document.getElementById('seqSteps');
            if (container) {
                container.innerHTML += '<div style="display:flex;gap:8px;margin-bottom:8px;align-items:center"><span style="font-size:0.75rem;color:var(--text-tertiary);width:30px">#' + (i+1) + '</span><input class="field-input" style="width:70px" type="number" id="seqDay' + i + '" value="1" min="1"><select class="field-input" style="width:100px" id="seqCh' + i + '"><option>Email</option><option>LinkedIn</option><option>Call</option><option>SMS</option></select><input class="field-input" id="seqAct' + i + '" placeholder="Action" style="flex:1"></div>';
            }
        };
        const handleSaveSequence = () => {
            const name = document.getElementById('seqName')?.value?.trim();
            if (!name) return;
            const steps = (window._seqSteps || []).map((_, i) => ({
                day: parseInt(document.getElementById('seqDay' + i)?.value || 1),
                channel: document.getElementById('seqCh' + i)?.value || 'Email',
                action: document.getElementById('seqAct' + i)?.value || ''
            }));
            const store = useStore.getState();
            store.setSequences([...store.sequences, { name, steps }]);
            window._seqSteps = [];
            document.getElementById('modal').classList.remove('active');
        };
        const handleLogTouchpoint = () => {
            const prospectId = window._logTpProspectId;
            if (!prospectId) return;
            useStore.getState().addTouchpoint(prospectId, {
                channel: document.getElementById('tpChannel')?.value || 'Email',
                note: document.getElementById('tpNote')?.value?.trim() || '',
                outcome: document.getElementById('tpOutcome')?.value || 'pending',
                type: 'touchpoint'
            });
            document.getElementById('modal').classList.remove('active');
            showToast('Touchpoint logged');
        };
        const handleLogDealTouchpoint = async (e) => {
            const { dealId, channel } = e.detail || {};
            if (!dealId) return;
            try {
                await useStore.getState().addTouchpoint(null, {
                    dealId,
                    channel: channel || document.getElementById('tpChannel')?.value || 'Email',
                    note: document.getElementById('tpNote')?.value?.trim() || '',
                    outcome: document.getElementById('tpOutcome')?.value || 'pending',
                });
                document.getElementById('modal').classList.remove('active');
                showToast('Activity logged');
            } catch (err) {
                console.error('logDealTouchpoint error:', err);
                showToast('Failed to log: ' + (err.message || 'Unknown error'));
            }
        };

        document.addEventListener('confirmOutcome', handleConfirmOutcome);
        document.addEventListener('saveTemplate', handleSaveTemplate);
        document.addEventListener('confirmCSV', handleConfirmCSV);
        document.addEventListener('addSeqStep', handleAddSeqStep);
        document.addEventListener('saveSequence', handleSaveSequence);
        document.addEventListener('logTouchpoint', handleLogTouchpoint);
        document.addEventListener('logDealTouchpoint', handleLogDealTouchpoint);
        return () => {
            document.removeEventListener('confirmOutcome', handleConfirmOutcome);
            document.removeEventListener('saveTemplate', handleSaveTemplate);
            document.removeEventListener('confirmCSV', handleConfirmCSV);
            document.removeEventListener('addSeqStep', handleAddSeqStep);
            document.removeEventListener('saveSequence', handleSaveSequence);
            document.removeEventListener('logTouchpoint', handleLogTouchpoint);
            document.removeEventListener('logDealTouchpoint', handleLogDealTouchpoint);
        };
    }, []);

    const openAddProspect = () => {
        setAddForm({ firstName: '', lastName: '', name: '', title: '', company: '', email: '', phone: '', linkedin: '', tier: 'cold', stage: 'lead', lifecycleStage: 'lead', contactStatus: '', dealValue: 0, angle: '', notes: '', countries: [], leadSource: '' });
        setShowAddForm(true);
    };

    const saveAddForm = async () => {
        const fullName = ((addForm.firstName || '') + ' ' + (addForm.lastName || '')).trim() || addForm.name;
        if (!fullName) { showToast('Name is required'); return; }
        const companyName = addForm.company.trim();
        if (companyName && !useStore.getState().companies.some(c => c.name.toLowerCase() === companyName.toLowerCase())) {
            try { await useStore.getState().addCompany({ name: companyName }); } catch {}
        }
        useStore.getState().addProspect({ ...addForm, name: fullName, company: companyName, dealValue: Number(addForm.dealValue) || 0, stageEnteredAt: new Date().toISOString().slice(0, 10) });
        showToast(fullName + ' added');
        setShowAddForm(false);
    };

    if (currentPage === 'home') return <>
        <LoadingScreen />
        <Modal />
        <Toast />
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <AnimatePresence mode="wait">
            <motion.div key="home" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}>
                <Home />
            </motion.div>
        </AnimatePresence>
    </>;

    if (currentPage === 'privacy' || currentPage === 'terms') return <>
        <LoadingScreen />
        <Modal />
        <Toast />
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        <AnimatePresence mode="wait">
            <motion.div key={currentPage} initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}>
                <Legal type={currentPage} />
            </motion.div>
        </AnimatePresence>
    </>;

    if (currentPage === 'signin') return <SignIn />;

    if (window.location.pathname.startsWith('/mcp/authorize')) return <McpConsent />;

    const bookMatch = window.location.pathname.match(/^\/book\/([a-z0-9-]+)\/?$/i);
    if (bookMatch) return <>
        <Toast />
        <BookingPage slug={bookMatch[1]} />
    </>;

    const PAGES = {
        dashboard: Dashboard,
        pipeline: Pipeline,
        prospects: Prospects,
        outreach: Outreach,
        analytics: Analytics,
        activity: Activity,
        reminders: Reminders,
        notes: Notes,
        settings: Settings,
        winloss: WinLoss,
        playbooks: Playbooks,
        dealrooms: DealRooms,
        territory: Territory,
        competitors: Competitors,
        sequences: Sequences,
        apollo_sequences: ApolloSequences,
        digest: DailyDigest,
        goals: ActivityGoals,
        customfields: CustomFields,
        contacts: ContactsPage,
        companies: CompaniesPage,
        meetings: Meetings,
        emails: EmailsPage,
        segments: Segments,
        duediligence: DueDiligence,
        calendar: CalendarPage,
    };

    const renderPage = () => {
        if (detailId) return <ProspectDetail prospectId={detailId} onBack={() => setDetailId(null)} />;
        const PageComponent = PAGES[appPage] || Dashboard;
        return <PageComponent />;
    };

    return <AuthGuard>
        <LoadingScreen />
        <Modal />
        <Toast />
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <ShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        {workspaceLoading ? (
            <AppSkeleton />
        ) : (
            <Layout onAddProspect={openAddProspect}>
                <AnimatePresence mode="wait">
                    <motion.div key={detailId ? 'detail-' + detailId : appPage} initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }} transition={{ duration:0.15 }}>
                        {renderPage()}
                    </motion.div>
                </AnimatePresence>
            </Layout>
        )}
        <AnimatePresence>
            {showAddForm && (
                <motion.div
                    initial={{ opacity:0 }}
                    animate={{ opacity:1 }}
                    exit={{ opacity:0 }}
                    transition={{ duration:0.12 }}
                    className="modal-overlay active" onClick={e => { if (e.target.className === 'modal-overlay active') setShowAddForm(false); }}
                >
                    <motion.div
                        initial={{ opacity:0, scale:0.95, y:8 }}
                        animate={{ opacity:1, scale:1, y:0 }}
                        exit={{ opacity:0, scale:0.95, y:8 }}
                        transition={{ duration:0.15, ease:'easeOut' }}
                        className="modal" style={{maxWidth:520}}
                    >
                    <div className="modal-header">
                        <div className="modal-title">Add Prospect</div>
                        <button className="modal-close" onClick={() => setShowAddForm(false)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                    </div>
                    <div className="modal-body">
                        <div className="field-row">
                            <div className="field"><label className="field-label">First Name</label><input className="field-input" value={addForm.firstName} onChange={e => setAddForm({...addForm, firstName: e.target.value})} placeholder="John" /></div>
                            <div className="field"><label className="field-label">Last Name</label><input className="field-input" value={addForm.lastName} onChange={e => setAddForm({...addForm, lastName: e.target.value})} placeholder="Doe" /></div>
                        </div>
                        <div className="field-row">
                            <div className="field"><label className="field-label">Title</label><input className="field-input" value={addForm.title} onChange={e => setAddForm({...addForm, title: e.target.value})} placeholder="VP Sales" /></div>
                            <CompanyPicker value={addForm.company} onChange={v => setAddForm({...addForm, company: v})} />
                        </div>
                        <div className="field-row">
                            <div className="field"><label className="field-label">Email</label><input className="field-input" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} placeholder="john@acme.com" /></div>
                            <div className="field"><label className="field-label">Phone</label><input className="field-input" value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})} placeholder="+1 555-0100" /></div>
                        </div>
                        <div className="field"><label className="field-label">LinkedIn</label><input className="field-input" value={addForm.linkedin} onChange={e => setAddForm({...addForm, linkedin: e.target.value})} placeholder="linkedin.com/in/johndoe" /></div>
                        <div className="field-row">
                            <div className="field"><label className="field-label">Tier</label><select className="field-input" value={addForm.tier} onChange={e => setAddForm({...addForm, tier: e.target.value})}><option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option></select></div>
                            <div className="field"><label className="field-label">Lifecycle Stage</label><select className="field-input" value={addForm.lifecycleStage} onChange={e => setAddForm({...addForm, lifecycleStage: e.target.value, contactStatus: e.target.value === 'lead' ? '' : addForm.contactStatus})}><option value="lead">Lead</option><option value="mql">MQL</option><option value="sql">SQL</option><option value="opportunity">Opportunity</option><option value="client">Client</option></select></div>
                        </div>
                        {addForm.lifecycleStage !== 'lead' && (
                            <div className="field"><label className="field-label">Status</label><select className="field-input" value={addForm.contactStatus} onChange={e => setAddForm({...addForm, contactStatus: e.target.value})}><option value="">Select status...</option><option value="new">New</option><option value="working">Working</option><option value="nurture">Nurture</option><option value="disqualified">Disqualified</option></select></div>
                        )}
                        <div className="field">
                            <label className="field-label">Lead Source</label>
                            <select className="field-input" value={addForm.leadSource} onChange={e => setAddForm({...addForm, leadSource: e.target.value})}>
                                <option value="">Select source...</option>
                                {getLeadSources(workspace).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div className="field-row">
                            <div className="field">
                                <label className="field-label">Stage</label>
                                <select className="field-input" value={addForm.stage} onChange={e => setAddForm({...addForm, stage: e.target.value})}>
                                    {getStageIds(workspace).filter(s => s !== 'won' && s !== 'lost').map(s => (
                                        <option key={s} value={s}>{getStageLabels(workspace)[s]}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="field"><label className="field-label">Deal Value ({currencySymbol(getCurrencyCode())})</label><input className="field-input" type="number" value={addForm.dealValue} onChange={e => setAddForm({...addForm, dealValue: e.target.value})} placeholder="0" min="0" /></div>
                        </div>
                        <div className="field"><label className="field-label">Angle / Pitch</label><input className="field-input" value={addForm.angle} onChange={e => setAddForm({...addForm, angle: e.target.value})} placeholder="Cost reduction, growth, etc." /></div>
                        <div className="field"><label className="field-label">Country</label><CountrySelect value={addForm.countries} onChange={v => setAddForm({...addForm, countries: v})} /></div>
                        <div className="field"><label className="field-label">Notes</label><textarea className="field-input" value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} placeholder="Research notes, talking points..." rows={3}></textarea></div>
                        <button className="btn-primary" style={{width:'100%',marginTop:8}} onClick={saveAddForm}>Save Prospect</button>
                    </div>
                </motion.div>
            </motion.div>
        )}
        </AnimatePresence>
    </AuthGuard>;
}
