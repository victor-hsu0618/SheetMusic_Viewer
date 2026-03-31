/**
 * 🎨 ScoreFlow Designer Guide (美工維護手冊)
 * ========================================
 * 這裡定義了工具列的所有按鈕以及它們在樂譜上的「繪圖方式」。
 */

export const INITIAL_LAYERS = [
    { id: 'draw', name: 'Pens', color: '#1d4ed8', visible: true, type: 'draw' },
    { id: 'fingering', name: 'B.Fingering', color: '#be123c', visible: true, type: 'fingering' },
    { id: 'articulation', name: 'Articulation', color: '#15803d', visible: true, type: 'articulation' },
    { id: 'text', name: 'Text', color: '#b45309', visible: true, type: 'text' },
    { id: 'others', name: 'Others', color: '#94a3b8', visible: true, type: 'others' }
];

// Cycle tool groups: clicking a stamp cycles it to the next type in the group
export const CYCLE_GROUPS = [
    ['up-bow', 'down-bow'],
    ['thumb', 'f1', 'f2', 'f3', 'f4', 'f5'],
];

// Cloak groups: stamps can be tagged with a hiddenGroup to control visibility
export const CLOAK_GROUPS = [
    { id: 'black', label: '黑色斗篷', color: '#374151' },
    { id: 'red',   label: '紅色斗篷', color: '#dc2626' },
    { id: 'blue',  label: '藍色斗篷', color: '#2563eb' },
];

