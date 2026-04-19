/**
 * BarlineStaffDetector — ScoreFlow Staff & System Detection Module
 * 
 * Key Insights:
 * 1. Final barlines are the most reliable anchors for staff line detection.
 * 2. Segmented row scanning improves robustness against skewed or broken lines.
 * 3. System detection requires Y-axis expansion to cover notes and markings.
 */
const BarlineStaffDetector = (() => {

    // Check if a column near barline has horizontal staff-like bands
    function _hasStaffBands(gray, w, h, bx, darkThreshold, minThinBands = 3) {
        const skip = 20;
        const stripW = 6;
        const x1 = Math.max(0, bx - skip - stripW);
        const x2 = Math.max(0, bx - skip);
        let thinRuns = 0, inRun = false, runStart = 0;
        for (let y = 0; y <= h; y++) {
            let dark = false;
            if (y < h) {
                for (let px = x1; px <= x2; px++) {
                    if (gray[y * w + px] < darkThreshold) { dark = true; break; }
                }
            }
            if (dark && !inRun) { inRun = true; runStart = y; }
            else if (!dark && inRun) {
                inRun = false;
                const rh = y - runStart;
                if (rh >= 1 && rh <= 12) thinRuns++;
            }
        }
        return thinRuns >= minThinBands;
    }

    // Find all potential barlines via rightmost-dark-pixel histogram
    function findAllBarlines(gray, w, h, darkThreshold) {
        const scanStart = Math.floor(w * 0.12);
        const minX = Math.floor(w * 0.45);
        const xCounts = new Int32Array(w);

        for (let y = 0; y < h; y++) {
            const rowBase = y * w;
            for (let x = w - 1; x >= scanStart; x--) {
                if (gray[rowBase + x] < darkThreshold) {
                    if (x >= minX) xCounts[x]++;
                    break;
                }
            }
        }

        const smooth = new Float32Array(w);
        for (let x = minX; x < w; x++) {
            let sum = 0, cnt = 0;
            for (let dx = -5; dx <= 5; dx++) {
                const nx = x + dx;
                if (nx >= 0 && nx < w) { sum += xCounts[nx]; cnt++; }
            }
            smooth[x] = sum / cnt;
        }

        const minCount = Math.max(4, Math.floor(h * 0.005));
        const peaks = [];
        for (let x = minX + 1; x < w - 1; x++) {
            if (smooth[x] >= minCount && smooth[x] >= smooth[x - 1] && smooth[x] >= smooth[x + 1]) {
                peaks.push(x);
            }
        }

        const merged = [];
        for (const x of peaks) {
            if (!merged.length) { merged.push(x); continue; }
            const last = merged[merged.length - 1];
            if (Math.abs(x - last) <= 15) {
                if (smooth[x] > smooth[last]) merged[merged.length - 1] = x;
            } else { merged.push(x); }
        }

        return merged.filter(x => _hasStaffBands(gray, w, h, x, darkThreshold)).sort((a, b) => b - a);
    }

    // Extract staff lines at a specific X position
    function extractStaff(gray, w, h, barlineX, darkThreshold, maxLineThick = 12, stripW = 4) {
        const minDensity = 0.70;
        const STEP = 5;      // 稍微加大步進
        const MAX_TRIES = 10; // 增加嘗試次數，確保能跳過極粗的終止線 (最多往左 50px)

        function scanAt(rightEdge) {
            const x2 = Math.max(0, rightEdge);
            const x1 = Math.max(0, x2 - stripW + 1);
            const stripLen = x2 - x1 + 1;
            const segs = [];
            let inSeg = false, segStart = 0;
            for (let y = 0; y <= h; y++) {
                let darkCount = 0;
                if (y < h) {
                    for (let x = x1; x <= x2; x++) { if (gray[y * w + x] < darkThreshold) darkCount++; }
                }
                const dark = (darkCount / stripLen) >= minDensity;
                if (dark && !inSeg) { inSeg = true; segStart = y; }
                else if (!dark && inSeg) {
                    inSeg = false;
                    const thick = y - segStart;
                    // 放寬厚度限制：有些加線或音符黏著時會比較厚，先抓進來再由 findStaves 篩選
                    if (thick >= 1 && thick <= 18)
                        segs.push({ top: segStart, bottom: y - 1, thickness: thick, confirmed: true });
                }
            }
            return segs;
        }

        let best = [];
        for (let t = 0; t < MAX_TRIES; t++) {
            const segs = scanAt(barlineX - 1 - t * STEP);
            // 如果這一次掃描抓到了 5 條線，且厚度分佈合理，就視為成功
            if (segs.length >= 5 && segs.length <= 15) {
                best = segs;
                break;
            }
            if (segs.length > best.length) best = segs;
        }
        return best;
    }

    // Validate 5-line staff patterns
    function findStaves(segs, maxLineThick) {
        if (segs.length < 5) return [];
        const centers = segs.map(s => (s.top + s.bottom) / 2);
        const smallGaps = [];
        for (let i = 1; i < centers.length; i++) {
            const g = centers[i] - centers[i - 1];
            if (g > 3 && g < 40) smallGaps.push(g);
        }
        if (smallGaps.length < 2) return [];
        smallGaps.sort((a, b) => a - b);
        const linespace = smallGaps[Math.floor(smallGaps.length / 2)];
        const tol = linespace * 0.45;

        const used = new Set();
        const staves = [];
        for (let si = 0; si < segs.length; si++) {
            if (used.has(si)) continue;
            const chain = [si];
            for (let k = 1; k <= 4; k++) {
                const expected = centers[si] + k * linespace;
                let bestIdx = -1, bestDist = tol + 1;
                for (let j = si + 1; j < segs.length; j++) {
                    if (used.has(j)) continue;
                    const dist = Math.abs(centers[j] - expected);
                    if (dist <= tol && dist < bestDist) { bestDist = dist; bestIdx = j; }
                }
                if (bestIdx === -1) break;
                chain.push(bestIdx);
            }
            if (chain.length === 5) {
                chain.forEach(i => used.add(i));
                staves.push(chain.map(i => segs[i]));
            }
        }
        return staves.flat().sort((a, b) => a.top - b.top);
    }

    // Main API for staff detection
    function detect(gray, w, h, opts = {}) {
        const { darkThreshold = 128, maxLineThick = 12, stripW = 4 } = opts;
        const barlineXs = findAllBarlines(gray, w, h, darkThreshold);
        if (!barlineXs.length) return { barlineX: null, barlineXs: [], segments: [] };

        const allSegs = [];
        for (const bx of barlineXs) {
            const segs = extractStaff(gray, w, h, bx, darkThreshold, maxLineThick, stripW);
            allSegs.push(...segs);
        }

        allSegs.sort((a, b) => a.top - b.top);
        const merged = [];
        for (const seg of allSegs) {
            if (!merged.length) { merged.push({ ...seg }); continue; }
            const last = merged[merged.length - 1];
            if (seg.top <= last.bottom + 2) {
                last.bottom = Math.max(last.bottom, seg.bottom);
                last.thickness = last.bottom - last.top + 1;
            } else { merged.push({ ...seg }); }
        }

        const validated = findStaves(merged, maxLineThick);
        const segments = validated.length >= 5 ? validated : [];
        return { barlineX: barlineXs[0], barlineXs, segments };
    }

    // Main API for system detection
    function detectSystems(gray, w, h, darkThreshold, opts = {}) {
        const scanX1 = Math.floor(w * 0.05);
        const scanX2 = Math.floor(w * 0.95);
        const scanLen = scanX2 - scanX1 + 1;
        const highDens = opts.highDens !== undefined ? opts.highDens : 0.40;
        const bracketRange = opts.bracketRange !== undefined ? opts.bracketRange : 0.10;
        const bracketDens = opts.bracketDens !== undefined ? opts.bracketDens : 0.55;
        const maxMerge = opts.maxMerge !== undefined ? opts.maxMerge : 120;
        const staffSegs = opts.staffSegs || []; // 新增：傳入已偵測到的五線譜線

        // Step 1: 標記高密度行
        const isHigh = new Uint8Array(h);

        // 軌道 A：影像密度掃描
        const segCount = 3;
        const segW = Math.floor(scanLen / segCount);
        for (let y = 0; y < h; y++) {
            let hits = 0;
            let midHigh = false;
            for (let s = 0; s < segCount; s++) {
                const sx1 = scanX1 + s * segW;
                const sx2 = sx1 + segW;
                let cnt = 0;
                for (let x = sx1; x < sx2; x++) { if (gray[y * w + x] < darkThreshold) cnt++; }
                const dens = cnt / segW;
                if (dens >= Math.min(highDens * 0.8, 0.35)) hits++;
                if (s === 1 && dens >= 0.55) midHigh = true;
            }
            if (hits >= 2 || midHigh) isHigh[y] = 1;
        }

        // 軌道 B：五線譜證據（如果已知是五線譜，那這行一定是 System 的一部分）
        staffSegs.forEach(seg => {
            for (let y = Math.max(0, seg.top - 2); y <= Math.min(h - 1, seg.bottom + 2); y++) {
                isHigh[y] = 1;
            }
        });

        // Step 2: 填補行距空隙
        for (let y = 1; y < h - 1; y++) {
            if (!isHigh[y] && isHigh[y - 1]) {
                let gapEnd = -1;
                for (let g = 1; g <= 20 && y + g < h; g++) { if (isHigh[y + g]) { gapEnd = y + g; break; } }
                if (gapEnd >= 0) for (let fy = y; fy < gapEnd; fy++) isHigh[fy] = 1;
            }
        }

        // Step 3: 找連續群組
        const anchors = [];
        let inRun = false, runStart = 0;
        for (let y = 0; y <= h; y++) {
            const c = y < h && isHigh[y];
            if (c && !inRun) { inRun = true; runStart = y; }
            else if (!c && inRun) {
                inRun = false;
                // 降低最小高度門檻：只要有 12px 且裡面有五線譜，就視為系統
                const height = y - runStart;
                const hasStaffInside = staffSegs.some(s => (s.top + s.bottom) / 2 >= runStart && (s.top + s.bottom) / 2 <= y);
                if (height >= 12 || hasStaffInside) anchors.push({ top: runStart, bottom: y - 1 });
            }
        }

        // Step 4: 擴展 Y-range
        const expanded = anchors.map(a => ({
            top: Math.max(0, a.top - 24),
            bottom: Math.min(h - 1, a.bottom + 24),
            anchor: a
        }));

        if (expanded.length <= 1) return expanded;

        // --- Bracket detection ---
        function hasBracket(yTop, yBottom) {
            const bx1 = Math.floor(w * 0.01);
            const bx2 = Math.floor(w * bracketRange);
            const span = yBottom - yTop;
            if (span <= 2) return false;
            for (let x = bx1; x <= bx2; x++) {
                let dark = 0;
                for (let y = yTop; y <= yBottom; y++) {
                    if (gray[y * w + x] < darkThreshold) dark++;
                }
                if (dark / (span + 1) >= bracketDens) return true;
            }
            return false;
        }

        // Step 5: 合併
        const systems = [{ ...expanded[0] }];
        for (let i = 1; i < expanded.length; i++) {
            const last = systems[systems.length - 1];
            const rawGap = anchors[i].top - anchors[i - 1].bottom;
            const hasConn = hasBracket(anchors[i - 1].bottom, anchors[i].top);
            // 放寬合併條件，特別是對於距離很近的行
            if (rawGap <= maxMerge && (hasConn || rawGap <= 25)) {
                last.bottom = expanded[i].bottom;
            } else {
                systems.push({ ...expanded[i] });
            }
        }
        return systems;
    }

    return { findAllBarlines, extractStaff, detect, detectSystems };
})();

if (typeof module !== 'undefined') module.exports = BarlineStaffDetector;
