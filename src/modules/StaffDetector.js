/**
 * StaffDetector — Enhanced System Detection for ScoreFlow
 * 
 * Version 2.0: Integrated Barline-Anchored Detection with Evidence Verification
 */
export class StaffDetector {
  constructor(app) {
    this.app = app
    this.params = { 
      scale: 1.5,      // Higher scale for better precision
      maxthick: 12,    // Max staff line thickness
      sysgap: 20,      // Gap between systems
      highDens: 0.40   // Horizontal density threshold
    }
  }

  // Auto-detect all pages, push results to app.stamps, save
  async autoDetect(pdf, onProgress) {
    const fp = this.app.pdfFingerprint
    const now = Date.now()

    // 1. LOGICAL DELETE: Mark existing auto-generated system stamps as deleted
    // Keeping the ID in the array with deleted:true is essential for sync engines 
    // to know that these specific records should be removed from the cloud too.
    if (this.app.stamps) {
      this.app.stamps.forEach(s => {
        if (s.type === 'system' && s.auto && !s.deleted) {
          s.deleted = true
          s.updatedAt = now // Must update timestamp to win the sync merge
        }
      })
    }

    const results = []
    const tempCanvas = document.createElement('canvas') // REUSE SINGLE CANVAS
    
    try {
      for (let p = 1; p <= pdf.numPages; p++) {
        if (this.app.pdfFingerprint !== fp) break 
        const page = await pdf.getPage(p)
        const systems = await this.detectPage(page, p, tempCanvas)
        results.push(...systems)
        if (onProgress) onProgress(p, pdf.numPages)
      }
    } finally {
      // Clean up the temporary canvas to free iPad memory
      tempCanvas.width = 0
      tempCanvas.height = 0
    }
    
    if (this.app.pdfFingerprint !== fp) return
    
    // 2. Add new results
    this.app.stamps.push(...results)
    
    // 3. Persist and trigger authoritative sync
    this.app.saveToStorage(true)
    this.app.updateRulerMarks()

    // Push all system stamps (new + soft-deleted old) to Supabase
    if (this.app.supabaseManager && fp) {
      this.app.stamps
        .filter(s => s.type === 'system' && s.auto)
        .forEach(s => this.app.supabaseManager.pushAnnotation(s, fp))
    }

    // Explicitly trigger authoritative cloud push if available
    if (this.app.driveSyncManager) {
      console.log('[StaffDetector] Triggering authoritative cloud push...')
      this.app.driveSyncManager.push(0, true)
    }
  }

  /**
   * Helper: Convert RGBA to Grayscale Uint8Array
   */
  _toGray(rgba, w, h) {
    const gray = new Uint8Array(w * h)
    for (let i = 0; i < gray.length; i++) {
      const idx = i * 4
      gray[i] = rgba[idx] * 0.299 + rgba[idx + 1] * 0.587 + rgba[idx + 2] * 0.114
    }
    return gray
  }

  /**
   * find ALL potential final barlines
   */
  _findAllBarlines(gray, w, h, darkThreshold) {
    const scanStart = Math.floor(w * 0.12)
    const minX      = Math.floor(w * 0.45)
    const xCounts   = new Int32Array(w)

    for (let y = 0; y < h; y++) {
      const rowBase = y * w
      for (let x = w - 1; x >= scanStart; x--) {
        if (gray[rowBase + x] < darkThreshold) {
          if (x >= minX) xCounts[x]++
          break
        }
      }
    }

    const smooth = new Float32Array(w)
    for (let x = minX; x < w; x++) {
      let sum = 0, cnt = 0
      for (let dx = -5; dx <= 5; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < w) { sum += xCounts[nx]; cnt++ }
      }
      smooth[x] = sum / cnt
    }

    const minCount = Math.max(4, Math.floor(h * 0.005))
    const peaks = []
    for (let x = minX + 1; x < w - 1; x++) {
      if (smooth[x] >= minCount && smooth[x] >= smooth[x - 1] && smooth[x] >= smooth[x + 1]) {
        peaks.push(x)
      }
    }

    const merged = []
    for (const x of peaks) {
      if (!merged.length) { merged.push(x); continue }
      const last = merged[merged.length - 1]
      if (Math.abs(x - last) <= 15) {
        if (smooth[x] > smooth[last]) merged[merged.length - 1] = x
      } else { merged.push(x) }
    }

