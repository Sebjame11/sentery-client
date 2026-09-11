import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { useAuth } from '../store/AuthContext';
import { SenteryWordmark } from './SenteryLogo';
import AIAssistant from './AIAssistant';
import ProspectSearchModal from './ProspectSearchModal';
import UserAvatar from './UserAvatar';

const NAV_ITEMS = [
    { section: 'Main' },
    { page: 'dashboard', label: 'Dashboard', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg> },
    { page: 'digest', label: 'Daily Digest', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { page: 'pipeline', label: 'Pipeline', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="17" y="1" width="6" height="20" rx="1"/></svg> },
    { page: 'calendar', label: 'Calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { page: 'prospects', label: 'Prospects', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { page: 'outreach', label: 'Outreach', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg> },
    { page: 'analytics', label: 'Analytics', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg> },
    { page: 'activity', label: 'Activity', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { page: 'reminders', label: 'Reminders', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { divider: true },
    { section: 'CRM' },
    { page: 'contacts', label: 'Contacts', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { page: 'companies', label: 'Companies', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { page: 'segments', label: 'Segments', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 14l2 2 4-4"/></svg> },
    { divider: true },
    { section: 'Deals' },
    { page: 'dealrooms', label: 'Deal Rooms', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
    { page: 'winloss', label: 'Win/Loss', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { page: 'territory', label: 'Territory', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
    { page: 'competitors', label: 'Competitors', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg> },
    { divider: true },
    { section: 'Tools' },
    { page: 'playbooks', label: 'Playbooks', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> },
    { page: 'sequences', label: 'Sequences', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg> },
    { page: 'apollo_sequences', label: 'Apollo Sequences', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> },
    { page: 'goals', label: 'Activity Goals', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> },
    { page: 'meetings', label: 'Meetings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
   { page: 'emails', label: 'Emails', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg> },
    { page: 'notes', label: 'Secure Notes', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
    { page: 'duediligence', label: 'Due Diligence', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><path d="M11 8v6"/><path d="M8 11h6"/></svg> },
    { divider: true },
    { section: 'Account' },
    { page: 'customfields', label: 'Custom Fields', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> },
    { page: 'settings', label: 'Settings', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

const PAGE_TITLES = { dashboard:'Dashboard', pipeline:'Pipeline', calendar:'Calendar', prospects:'Prospects', outreach:'Outreach', analytics:'Analytics', activity:'Activity', reminders:'Reminders', notes:'Secure Notes', duediligence:'Due Diligence', settings:'Settings', winloss:'Win/Loss Analysis', playbooks:'Sales Playbooks', dealrooms:'Deal Rooms', territory:'Territory View', competitors:'Competitor Intelligence', sequences:'Email Sequences', apollo_sequences:'Apollo Sequences', digest:'Daily Digest', goals:'Activity Goals', customfields:'Custom Fields', contacts:'Contacts', companies:'Companies', meetings:'Meetings', emails:'Emails', segments:'Segments' };

export default function Layout({ children, onAddProspect }) {
    const { appPage, setAppPage, theme, setTheme } = useStore();
    const { workspaces, workspace, setCurrentWorkspace, defaultWorkspaceId, setDefaultWorkspace } = useStore();
    const { user, signOut } = useAuth();
    const isDark = theme === 'dark';
    const [wsOpen, setWsOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);

    useEffect(() => {
        const name = workspace?.company_profile?.company_name || workspace?.name || 'Sentery';
        const page = PAGE_TITLES[appPage] || 'Dashboard';
        document.title = `${page} · ${name}`;
    }, [appPage, workspace?.id, workspace?.name, workspace?.company_profile?.company_name]);

    return (
        <>
            <div className="app-shell">
                <aside className="sidebar">
                    <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                        {workspace?.company_profile?.logo_url ? (
                            <img src={workspace.company_profile.logo_url} alt="" style={{width:28,height:28,borderRadius:6,objectFit:'cover',flexShrink:0}} />
                        ) : (
                            <div style={{width:28,height:28,borderRadius:6,background:'var(--accent-tint)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0}}>
                                {(workspace?.company_profile?.company_name || workspace?.name || 'W')[0].toUpperCase()}
                            </div>
                        )}
                        <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-primary)',lineHeight:1.3}}>
                                {workspace?.company_profile?.company_name || workspace?.name || 'Sentery'}
                            </div>
                            <div style={{fontSize:10,color:'var(--text-tertiary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                {workspace?.company_profile?.industry || 'Workspace'}
                            </div>
                        </div>
                        <span onClick={() => useStore.getState().setPage('home')} style={{fontSize:8,color:'var(--text-tertiary)',cursor:'pointer',flexShrink:0,opacity:0.4,fontWeight:600}}>S</span>
                    </div>

                    {workspace && (
                        <div style={{position:'relative',padding:'0 12px',marginBottom:8,marginTop:8}}>
                            <button style={{
                                width:'100%',display:'flex',alignItems:'center',gap:6,
                                padding:'7px 10px',fontSize:12,fontWeight:500,
                                background:'var(--bg-sunken)',border:'none',borderRadius:10,
                                cursor:'pointer',color:'var(--text-primary)',
                                transition:'background 0.1s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                                onClick={() => setWsOpen(!wsOpen)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                <span style={{flex:1,textAlign:'left',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{workspace.name}</span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="10" height="10" style={{opacity:0.5,flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            {wsOpen && (
                                <div style={{
                                    position:'absolute',top:'calc(100% + 4px)',left:12,right:12,
                                    background:'var(--bg-surface)',border:'1px solid var(--border)',
                                    borderRadius:12,boxShadow:'0 6px 24px rgba(0,0,0,0.1)',
                                    zIndex:100,overflow:'hidden',padding:4,
                                }}>
                                    {workspaces.map(ws => {
                                        const p = ws.company_profile || {};
                                        return (
                                        <button key={ws.id} style={{
                                            width:'100%',display:'flex',alignItems:'center',gap:8,
                                            padding:'8px 10px',fontSize:12,fontWeight:500,
                                            background: ws.id === workspace?.id ? 'var(--accent-tint)' : 'transparent',
                                            color: ws.id === workspace?.id ? 'var(--accent)' : 'var(--text-primary)',
                                            border:'none',borderRadius:8,cursor:'pointer',
                                            transition:'background 0.1s',
                                        }}
                                            onMouseEnter={e => { if (ws.id !== workspace?.id) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                                            onMouseLeave={e => { if (ws.id !== workspace?.id) e.currentTarget.style.background = 'transparent'; }}
                                            onClick={() => { setCurrentWorkspace(ws); setWsOpen(false); }}>
                                            {p.logo_url ? (
                                                <img src={p.logo_url} alt="" style={{width:16,height:16,borderRadius:4,objectFit:'cover'}} />
                                            ) : (
                                                <div style={{width:16,height:16,borderRadius:4,background:'var(--accent-tint)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,flexShrink:0}}>
                                                    {(p.company_name || ws.name)[0].toUpperCase()}
                                                </div>
                                            )}
                                            <div style={{flex:1,minWidth:0}}>
                                                <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'left'}}>{p.company_name || ws.name}</div>
                                                {p.industry && <div style={{fontSize:10,color:'var(--text-tertiary)',textAlign:'left'}}>{p.industry}</div>}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDefaultWorkspace(defaultWorkspaceId === ws.id ? null : ws.id); }}
                                                title={defaultWorkspaceId === ws.id ? 'Remove default' : 'Set as default'}
                                                style={{
                                                    background:'none',border:'none',cursor:'pointer',padding:0,
                                                    color: defaultWorkspaceId === ws.id ? '#f59e0b' : 'var(--text-tertiary)',
                                                    flexShrink:0,lineHeight:0,fontSize:14,
                                                }}
                                            >
                                                {defaultWorkspaceId === ws.id ? '★' : '☆'}
                                            </button>
                                        </button>
                                        );
                                    })}
                                    <div style={{borderTop:'1px solid var(--border)',marginTop:4,paddingTop:4}}>
                                        <button style={{
                                            width:'100%',display:'flex',alignItems:'center',gap:8,
                                            padding:'8px 10px',fontSize:12,fontWeight:500,
                                            color:'var(--text-tertiary)',border:'none',borderRadius:8,cursor:'pointer',
                                            background:'transparent',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
                                            onClick={() => { setWsOpen(false); setAppPage('settings'); }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                            New Workspace
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <nav className="sidebar-nav">
                        {NAV_ITEMS.map((item, i) => {
                            if (item.divider) return <div key={i} className="nav-divider"></div>;
                            if (item.section) return <div key={i} className="nav-section">{item.section}</div>;
                            return (
                                <button key={item.page} className={'nav-item' + (appPage === item.page ? ' active' : '')} onClick={() => setAppPage(item.page)}>
                                    {item.icon}{item.label}
                                </button>
                            );
                        })}
                    </nav>

                    {user && (
                        <div style={{padding:'6px 8px 8px',borderTop:'1px solid var(--border)',marginTop:'auto',position:'relative'}}>
                            <button style={{
                                width:'100%',display:'flex',alignItems:'center',gap:9,
                                padding:'8px 8px',fontSize:13,fontWeight:500,
                                background:'none',border:'none',borderRadius:10,
                                cursor:'pointer',color:'var(--text-primary)',
                                transition:'background 0.1s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                onClick={() => setUserMenuOpen(!userMenuOpen)}>
                                <div style={{
                                    width:28,height:28,borderRadius:8,
                                    background:'var(--accent-tint)',color:'var(--accent)',
                                    display:'flex',alignItems:'center',justifyContent:'center',
                                    fontSize:13,fontWeight:600,flexShrink:0,overflow:'hidden',
                                }}>
                                    <UserAvatar src={user.user_metadata?.avatar_url} name={user.user_metadata?.display_name} email={user.email} size={28} radius={8} />
                                </div>
                                <span style={{flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'left',fontWeight:500}}>
                                    {user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'}
                                </span>
                            </button>
                            {userMenuOpen && (
                                <div style={{
                                    position:'absolute',bottom:'calc(100% + 4px)',left:8,right:8,
                                    background:'var(--bg-surface)',border:'1px solid var(--border)',
                                    borderRadius:12,boxShadow:'0 6px 24px rgba(0,0,0,0.1)',
                                    zIndex:100,overflow:'hidden',padding:4,
                                }}>
                                    <div style={{padding:'10px 12px 6px'}}>
                                        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',lineHeight:1.3}}>{user.user_metadata?.display_name || 'User'}</div>
                                        <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:1}}>{user.email}</div>
                                    </div>
                                    <div style={{borderTop:'1px solid var(--border)',marginTop:6,paddingTop:4}}>
                                        <button style={{
                                            width:'100%',display:'flex',alignItems:'center',gap:8,
                                            padding:'8px 10px',fontSize:12,fontWeight:500,
                                            color:'var(--text-primary)',border:'none',borderRadius:8,cursor:'pointer',
                                            background:'transparent',transition:'background 0.1s',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-sunken)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => { setUserMenuOpen(false); setAppPage('settings'); }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                            Settings
                                        </button>
                                        <button style={{
                                            width:'100%',display:'flex',alignItems:'center',gap:8,
                                            padding:'8px 10px',fontSize:12,fontWeight:500,
                                            color:'var(--danger)',border:'none',borderRadius:8,cursor:'pointer',
                                            background:'transparent',transition:'background 0.1s',
                                        }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--danger-tint)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => { setUserMenuOpen(false); signOut(); useStore.getState().setPage('home'); }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                                            Sign Out
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </aside>
                <main className="app-main">
                    <header className="app-header">
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                            {workspace?.company_profile?.company_name && (
                                <span style={{fontSize:11,color:'var(--text-tertiary)',padding:'2px 8px',background:'var(--bg-sunken)',borderRadius:6,fontWeight:500}}>
                                    {workspace.company_profile.company_name}
                                </span>
                            )}
                        </div>
                        <SenteryWordmark height={28} style={{opacity:isDark ? 0.9 : 0.65,position:'absolute',left:'calc(50vw - var(--sidebar-w))',top:'50%',transform:'translate(-50%,-50%)'}} />
                        <div className="app-header-actions">
                            <button className={"btn-icon" + (aiOpen ? " active" : "")} onClick={() => setAiOpen(!aiOpen)} title="AI Assistant" style={aiOpen ? {background:'var(--accent-tint)',color:'var(--accent)'} : {}}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="18" height="18"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>
                            </button>
                            <button className="btn-icon" onClick={() => setTheme(isDark ? 'light' : 'dark')} title="Toggle theme">
                                {isDark ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                        <circle cx="12" cy="12" r="5"/>
                                        <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                                    </svg>
                                )}
                            </button>
                            {['prospects','contacts','pipeline','dashboard'].includes(appPage) && (
                                <>
                                    <button className="btn-primary" onClick={onAddProspect}>+ Add Prospect</button>
                                    <button className="btn-secondary" onClick={() => setSearchOpen(true)} style={{display:'flex',alignItems:'center',gap:4}}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                        Find Prospects
                                    </button>
                                </>
                            )}
                        </div>
                    </header>
                    <div className="app-content">
                        {children}
                    </div>
                </main>
            </div>
            <AIAssistant open={aiOpen} onToggle={() => setAiOpen(!aiOpen)} />
            {searchOpen && <ProspectSearchModal onClose={() => setSearchOpen(false)} />}
        </>
    );
}
