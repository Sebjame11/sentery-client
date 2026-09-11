import useStore from '../store/useStore';
import { showToast } from './Toast';

export default function ExportCompaniesCSV() {
    const companies = useStore(s => s.companies);

    const exportCSV = () => {
        if (!companies.length) { showToast('No companies to export'); return; }
        const headers = ['Name','Domain','Industry','Size','Annual Revenue','Phone','Address','City','Region','Country','Description','LinkedIn','Type','Outbound Type','Tags'];
        const rows = companies.map(c => [
            c.name, c.domain || '', c.industry || '', c.companySize || '', c.annualRevenue || '',
            c.phone || '', c.address || '', c.city || '', c.region || '', c.country || '',
            (c.description || '').replace(/"/g, '""'), c.linkedinUrl || '', c.companyType || 'prospect',
            c.customFields?.outboundType || '',
            (c.tags || []).join('; ')
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sentery-companies-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(companies.length + ' companies exported to CSV');
    };

    const exportJSON = () => {
        if (!companies.length) { showToast('No companies to export'); return; }
        const blob = new Blob([JSON.stringify(companies, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sentery-companies-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Companies exported as JSON');
    };

    return (
        <div style={{display:'flex',gap:6}}>
            <button className="btn-secondary" onClick={exportCSV} style={{fontSize:'0.78rem'}}>Export CSV</button>
            <button className="btn-secondary" onClick={exportJSON} style={{fontSize:'0.78rem'}}>Export JSON</button>
        </div>
    );
}
