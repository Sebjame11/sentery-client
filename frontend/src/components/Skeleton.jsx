export function SkeletonBox({ width, height, style }) {
    return <div style={{ width: width || '100%', height: height || 12, borderRadius: 6, background: 'var(--bg-sunken)', animation: 'skeletonPulse 1.5s ease-in-out infinite', ...style }} />;
}

export function SkeletonLine({ width, style }) {
    return <SkeletonBox width={width || '100%'} height={10} style={{ marginBottom: 8, ...style }} />;
}

export function SkeletonAvatar({ size }) {
    return <div style={{ width: size || 28, height: size || 28, borderRadius: 8, background: 'var(--bg-sunken)', animation: 'skeletonPulse 1.5s ease-in-out infinite', flexShrink: 0 }} />;
}

export function AppSkeleton() {
    return (
        <div style={{ display:'flex', minHeight:'100vh', background:'var(--bg-app)' }}>
            <div style={{ width:220, background:'var(--bg-surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:16, gap:12 }}>
                <SkeletonBox width={120} height={14} />
                <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:8 }}>
                    <SkeletonBox width={140} height={10} />
                    <SkeletonBox width={100} height={10} />
                    <SkeletonBox width={130} height={10} />
                    <SkeletonBox width={110} height={10} />
                    <SkeletonBox width={150} height={10} />
                    <SkeletonBox width={90} height={10} />
                    <SkeletonBox width={120} height={10} />
                </div>
                <div style={{ marginTop:'auto', display:'flex', alignItems:'center', gap:8 }}>
                    <SkeletonAvatar size={26} />
                    <SkeletonBox width={100} height={10} />
                </div>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', padding:16, gap:16 }}>
                <SkeletonBox width={200} height={16} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                    <SkeletonBox height={100} />
                    <SkeletonBox height={100} />
                    <SkeletonBox height={100} />
                </div>
                <SkeletonBox height={200} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <SkeletonBox height={120} />
                    <SkeletonBox height={120} />
                </div>
            </div>
        </div>
    );
}

export function PageSkeleton({ rows, cards, type }) {
    if (type === 'settings') {
        return (
            <div style={{ animation:'fadeSlideUp 0.3s ease-out', maxWidth:720, display:'flex', flexDirection:'column', gap:16 }}>
                <SkeletonBox height={200} />
                <SkeletonBox height={180} />
                <SkeletonBox height={120} />
                <SkeletonBox height={160} />
            </div>
        );
    }
    return (
        <div style={{ animation:'fadeSlideUp 0.3s ease-out', display:'flex', flexDirection:'column', gap:12 }}>
            <SkeletonBox width={240} height={18} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                {Array.from({ length: cards || 3 }).map((_, i) => (
                    <SkeletonBox key={i} height={120} />
                ))}
            </div>
            <SkeletonBox height={40} />
            {Array.from({ length: rows || 4 }).map((_, i) => (
                <SkeletonBox key={i} height={44} />
            ))}
        </div>
    );
}

export function AuthSkeleton() {
    return (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg-app)' }}>
            <div style={{ width:340, display:'flex', flexDirection:'column', gap:16, alignItems:'center' }}>
                <SkeletonBox width={180} height={20} />
                <SkeletonBox width={260} height={12} />
                <SkeletonBox width={340} height={44} />
                <SkeletonBox width={340} height={44} />
                <SkeletonBox width={340} height={44} />
            </div>
        </div>
    );
}
