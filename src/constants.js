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
            { id: 'pen', label: 'Pen', row: 1, icon: '<path d="M12 19l7-7 M19 12l3 3 M22 15l-7 7 M15 22l-3-3 M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M 1 0 L -1 0' } },
            { id: 'green-pen', label: 'Green', row: 1, icon: '<path d="M12 19l7-7 M19 12l3 3 M22 15l-7 7 M15 22l-3-3 M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="#10b981" stroke-width="2.5" />', draw: { type: 'path', color: '#10b981' } },
            { id: 'blue-pen', label: 'Blue', row: 1, icon: '<path d="M12 19l7-7 M19 12l3 3 M22 15l-7 7 M15 22l-3-3 M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5" fill="none" stroke="#3b82f6" stroke-width="2.5" />', draw: { type: 'path', color: '#3b82f6' } },
            { id: 'dashed-pen', label: 'Dashed', row: 1, icon: '<path d="M4 12h16" stroke="currentColor" stroke-width="2" stroke-dasharray="3,3"/><path d="M12 19l7-7 M18 13L16.5 5.5L2 2l3.5 14.5L13 18" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>', draw: { type: 'path', dashed: true } },
            { id: 'arrow-pen', label: 'Arrow', row: 1, icon: '<path d="M3 13h15 M14 9l4 4-4 4" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M12 19l7-7 M18 13L16.5 5.5L2 2l3.5 14.5L13 18" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>', draw: { type: 'path', arrow: true } },
            { id: 'highlighter', label: 'Highlighter', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#fde047" opacity="0.4" stroke="currentColor" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#fde047" stroke-width="4" opacity="0.6" />' },
            { id: 'highlighter-red', label: 'H.Red', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#ff4757" opacity="0.3" stroke="#ff4757" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#ff4757" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#ff4757' } },
            { id: 'highlighter-blue', label: 'H.Blue', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#3b82f6" opacity="0.3" stroke="#3b82f6" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#3b82f6" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#3b82f6' } },
            { id: 'highlighter-green', label: 'H.Green', row: 2, icon: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#10b981" opacity="0.3" stroke="#10b981" stroke-width="1" /><line x1="4" y1="12" x2="20" y2="12" stroke="#10b981" stroke-width="4" opacity="0.5" />', draw: { type: 'highlighter', color: '#10b981' } },
            { id: 'line', label: 'Line', row: 2, icon: '<line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" stroke-width="1.2" />' },
            { id: 'slur', label: 'Slur', row: 2, icon: '<path d="M4 8c4 8 12 8 16 0" fill="none" stroke="currentColor" stroke-width="1.5" />' }
        ]
    },
    {
        name: 'Bow/Fingering',
        type: 'fingering',
        tools: [
            { id: 'thumb', label: 'Thumb', row: 1, icon: '<ellipse cx="12" cy="12" rx="1.9" ry="3.2" fill="none" stroke="currentColor" stroke-width="0.8" /><line x1="12" y1="15.2" x2="12" y2="18.4" stroke="currentColor" stroke-width="0.8" />', draw: { type: 'complex', variant: 'thumb', size: 15 } },
            { id: 'f1', label: '1', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">1</text>', draw: { type: 'text', content: '1', font: '300', size: 20 } },
            { id: 'f2', label: '2', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">2</text>', draw: { type: 'text', content: '2', font: '300', size: 20 } },
            { id: 'f3', label: '3', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">3</text>', draw: { type: 'text', content: '3', font: '300', size: 20 } },
            { id: 'f4', label: '4', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">4</text>', draw: { type: 'text', content: '4', font: '300', size: 20 } },
            { id: 'f5', label: '5', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">5</text>', draw: { type: 'text', content: '5', font: '300', size: 20 } },
            { id: 'f0', label: '0', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">0</text>', draw: { type: 'text', content: '0', font: '300', size: 20 } },
            { id: 'f-exp', label: 'x', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">x</text>', draw: { type: 'text', content: 'x', font: '300', size: 20 } },
            { id: 'f-shift', label: '+', row: 1, icon: '<text x="12" y="17" font-family="Outfit" font-weight="300" text-anchor="middle" fill="currentColor" stroke="none">+</text>', draw: { type: 'text', content: '+', font: '300', size: 20 } },
            { id: 'down-bow', label: 'Down', row: 2, icon: '<path d="M8 11.5h8v4.3 M8 15.8v-4.3 M16 15.8v-4.3" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.26 0.17 L -0.26 -0.26 L 0.26 -0.26 L 0.26 0.17' } },
            { id: 'up-bow', label: 'Up', row: 2, icon: '<path d="M8 9.5l4 7l4-7" fill="none" stroke="currentColor" stroke-width="1.2" />', draw: { type: 'path', data: 'M -0.26 -0.26 L 0 0.22 L 0.26 -0.26' } },
            { id: 'open_string', label: 'o', row: 2, icon: '<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="1.0" />', draw: { type: 'shape', shape: 'circle', radius: 0.5, fill: false } },
            { id: 'i', label: 'I', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">I</text>', draw: { type: 'text', content: 'I', font: '300', size: 20, fontFace: 'serif' } },
            { id: 'ii', label: 'II', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">II</text>', draw: { type: 'text', content: 'II', font: '300', size: 20, fontFace: 'serif' } },
            { id: 'iii', label: 'III', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">III</text>', draw: { type: 'text', content: 'III', font: '300', size: 20, fontFace: 'serif' } },
            { id: 'iv', label: 'IV', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="300" font-style="italic" text-anchor="middle" fill="currentColor" stroke="none">IV</text>', draw: { type: 'text', content: 'IV', font: '300', size: 20, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Articulation',
        type: 'articulation',
        tools: [
            { id: 'accent', label: 'Accent', row: 1, icon: '<path d="M8 9l8 3-8 3" fill="none" stroke="currentColor" stroke-width="1.5"/>', draw: { type: 'path', data: 'M -0.4 -0.2 L 0.4 0 L -0.4 0.2' } },
            { id: 'staccato', label: 'Staccato', row: 1, icon: '<circle cx="12" cy="12" r="1.5" fill="currentColor" />', draw: { type: 'shape', shape: 'circle', radius: 0.12, fill: true } },
            { id: 'tenuto', label: 'Tenuto', row: 1, icon: '<line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="1.8" />', draw: { type: 'path', data: 'M -0.4 0 L 0.4 0' } },
            { id: 'fermata', label: 'Fermata', row: 1, icon: '<path d="M7 15a5 5 0 0 1 10 0" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="13.5" r="1.2" fill="currentColor" />', draw: { type: 'complex', variant: 'fermata' } },
            { id: 'sharp', label: 'Sharp', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">♯</text>', draw: { type: 'text', content: '♯', font: '500', size: 20, fontFace: 'serif' } },
            { id: 'flat', label: 'Flat', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">♭</text>', draw: { type: 'text', content: '♭', font: '500', size: 20, fontFace: 'serif' } },
            { id: 'natural', label: 'Natural', row: 2, icon: '<text x="12" y="17" font-family="serif" font-weight="500" text-anchor="middle" fill="currentColor" stroke="none">♮</text>', draw: { type: 'text', content: '♮', font: '500', size: 20, fontFace: 'serif' } }
        ]
    },
    {
        name: 'Text',
        type: 'text',
        tools: [
            // Row 1: Dynamics (Professional Musical Symbols using SVG Paths)
            { 
                id: 'text-ppp', label: 'ppp', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(1,3)"/><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(6,3)"/><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(11,3)"/></svg>',
                draw: { type: 'path', data: 'M -0.4 0.2 C -0.45 0.35 -0.55 0.5 -0.7 0.65 C -0.8 0.75 -0.95 0.8 -1.1 0.8 C -1.15 0.8 -1.2 0.75 -1.25 0.7 C -1.3 0.65 -1.3 0.6 -1.3 0.5 C -1.3 0.35 -1.25 0.2 -1.13 0.05 C -1.1 0 -1.1 -0.05 -1.05 -0.1 C -1.03 -0.15 -1 -0.2 -0.96 -0.25 C -0.92 -0.3 -0.9 -0.35 -0.9 -0.4 C -0.9 -0.45 -0.92 -0.5 -0.95 -0.53 C -0.98 -0.55 -1.03 -0.57 -1.08 -0.57 C -1.13 -0.57 -1.18 -0.55 -1.25 -0.5 C -1.33 -0.45 -1.4 -0.38 -1.45 -0.3 L -1.55 -0.35 M -0.05 0.2 C -0.1 0.35 -0.2 0.5 -0.35 0.65 C -0.45 0.75 -0.6 0.8 -0.75 0.8 C -0.8 0.8 -0.85 0.75 -0.9 0.7 C -0.95 0.65 -0.95 0.6 -0.95 0.5 C -0.95 0.35 -0.9 0.2 -0.78 0.05 C -0.75 0 -0.75 -0.05 -0.7 -0.1 C -0.68 -0.15 -0.65 -0.2 -0.61 -0.25 C -0.57 -0.3 -0.55 -0.35 -0.55 -0.4 C -0.55 -0.45 -0.57 -0.5 -0.6 -0.53 C -0.63 -0.55 -0.68 -0.57 -0.73 -0.57 C -0.78 -0.57 -0.83 -0.55 -0.9 -0.5 C -0.98 -0.45 -1.05 -0.38 -1.1 -0.3 L -1.2 -0.35 M 0.3 0.2 C 0.25 0.35 0.15 0.5 0 0.65 C -0.1 0.75 -0.25 0.8 -0.4 0.8 C -0.45 0.8 -0.5 0.75 -0.55 0.7 C -0.6 0.65 -0.6 0.6 -0.6 0.5 C -0.6 0.35 -0.55 0.2 -0.43 0.05 C -0.4 0 -0.4 -0.05 -0.35 -0.1 C -0.33 -0.15 -0.3 -0.2 -0.26 -0.25 C -0.22 -0.3 -0.2 -0.35 -0.2 -0.4 C -0.2 -0.45 -0.22 -0.5 -0.25 -0.53 C -0.28 -0.55 -0.33 -0.57 -0.38 -0.57 C -0.43 -0.57 -0.48 -0.55 -0.55 -0.5 C -0.63 -0.45 -0.7 -0.38 -0.75 -0.3 L -0.85 -0.35' } 
            },
            { 
                id: 'text-pp', label: 'pp', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(1,3)"/><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(7,3)"/></svg>',
                draw: { type: 'path', data: 'M -0.2 0.2 C -0.25 0.35 -0.35 0.5 -0.5 0.65 C -0.6 0.75 -0.75 0.8 -0.9 0.8 C -0.95 0.8 -1.0 0.75 -1.05 0.7 C -1.1 0.65 -1.1 0.6 -1.1 0.5 C -1.1 0.35 -1.05 0.2 -0.93 0.05 C -0.9 0 -0.9 -0.05 -0.85 -0.1 C -0.83 -0.15 -0.8 -0.2 -0.76 -0.25 C -0.72 -0.3 -0.7 -0.35 -0.7 -0.4 C -0.7 -0.45 -0.72 -0.5 -0.75 -0.53 C -0.78 -0.55 -0.83 -0.57 -0.88 -0.57 C -0.93 -0.57 -0.98 -0.55 -1.05 -0.5 C -1.13 -0.45 -1.2 -0.38 -1.25 -0.3 L -1.35 -0.35 M 0.3 0.2 C 0.25 0.35 0.15 0.5 0 0.65 C -0.1 0.75 -0.25 0.8 -0.4 0.8 C -0.45 0.8 -0.5 0.75 -0.55 0.7 C -0.6 0.65 -0.6 0.6 -0.6 0.5 C -0.6 0.35 -0.55 0.2 -0.43 0.05 C -0.4 0 -0.4 -0.05 -0.35 -0.1 C -0.33 -0.15 -0.3 -0.2 -0.26 -0.25 C -0.22 -0.3 -0.2 -0.35 -0.2 -0.4 C -0.2 -0.45 -0.22 -0.5 -0.25 -0.53 C -0.28 -0.55 -0.33 -0.57 -0.38 -0.57 C -0.43 -0.57 -0.48 -0.55 -0.55 -0.5 C -0.63 -0.45 -0.7 -0.38 -0.75 -0.3 L -0.85 -0.35' } 
            },
            { 
                id: 'text-p', label: 'p', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(6,3)"/></svg>',
                draw: { type: 'path', data: 'M 0.3 0.2 C 0.25 0.35 0.15 0.5 0 0.65 C -0.1 0.75 -0.25 0.8 -0.4 0.8 C -0.45 0.8 -0.5 0.75 -0.55 0.7 C -0.6 0.65 -0.6 0.6 -0.6 0.5 C -0.6 0.35 -0.55 0.2 -0.43 0.05 C -0.4 0 -0.4 -0.05 -0.35 -0.1 C -0.33 -0.15 -0.3 -0.2 -0.26 -0.25 C -0.22 -0.3 -0.2 -0.35 -0.2 -0.4 C -0.2 -0.45 -0.22 -0.5 -0.25 -0.53 C -0.28 -0.55 -0.33 -0.57 -0.38 -0.57 C -0.43 -0.57 -0.48 -0.55 -0.55 -0.5 C -0.63 -0.45 -0.7 -0.38 -0.75 -0.3 L -0.85 -0.35' } 
            },
            { 
                id: 'text-mp', label: 'mp', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M4.5 15.5H3.1l-.2.5H1.5l1.6-4.5H4.2l1.6 4.5H4.3l-.2-.5zm-.2-.4l-.5-1.4-.5 1.4h1z M10.5 13.5c-2.1 0-3.2-1.5-3.2-4.2s1.1-7.5 3.2-7.5h.5l-.8 1.5c-.5-.8-1-.8-1.5-.8-1 0-1.8 3.5-1.8 6.5 0 2.2.8 3.2 1.6 3.2s1-.8 1.5-1.8l.5 1.5h-1V13.5z m.5-5.5h6v1h-6v-1z M14.8 14.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(0,0)"/></svg>',
                draw: { type: 'path', data: 'M -1.2 0.6 L -1.05 -0.6 C -1.04 -0.68 -1.01 -0.72 -0.96 -0.72 C -0.92 -0.72 -0.88 -0.69 -0.85 -0.63 C -0.82 -0.57 -0.8 -0.49 -0.79 -0.39 C -0.75 -0.52 -0.7 -0.62 -0.65 -0.68 C -0.6 -0.74 -0.54 -0.77 -0.48 -0.77 C -0.43 -0.77 -0.39 -0.74 -0.36 -0.68 C -0.33 -0.62 -0.3 -0.52 -0.28 -0.39 C -0.24 -0.52 -0.19 -0.62 -0.13 -0.68 C -0.07 -0.74 -0.01 -0.77 0.05 -0.77 C 0.15 -0.77 0.21 -0.69 0.22 -0.53 L 0.28 0.01 M 0.25 -0.35 c.1-1.6.8-2.4 2.1-2.4.8 0 1.4.4 1.8 1.1.4.7.6 1.7.6 3 0 1-.2 2.1-.6 3.3 0 0-.1.2-.4.6-.2.4-.4.8-.7 1.1-.3.3-.4.6-.4.9 0 .4.1.7.4.9.3.2.6.3.9.3.4 0 .8-.2 1.2-.6.4-.4.8-.9 1.1-1.5l.8.3c-.3 1-.6 1.8-.8 2.3-.2.5-.5.8-.7 1-.3.2-.6.3-.9.3-.4 0-.8-.2-1.1-.5-.3-.3-.4-.6-.4-1 0-.6.2-1.3.6-2.1.4-.8 1-1.7 1.8-2.6.8-.9 1.6-1.4 2.5-1.4.4 0 .8.1 1.1.4.3.3.4.7.4 1.3 0 .8-.4 1.8-1.1 3' } 
            },
            { 
                id: 'text-mf', label: 'mf', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M5.5 8c-.6 0-1.1.2-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5c-.4 2.1-1 3.5-2 4.5-.8.8-1.7 1.2-2.7 1.2-.8 0-1.3-.4-1.3-1.2 0-.8.4-1.8 1.1-3 M4 10l8 0" transform="translate(4,2)"/></svg>',
                draw: { type: 'path', data: 'M -1.2 0.6 L -1.05 -0.6 C -1.04 -0.68 -1.01 -0.72 -0.96 -0.72 C -0.92 -0.72 -0.88 -0.69 -0.85 -0.63 C -0.82 -0.57 -0.8 -0.49 -0.79 -0.39 C -0.75 -0.52 -0.7 -0.62 -0.65 -0.68 C -0.6 -0.74 -0.54 -0.77 -0.48 -0.77 C -0.43 -0.77 -0.39 -0.74 -0.36 -0.68 C -0.33 -0.62 -0.3 -0.52 -0.28 -0.39 C -0.24 -0.52 -0.19 -0.62 -0.13 -0.68 C -0.07 -0.74 -0.01 -0.77 0.05 -0.77 C 0.15 -0.77 0.21 -0.69 0.22 -0.53 L 0.28 0.01 M 0.28 -0.39 L 0.25 -0.35 c.1-1.6.8-2.4 2.1-2.4 2.5 0 2.8 1.3 2.8 3.5 0 1-.1 2-.4 3.1l.3.2 2.4-10c.1-.5.3-.8.6-.8.4 0 .7.3.9 1 .2.7.3 1.6.3 2.7l-2.4 10c-.1.5-.3.8-.6.8s-.7-.3-.9-1c-.2-.7-.3-1.6-.3-2.7l2.4-10 M 0.9 -0.3 l 1.2 0' } 
            },
            { 
                id: 'text-f', label: 'f', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(6,2)"/></svg>',
                draw: { type: 'path', data: 'M 0.5 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.6 -2.5 c 0.025 -0.125 0.075 -0.2 0.15 -0.2 0.1 0 0.175 0.075 0.225 0.25 0.05 0.175 0.075 0.4 0.075 0.675 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -1.25 -0.1 l 2.5 0' } 
            },
            { 
                id: 'text-ff', label: 'ff', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(1,2)"/><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(8,2)"/></svg>',
                draw: { type: 'path', data: 'M -0.1 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.6 -2.5 c 0.025 -0.125 0.075 -0.2 0.15 -0.2 0.1 0 0.175 0.075 0.225 0.25 0.05 0.175 0.075 0.4 0.075 0.675 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -1.85 -0.1 l 2.5 0 M 0.9 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.6 -2.5 c 0.025 -0.125 0.075 -0.2 0.15 -0.2 0.1 0 0.175 0.075 0.225 0.25 0.05 0.175 0.075 0.4 0.075 0.675 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -0.85 -0.1 l 2.5 0' } 
            },
            { 
                id: 'text-fff', label: 'fff', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(-1,2)"/><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(5,2)"/><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5 M4 10l8 0" transform="translate(11,2)"/></svg>',
                draw: { type: 'path', data: 'M -0.4 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -2.15 -0.1 l 2.5 0 M 0.2 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -1.55 -0.1 l 2.5 0 M 0.9 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -0.85 -0.1 l 2.5 0' } 
            },
            { 
                id: 'text-fp', label: 'fp', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5" transform="translate(1,2)"/><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(11,3)"/></svg>',
                draw: { type: 'path', data: 'M -0.15 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -1.85 -0.1 l 2.0 0 M 0.9 0.2 C 0.85 0.35 0.75 0.5 0.6 0.65 C 0.5 0.75 0.35 0.8 0.2 0.8 C 0.15 0.8 0.1 0.75 0.05 0.7 C 0 0.65 0 0.6 0 0.5 C 0 0.35 0.05 0.2 0.17 0.05 C 0.2 0 0.2 -0.05 0.25 -0.1 C 0.27 -0.15 0.3 -0.2 0.34 -0.25 C 0.38 -0.3 0.4 -0.35 0.4 -0.4 C 0.4 -0.45 0.38 -0.5 0.35 -0.53 C 0.32 -0.55 0.27 -0.57 0.22 -0.57 C 0.17 -0.57 0.12 -0.55 0.05 -0.5 C -0.03 -0.45 -0.1 -0.38 -0.15 -0.3 L -0.25 -0.35' } 
            },
            { 
                id: 'text-sfp', label: 'sfp', row: 1, 
                icon: '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M2.5 11s-2 0-2-1.5 1-1.5 2-1.5c1 0 2 .5 2 1 0 .5-.5 1-1 1s-.5-.5-.5-1c0-.2.2-.4.4-.5-.6 0-1 1-1 1.5 0 .5.5 1 1 1h.5l-.5 1c-.5.5-1 1-2 1-1.5 0-2-1-2-2l.5-.2c0 .8.5 1.2 1 1.2.5 0 1-.5 1-1z" transform="translate(1,3)"/><path d="M8.5 5c-.3 2.5-1.2 5.5-2.8 8-1.2 1.8-2.5 3.2-4 3.2-.8 0-1.5-.5-1.5-1.5 0-1.2 1-3.2 2.8-5.5s.8-.8.8-1.2c0-.6-.3-1-.8-1.2-.4-.2-.9-.3-1.4-.3-.8 0-1.5.3-2.1 1l.5.6c.4-.6.8-.9 1.2-.9.3 0 .5.2.5.6s-.2.9-.6 1.5c-.8 1.1-1.8 2.5-2.5 4-.6 1.2-.9 2.5-.9 3.5 0 2 1.2 3.2 3.2 3.2 1.5 0 3-.8 4.2-2.2.8-.8 1.5-1.8 2-3s.1-.2.1-.2h1V10h-1l-1 5" transform="translate(6,2)"/><path d="M5.5 11c-.8-.8-1.4-1.8-1.8-2.5-.4-.8-.6-1.5-.6-2 0-.5.3-.8.7-.8s.8.4 1.2 1.2L5 10.5 m4.8-3.5c-.5 0-1.1.3-1.5.8-.3-.6-.8-.8-1.3-.8-.8 0-1.4.5-1.4 1.5 0 .8.3 1.8 1 2.8s1.6 2.2 2.5 3l-.8 3.5c-.2.8-.4 1.2-.8 1.2-.3 0-.5-.3-.5-.8s.2-1.3.5-2.2l-.6-.2c-.3.8-.5 1.8-.5 2.5 0 1.2.4 2 1.2 2.1s1.3-.6 1.6-1.5l1-3.8c.8 1 1.6 1.8 2.5 1.8 1 0 1.8-.8 1.8-2 0-1-.6-2.1-1.5-3.2l-1.5-1.2c.8-.8 1.4-1.5 1.4-2.2 0-.7-.3-1.1-.9-1.1z" transform="translate(13,3)"/></svg>',
                draw: { type: 'path', data: 'M -1.2 0.3 C -1.2 0.2 -1.15 0.1 -1.1 0.1 C -1.05 0.1 -1.0 0.15 -0.95 0.2 C -0.9 0.25 -0.85 0.3 -0.8 0.3 C -0.75 0.3 -0.7 0.25 -0.7 0.2 C -0.7 0.15 -0.75 0.1 -0.85 0.05 C -1.0 -0.05 -1.1 -0.2 -1.1 -0.3 C -1.1 -0.4 -1.0 -0.5 -0.85 -0.5 C -0.75 -0.5 -0.65 -0.45 -0.6 -0.4 M -0.4 0.2 L -0.8 0.8 M 0.4 -1.1 c 0-0.4 -0.12-0.6 -0.37-0.6 -0.25 0 -0.45 0.2 -0.6 0.6 l -0.6 2.5 c -0.025 0.125 -0.075 0.2 -0.15 0.2 -0.1 0 -0.175 -0.075 -0.225 -0.25 -0.05 -0.175 -0.075 -0.4 -0.075 -0.675 l 0.525-2.125 M -1.25 -0.1 l 2.0 0 M 1.2 0.2 C 1.15 0.35 1.05 0.5 0.9 0.65 C 0.8 0.75 0.65 0.8 0.5 0.8 C 0.45 0.8 0.4 0.75 0.35 0.7 C 0.3 0.65 0.3 0.6 0.3 0.5 C 0.3 0.35 0.35 0.2 0.47 0.05 C 0.5 0 0.5 -0.05 0.55 -0.1 C 0.57 -0.15 0.6 -0.2 0.64 -0.25 C 0.68 -0.3 0.7 -0.35 0.7 -0.4 C 0.7 -0.45 0.68 -0.5 0.65 -0.53 C 0.62 -0.55 0.57 -0.57 0.52 -0.57 C 0.47 -0.57 0.42 -0.55 0.35 -0.5 C 0.27 -0.45 0.2 -0.38 0.15 -0.3 L 0.05 -0.35' } 
            },
            
            // Row 2: Sections & Reminders (Italic Text Labels)
            { id: 'text-cond', label: '指揮', row: 2, draw: { type: 'text', content: '指揮', font: 'italic 500', size: 18 } },
            { id: 'text-v1', label: '小提', row: 2, draw: { type: 'text', content: '小提', font: 'italic 500', size: 18 } },
            { id: 'text-vlc', label: '大提', row: 2, draw: { type: 'text', content: '大提', font: 'italic 500', size: 18 } },
            { id: 'text-wind', label: '管', row: 2, draw: { type: 'text', content: '管', font: 'italic 500', size: 18 } },
            { id: 'text-perc', label: '打擊', row: 2, draw: { type: 'text', content: '打擊', font: 'italic 500', size: 18 } },
            { id: 'text-solo', label: '獨奏', row: 2, draw: { type: 'text', content: '獨奏', font: 'italic 500', size: 18 } },
            { id: 'text-page', label: '換頁', row: 2, draw: { type: 'text', content: '換頁', font: 'italic 500', size: 18, color: '#ef4444' } },
            { id: 'text-score', label: '換譜', row: 2, draw: { type: 'text', content: '換譜', font: 'italic 500', size: 18, color: '#ef4444' } },
            { id: 'text-breath', label: '呼吸', row: 2, draw: { type: 'text', content: '呼吸', font: 'italic 500', size: 18, color: '#3b82f6' } }
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
