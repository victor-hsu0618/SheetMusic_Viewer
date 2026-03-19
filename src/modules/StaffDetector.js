export class StaffDetector {
  constructor(app) {
    this.app = app
    this.params = { scale: 1.0, maxthick: 8, sysgap: 17 }
  }

  // Auto-detect all pages, push results to app.stamps, save
  async autoDetect(pdf, onProgress) {
    const fp = this.app.pdfFingerprint  // capture fingerprint at start
    const results = []
    for (let p = 1; p <= pdf.numPages; p++) {
      if (this.app.pdfFingerprint !== fp) return  // PDF changed mid-detection, discard
      const page = await pdf.getPage(p)
      const systems = await this.detectPage(page, p)
      results.push(...systems)
      if (onProgress) onProgress(p, pdf.numPages)
    }
    if (this.app.pdfFingerprint !== fp) return  // discard if switched after last page
    this.app.stamps.push(...results)
    this.app.saveToStorage(true)
    this.app.updateRulerMarks()
  }

  // ── BarlineStaffDetector (same algorithm as pdf-cleaner tool) ──
  //
  // Key insight: final barlines are the RIGHTMOST dark element in their rows —
  // blank paper lies to their right.  Interior barlines are never rightmost
  // (notes/content follow them).  Histogram of per-row rightmost-dark-x peaks
  // at each system's final barline, even when systems drift horizontally.

  // 驗證候選 barlineX：左側 strip 是否有 ≥ minThinBands 條細橫帶（五線譜線）
  _hasStaffBands(data, w, h, bx, darkThreshold, minThinBands = 3) {
    const stripW = 6
    const x1 = Math.max(0, bx - stripW)
    const x2 = Math.max(0, bx - 1)
    let thinRuns = 0, inRun = false, runStart = 0
    for (let y = 0; y <= h; y++) {
      let dark = false
      if (y < h) {
        for (let px = x1; px <= x2; px++) {
          const i = (y * w + px) * 4
          if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < darkThreshold) {
            dark = true; break
          }
        }
      }
      if (dark && !inRun)      { inRun = true;  runStart = y }
      else if (!dark && inRun) {
        inRun = false
        const rh = y - runStart
        if (rh >= 1 && rh <= 10) thinRuns++
      }
    }
    return thinRuns >= minThinBands
  }

  // Step 1: find ALL system barlines via rightmost-dark-pixel histogram.
  // Peaks are validated by staff-band check to reject text/page-number false positives.
  _findAllBarlines(data, w, h, darkThreshold) {
    const scanStart = Math.floor(w * 0.12)
    const minX      = Math.floor(w * 0.45)
    const xCounts   = new Int32Array(w)

    for (let y = 0; y < h; y++) {
      for (let x = w - 1; x >= scanStart; x--) {
        const i = (y * w + x) * 4
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        if (lum < darkThreshold) {
          if (x >= minX) xCounts[x]++
          break
        }
      }
    }

    // Smooth ±5px
    const smooth = new Float32Array(w)
    for (let x = minX; x < w; x++) {
      let sum = 0, cnt = 0
      for (let dx = -5; dx <= 5; dx++) {
        const nx = x + dx
        if (nx >= 0 && nx < w) { sum += xCounts[nx]; cnt++ }
      }
      smooth[x] = sum / cnt
    }

    const minCount = Math.max(8, Math.floor(h * 0.015))

    const peaks = []
    for (let x = minX + 1; x < w - 1; x++) {
      if (smooth[x] >= minCount &&
          smooth[x] >= smooth[x - 1] &&
          smooth[x] >= smooth[x + 1]) {
        peaks.push(x)
      }
    }

    const merged = []
    for (const x of peaks) {
      if (!merged.length) { merged.push(x); continue }
      const last = merged[merged.length - 1]
      if (Math.abs(x - last) <= 15) {
        if (smooth[x] > smooth[last]) merged[merged.length - 1] = x
      } else {
        merged.push(x)
      }
    }

    // 驗證：過濾掉沒有五線譜細橫帶的假 peak（文字、頁碼等）
    const validated = merged.filter(x => this._hasStaffBands(data, w, h, x, darkThreshold))
    validated.sort((a, b) => b - a)
    return validated
  }

  // 五線譜嚴格驗證：只保留能組成剛好 5 條等間距的線鏈，其餘丟棄
  _findStaves(segs, maxthick) {
    if (segs.length < 5) return []
    const center = s => (s.top + s.bottom) / 2
    const centers = segs.map(center)

    const smallGaps = []
    for (let i = 1; i < centers.length; i++) {
      const g = centers[i] - centers[i - 1]
      if (g > maxthick && g < maxthick * 10) smallGaps.push(g)
    }
    if (smallGaps.length < 2) return []
    smallGaps.sort((a, b) => a - b)
    const linespace = smallGaps[Math.floor(smallGaps.length / 2)]
    const tol = linespace * 0.40

    const used = new Set()
    const staves = []
    for (let si = 0; si < segs.length; si++) {
      if (used.has(si)) continue
      const chain = [si]
      for (let k = 1; k <= 4; k++) {
        const expected = centers[si] + k * linespace
        let bestIdx = -1, bestDist = tol + 1
        for (let j = 0; j < segs.length; j++) {
          if (used.has(j) || chain.includes(j)) continue
          const dist = Math.abs(centers[j] - expected)
          if (dist <= tol && dist < bestDist) { bestDist = dist; bestIdx = j }
        }
        if (bestIdx === -1) break
        chain.push(bestIdx)
      }
      if (chain.length === 5) {
        chain.forEach(i => used.add(i))
        staves.push(chain.map(i => segs[i]))
      }
    }
    return staves.flat().sort((a, b) => a.top - b.top)
  }

  // Step 2: 極窄 strip（4px）+ 高密度（70%）— 音符不入，五線譜線必入
  _extractStaff(data, w, h, barlineX, darkThreshold, maxthick) {
    const stripW     = 4
    const minDensity = 0.70
    const x1 = Math.max(0, barlineX - stripW)
    const x2 = Math.max(0, barlineX - 1)
    const stripLen = x2 - x1 + 1
    const segs = []
    let inSeg = false, segStart = 0
    for (let y = 0; y <= h; y++) {
      let darkCount = 0
      if (y < h) {
        for (let x = x1; x <= x2; x++) {
          const i = (y * w + x) * 4
          if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < darkThreshold) darkCount++
        }
      }
      const dark = (darkCount / stripLen) >= minDensity
      if (dark && !inSeg)      { inSeg = true;  segStart = y }
      else if (!dark && inSeg) {
        inSeg = false
        const thick = y - segStart
        if (thick >= 1 && thick <= maxthick) segs.push({ top: segStart, bottom: y - 1 })
      }
    }
    return segs
  }

  // 高密度行 anchor 找 system y 邊界（≥40% 水平暗像素密度）
  // Step 4 改用 bracket detection：掃左側邊緣有無連續垂直暗線來判斷雙行 system
  _detectSystems(data, w, h, darkThreshold, bracketRange = 0.10, maxMerge = 120) {
    const scanX1 = Math.floor(w * 0.05)
    const scanX2 = Math.floor(w * 0.95)
    const scanLen = scanX2 - scanX1 + 1
    const highDens = 0.40

    // Step 1: 標記高密度行
    const isHigh = new Uint8Array(h)
    for (let y = 0; y < h; y++) {
      let cnt = 0
      for (let x = scanX1; x <= scanX2; x++) {
        const i = (y * w + x) * 4
        if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < darkThreshold) cnt++
      }
      if (cnt / scanLen >= highDens) isHigh[y] = 1
    }

    // Step 2: 填補 ≤12px 空隙
    for (let y = 1; y < h - 1; y++) {
      if (!isHigh[y]) {
        let gapEnd = y
        while (gapEnd < h && !isHigh[gapEnd]) gapEnd++
        if (gapEnd - y <= 12 && isHigh[y - 1] && gapEnd < h && isHigh[gapEnd]) {
          for (let fy = y; fy < gapEnd; fy++) isHigh[fy] = 1
        }
      }
    }

    // Step 3: 找連續群組（≥5px 才算）
    const groups = []
    let inGroup = false, groupStart = 0
    for (let y = 0; y <= h; y++) {
      const high = y < h && isHigh[y]
      if (high && !inGroup)      { inGroup = true; groupStart = y }
      else if (!high && inGroup) {
        inGroup = false
        if (y - groupStart >= 5) groups.push({ top: groupStart, bottom: y - 1 })
      }
    }

    if (!groups.length) return []
    if (groups.length === 1) return [{ ...groups[0] }]

    // Step 4: bracket detection — 掃左側 [1%, bracketRange] 範圍
    // 若兩 group 之間的空隙有連續垂直暗線（bracket），代表同一 system
    const bx1 = Math.floor(w * 0.01)
    const bx2 = Math.floor(w * bracketRange)
    const bracketDens = 0.55

    const hasBracket = (yTop, yBottom) => {
      const span = yBottom - yTop
      if (span <= 2) return false
      for (let x = bx1; x <= bx2; x++) {
        let dark = 0
        for (let y = yTop; y <= yBottom; y++) {
          const idx = (y * w + x) * 4
          if (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114 < darkThreshold) dark++
        }
        if (dark / (span + 1) >= bracketDens) return true
      }
      return false
    }

    // Step 5: 合併有 bracket 且 gap ≤ maxMerge 的相鄰 group
    const systems = [{ ...groups[0] }]
    for (let i = 1; i < groups.length; i++) {
      const last = systems[systems.length - 1]
      const gap = groups[i].top - last.bottom
      if (gap <= maxMerge && hasBracket(last.bottom, groups[i].top)) {
        last.bottom = groups[i].bottom
      } else {
        systems.push({ ...groups[i] })
      }
    }

    return systems  // [{top, bottom}]
  }

  async detectPage(pdfPage, pageNum) {
    const { scale } = this.params
    const viewport = pdfPage.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pdfPage.render({ canvasContext: ctx, viewport }).promise

    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const w = canvas.width, h = canvas.height

    // Adaptive dark threshold from background sample
    let bgSum = 0, bgCount = 0
    const regions = [[10, 10], [w - 30, 10], [10, h - 30], [w - 30, h - 30], [10, h >> 1], [w - 30, h >> 1]]
    regions.forEach(([rx, ry]) => {
      for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) {
        const i = ((ry + dy) * w + (rx + dx)) * 4
        bgSum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
        bgCount++
      }
    })
    const darkThreshold = (bgSum / bgCount) * 0.75

    const systemBounds = this._detectSystems(data, w, h, darkThreshold)
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
