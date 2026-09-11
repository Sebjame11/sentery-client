import React from 'react';

export const AVATAR_STYLES = [
    { id: 'avataaars', label: 'Cartoon' },
    { id: 'adventurer', label: 'Adventurer' },
    { id: 'notionists', label: 'Flat' },
    { id: 'micah', label: '3D' },
    { id: 'pixel-art', label: 'Pixel' },
    { id: 'bottts', label: 'Robot' },
    { id: 'fun-emoji', label: 'Emoji' },
    { id: 'lorelei', label: 'Lorelei' },
    { id: 'personas', label: 'Persona' },
    { id: 'rings', label: 'Rings' },
];

export const AVATAR_BG = 'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf';

export function dicebearUrl(style, seed, size = 96) {
    const s = encodeURIComponent(String(seed || 'sentery'));
    const st = AVATAR_STYLES.some(x => x.id === style) ? style : 'adventurer';
    return `https://api.dicebear.com/9.x/${st}/svg?seed=${s}&backgroundColor=${AVATAR_BG}&size=${size}&radius=12`;
}

export function randomAvatarStyle() {
    return AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)].id;
}

export function randomSeed() {
    const words = ['ember', 'oak', 'storm', 'river', 'fox', 'luna', 'nova', 'blaze', 'moss', 'fern', 'sage', 'cove', 'drift', 'harbor', 'lynx', 'maple', 'onyx', 'pine', 'quartz', 'raven', 'summit', 'tide', 'valley', 'willow'];
    return words[Math.floor(Math.random() * words.length)] + '-' + Math.floor(Math.random() * 1000);
}

export default function UserAvatar({ src, name, email, size = 28, radius = 8, style = {} }) {
    const initials = (name || email || '?')
        .split(' ')
        .map(s => s[0])
        .filter(Boolean)
        .join('')
        .slice(0, 2)
        .toUpperCase();
    const common = {
        width: size, height: size, borderRadius: radius, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, size * 0.42), fontWeight: 600,
        overflow: 'hidden', background: 'var(--accent-tint)', color: 'var(--accent)',
        ...style,
    };
    if (src) {
        return (
            <img
                src={src}
                alt={name || email || 'avatar'}
                style={{ ...common, objectFit: 'cover', background: 'transparent' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
            />
        );
    }
    return <div style={common}>{initials}</div>;
}