/**
 * 🎨 ScoreFlow Designer Guide (美工維護手冊)
 * ========================================
 * 這裡定義了工具列的所有按鈕以及它們在樂譜上的「繪圖方式」。
 */

export const INITIAL_LAYERS = [
    { id: 'draw', name: 'Draw Objects', color: '#ff4757', visible: true, type: 'draw' },
    { id: 'fingering', name: 'Bow/Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
    { id: 'articulation', name: 'Articulation', color: '#10b981', visible: true, type: 'articulation' },
    { id: 'text', name: 'Text', color: '#f59e0b', visible: true, type: 'text' },
    { id: 'layout', name: 'Others', color: '#64748b', visible: true, type: 'layout' }
];

export const TOOLSETS = [
    {
        name: 'Edit',
        type: 'edit',
        tools: [
            { id: 'view', label: 'View', icon: '<path d="M5 12.55V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.55" /><path d="M12 22a2.98 2.98 0 0 0 2.81-2H9.18a3 3 0 0 0 2.82 2z" /><path d="M20 13a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2z" />' },
            { id: 'select', label: 'Select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" />' },
            { id: 'copy', label: 'Copy', icon: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>' },
            { id: 'eraser', label: 'Eraser', icon: '<path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" /><path d="M17 17L7 7" />' }
        ]
    },
    {
        name: 'Pens',
        type: 'draw',
        tools: [
            { id: 'pen', label: 'Pen', icon: '<path d="M12 19l7-7 M19 12l3 3 M22 15l-7 7 M15 22l-3-3 M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M 1 0 L -1 0' } },
            { id: 'highlighter', label: 'Highlighter', icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" /><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="3" opacity="0.3" />' },
            { id: 'line', label: 'Line', icon: '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="1.2" />' }
        ]
    },
    {
        name: 'Bow/Fingering',
        type: 'fingering',
        tools: [
            { id: 'down-bow', label: 'Down', icon: '<path d="M8 11.5h8v4.3 M8 15.8v-4.3 M16 15.8v-4.3" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.26 0.17 L -0.26 -0.26 L 0.26 -0.26 L 0.26 0.17' } },
            { id: 'up-bow', label: 'Up', icon: '<path d="M8 9.5l4 7l4-7" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.26 -0.3 L 0.4 0 L -0.26 -0.3' } },
            { id: 'thumb', label: 'Thumb', icon: '<ellipse cx="12" cy="11" rx="1.9" ry="3.2" fill="none" stroke="currentColor" stroke-width="0.8" /><line x1="12" y1="14.2" x2="12" y2="17.4" stroke="currentColor" stroke-width="0.8" />', draw: { type: 'complex', variant: 'thumb', size: 16 } },
            { id: 'f1', label: '1', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">1</text>', draw: { type: 'text', content: '1', font: '300', size: 18 } },
            { id: 'f2', label: '2', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">2</text>', draw: { type: 'text', content: '2', font: '300', size: 18 } },
            { id: 'f3', label: '3', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">3</text>', draw: { type: 'text', content: '3', font: '300', size: 18 } },
            { id: 'f4', label: '4', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">4</text>', draw: { type: 'text', content: '4', font: '300', size: 18 } },
            { id: 'f5', label: '5', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">5</text>', draw: { type: 'text', content: '5', font: '300', size: 18 } },
            { id: 'f0', label: '0', icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">0</text>', draw: { type: 'text', content: '0', font: '300', size: 18 } },
            { id: 'open_string', label: 'o', icon: '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1.3" />', draw: { type: 'shape', shape: 'circle', radius: 0.5, fill: false } },
            { id: 'i', label: 'I', icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">I</text>', draw: { type: 'text', content: 'I', font: '300', size: 14, fontFace: 'serif' } },
            { id: 'ii', label: 'II', icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">II</text>', draw: { type: 'text', content: 'II', font: '300', size: 14, fontFace: 'serif' } },
            { id: 'iii', label: 'III', icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">III</text>', draw: { type: 'text', content: 'III', font: '300', size: 14, fontFace: 'serif' } },
            { id: 'iv', label: 'IV', icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">IV</text>', draw: { type: 'text', content: 'IV', font: '300', size: 14, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Articulation',
        type: 'articulation',
        tools: [
            { id: 'accent', label: 'Accent', icon: '<path d="M8 9l8 3-8 3" fill="none" stroke="currentColor" stroke-width="1.5"/>', draw: { type: 'path', data: 'M -0.4 -0.2 L 0.4 0 L -0.4 0.2' } },
            { id: 'staccato', label: 'Staccato', icon: '<circle cx="12" cy="12" r="1.5" fill="currentColor" />', draw: { type: 'shape', shape: 'circle', radius: 0.12, fill: true } },
            { id: 'tenuto', label: 'Tenuto', icon: '<line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.8" />', draw: { type: 'path', data: 'M -0.4 0 L 0.4 0' } },
            { id: 'fermata', label: 'Fermata', icon: '<path d="M7 15a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="13.5" r="1.2" fill="currentColor" />', draw: { type: 'complex', variant: 'fermata' } },
            { id: 'sharp', label: 'Sharp', icon: '<text x="12" y="17" font-family="serif" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">♯</text>', draw: { type: 'text', content: '♯', font: '500', size: 18, fontFace: 'serif' } },
            { id: 'flat', label: 'Flat', icon: '<text x="12" y="17" font-family="serif" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">♭</text>', draw: { type: 'text', content: '♭', font: '500', size: 18, fontFace: 'serif' } }        ]
    },
    {
        name: 'Text',
        type: 'text',
        tools: [
            { id: 'text-pizz', label: 'pizz.', draw: { type: 'text', content: 'pizz.', font: 'italic 300', size: 20, fontFace: 'serif' } },
            { id: 'text-arco', label: 'arco.', draw: { type: 'text', content: 'arco.', font: 'italic 300', size: 20, fontFace: 'serif' } },
            { id: 'text-f', label: 'f', draw: { type: 'text', content: 'f', font: 'italic 600', size: 24, fontFace: 'serif' } },
            { id: 'text-p', label: 'p', draw: { type: 'text', content: 'p', font: 'italic 600', size: 24, fontFace: 'serif' } },
            { id: 'text-mf', label: 'mf', draw: { type: 'text', content: 'mf', font: 'italic 600', size: 22, fontFace: 'serif' } },
            { id: 'text-mp', label: 'mp', draw: { type: 'text', content: 'mp', font: 'italic 600', size: 22, fontFace: 'serif' } },
            { id: 'text-rit', label: 'rit.', draw: { type: 'text', content: 'rit.', font: 'italic 300', size: 20, fontFace: 'serif' } },
            { id: 'text-accel', label: 'accel.', draw: { type: 'text', content: 'accel.', font: 'italic 300', size: 20, fontFace: 'serif' } },
            { id: 'text-cresc', label: 'cresc.', draw: { type: 'text', content: 'cresc.', font: 'italic 300', size: 20, fontFace: 'serif' } },
            { id: 'text-dim', label: 'dim.', draw: { type: 'text', content: 'dim.', font: 'italic 300', size: 20, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Others',
        type: 'layout',
        tools: [
            { id: 'anchor', label: 'Anchor', icon: '<circle cx="12" cy="3" r="1.5" fill="currentColor" /><rect x="11.25" y="4.5" width="1.5" height="9" fill="currentColor" /><rect x="7.5" y="10.5" width="9" height="1.5" fill="currentColor" /><path d="M6 12 C6 18, 18 18, 18 12 L16.5 12 C16.5 16.5, 7.5 16.5, 7.5 12 Z" fill="currentColor" />', draw: { type: 'complex', variant: 'anchor' } },
            { id: 'music-anchor', label: 'Music', icon: '<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />', draw: { type: 'special', variant: 'playback' } },
            { id: 'measure', label: 'Measure', icon: '<text x="12" y="16.5" font-size="14" font-family="Outfit" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">#</text>', draw: { type: 'special', variant: 'measure' } }
        ]
    }
];