export const TOOLSETS = [
    {
        name: 'Edit',
        type: 'edit',
        tools: [
            { id: 'view', label: 'View', icon: '<path d="M5 12.55V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.55" /><path d="M12 22a2.98 2.98 0 0 0 2.81-2H9.18a3 3 0 0 0 2.82 2z" /><path d="M20 13a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2z" />' },
            { id: 'select', label: 'Select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" />' },
            { id: 'pen', label: 'Pen', isPenTrigger: true, icon: '<path d="M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 19l7-7l3 3l-7 7l-3-3z" fill="#1a1a1a" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>', draw: { type: 'path', color: '#1a1a1a' } },
            { id: 'cycle', label: 'Cycle', icon: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><polyline points="21 3 21 8 16 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
            { id: 'eraser', label: 'Eraser', icon: '<path d="M16.5 4.5 L19.5 7.5 L9 18 L4.5 18 L4.5 13.5 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><line x1="12" y1="7.5" x2="15" y2="10.5" stroke="currentColor" stroke-width="1.6"/><line x1="4.5" y1="18" x2="19.5" y2="18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
            { id: 'stamp-palette', label: 'Stamps', isStampTrigger: true, icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>' },
            { id: 'scroll-bar', label: 'Others', icon: '<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>' }
        ]
    },
    {
        name: 'Pens',
        type: 'draw',
        tools: [
            { id: 'pen',        label: 'Ballpoint', row: 1, icon: '<path d="M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 19l7-7l3 3l-7 7l-3-3z" fill="currentColor" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/>', draw: { type: 'path' } },
            { id: 'fine-pen',   label: 'Fine',      row: 1, icon: '<path d="M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="0.6"/><path d="M12 19l7-7l3 3l-7 7l-3-3z" fill="currentColor" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>', draw: { type: 'path' } },
            { id: 'marker-pen', label: 'Marker',    row: 1, icon: '<rect x="9.5" y="2" width="5" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 16h5v3.5L12 22l-2.5-2.5V16z" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="1.2"/>', draw: { type: 'path' } },
            { id: 'brush-pen',    label: 'Brush',    row: 1, icon: '<path d="M16 4c1-1 3 1 2 2L7 17c-1 1-3 2-4 3 1-2 2-3 3-4L16 4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 20c0 0 2-1 3-2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>', draw: { type: 'path' } },
            { id: 'fountain-pen', label: 'Fountain', row: 1, icon: '<path d="M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 20l9-9 2 2-9 9-2-2z" fill="currentColor" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/><line x1="11.2" y1="20.5" x2="13.2" y2="22.5" stroke="rgba(255,255,255,0.8)" stroke-width="0.9"/>', draw: { type: 'path' } },
            { id: 'pencil-pen',   label: 'Pencil',   row: 1, icon: '<path d="M17 3.5L20.5 7L9 18.5H5.5V15L17 3.5Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M17 3.5L20.5 7L21.5 6L18 2.5Z" fill="currentColor" opacity="0.6"/><path d="M5.5 15L4 20L9 18.5Z" fill="currentColor" opacity="0.4"/><line x1="6.5" y1="15.5" x2="17.5" y2="4.5" stroke="currentColor" stroke-width="0.5" opacity="0.35"/>', draw: { type: 'path' } },
            { id: 'dashed-pen', label: 'Dashed', row: 1, icon: '<path d="M4 12h16" stroke="currentColor" stroke-width="2" stroke-dasharray="3,3"/><path d="M12 19l7-7 M18 13L16.5 5.5L2 2l3.5 14.5L13 18" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>', draw: { type: 'path', dashed: true } },
            { id: 'arrow-pen', label: 'Arrow', row: 1, icon: '<path d="M3 13h15 M14 9l4 4-4 4" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M12 19l7-7 M18 13L16.5 5.5L2 2l3.5 14.5L13 18" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>', draw: { type: 'path', arrow: true } },
            { id: 'highlighter', label: 'Highlighter', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#fde047" opacity="0.4" stroke="currentColor" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#fde047" stroke-width="4" opacity="0.6" />', draw: { type: 'highlighter', color: '#fde047' } },
            { id: 'highlighter-red', label: 'H.Red', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#be123c" opacity="0.3" stroke="#be123c" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#be123c" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#be123c' } },
            { id: 'highlighter-blue', label: 'H.Blue', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#1d4ed8" opacity="0.3" stroke="#1d4ed8" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#1d4ed8" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#1d4ed8' } },
            { id: 'highlighter-green', label: 'H.Green', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#15803d" opacity="0.3" stroke="#15803d" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#15803d" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#15803d' } },
            { id: 'line',          label: 'Line',    row: 3, icon: '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="1.2" />' },
            { id: 'slur',          label: 'Slur',    row: 3, icon: '<path d="M4 8c4 8 12 8 16 0" fill="none" stroke="currentColor" stroke-width="1.5" />', draw: { type: 'path' } },
            { id: 'bracket-left',  label: '[',         row: 3, icon: '<path d="M15 5 L9 5 L9 19 L15 19" fill="none" stroke="currentColor" stroke-width="2" />', draw: { type: 'path' } },
            { id: 'bracket-right', label: ']',         row: 3, icon: '<path d="M9 5 L15 5 L15 19 L9 19" fill="none" stroke="currentColor" stroke-width="2" />', draw: { type: 'path' } },
            { id: 'curly-left',    label: '{',         row: 3, icon: '<path d="M14 4 C11 4 11 7 11 10 C11 11.5 10 12 9 12 C10 12 11 12.5 11 14 C11 17 11 20 14 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />', draw: { type: 'path' } },
            { id: 'curly-right',   label: '}',         row: 3, icon: '<path d="M10 4 C13 4 13 7 13 10 C13 11.5 14 12 15 12 C14 12 13 12.5 13 14 C13 17 13 20 10 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />', draw: { type: 'path' } },
            { id: 'rect-shape',    label: 'Rect',      row: 3, icon: '<rect x="3" y="6" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>', draw: { type: 'path' } },
            { id: 'circle-shape',  label: 'Circle',    row: 3, icon: '<ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor" stroke-width="1.8"/>', draw: { type: 'path' } },
            { id: 'cover-brush',     label: 'Cover',  row: 3, icon: '<rect x="3" y="14" width="18" height="5" rx="1.5" fill="white" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="4" width="6" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="9" y1="9" x2="15" y2="9" stroke="currentColor" stroke-width="1"/>', draw: { type: 'cover' } },
            { id: 'correction-pen',  label: 'Fix',    row: 3, icon: '<g transform="rotate(225 12 12)"><rect x="10.25" y="18" width="3.5" height="1" fill="#D1D5DB" stroke="#6B7280" stroke-width="0.8"/><rect x="13" y="18.5" width="0.6" height="4" rx="0.3" fill="#6B7280"/><path d="M10.25 19H13.75V22.5C13.75 23.3 13.1 24 12 24C10.9 24 10.25 23.3 10.25 22.5V19Z" fill="#E5E7EB" stroke="#6B7280" stroke-width="0.8"/><rect x="10.5" y="6" width="3" height="12" fill="currentColor" stroke="#6B7280" stroke-width="0.8"/><path d="M10.5 6L11 4.5H13L13.5 6H10.5Z" fill="#D1D5DB" stroke="#6B7280" stroke-width="0.8"/><rect x="11.2" y="3.5" width="1.6" height="1" rx="0.3" fill="#E5E7EB" stroke="#6B7280" stroke-width="0.8"/><path d="M11.5 3.5V0.5C11.5 0.22 11.72 0 12 0C12.28 0 12.5 0.22 12.5 0.5V3.5H11.5Z" fill="#FFFFFF" stroke="#6B7280" stroke-width="0.8"/></g>', draw: { type: 'correction' } },
        ]
    },
    {
        name: 'B.Fingering',
        type: 'fingering',
        tools: [
            { id: 'thumb', label: 'Thumb', row: 1, icon: '<ellipse cx="12" cy="12" rx="1.9" ry="3.2" fill="none" stroke="currentColor" stroke-width="0.8" /><line x1="12" y1="15.2" x2="12" y2="18.4" stroke="currentColor" stroke-width="0.8" />', draw: { type: 'complex', variant: 'thumb', size: 15 } },
            { id: 'f1', label: '1', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">1</text>', draw: { type: 'text', content: '1', font: '300', size: 20 } },
            { id: 'f2', label: '2', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">2</text>', draw: { type: 'text', content: '2', font: '300', size: 20 } },
            { id: 'f3', label: '3', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">3</text>', draw: { type: 'text', content: '3', font: '400', size: 20 } },
            { id: 'f4', label: '4', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">4</text>', draw: { type: 'text', content: '4', font: '400', size: 20 } },
            { id: 'f5', label: '5', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">5</text>', draw: { type: 'text', content: '5', font: '400', size: 20 } },
            { id: 'f0', label: '0', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">0</text>', draw: { type: 'text', content: '0', font: '300', size: 14 } },
            { id: 'f-exp', label: 'x', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">x</text>', draw: { type: 'text', content: 'x', font: '300', size: 20 } },
            { id: 'f-shift', label: '+', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">+</text>', draw: { type: 'text', content: '+', font: '300', size: 20 } },
            { id: 'down-bow', label: 'Down', row: 2, icon: '<path d="M8 17 L8 10 L16 10 L16 17" fill="none" stroke="currentColor" stroke-width="1.6" />', draw: { type: 'path', data: 'M -0.25 0.3 L -0.25 -0.3 L 0.25 -0.3 L 0.25 0.3', size: 15, strokeWidth: 1.6, fill: 'none' } },
            { id: 'up-bow', label: 'Up', row: 2, icon: '<path d="M8 8 L12 17 L16 8" fill="none" stroke="currentColor" stroke-width="1.6" />', draw: { type: 'path', data: 'M -0.28 -0.35 L 0 0.35 L 0.28 -0.35', size: 15, strokeWidth: 1.6, fill: 'none' } },
            { id: 'open_string', label: 'o', row: 2, icon: '<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.0" />', draw: { type: 'shape', shape: 'circle', radius: 0.2, fill: false, size: 20 } },
            { id: 'i', label: 'I', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">I</text>', draw: { type: 'text', content: 'I', font: 'italic 300', size: 14, fontFace: 'serif' } },
            { id: 'ii', label: 'II', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">II</text>', draw: { type: 'text', content: 'II', font: 'italic 300', size: 14, fontFace: 'serif' } },
            { id: 'iii', label: 'III', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">III</text>', draw: { type: 'text', content: 'III', font: 'italic 300', size: 14, fontFace: 'serif' } },
            { id: 'iv', label: 'IV', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" font-size="12" text-anchor="middle" fill="currentColor" stroke="none">IV</text>', draw: { type: 'text', content: 'IV', font: 'italic 300', size: 14, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Articulation',
        type: 'articulation',
        tools: [
            { id: 'accent', label: 'Accent', row: 1, icon: '<path d="M6 10 L18 12 L6 14" fill="none" stroke="currentColor" stroke-width="1.2"/>', draw: { type: 'path', data: 'M -0.35 -0.15 L 0.35 0 L -0.35 0.15', size: 20, strokeWidth: 2, fill: 'none' } },
            { id: 'stress-above', label: 'Stress', row: 1, icon: '<path d="M8 7 L12 16 L16 7 Z" fill="currentColor" stroke="none"/>', draw: { type: 'path', data: 'M -0.2 -0.3 L 0 0.3 L 0.2 -0.3 Z', size: 20, strokeWidth: 0, fill: 'currentColor' } },
            { id: 'marcato', label: 'Marcato', row: 1, icon: '<path d="M8 17 L12 8 L16 17" fill="none" stroke="currentColor" stroke-width="1.2"/>', draw: { type: 'path', data: 'M -0.2 0.3 L 0 -0.3 L 0.2 0.3', size: 20, strokeWidth: 2, fill: 'none' } },
            { id: 'staccato', label: 'Staccato', row: 1, icon: '<circle cx="12" cy="12" r="2.0" fill="currentColor" />', draw: { type: 'shape', shape: 'circle', radius: 0.15, fill: true, size: 20 } },
            { id: 'tenuto', label: 'Tenuto', row: 1, icon: '<line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.3 0 L 0.3 0', size: 20, strokeWidth: 2, fill: 'none' } },
            { id: 'fermata', label: 'Fermata', row: 1, icon: '<path d="M4 16a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="12" r="1.3" fill="currentColor" />', draw: { type: 'complex', variant: 'fermata', size: 20 } },
            { id: 'harmonic', label: 'Harmonic', row: 1, icon: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>', draw: { type: 'shape', shape: 'circle', radius: 0.15, fill: false, size: 20 } },
            { id: 'sharp', label: 'Sharp', row: 2, icon: '<text x="12" y="17" font-family="serif" font-size="15" font-weight="400" text-anchor="middle" fill="currentColor" stroke="none">♯</text>', draw: { type: 'text', content: '♯', font: '400', size: 17, fontFace: 'serif' } },
            { id: 'flat', label: 'Flat', row: 2, icon: '<text x="12" y="18" font-family="serif" font-size="15" font-weight="400" text-anchor="middle" fill="currentColor" stroke="none">♭</text>', draw: { type: 'text', content: '♭', font: '400', size: 17, fontFace: 'serif' } },
            { id: 'natural', label: 'Natural', row: 2, icon: '<text x="12" y="17" font-family="serif" font-size="15" font-weight="400" text-anchor="middle" fill="currentColor" stroke="none">♮</text>', draw: { type: 'text', content: '♮', font: '400', size: 17, fontFace: 'serif' } },
            { id: 'double-sharp', label: 'D.Sharp', row: 2, icon: '<text x="12" y="17" font-family="Apple Symbols, Segoe UI Symbol, serif" font-size="15" font-weight="400" text-anchor="middle" fill="currentColor" stroke="none">𝄪</text>', draw: { type: 'text', content: '𝄪', font: '400', size: 17, fontFace: 'Apple Symbols, Segoe UI Symbol, serif' } },
            { id: 'double-flat', label: 'D.Flat', row: 2, icon: '<text x="12" y="18" font-family="Apple Symbols, Segoe UI Symbol, serif" font-size="15" font-weight="400" text-anchor="middle" fill="currentColor" stroke="none">𝄫</text>', draw: { type: 'text', content: '𝄫', font: '400', size: 17, fontFace: 'Apple Symbols, Segoe UI Symbol, serif' } }
        ]
    },
    {
        name: 'Text',
        type: 'text',
        tools: [
            // Row 1: Dynamics
            { id: 'text-ppp', label: 'ppp', row: 1, icon: 'ppp', draw: { type: 'text', content: 'ppp', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-pp', label: 'pp', row: 1, icon: 'pp', draw: { type: 'text', content: 'pp', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-p', label: 'p', row: 1, icon: 'p', draw: { type: 'text', content: 'p', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-mp', label: 'mp', row: 1, icon: 'mp', draw: { type: 'text', content: 'mp', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-mf', label: 'mf', row: 1, icon: 'mf', draw: { type: 'text', content: 'mf', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-f', label: 'f', row: 1, icon: 'f', draw: { type: 'text', content: 'f', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-ff', label: 'ff', row: 1, icon: 'ff', draw: { type: 'text', content: 'ff', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-fff', label: 'fff', row: 1, icon: 'fff', draw: { type: 'text', content: 'fff', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-fp', label: 'fp', row: 1, icon: 'fp', draw: { type: 'text', content: 'fp', font: 'italic 800', size: 16, fontFace: 'serif' } },
            { id: 'text-sfp', label: 'sfp', row: 1, icon: 'sfp', draw: { type: 'text', content: 'sfp', font: 'italic 800', size: 16, fontFace: 'serif' } },


            // Row 2: Tempo marks (note value = BPM — prompts for BPM on placement)
            { id: 'tempo-quarter',        label: '♩=',   row: 2, icon: '♩=',   draw: { type: 'tempo', noteSymbol: '♩'  } },
            { id: 'tempo-dotted-quarter', label: '♩.=',  row: 2, icon: '♩.=',  draw: { type: 'tempo', noteSymbol: '♩.' } },
            { id: 'tempo-half',           label: '½=',   row: 2, icon: '½=',   draw: { type: 'tempo', noteSymbol: '½'  } },
            { id: 'tempo-dotted-half',    label: '½.=',  row: 2, icon: '½.=',  draw: { type: 'tempo', noteSymbol: '½.' } },
            { id: 'tempo-eighth',         label: '♪=',   row: 2, icon: '♪=',   draw: { type: 'tempo', noteSymbol: '♪'  } },
            { id: 'tempo-dotted-eighth',  label: '♪.=',  row: 2, icon: '♪.=',  draw: { type: 'tempo', noteSymbol: '♪.' } },

            // Row 3: Common Italian technique phrases
            { id: 'text-pizz',      label: 'pizz.',       row: 3, draw: { type: 'text', content: 'pizz.',      font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-arco',      label: 'arco.',       row: 3, draw: { type: 'text', content: 'arco.',      font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-col-legno', label: 'Col legno',   row: 3, draw: { type: 'text', content: 'Col legno',  font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-sul-pont',  label: 'Sul pont.',   row: 3, draw: { type: 'text', content: 'Sul pont.',  font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-sul-tasto', label: 'Sul tasto',   row: 3, draw: { type: 'text', content: 'Sul tasto',  font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-flaut',     label: 'Flautando',   row: 3, draw: { type: 'text', content: 'Flautando',  font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-spicc',     label: 'Spiccato',    row: 3, draw: { type: 'text', content: 'Spiccato',   font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-trem',      label: 'Trem.',       row: 3, draw: { type: 'text', content: 'Trem.',      font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-div',       label: 'Div.',        row: 3, draw: { type: 'text', content: 'Div.',       font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-unis',      label: 'Unis.',       row: 3, draw: { type: 'text', content: 'Unis.',      font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-con-sord',  label: 'Con sord.',   row: 3, draw: { type: 'text', content: 'Con sord.',  font: 'italic 400', size: 16, fontFace: 'serif' } },
            { id: 'text-senza-sord',label: 'Senza sord.', row: 3, draw: { type: 'text', content: 'Senza sord.',font: 'italic 400', size: 16, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Breaths & Pauses',
        type: 'draw',
        tools: [
            { id: 'breath-mark', label: 'Breath', icon: '<path d="M12 8 C 14 8, 15 10, 15 12 C 15 14, 13 16, 10 17 C 11.5 15.5, 12.5 14, 12.5 12 C 12.5 11, 12 10, 11 10 C 11 9, 11.5 8, 12 8 Z" fill="currentColor"/>', draw: { type: 'path', data: 'M 0 -0.4 C 0.2 -0.4, 0.3 -0.2, 0.3 0 C 0.3 0.2, 0.1 0.4, -0.2 0.5 C -0.05 0.35, 0.05 0.2, 0.05 0 C 0.05 -0.1, 0 -0.2, -0.1 -0.2 C -0.1 -0.3, -0.05 -0.4, 0 -0.4 Z', size: 10, strokeWidth: 0, fill: 'currentColor' } },
            { id: 'caesura',     label: 'Caesura', icon: '<path d="M10 6 L7 18 M16 6 L13 18" fill="none" stroke="currentColor" stroke-width="2" />', draw: { type: 'path', data: 'M -0.1 0.4 L 0.05 -0.4 M 0.1 0.4 L 0.25 -0.4', size: 24, strokeWidth: 2, fill: 'none' } }
        ]
    },
    {
        name: 'Emoji',
        type: 'emoji',
        tools: [
            { id: 'emoji-star',   label: '⭐', textIcon: '⭐', draw: { type: 'text', content: '⭐', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-check',  label: '✅', textIcon: '✅', draw: { type: 'text', content: '✅', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-cross',  label: '❌', textIcon: '❌', draw: { type: 'text', content: '❌', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-exclaim',label: '❗', textIcon: '❗', draw: { type: 'text', content: '❗', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-question',label:'❓', textIcon: '❓', draw: { type: 'text', content: '❓', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-heart',  label: '❤️', textIcon: '❤️', draw: { type: 'text', content: '❤️', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-idea',   label: '💡', textIcon: '💡', draw: { type: 'text', content: '💡', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-eyes',   label: '👀', textIcon: '👀', draw: { type: 'text', content: '👀', size: 26, fontFace: 'system-ui' } },
            { id: 'emoji-music',  label: '🎵', textIcon: '🎵', draw: { type: 'text', content: '🎵', size: 26, fontFace: 'system-ui' } }
        ]
    },
    {
        name: 'Others',
        type: 'others',
        tools: [
            { id: 'cloak-black', label: '黑斗篷', icon: '<path d="M12 3a6 6 0 0 0-6 6v8l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5V9a6 6 0 0 0-6-6z" fill="none" stroke="#374151" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="10" r="1" fill="#374151"/><circle cx="14" cy="10" r="1" fill="#374151"/>' },
            { id: 'cloak-red',   label: '紅斗篷', icon: '<path d="M12 3a6 6 0 0 0-6 6v8l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5V9a6 6 0 0 0-6-6z" fill="none" stroke="#dc2626" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="10" r="1" fill="#dc2626"/><circle cx="14" cy="10" r="1" fill="#dc2626"/>' },
            { id: 'cloak-blue',  label: '藍斗篷', icon: '<path d="M12 3a6 6 0 0 0-6 6v8l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5V9a6 6 0 0 0-6-6z" fill="none" stroke="#2563eb" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="10" r="1" fill="#2563eb"/><circle cx="14" cy="10" r="1" fill="#2563eb"/>' },
            { id: 'page-bookmark', label: 'Bookmark', icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill="currentColor" stroke="none"/>', draw: { type: 'special', variant: 'page-bookmark' } },
            { id: 'anchor', label: 'Anchor', icon: '<circle cx="12" cy="3" r="1.5" fill="currentColor" /><rect x="11.25" y="4.5" width="1.5" height="9" fill="currentColor" /><rect x="7.5" y="10.5" width="9" height="1.5" fill="currentColor" /><path d="M6 12 C6 18, 18 18, 18 12 L16.5 12 C16.5 16.5, 7.5 16.5, 7.5 12 Z" fill="currentColor" />', draw: { type: 'complex', variant: 'anchor' } },
            { id: 'music-anchor', label: 'Music', icon: '<path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />', draw: { type: 'special', variant: 'playback' } },
            { id: 'measure', label: 'Measure', icon: '<text x="12" y="16.5" font-size="14" font-family="Outfit" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">#</text>', draw: { type: 'special', variant: 'measure' } },
            { id: 'measure-free', label: 'Free #', icon: '<text x="12" y="16.5" font-size="14" font-family="Outfit" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">#</text><circle cx="18" cy="18" r="4" fill="currentColor" opacity="0.5"/>', draw: { type: 'special', variant: 'measure' } },
            { id: 'sticky-note', label: '便條紙', row: 1, icon: '<rect x="4" y="4" width="14" height="16" rx="1" fill="#fef08a" stroke="currentColor" stroke-width="1.2"/><polygon points="14,4 18,4 18,8 14,8" fill="rgba(0,0,0,0.12)" stroke="none"/><line x1="14" y1="4" x2="18" y2="8" stroke="currentColor" stroke-width="1.2"/><line x1="7" y1="10" x2="16" y2="10" stroke="#854d0e" stroke-width="1"/><line x1="7" y1="13" x2="16" y2="13" stroke="#854d0e" stroke-width="1"/><line x1="7" y1="16" x2="12" y2="16" stroke="#854d0e" stroke-width="1"/>', draw: { type: 'sticky' } },
            { id: 'star-icon', label: 'Star', row: 1, icon: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>', draw: { type: 'path', data: 'M 0 -0.5 L 0.15 -0.15 L 0.5 -0.1 L 0.25 0.15 L 0.3 0.5 L 0 0.3 L -0.3 0.5 L -0.25 0.15 L -0.5 -0.1 L -0.15 -0.15 Z', size: 25, strokeWidth: 0, fill: 'currentColor' } }
        ]
    }
];
