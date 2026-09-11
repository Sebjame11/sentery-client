import toast, { Toaster } from 'react-hot-toast';

export { Toaster };
export const showToast = toast;

export default function Toast() {
    return (
        <Toaster
            position="bottom-center"
            toastOptions={{
                duration: 1800,
                style: {
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    fontSize: 13,
                    padding: '10px 16px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                },
            }}
        />
    );
}
