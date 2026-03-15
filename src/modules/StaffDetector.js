export class StaffDetector {
  constructor(app) {
    this.app = app
    this.params = { scale: 1.5, density: 0.30, maxthick: 8, sysgap: 25, margin: 3 }
  }

  // Auto-detect all pages, push results to app.stamps, save
  async autoDetect(pdf, onProgress) {
    const results = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const systems = await this.detectPage(page, p)
      results.push(...systems)
      if (onProgress) onProgress(p, pdf.numPages)
    }
    this.app.stamps.push(...results)
    this.app.saveToStorage(true)
    this.app.updateRulerMarks()
  }

  async detectPage(pdfPage, pageNum) {
    const { scale, density, maxthick, sysgap, margin } = this.params
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
    const marginPx = Math.floor(w * (margin / 100))
    const scanLeft = marginPx, scanRight = w - marginPx

    // Sample background luminance (6 edge regions) for adaptive threshold
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

    // Row density scan
    const rowDensity = new Float32Array(h)
    for (let y = 0; y < h; y++) {
      let dark = 0, total = 0
      for (let x = scanLeft; x < scanRight; x += 2) {
        const i = (y * w + x) * 4
        if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < darkThreshold) dark++
        total++
      }
      rowDensity[y] = dark / total
    }

    // Candidate rows → line segments → filter → group into systems
    const candidates = []
    for (let y = 0; y < h; y++) if (rowDensity[y] >= density) candidates.push(y)

    const segments = []
    let i = 0
    while (i < candidates.length) {
      let start = candidates[i], end = start
      while (i < candidates.length && candidates[i] <= end + 2) { end = candidates[i]; i++ }
      // Only keep thin lines (staff lines); thick bands are text/beams.
      // Do NOT do i++ here — inner loop already advanced i past this segment.
      if (end - start + 1 <= maxthick) segments.push({ top: start, bottom: end })
    }

    const systems = []
    let group = []
    segments.forEach(seg => {
      if (!group.length) { group.push(seg); return }
      if (seg.top - group[group.length - 1].bottom > sysgap) {
        if (group.length >= 2) systems.push(group)
        group = [seg]
      } else group.push(seg)
    })
    if (group.length >= 2) systems.push(group)

    // Convert to System Stamps using ratio (scale-independent)
    const naturalH = pdfPage.getViewport({ scale: 1 }).height
    const toRatio = px => px / (naturalH * scale)

    return systems.map(lines => ({
      type: 'system',
      page: pageNum,
      y: toRatio(lines[0].top),
      yBottom: toRatio(lines[lines.length - 1].bottom),
      lineCount: lines.length,
      auto: true,
      deleted: false
    }))
  }
}
