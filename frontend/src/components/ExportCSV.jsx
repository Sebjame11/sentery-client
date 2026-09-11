import useStore from '../store/useStore';
import { STAGE_LABELS } from '../utils/constants';
import { showToast } from './Toast';

export default function ExportCSV() {
    const { prospects } = useStore();

    const exportCSV = () => {
        if (!prospects.length) { showToast('No prospects to export'); return; }
        const headers = ['Name','Title','Company','Email','Phone','LinkedIn','Tier','Stage','Deal Value','Angle','Notes','Tags','Created','Last Touch','Touchpoints'];
        const rows = prospects.map(p => [
            p.name, p.title || '', p.company || '', p.email || '', p.phone || '', p.linkedin || '',
            p.tier, STAGE_LABELS[p.stage] || p.stage, p.dealValue || 0,
            p.angle || '', (p.notes || '').replace(/"/g, '""'),
            (p.tags || []).map(t => t.name).join('; '),
            p.createdAt?.slice(0, 10) || '', p.lastTouch?.slice(0, 10) || '',
            p.touchpoints.length
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vaulty-nodey-prospects-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(prospects.length + ' prospects exported to CSV');
    };

    const exportJSON = () => {
        if (!prospects.length) { showToast('No prospects to export'); return; }
        const blob = new Blob([JSON.stringify(prospects, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vaulty-nodey-prospects-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showToast('Prospects exported as JSON');
    };

    return (
        <div style={{display:'flex',gap:6}}>
            <button className="btn-secondary" onClick={exportCSV} style={{fontSize:'0.78rem'}}>Export CSV</button>
            <button className="btn-secondary" onClick={exportJSON} style={{fontSize:'0.78rem'}}>Export JSON</button>
        </div>
    );
}
