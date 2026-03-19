/**
 * ImageProcessor — ScoreFlow Image Processing Module
 * 
 * Handles grayscale conversion, thresholding (Otsu/Adaptive), 
 * denoising, staff enhancement, and notehead reconstruction.
 */
const ImageProcessor = (() => {

    function otsuThresholdFromHist(hist, total) {
        let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, max = 0, best = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t]; if (!wB) continue;
            const wF = total - wB; if (!wF) break;
            sumB += t * hist[t];
            const mB = sumB / wB, mF = (sum - sumB) / wF;
            const b = wB * wF * (mB - mF) ** 2;
            if (b > max) { max = b; best = t; }
        }
        return best;
    }

    function otsuThreshold(d) {
        const hist = new Array(256).fill(0), total = d.length / 4;
        for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
        return otsuThresholdFromHist(hist, total);
    }

    function adaptiveThreshold(d, w, h, blockSize) {
        const half = Math.floor(blockSize / 2);
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0; i < w * h; i++) gray[i] = d[i * 4];
        const integral = new Float64Array((w + 1) * (h + 1));
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            integral[(y + 1) * (w + 1) + (x + 1)] = gray[y * w + x] + integral[y * (w + 1) + (x + 1)] + integral[(y + 1) * (w + 1) + x] - integral[y * (w + 1) + x];
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const x1 = Math.max(0, x - half), y1 = Math.max(0, y - half), x2 = Math.min(w, x + half + 1), y2 = Math.min(h, y + half + 1);
            const area = (x2 - x1) * (y2 - y1);
            const sum = integral[y2 * (w + 1) + x2] - integral[y1 * (w + 1) + x2] - integral[y2 * (w + 1) + x1] + integral[y1 * (w + 1) + x1];
            const v = gray[y * w + x] < sum / area - 8 ? 0 : 255;
            const idx = (y * w + x) * 4; d[idx] = d[idx + 1] = d[idx + 2] = v;
        }
    }

    function enhanceStaffLines(imageData, densityThreshold = 0.20, previewSegs = null, excludedIdxs = null, targetThickness = 0) {
        const d = imageData.data, w = imageData.width, h = imageData.height;
        const segs = previewSegs || []; // Fallback detection logic could be here but usually passed from outside
        segs.forEach((seg, idx) => {
            if (excludedIdxs && excludedIdxs.has(idx)) return;
            const mid = Math.round((seg.top + seg.bottom) / 2);
            const thick = targetThickness > 0 ? targetThickness : (seg.bottom - seg.top + 1);
            const yStart = Math.max(0, mid - Math.floor(thick / 2));
            const yEnd = Math.min(h - 1, yStart + thick - 1);
            for (let y = yStart; y <= yEnd; y++) for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255;
            }
        });
    }

    function cleanNoteheads(ctx, w, h, minSize, maxSize) {
        const imageData = ctx.getImageData(0, 0, w, h), d = imageData.data;
        const visited = new Uint8Array(w * h);
        const blobs = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (visited[idx] || d[idx * 4] > 64) continue;
            const queue = [idx]; visited[idx] = 1;
            let minX = x, maxX = x, minY = y, maxY = y, pixels = [];
            let qi = 0;
            while (qi < queue.length) {
                const cur = queue[qi++], cx = cur % w, cy = Math.floor(cur / w);
                pixels.push(cur);
                if (cx < minX) minX = cx; if (cx > maxX) maxX = cx; if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
                for (const nb of [cur - 1, cur + 1, cur - w, cur + w]) {
                    if (nb < 0 || nb >= w * h) continue;
                    const nx = nb % w, ny = Math.floor(nb / w);
                    if (Math.abs(nx - cx) + Math.abs(ny - cy) > 1) continue;
                    if (!visited[nb] && d[nb * 4] <= 64) { visited[nb] = 1; queue.push(nb); }
                }
            }
            const bw = maxX - minX + 1, bh = maxY - minY + 1;
            blobs.push({ minX, maxX, minY, maxY, bw, bh, pixels });
        }
        const noteheads = blobs.filter(b => {
            if (b.bw < minSize || b.bh < minSize || b.bw > maxSize || b.bh > maxSize) return false;
            const ratio = b.bw / b.bh; if (ratio < 0.5 || ratio > 2.5) return false;
            return b.pixels.length / (b.bw * b.bh) >= 0.2;
        });
        ctx.save();
        noteheads.forEach(b => {
            const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
            const rx = b.bw / 2, ry = b.bh / 2;
            const isHollow = b.pixels.length / (b.bw * b.bh) < 0.55;
            ctx.fillStyle = 'white'; ctx.fillRect(b.minX - 1, b.minY - 1, b.bw + 2, b.bh + 2);
            ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            if (isHollow) { ctx.strokeStyle = 'black'; ctx.lineWidth = Math.max(1.5, Math.min(rx, ry) * 0.25); ctx.stroke(); }
            else { ctx.fillStyle = 'black'; ctx.fill(); }
        });
        ctx.restore();
    }

    // Unified pipeline runner
    function runPipeline(ctx, w, h, p, otsuT, staffSegs, staffExcl, pipelineOrder, PIPELINE_LABELS) {
        let imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Grayscale always first
        for (let i = 0; i < d.length; i += 4) {
            const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            d[i] = d[i + 1] = d[i + 2] = g;
        }

        for (const step of pipelineOrder) {
            if (step === 'contrast' && p.contrast !== 1.0) {
                for (let i = 0; i < d.length; i += 4) {
                    const v = Math.min(255, Math.max(0, (d[i] - 128) * p.contrast + 128));
                    d[i] = d[i + 1] = d[i + 2] = v;
                }
            } else if (step === 'denoise' && p.denoiseR > 0) {
                const temp = new Uint8ClampedArray(w * h);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    let sum = 0, cnt = 0;
                    for (let dy = -p.denoiseR; dy <= p.denoiseR; dy++)
                        for (let dx = -p.denoiseR; dx <= p.denoiseR; dx++) {
                            const ny = y + dy, nx = x + dx;
                            if (ny >= 0 && ny < h && nx >= 0 && nx < w) { sum += d[(ny * w + nx) * 4]; cnt++; }
                        }
                    temp[y * w + x] = sum / cnt;
                }
                for (let i = 0; i < w * h; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = temp[i];
            } else if (step === 'threshold') {
                if (p.mode === 'simple') {
                    for (let i = 0; i < d.length; i += 4) { const v = d[i] < p.threshold ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
                } else if (p.mode === 'otsu') {
                    const t = otsuT !== null ? otsuT : otsuThreshold(d);
                    for (let i = 0; i < d.length; i += 4) { const v = d[i] < t ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
                } else if (p.mode === 'adaptive') {
                    adaptiveThreshold(d, w, h, 31);
                } else { // denoise-only mode
                    for (let i = 0; i < d.length; i += 4) { const v = Math.min(255, Math.max(0, (d[i] - 100) * 1.8 + 100)); d[i] = d[i + 1] = d[i + 2] = v; }
                }
            } else if (step === 'staff' && p.staffEnhance) {
                enhanceStaffLines(imgData, p.staffDensity, staffSegs, staffExcl, p.staffThickness);
            } else if (step === 'notehead' && p.noteClean) {
                ctx.putImageData(imgData, 0, 0);
                cleanNoteheads(ctx, w, h, p.noteMin, p.noteMax);
                imgData = ctx.getImageData(0, 0, w, h);
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    function detectStaffLinesFromImage(imageData, densityThreshold) {
        const d = imageData.data, w = imageData.width, h = imageData.height;
        const margin = Math.floor(w * 0.05), scanL = margin, scanR = w - margin;
        const rowDensity = new Float32Array(h);
        for (let y = 0; y < h; y++) {
            let dark = 0, tot = 0;
            for (let x = scanL; x < scanR; x += 2) { if (d[(y * w + x) * 4] < 128) dark++; tot++; }
            rowDensity[y] = dark / tot;
        }
        const cands = []; for (let y = 0; y < h; y++) if (rowDensity[y] >= densityThreshold) cands.push(y);
        const segs = []; let i = 0;
        while (i < cands.length) {
            let s = cands[i], e = s;
            while (i < cands.length && cands[i] <= e + 2) { e = cands[i]; i++; }
            const thickness = e - s + 1;
            if (thickness <= 12) segs.push({ top: s, bottom: e, thickness });
        }
        return segs;
    }

    return {
        otsuThreshold,
        otsuThresholdFromHist,
        adaptiveThreshold,
        enhanceStaffLines,
        cleanNoteheads,
        runPipeline,
        detectStaffLinesFromImage
    };
})();

if (typeof module !== 'undefined') module.exports = ImageProcessor;
