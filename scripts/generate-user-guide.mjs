/**
 * Generates public/assets/ScoreFlow_UserGuide.pdf from docs/user-manual.html
 * Run: node scripts/generate-user-guide.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '../docs/user-manual.html');
const OUT = path.join(__dirname, '../public/assets/ScoreFlow_UserGuide.pdf');

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Load from local file for accurate font/CSS rendering
    await page.goto(`file://${SRC}`, { waitUntil: 'networkidle' });

    await page.pdf({
        path: OUT,
        format: 'A4',
        printBackground: true,
        scale: 1,
        margin: { top: '16mm', right: '16mm', bottom: '16mm', left: '16mm' },
    });

    await browser.close();
    console.log(`✅  User Guide generated → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
