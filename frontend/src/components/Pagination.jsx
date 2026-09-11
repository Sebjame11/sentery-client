import { useState, useMemo } from 'react';

const PAGE_SIZE = 25;

export default function Pagination({ total, page, onChange }) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), totalPages);

    const pages = useMemo(() => {
        const arr = [];
        const showEllipsisStart = safePage > 3;
        const showEllipsisEnd = safePage < totalPages - 2;

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) arr.push(i);
        } else {
            arr.push(1);
            if (showEllipsisStart) arr.push('...');
            const start = Math.max(2, safePage - 1);
            const end = Math.min(totalPages - 1, safePage + 1);
            for (let i = start; i <= end; i++) arr.push(i);
            if (showEllipsisEnd) arr.push('...');
            if (totalPages > 1) arr.push(totalPages);
        }
        return arr;
    }, [safePage, totalPages]);

    if (total <= PAGE_SIZE) return null;

    const from = (safePage - 1) * PAGE_SIZE + 1;
    const to = Math.min(safePage * PAGE_SIZE, total);

    return (
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',flexShrink:0}}>
            <span style={{fontSize:12,color:'var(--text-tertiary)'}}>
                Showing {from}–{to} of {total}
            </span>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
                <button
                    onClick={() => onChange(safePage - 1)}
                    disabled={safePage <= 1}
                    style={{
                        padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
                        background:'var(--bg-surface)',color: safePage <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                        cursor: safePage <= 1 ? 'default' : 'pointer',fontSize:12,fontWeight:500,
                        fontFamily:'inherit',opacity: safePage <= 1 ? 0.5 : 1,
                    }}
                >Prev</button>
                {pages.map((p, i) => p === '...' ? (
                    <span key={'e'+i} style={{padding:'0 4px',fontSize:12,color:'var(--text-tertiary)'}}>…</span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onChange(p)}
                        style={{
                            minWidth:28,height:28,borderRadius:6,border:'1px solid',
                            background: p === safePage ? 'var(--accent)' : 'var(--bg-surface)',
                            color: p === safePage ? '#fff' : 'var(--text-primary)',
                            borderColor: p === safePage ? 'var(--accent)' : 'var(--border)',
                            cursor:'pointer',fontSize:12,fontWeight: p === safePage ? 600 : 400,
                            fontFamily:'inherit',
                        }}
                    >{p}</button>
                ))}
                <button
                    onClick={() => onChange(safePage + 1)}
                    disabled={safePage >= totalPages}
                    style={{
                        padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
                        background:'var(--bg-surface)',color: safePage >= totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
                        cursor: safePage >= totalPages ? 'default' : 'pointer',fontSize:12,fontWeight:500,
                        fontFamily:'inherit',opacity: safePage >= totalPages ? 0.5 : 1,
                    }}
                >Next</button>
            </div>
        </div>
    );
}

export { PAGE_SIZE };
