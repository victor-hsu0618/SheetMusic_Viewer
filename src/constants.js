/**
 * 🎨 ScoreFlow Designer Guide (美工維護手冊)
 * ========================================
 * 這裡定義了工具列的所有按鈕以及它們在樂譜上的「繪圖方式」。
 */

export const INITIAL_LAYERS = [
    { id: 'draw', name: 'Draw Objects', color: '#ff4757', visible: true, type: 'draw' },
    { id: 'fingering', name: 'Bow/Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
    { id: 'articulation', name: 'Articulations', color: '#10b981', visible: true, type: 'articulation' },
    { id: 'performance', name: 'Performance', color: '#f59e0b', visible: true, type: 'performance' },
    { id: 'other', name: 'Other (Layout)', color: '#64748b', visible: true, type: 'layout' }
];

export const TOOLSETS = [
    {
        name: 'Edit',
        type: 'edit',
        tools: [
            { id: 'select', label: 'Select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" />' },
            { id: 'eraser', label: 'Eraser', icon: '<path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" /><path d="M17 17L7 7" />' },
            { id: 'recycle-bin', label: 'Recycle', icon: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />' }
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
            { id: 'down-bow', label: 'Down', icon: '<path d="M7 11h10v5 M7 16v-5 M17 16v-5" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.3 0.2 L -0.3 -0.3 L 0.3 -0.3 L 0.3 0.2' } },
            { id: 'up-bow', label: 'Up', icon: '<path d="M7 9l5 8l5-8" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.3 -0.35 L 0 0.35 L 0.3 -0.35' } },
            { id: 'pizz', label: 'pizz.', icon: '<text x="12" y="16.5" font-size="14" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">pizz</text>', draw: { type: 'text', content: 'pizz.', font: 'italic 300', size: 22, fontFace: 'serif' } },
            { id: 'arco', label: 'arco.', icon: '<text x="12" y="16.5" font-size="14" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">arco</text>', draw: { type: 'text', content: 'arco.', font: 'italic 300', size: 22, fontFace: 'serif' } },
            { id: 'thumb', label: 'Thumb', icon: '<ellipse cx="12" cy="8" rx="3" ry="5" fill="none" stroke="currentColor" stroke-width="2" /><line x1="12" y1="13" x2="12" y2="15" stroke="currentColor" stroke-width="2" />', draw: { type: 'complex', variant: 'thumb' } },
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
            { id: 'fermata', label: 'Fermata', icon: '<path d="M7 15a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="13.5" r="1.2" fill="currentColor" />', draw: { type: 'complex', variant: 'fermata' } }
        ]
    },
    {
        name: 'Tempo',
        type: 'performance',
        tools: [
            { id: 'tempo-quarter', label: 'q=', icon: '<path d="M10 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11.5 16V4" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'text', content: 'q=', font: '300', size: 20 } },
            { id: 'tempo-text', label: 'Tempo', icon: '<text x="12" y="16" font-size="10" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">Tempo</text>', draw: { type: 'special', variant: 'input-text' } },
            { id: 'rit', label: 'rit.', icon: '<text x="12" y="16.5" font-size="14" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">rit.</text>', draw: { type: 'text', content: 'rit.', font: 'italic 300', size: 22, fontFace: 'serif' } },
            { id: 'accel', label: 'accel.', icon: '<text x="12" y="16.5" font-size="12" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">accel.</text>', draw: { type: 'text', content: 'accel.', font: 'italic 300', size: 22, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Dynamic',
        type: 'performance',
        tools: [
            { id: 'forte', label: 'f', icon: '<text x="12" y="20" font-family="serif" font-style="italic" font-weight="300" font-size="20" text-anchor="middle" fill="currentColor" stroke="none">f</text>', draw: { type: 'text', content: 'f', font: 'italic 300', size: 24, fontFace: 'serif' } },
            { id: 'piano', label: 'p', icon: '<text x="12" y="20" font-family="serif" font-style="italic" font-weight="300" font-size="20" text-anchor="middle" fill="currentColor" stroke="none">p</text>', draw: { type: 'text', content: 'p', font: 'italic 300', size: 24, fontFace: 'serif' } },
            { id: 'text', label: 'Exp.', icon: '<text x="12" y="18" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">T</text>', draw: { type: 'special', variant: 'input-text' } }
        ]
    },
    {
        name: 'Anchor',
        type: 'layout',
        tools: [
            { id: 'anchor', label: 'Anchor', icon: '<circle cx="12" cy="3" r="1.5" fill="currentColor" /><rect x="11.25" y="4.5" width="1.5" height="9" fill="currentColor" /><rect x="7.5" y="10.5" width="9" height="1.5" fill="currentColor" /><path d="M6 12 C6 18, 18 18, 18 12 L16.5 12 C16.5 16.5, 7.5 16.5, 7.5 12 Z" fill="currentColor" />', draw: { type: 'complex', variant: 'anchor' } },
            { id: 'measure', label: 'Measure', icon: '<text x="12" y="16.5" font-size="14" font-family="Outfit" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">#</text>', draw: { type: 'special', variant: 'measure' } }
        ]
    }
];
