import { useState, useEffect } from 'react';
import { SenteryWordmark } from './SenteryLogo';

let loadingFn = null;

export function showLoading(onComplete) {
    if (loadingFn) loadingFn(onComplete);
}

export default function LoadingScreen() {
    const [active, setActive] = useState(false);
    const [status, setStatus] = useState('Initializing');
    const [onComplete, setOnComplete] = useState(null);

    useEffect(() => {
        loadingFn = (cb) => {
            setActive(true);
            setOnComplete(() => cb);
            setStatus('Decrypting vault');
            let i = 0;
            const statuses = ['Decrypting vault', 'Loading pipeline', 'Syncing data', 'Ready'];
            const interval = setInterval(() => {
                i++;
                if (i < statuses.length) setStatus(statuses[i]);
            }, 600);
            setTimeout(() => {
                clearInterval(interval);
                setActive(false);
                if (cb) cb();
            }, 2500);
        };
        return () => { loadingFn = null; };
    }, []);

    useEffect(() => {
        if (!active) return;
        const bar = document.getElementById('loadingBar');
        if (bar) {
            bar.style.width = '0';
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    bar.style.width = '100%';
                });
            });
        }
    }, [active]);

    return (
        <div className={'loading-screen' + (active ? ' active' : '')}>
            <SenteryWordmark height={32} className="loading-logo" />
            <div className="loading-bar-wrap">
                <div className="loading-bar-track">
                    <div className="loading-bar-fill" id="loadingBar"></div>
                </div>
            </div>
            <div className="loading-status">{status}<span className="loading-dots"></span></div>
        </div>
    );
}
