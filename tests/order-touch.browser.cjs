// Optional real-browser regression check. Set PLAYWRIGHT_MODULE if Playwright is installed elsewhere.
// All app data and network requests are local fixtures; no Firebase writes are performed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const source = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '')
    .replace(/initializeApplication\(\);\s*$/, '');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '');
const css = fs.readFileSync(path.join(root, 'public/css/app.css'), 'utf8');
// Supply layout utilities locally so tests never depend on a CDN being available.
const layout = `
    * { box-sizing: border-box; } body { margin: 0; font: 16px sans-serif; }
    #loading-overlay { display: none; }
    #order-modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; }
    #order-modal > div { width: min(768px, 96vw); max-height: 90vh; display: flex; flex-direction: column; background: white; }
    #order-modal > div > :first-child, .hig-modal-footer { flex-shrink: 0; padding: 12px 16px; }
    #order-modal > div > :nth-child(2) { overflow-y: auto; flex: 1; min-height: 0; padding: 16px; }
    #active-list { padding: 12px; background: #eef4ff; }
    .sortable-item, #available-list > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; min-height: 68px; margin: 8px 0; background: white; border: 1px solid #ddd; }
    .remove-item-btn, .add-item-btn { min-height: 44px; min-width: 44px; }
    .flex { display: flex; } .flex-grow { flex-grow: 1; } .items-center { align-items: center; }
    .hidden { display: none; } .hig-modal-footer { display: flex; justify-content: flex-end; gap: 8px; }
`;

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
        await page.goto('http://tenpo.test/');
        await page.addStyleTag({ content: css + layout });
        await page.addScriptTag({ content: source + `
            currentState = {store:'test-store',storeName:'テスト店舗',staff:'test-staff',category:'引き継ぎチェック',orderType:'handover1Order'};
            handoverTaskMaster = Object.fromEntries(Array.from({length:25}, (_, i) => ['t'+i, {name:'確認項目 '+(i+1)}]));
            storeSettings = {'test-store':{handover1Order:Object.keys(handoverTaskMaster),handover2Order:['t2','t1','t0']}};
            window.testWrites = [];
            window.testFailSave = false;
            function doc(db, path, id) { return {path,id}; }
            async function setDoc(ref, payload, options) {
                if (window.testFailSave) throw new Error('test save failure');
                window.testWrites.push({ref,payload,options});
            }
            updateCategoryStatus = async () => {};
            window.openTestOrder = (orderType = 'handover1Order') => {
                openOrderModalForCategory(orderType, orderType === 'handover1Order' ? '1レジの項目設定' : '2レジの項目設定');
            };
            window.testStoredOrder = () => storeSettings['test-store'][currentState.orderType];
            window.openTestOrder();
        ` });
        const cdp = await page.context().newCDPSession(page);
        const order = () => page.locator('#active-list > [data-id]').evaluateAll(items => items.map(item => item.dataset.id));
        const scrollTop = () => page.locator('#order-modal > div > :nth-child(2)').evaluate(el => el.scrollTop);
        async function touch(type, x, y) {
            await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
        }
        async function swipe(x, startY, endY) {
            await touch('touchStart', x, startY);
            for (let i = 1; i <= 10; i++) await touch('touchMove', x, startY + (endY - startY) * i / 10);
            await touch('touchEnd');
        }
        const initial = await order();
        await page.locator('.remove-item-btn').first().tap();
        if (baseline) {
            console.log('Before fix: tap on remove button removed item:', (await order()).length < initial.length);
        } else {
            assert.equal((await order()).length, initial.length - 1, 'touch remove');
            await page.locator('#available-list .add-item-btn').first().tap();
            assert.equal((await order()).at(-1), 't0', 'touch add');
        }
        await page.evaluate(() => window.openTestOrder());
        const row = await page.locator('#active-list > [data-id]').nth(3).boundingBox();
        await swipe(row.x + row.width / 2, row.y + row.height / 2, row.y - 140);
        await page.waitForTimeout(150);
        if (baseline) {
            console.log('Before fix: ordinary row swipe scrolled list:', await scrollTop() > 0);
            console.log('Before fix: ordinary row swipe changed order:', JSON.stringify(await order()) !== JSON.stringify(initial));
            return;
        }
        assert.ok(await scrollTop() > 0, 'ordinary row swipe must scroll');
        assert.deepEqual(await order(), initial, 'scrolling must not reorder items');
        await page.evaluate(() => window.openTestOrder());
        await page.locator('.move-item-down-btn').first().tap();
        assert.deepEqual((await order()).slice(0, 3), ['t1', 't0', 't2'], 'tap move down');
        await page.locator('#active-list > [data-id="t0"] .move-item-up-btn').tap();
        assert.deepEqual(await order(), initial, 'tap move up');
        assert.equal(await page.locator('.move-item-up-btn').first().isDisabled(), true);
        assert.equal(await page.locator('.move-item-down-btn').last().isDisabled(), true);

        // Drag only the handle; allow enough travel to cross multiple row midpoints.
        const handle = await page.locator('.order-drag-handle').first().boundingBox();
        const destination = await page.locator('#active-list > [data-id]').nth(2).boundingBox();
        await swipe(handle.x + handle.width / 2, handle.y + handle.height / 2, destination.y + destination.height - 4);
        assert.deepEqual((await order()).slice(0, 3), ['t1', 't2', 't0'], 'touch handle drag');

        // Moving near the bottom must reach initially off-screen items.
        await page.evaluate(() => window.openTestOrder());
        const firstHandle = await page.locator('.order-drag-handle').first().boundingBox();
        const body = await page.locator('#order-modal > div > :nth-child(2)').boundingBox();
        await touch('touchStart', firstHandle.x + 15, firstHandle.y + 15);
        await touch('touchMove', firstHandle.x + 15, body.y + body.height - 8);
        await page.waitForTimeout(750);
        assert.ok(await scrollTop() > 100, 'edge drag auto-scroll');
        await touch('touchCancel');
        assert.equal(await page.locator('.sortable-ghost').count(), 0, 'cancel cleans drag state');
        const stoppedScroll = await scrollTop();
        await page.waitForTimeout(100);
        assert.equal(await scrollTop(), stoppedScroll, 'cancel stops auto-scroll');

        // Cancellation discards edits; successful save persists only the chosen register.
        await page.locator('#cancel-order-btn').tap();
        await page.evaluate(() => window.openTestOrder());
        assert.deepEqual(await order(), initial, 'cancel does not save');
        await page.locator('.move-item-down-btn').first().tap();
        const savedOrder = await order();
        await page.locator('#save-order-btn').tap();
        await page.waitForSelector('#order-modal', { state: 'detached' });
        const writes = await page.evaluate(() => window.testWrites);
        assert.deepEqual(writes.at(-1).payload, { handover1Order: savedOrder });
        assert.equal(writes.at(-1).options.merge, true);
        await page.evaluate(() => window.openTestOrder());
        assert.deepEqual(await order(), savedOrder, 'reopening keeps saved order');
        await page.evaluate(() => window.openTestOrder('handover2Order'));
        assert.deepEqual(await order(), ['t2', 't1', 't0'], 'register 2 remains independent');
        await page.locator('.move-item-down-btn').first().tap();
        await page.evaluate(() => { window.testFailSave = true; });
        await page.locator('#save-order-btn').tap();
        assert.equal(await page.locator('#order-modal').count(), 1, 'failed save keeps dialog');
        assert.deepEqual(await page.evaluate(() => window.testStoredOrder()), ['t2', 't1', 't0'], 'failed save does not replace stored order');
        await page.evaluate(() => { window.testFailSave = false; });
        await page.locator('#save-order-btn').tap();
        await page.waitForSelector('#order-modal', { state: 'detached' });
        await page.evaluate(() => window.openTestOrder('handover2Order'));
        assert.deepEqual(await order(), ['t1', 't2', 't0'], 'register 2 save');

        // Mouse/trackpad uses the same handle without native drag-and-drop conflicts.
        const mouseHandle = await page.locator('.order-drag-handle').first().boundingBox();
        const mouseTarget = await page.locator('#active-list > [data-id]').nth(2).boundingBox();
        await page.mouse.move(mouseHandle.x + 15, mouseHandle.y + 15);
        await page.mouse.down();
        await page.mouse.move(mouseHandle.x + 15, mouseTarget.y + mouseTarget.height - 4, { steps: 8 });
        await page.mouse.up();
        assert.deepEqual(await order(), ['t2', 't0', 't1'], 'mouse handle drag');
        assert.deepEqual(errors, [], 'no uncaught browser errors');
        if (process.env.DHDAPP_TEST_SCREENSHOT) {
            await page.setViewportSize({ width: 820, height: 1180 });
            await page.evaluate(() => window.openTestOrder());
            await page.screenshot({ path: process.env.DHDAPP_TEST_SCREENSHOT });
        }
        console.log('PASS: touch reorder, tap controls, scrolling, auto-scroll, cancel, register-specific save/reopen, save failure, mouse drag');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
