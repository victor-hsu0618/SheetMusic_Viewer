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
            // Row 1: Dynamics (Professional Musical Symbols using Text mode for stability)
            { id: 'text-ppp', label: 'ppp', row: 1, icon: 'ppp', draw: { type: 'text', content: 'ppp', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-pp', label: 'pp', row: 1, icon: 'pp', draw: { type: 'text', content: 'pp', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-p', label: 'p', row: 1, icon: 'p', draw: { type: 'text', content: 'p', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-mp', label: 'mp', row: 1, icon: 'mp', draw: { type: 'text', content: 'mp', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-mf', label: 'mf', row: 1, icon: 'mf', draw: { type: 'text', content: 'mf', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-f', label: 'f', row: 1, icon: 'f', draw: { type: 'text', content: 'f', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-ff', label: 'ff', row: 1, icon: 'ff', draw: { type: 'text', content: 'ff', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-fff', label: 'fff', row: 1, icon: 'fff', draw: { type: 'text', content: 'fff', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-fp', label: 'fp', row: 1, icon: 'fp', draw: { type: 'text', content: 'fp', font: 'italic 800', size: 24, fontFace: 'serif' } },
            { id: 'text-sfp', label: 'sfp', row: 1, icon: 'sfp', draw: { type: 'text', content: 'sfp', font: 'italic 800', size: 24, fontFace: 'serif' } },
            
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