    // Validate barlines by checking for horizontal staff bands to the left
    return merged.filter(x => {
      const skip = 20, stripW = 6
      const x1 = Math.max(0, x - skip - stripW), x2 = Math.max(0, x - skip)
      let thinRuns = 0, inRun = false, runStart = 0
      for (let y = 0; y <= h; y++) {
        let dark = false
        if (y < h) {
          for (let px = x1; px <= x2; px++) { if (gray[y * w + px] < darkThreshold) { dark = true; break } }
        }
        if (dark && !inRun) { inRun = true; runStart = y }
        else if (!dark && inRun) { inRun = false; if (y - runStart >= 1 && y - runStart <= 12) thinRuns++ }
      }
      return thinRuns >= 3
    }).sort((a, b) => b - a)
  }

  /**
   * Extract staff segments near a barline
   */
  _extractStaff(gray, w, h, barlineX, darkThreshold) {
    const stripW = 4, minDensity = 0.70, STEP = 5, MAX_TRIES = 10
    const scanAt = (rightEdge) => {
      const x2 = Math.max(0, rightEdge), x1 = Math.max(0, x2 - stripW + 1)
      const stripLen = x2 - x1 + 1, segs = []
      let inSeg = false, segStart = 0
      for (let y = 0; y <= h; y++) {
        let darkCount = 0
        if (y < h) { for (let x = x1; x <= x2; x++) { if (gray[y * w + x] < darkThreshold) darkCount++ } }
        const dark = (darkCount / stripLen) >= minDensity
        if (dark && !inSeg) { inSeg = true; segStart = y }
        else if (!dark && inSeg) { inSeg = false; const thick = y - segStart; if (thick >= 1 && thick <= 18) segs.push({ top: segStart, bottom: y - 1, thickness: thick }) }
      }
      return segs
    }
    let best = []
    for (let t = 0; t < MAX_TRIES; t++) {
      const segs = scanAt(barlineX - 1 - t * STEP)
      if (segs.length >= 5 && segs.length <= 15) { best = segs; break }
      if (segs.length > best.length) best = segs
    }
    return best
  }

  /**
   * Validate 5-line staff pattern
   */
  _findStaves(segs) {
    if (segs.length < 5) return []
    const centers = segs.map(s => (s.top + s.bottom) / 2)
    const smallGaps = []
    for (let i = 1; i < centers.length; i++) {
      const g = centers[i] - centers[i - 1]
      if (g > 3 && g < 40) smallGaps.push(g)
    }
    if (smallGaps.length < 2) return []
    smallGaps.sort((a, b) => a - b)
    const linespace = smallGaps[Math.floor(smallGaps.length / 2)]
    const tol = linespace * 0.45, used = new Set(), staves = []
    for (let si = 0; si < segs.length; si++) {
      if (used.has(si)) continue
      const chain = [si]
      for (let k = 1; k <= 4; k++) {
        const expected = centers[si] + k * linespace
        let bestIdx = -1, bestDist = tol + 1
        for (let j = si + 1; j < segs.length; j++) {
          if (used.has(j)) continue
          const dist = Math.abs(centers[j] - expected)
          if (dist <= tol && dist < bestDist) { bestDist = dist; bestIdx = j }
        }
        if (bestIdx === -1) break
        chain.push(bestIdx)
      }
      if (chain.length === 5) { chain.forEach(i => used.add(i)); staves.push(chain.map(i => segs[i])) }
    }
    return staves.flat().sort((a, b) => a.top - b.top)
  }

  /**
   * Main System Detection logic with Evidence Verification
   */
  _detectSystems(gray, w, h, darkThreshold, staffSegs = []) {
    const scanX1 = Math.floor(w * 0.05), scanX2 = Math.floor(w * 0.95), scanLen = scanX2 - scanX1 + 1
    const highDens = this.params.highDens, maxMerge = 120, bracketRange = 0.10, bracketDens = 0.55
    const isHigh = new Uint8Array(h)

    // Track A: Density Scan (Segmented for skew tolerance)
    const segCount = 3, segW = Math.floor(scanLen / segCount)
    for (let y = 0; y < h; y++) {
      let hits = 0, midHigh = false
      for (let s = 0; s < segCount; s++) {
        const sx1 = scanX1 + s * segW, sx2 = sx1 + segW
        let cnt = 0
        for (let x = sx1; x < sx2; x++) { if (gray[y * w + x] < darkThreshold) cnt++ }
        const dens = cnt / segW
        if (dens >= Math.min(highDens * 0.8, 0.35)) hits++
        if (s === 1 && dens >= 0.55) midHigh = true
      }
      if (hits >= 2 || midHigh) isHigh[y] = 1
    }

    // Track B: Staff Evidence
    staffSegs.forEach(seg => { for (let y = Math.max(0, seg.top - 2); y <= Math.min(h - 1, seg.bottom + 2); y++) isHigh[y] = 1 })

    // Step 2: Fill gaps
    for (let y = 1; y < h - 1; y++) {
      if (!isHigh[y] && isHigh[y - 1]) {
        let gapEnd = -1
        for (let g = 1; g <= 20 && y + g < h; g++) { if (isHigh[y + g]) { gapEnd = y + g; break } }
        if (gapEnd >= 0) for (let fy = y; fy < gapEnd; fy++) isHigh[fy] = 1
      }
    }

    // Step 3: Find continuous anchors
    const anchors = []
    let inRun = false, runStart = 0
    for (let y = 0; y <= h; y++) {
      const c = y < h && isHigh[y]
      if (c && !inRun) { inRun = true; runStart = y }
      else if (!c && inRun) { 
        inRun = false
        const height = y - runStart
        const hasStaff = staffSegs.some(s => (s.top + s.bottom)/2 >= runStart && (s.top + s.bottom)/2 <= y)
        if (height >= 12 || hasStaff) anchors.push({ top: runStart, bottom: y - 1 }) 
      }
    }

    // Step 4: Expand Y-range to cover notes
    const expanded = anchors.map(a => ({ top: Math.max(0, a.top - 24), bottom: Math.min(h - 1, a.bottom + 24), anchor: a }))
    if (expanded.length <= 1) return expanded

    // Step 5: Bracket-based merging
    const hasBracket = (yTop, yBottom) => {
      const bx1 = Math.floor(w * 0.01), bx2 = Math.floor(w * bracketRange), span = yBottom - yTop
      if (span <= 2) return false
      for (let x = bx1; x <= bx2; x++) {
        let dark = 0
        for (let y = yTop; y <= yBottom; y++) { if (gray[y * w + x] < darkThreshold) dark++ }
        if (dark / (span + 1) >= bracketDens) return true
      }
      return false
    }

    const systems = [{ ...expanded[0] }]
    for (let i = 1; i < expanded.length; i++) {
      const last = systems[systems.length - 1], rawGap = anchors[i].top - anchors[i - 1].bottom
      const hasConn = hasBracket(anchors[i - 1].bottom, anchors[i].top)
      if (rawGap <= maxMerge && (hasConn || rawGap <= 25)) last.bottom = expanded[i].bottom
      else systems.push({ ...expanded[i] })
    }
    return systems
  }

  async detectPage(pdfPage, pageNum, canvas = null) {
    const { scale } = this.params
    const viewport = pdfPage.getViewport({ scale })
    
    if (!canvas) canvas = document.createElement('canvas')
    
    // Canvas Size Capping for Staff Detection (iPad memory safety)
    const MAX_AREA = 9437184; // 9M pixels (3000x3000)
    const currentArea = viewport.width * viewport.height;
    let renderScale = 1.0;
    
    if (currentArea > MAX_AREA && currentArea > 0) {
      renderScale = Math.sqrt(MAX_AREA / currentArea);
      console.warn(`[StaffDetector] Page ${pageNum} exceeds MAX_AREA. Capping to 9M pixels (scale: ${renderScale.toFixed(2)}x)`);
    } else if (currentArea <= 0) {
      console.error(`[StaffDetector] Invalid area for page ${pageNum}. Skipping.`);
      return [];
    }

    canvas.width = Math.floor(viewport.width * renderScale)
    canvas.height = Math.floor(viewport.height * renderScale)

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    await pdfPage.render({ 
      canvasContext: ctx, 
      viewport: pdfPage.getViewport({ scale: scale * renderScale }) 
    }).promise

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const w = canvas.width, h = canvas.height
    const gray = this._toGray(data, w, h)

    // Adaptive dark threshold from background sample
    let bgSum = 0, bgCount = 0
    const regions = [[10, 10], [w - 30, 10], [10, h - 30], [w - 30, h - 30], [10, h >> 1], [w - 30, h >> 1]]
    regions.forEach(([rx, ry]) => {
      for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) {
        const i = (ry + dy) * w + (rx + dx)
        bgSum += gray[i]; bgCount++
      }
    })
    const darkThreshold = (bgSum / bgCount) * 0.75

    // 1. Find Barlines
    const barlineXs = this._findAllBarlines(gray, w, h, darkThreshold)
    
    // 2. Find Staff Evidence
    let allStaffSegs = []
    for (const bx of barlineXs) {
      const segs = this._extractStaff(gray, w, h, bx, darkThreshold)
      allStaffSegs.push(...segs)
    }
    const validatedStaff = this._findStaves(allStaffSegs)

    // 3. Detect Systems using Staff Evidence
    const systemBounds = this._detectSystems(gray, w, h, darkThreshold, validatedStaff)
    if (!systemBounds.length) return []

    // Convert to System Stamps using ratio (scale-independent)
    const naturalH = pdfPage.getViewport({ scale: 1 }).height
    const toRatio = px => px / (naturalH * scale)
    const now = Date.now()

    return systemBounds.map(({ top, bottom }) => ({
      type: 'system',
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sys-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      page: pageNum,
      x: 0,
      y: toRatio(top),
      yBottom: toRatio(bottom),
      lineCount: 5,
      auto: true,
      deleted: false,
      createdAt: now,
      updatedAt: now
    }))
  }
}
