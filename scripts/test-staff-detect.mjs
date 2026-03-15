/**
 * Test staff detection on a local PDF using Playwright.
 * Usage: node scripts/test-staff-detect.mjs [pdf-path] [pages]
 * Example: node scripts/test-staff-detect.mjs Test_Document/IMSLP18211-Duport_-_21_Etudes_for_Cello.pdf 3
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { resolve, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')

const pdfPath = resolve(ROOT, process.argv[2] || 'Test_Document/IMSLP18211-Duport_-_21_Etudes_for_Cello.pdf')
const pagesToTest = parseInt(process.argv[3] || '4')

const pdfBytes = readFileSync(pdfPath)
const pdfB64 = pdfBytes.toString('base64')
console.log(`\nTesting: ${basename(pdfPath)}  (first ${pagesToTest} pages)\n`)

const browser = await chromium.launch()
const page = await browser.newPage()

// Minimal HTML with pdf.js + detector logic
await page.setContent(`<!DOCTYPE html><html><body><script type="module">
import * as pdfjsLib from 'https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.mjs'
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.mjs'
window._pdfjsLib = pdfjsLib
</script></body></html>`, { waitUntil: 'networkidle' })

// Load PDF from base64
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  window._pdf = await window._pdfjsLib.getDocument({ data: bytes }).promise
  window._numPages = window._pdf.numPages
}, pdfB64)

const numPages = await page.evaluate(() => window._numPages)
console.log(`Total pages: ${numPages}`)

// Run detection on each page
const params = { scale: 1.5, density: 0.30, maxthick: 8, sysgap: 25, margin: 3 }

for (let p = 1; p <= Math.min(pagesToTest, numPages); p++) {
  const result = await page.evaluate(async ({ pageNum, params }) => {
    const { scale, density, maxthick, sysgap, margin } = params
    const pdfPage = await window._pdf.getPage(pageNum)
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

    // Adaptive background threshold
    let bgSum = 0, bgCount = 0
    const regions = [[10,10],[w-30,10],[10,h-30],[w-30,h-30],[10,h>>1],[w-30,h>>1]]
    regions.forEach(([rx, ry]) => {
      for (let dy = 0; dy < 20; dy++) for (let dx = 0; dx < 20; dx++) {
        const i = ((ry+dy)*w + (rx+dx)) * 4
        bgSum += data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114
        bgCount++
      }
    })
    const bgAvg = bgSum / bgCount
    const darkThreshold = bgAvg * 0.75

    // Row density scan
    const rowDensity = new Float32Array(h)
    for (let y = 0; y < h; y++) {
      let dark = 0, total = 0
      for (let x = scanLeft; x < scanRight; x += 2) {
        const i = (y*w + x) * 4
        if (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114 < darkThreshold) dark++
        total++
      }
      rowDensity[y] = dark / total
    }

    // Candidates → segments → systems
    const candidates = []
    for (let y = 0; y < h; y++) if (rowDensity[y] >= density) candidates.push(y)

    const segments = []
    let i = 0
    while (i < candidates.length) {
      let start = candidates[i], end = start
      while (i < candidates.length && candidates[i] <= end + 2) { end = candidates[i]; i++ }
      if (end - start + 1 <= maxthick) segments.push({ top: start, bottom: end })
    }

    const systems = []
    let group = []
    segments.forEach(seg => {
      if (!group.length) { group.push(seg); return }
      if (seg.top - group[group.length-1].bottom > sysgap) {
        if (group.length >= 2) systems.push(group)
        group = [seg]
      } else group.push(seg)
    })
    if (group.length >= 2) systems.push(group)

    return {
      canvasSize: `${w}×${h}`,
      bgAvg: Math.round(bgAvg),
      darkThreshold: Math.round(darkThreshold),
      candidateRows: candidates.length,
      segments: segments.length,
      systems: systems.map(g => ({
        lines: g.length,
        topY: g[0].top,
        bottomY: g[g.length-1].bottom,
        topRatio: +(g[0].top / h).toFixed(4),
      }))
    }
  }, { pageNum: p, params })

  console.log(`── Page ${p} ──  canvas ${result.canvasSize}  bgAvg=${result.bgAvg}  darkThreshold=${result.darkThreshold}`)
  console.log(`   candidates=${result.candidateRows}  segments=${result.segments}  systems=${result.systems.length}`)
  result.systems.forEach((s, idx) => {
    console.log(`   System ${idx+1}: ${s.lines} lines  y=${s.topY}–${s.bottomY}  ratio=${s.topRatio}`)
  })
  if (result.systems.length === 0) {
    console.log(`   ⚠️  NO SYSTEMS DETECTED`)
  }
  console.log()
}

await browser.close()
console.log('Done.')
