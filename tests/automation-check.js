import { chromium, expect } from '@playwright/test';

/**
 * ScoreFlow Elite Automation Test
 * This script tests the core functionality of the SheetMusic Viewer.
 */
(async () => {
    console.log('🚀 Starting ScoreFlow Elite Automation Test...');

    // Launch browser (non-headless so you can see the magic happen)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Load the application
        console.log('--- Step 1: Loading Application ---');
        await page.goto('http://localhost:5173/SheetMusic_Viewer/');
        await page.waitForSelector('#app');
        console.log('✅ Application loaded.');

        // 2. Test Sidebar Toggling
        console.log('--- Step 2: Testing Sidebar ---');
        // Hover left edge to trigger sidebar open
        await page.mouse.move(5, 500);
        await page.waitForSelector('#sidebar.open');
        console.log('✅ Sidebar opened on hover.');

        // 3. Test Library & Specific PDF Loading (Simulated)
        console.log('--- Step 3: Testing Library UI ---');
        await page.click('.sidebar-tab[data-tab="library"]');

        // Check if the Library interface elements are present
        const libBtn = page.locator('#select-library-btn');
        const searchInput = page.locator('#library-search');
        await expect(libBtn).toBeVisible();
        await expect(searchInput).toBeVisible();
        console.log('✅ Library selection UI verified.');

        // User Test Score Verification Note:
        // Directory: /Users/victor_hsu/MyProgram/SheetMusic_Viewer/Test_Document/大稻埕2026-下半年
        // Manual Action: Click "Select Library Folder" and pick the above path.
        console.log('ℹ️  Note: To test the actual PDF loading for "大稻埕2026", manually select the folder during the dev session.');

        // 4. Test Tab Switching (Score Detail, Settings)
        console.log('--- Step 4: Testing Tab Switching ---');
        const tabs = ['score-detail', 'settings'];
        for (const tab of tabs) {
            await page.click(`.sidebar-tab[data-tab="${tab}"]`);
            const panel = page.locator(`.tab-panel[data-panel="${tab}"]`);
            await expect(panel).toHaveClass(/active/);

            // Special check for Score Detail tab UI
            if (tab === 'score-detail') {
                const nameInput = page.locator('#score-name-input');
                await expect(nameInput).toBeVisible();
                console.log(`✅ Score Detail tab symbols verified.`);
            }

            console.log(`✅ Tab "${tab}" content displayed.`);
        }

        // 5. Test Notation Visibility Toggles (Score Tab)
        console.log('--- Step 5: Testing Visibility Toggles ---');
        await page.click('.sidebar-tab[data-tab="score"]');
        const firstBtn = page.locator('.layer-vis-btn').first();
        const initialText = (await firstBtn.textContent()).trim();
        console.log(`Initial button text: ${initialText}`);

        await firstBtn.click();
        const afterClickText = (await firstBtn.textContent()).trim();
        console.log(`After click text: ${afterClickText}`);

        if (initialText !== afterClickText) {
            console.log('✅ Toggle successfully changed label (Show/Hide).');
        } else {
            throw new Error('Toggle failed to update label!');
        }

        // 6. Test Settings Slider
        console.log('--- Step 6: Testing Settings Slider ---');
        await page.click('.sidebar-tab[data-tab="settings"]');
        const slider = page.locator('#jump-offset');
        await slider.fill('4.2'); // Simulate moving slider to 4.2
        const valText = await page.textContent('#jump-offset-value');
        if (valText.includes('4.2')) {
            console.log('✅ Jump offset slider updated correctly.');
        } else {
            throw new Error('Slider value display mismatch!');
        }

        console.log('\n✨ ALL CORE TESTS PASSED! ✨');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error.message);
    } finally {
        console.log('\nClosing browser in 5 seconds...');
        await new Promise(r => setTimeout(r, 5000));
        await browser.close();
    }
})();
