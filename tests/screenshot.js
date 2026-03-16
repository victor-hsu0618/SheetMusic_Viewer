import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH = path.resolve(__dirname, '../Test_Document/Rachmaninoff_-_Cello_Sonata_in_G_minor_-_Op._19_-_II.pdf');
const OUT = path.resolve(__dirname, '../docs/screenshot');

async function shot(page, name, el = null) {
    await page.waitForTimeout(400);
    if (el) {
        await el.screenshot({ path: `${OUT}/${name}` });
    } else {
        await page.screenshot({ path: `${OUT}/${name}` });
    }
    console.log(`📸 ${name}`);
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto('http://localhost:5173/SheetMusic_Viewer/');
    await page.waitForSelector('#app-root', { timeout: 15000 });

    // Load PDF
    const fileInput = await page.$('.native-file-input[accept="application/pdf"]');
    await fileInput.setInputFiles(PDF_PATH);
    await page.waitForSelector('.pdf-canvas', { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.keyboard.press('w'); // fit to width
    await page.waitForTimeout(600);

    // ── S1: App overview ──────────────────────────────
    await shot(page, 's1_overview.png');

    // ── S2: Doc Bar ───────────────────────────────────
    const docBar = await page.$('#floating-doc-bar');
    await shot(page, 's2_docbar.png', docBar);

    // S2: With ruler
    await page.keyboard.press('r');
    await page.waitForTimeout(400);
    await shot(page, 's2_with_ruler.png');
    await page.keyboard.press('r'); // hide ruler again
    await page.waitForTimeout(300);

    // ── Open stamp panel ──────────────────────────────
    await page.keyboard.press('t');
    await page.waitForTimeout(600);
    const panel = await page.$('#active-tools-container');

    // ── S6: Edit toolbar ──────────────────────────────
    await shot(page, 's6_edit_toolbar.png', panel);

    // ── S6: Pens ──────────────────────────────────────
    const tabs = await page.$$('.tool-category-tab');
    const tabNames = await Promise.all(tabs.map(t => t.textContent()));

    const clickTab = async (name) => {
        for (let i = 0; i < tabs.length; i++) {
            if (tabNames[i].trim().toLowerCase().includes(name.toLowerCase())) {
                await tabs[i].click();
                await page.waitForTimeout(400);
                return;
            }
        }
    };

    await clickTab('Pens');
    await shot(page, 's6_pens.png', panel);

    await clickTab('Fingering');
    await shot(page, 's6_fingering.png', panel);

    await clickTab('Articulation');
    await shot(page, 's6_articulation.png', panel);

    await clickTab('Text');
    await shot(page, 's6_text.png', panel);

    await clickTab('Others');
    await shot(page, 's6_others.png', panel);

    // ── S4/S5: Settings → More (Staff Detection + Cloak) ──
    await page.click('.btn-settings-top-right');
    await page.waitForTimeout(600);
    await page.click('.settings-vtab-btn[data-tab="more"]');
    await shot(page, 's4_settings_more.png', panel);

    // Settings → Size (Cloak Badge toggle)
    await page.click('.settings-vtab-btn[data-tab="display"]');
    await shot(page, 's_settings_size.png', panel);

    // ── Back to tools panel from settings ─────────────
    await page.click('#btn-settings-back');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const canvas = await page.$('.pdf-canvas');
    const box = await canvas.boundingBox();

    // ── S3: Ruler on + place anchors via app.activeStampType ──
    await page.keyboard.press('r'); // ruler on
    await page.waitForTimeout(300);
    // Use app API directly to set anchor mode
    await page.evaluate(() => {
        window.app.activeStampType = 'anchor';
    });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.25);
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
    await page.waitForTimeout(500);
    await shot(page, 's3_anchors_ruler.png');

    // ── S6: Draw pen stroke ─────────────────────────────
    await page.evaluate(() => {
        window.app.activeStampType = 'pen';
    });
    await page.waitForTimeout(200);
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.18);
    await page.mouse.down();
    for (let i = 0; i <= 20; i++) {
        await page.mouse.move(box.x + box.width * (0.35 + i * 0.018), box.y + box.height * (0.18 + Math.sin(i * 0.4) * 0.02));
        await page.waitForTimeout(10);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // ── S6: Place fingering stamps ──────────────────────
    await page.evaluate(() => { window.app.activeStampType = 'f1'; });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.13);
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.app.activeStampType = 'f2'; });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.47, box.y + box.height * 0.13);
    await page.waitForTimeout(200);
    await page.evaluate(() => { window.app.activeStampType = 'up-bow'; });
    await page.waitForTimeout(200);
    await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.10);
    await page.waitForTimeout(500);
    await shot(page, 's6_annotations_on_score.png');

    await browser.close();
    console.log('\n✅ All screenshots saved to docs/screenshot/');
})();
