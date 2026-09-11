import { useEffect } from 'react';

let modalFn = null;

export function openModalFn(title, html) {
    if (modalFn) modalFn(title, html);
}

export function closeModalFn() {
    if (modalFn) modalFn(null, null);
}

export default function Modal() {
    useEffect(() => {
        modalFn = (title, html) => {
            const overlay = document.getElementById('modal');
            const titleEl = document.getElementById('modalTitle');
            const bodyEl = document.getElementById('modalBody');
            if (title === null) {
                overlay.classList.remove('active');
            } else {
                titleEl.textContent = title;
                bodyEl.innerHTML = html;
                overlay.classList.add('active');
            }
        };
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('modal');
                if (overlay) overlay.classList.remove('active');
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => {
            modalFn = null;
            document.removeEventListener('keydown', handleKey);
        };
    }, []);

    return (
        <div className="modal-overlay" id="modal" onClick={(e) => {
            if (e.target.id === 'modal') e.target.classList.remove('active');
        }}>
            <div className="modal">
                <div className="modal-header">
                    <div className="modal-title" id="modalTitle"></div>
                    <button className="modal-close" onClick={() => {
                        document.getElementById('modal').classList.remove('active');
                    }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6 6 18M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div className="modal-body" id="modalBody"></div>
            </div>
        </div>
    );
}
