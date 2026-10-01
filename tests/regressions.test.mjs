import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

process.env.TZ = 'Asia/Tokyo';

// Run the app's own functions without loading Firebase or touching production data.
const source = fs.readFileSync(process.env.DHDAPP_TEST_SOURCE || new URL('../public/js/app.js', import.meta.url), 'utf8')
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*"[^"]+";/g, '')
    .replace(/initializeApplication\(\);\s*$/, '');

function element() {
    return {
        children: [], style: {}, dataset: {}, listeners: {},
        classList: { add() {}, remove() {} },
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); },
        addEventListener(type, fn) { this.listeners[type] = fn; },
        dispatchEvent(event) { this.listeners[event.type]?.(event); },
    };
}

function card(dataset, values) {
    const fields = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {
        value: String(value), checked: value === true, dispatchEvent() {},
    }]));
    return { dataset, fields, querySelector(selector) { return fields[selector.match(/data-field="([^"]+)"/)?.[1]]; } };
}

function harness() {
    const nodes = new Map();
    const storage = new Map();
    const timers = new Map();
    let timerId = 0;
    const document = {
        activeCards: [], cards: { temp: [], haccp: [] },
        getElementById(id) {
            if (!nodes.has(id)) {
                const node = element();
                node.querySelector = selector => this.getElementById(selector);
                nodes.set(id, node);
            }
            return nodes.get(id);
        },
        querySelector(selector) { return this.getElementById(selector); },
        querySelectorAll(selector) {
            if (selector.includes('[data-equipment-id]')) return this.activeCards.filter(c => c.dataset.equipmentId);
            if (selector.includes('[data-item-id]')) return this.activeCards.filter(c => c.dataset.itemId);
            return [];
        },
        createElement: element,
    };
    const context = vm.createContext({
        console, Date, Event, document,
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
        sessionStorage: { getItem: () => null, setItem() {} },
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id),
        Timestamp: { fromDate: date => date },
        collectionGroup: (_db, name) => name,
        where: (field, operator, value) => ({ field, operator, value }),
        query: (group, ...conditions) => ({ group, conditions }),
        records: [],
    });
    const run = code => vm.runInContext(code, context);
    run(source);
    run(`
        showAppAlert = () => {};
        updateCategoryStatus = async () => {};
        updateDashboard = async () => {};
        createModal = () => {};
        renderTempCheckView = () => { document.activeCards = document.cards.temp; };
        renderHaccpCheckView = () => { document.activeCards = document.cards.haccp; };
        currentState.store = 'store-A';
        currentState.staff = 'staff-A';
        currentState.category = '温度チェック';
    `);
    context.getDocs = async ({ group, conditions }) => ({
        docs: context.records.filter(record => record.group === group && conditions.every(({ field, operator, value }) => {
            const actual = field === 'createdAt' ? record.data.createdAt.toDate() : record.data[field];
            if (operator === '==') return actual === value;
            if (operator === '>=') return actual >= value;
            if (operator === '<') return actual < value;
            if (operator === '<=') return actual <= value;
            throw new Error(`Unexpected query operator: ${operator}`);
        })).map(record => ({ id: record.id, data: () => record.data })),
    });
    return { run, document, storage, timers, context };
}

test('leaving an unfinished form saves it for its owner, never the newly selected store/staff', () => {
    const h = harness();
    h.document.cards.temp = [card({ equipmentId: 'shared-fridge' }, { temperature: '4.5' })];
    h.run("renderChecklistView('温度チェック'); scheduleDraftSave(); backToMainView();");
    const originalKey = [...h.storage.keys()][0];
    assert.ok(originalKey?.includes(':store-A:staff-A:温度チェック:'));
    assert.equal(h.timers.size, 0);
    h.run("currentState.store = 'store-B'; currentState.staff = 'staff-B'; flushDraftSaveSync();");
    assert.equal(h.storage.size, 1);
    assert.equal(JSON.parse(h.storage.get(originalKey)).checks[0].temperature, '4.5');
    h.document.cards.temp = [card({ equipmentId: 'shared-fridge' }, { temperature: '' })];
    h.run("renderChecklistView('温度チェック');");
    assert.equal(h.document.activeCards[0].fields.temperature.value, '');
    h.run("backToMainView(); currentState.store = 'store-A'; currentState.staff = 'staff-A'; renderChecklistView('温度チェック');");
    assert.equal(h.document.activeCards[0].fields.temperature.value, '4.5');
});

test('switching categories before the debounce fires preserves both drafts', () => {
    const h = harness();
    h.document.cards.temp = [card({ equipmentId: 'fridge' }, { temperature: '3.0' })];
    h.document.cards.haccp = [card({ itemId: 'wash' }, { status: '実施', action: '処置済' })];
    h.run("renderChecklistView('温度チェック'); scheduleDraftSave(); currentState.category = 'HACCPチェック'; renderChecklistView('HACCPチェック'); flushDraftSaveSync();");
    const entries = [...h.storage.entries()];
    assert.equal(entries.length, 2);
    const temp = JSON.parse(entries.find(([key]) => key.includes(':温度チェック:'))[1]);
    const haccp = JSON.parse(entries.find(([key]) => key.includes(':HACCPチェック:'))[1]);
    assert.equal(temp.checks[0].temperature, '3.0');
    assert.equal(haccp.checks[0].status, '実施');
});

test('opening dashboard history cannot rewrite an unrelated hidden form draft', () => {
    const h = harness();
    h.document.cards.temp = [card({ equipmentId: 'fridge' }, { temperature: '3.0' })];
    h.run("renderChecklistView('温度チェック'); renderDashboardView();");
    const before = [...h.storage.entries()];
    h.run("currentState.category = 'HACCPチェック'; flushDraftSaveSync();");
    assert.deepEqual([...h.storage.entries()], before);
    assert.equal(before.length, 1);
});

test('clearing a saved draft cancels its pending write', () => {
    const h = harness();
    h.document.cards.temp = [card({ equipmentId: 'fridge' }, { temperature: '3.0' })];
    h.run("renderChecklistView('温度チェック'); flushDraftSaveSync(); scheduleDraftSave(); clearChecklistDraft();");
    assert.equal(h.storage.size, 0);
    assert.equal(h.timers.size, 0);
});

for (const [category, group, logCategory] of [
    ['温度チェック', 'entries', 'temperature'],
    ['HACCPチェック', 'entries', 'haccp'],
    ['トイレ掃除', 'entries', 'toilet_cleaning'],
    ['引き継ぎチェック', 'handover1Order', null],
    ['引き継ぎチェック', 'handover2Order', null],
]) {
    test(`${category}/${group}: monthly history follows the 05:00 business-day boundary`, async () => {
        const h = harness();
        h.run(`currentState.category = ${JSON.stringify(category)};`);
        h.context.records = [
            ['before', '2026-09-01T04:59:59.999+09:00'],
            ['start', '2026-09-01T05:00:00+09:00'],
            ['month-end', '2026-09-30T23:59:59.999+09:00'],
            ['overnight', '2026-10-01T02:00:00+09:00'],
            ['last-ms', '2026-10-01T04:59:59.999+09:00'],
            ['next-month', '2026-10-01T05:00:00+09:00'],
        ].map(([id, timestamp]) => ({
            id, group, data: { storeId: 'store-A', logCategory, createdAt: { toDate: () => new Date(timestamp) } },
        }));
        const logs = await h.run('fetchLogsForMonth(2026, 8)');
        assert.deepEqual(Array.from(logs, log => log.id), ['start', 'month-end', 'overnight', 'last-ms']);
        await h.run('generateCalendar(2026, 8)');
        const days = h.document.getElementById('calendar-body').children;
        const lastDay = days.find(day => day.children[0]?.textContent === 30);
        assert.equal(lastDay.children[1]?.textContent, '3件');
        h.run('showLogsForDay = (date, logs) => { globalThis.selectedDay = formatLocalYMD(date); globalThis.selectedLogs = logs; };');
        lastDay.listeners.click();
        assert.equal(h.context.selectedDay, '2026-09-30');
        assert.deepEqual(Array.from(h.context.selectedLogs, log => log.id), ['month-end', 'overnight', 'last-ms']);
    });
}

for (const [from, button, expected] of [
    ['2026-03-31T12:00:00+09:00', 'prev-month-btn', [2026, 1]],
    ['2026-01-31T12:00:00+09:00', 'next-month-btn', [2026, 1]],
    ['2024-03-31T12:00:00+09:00', 'prev-month-btn', [2024, 1]],
    ['2026-12-31T12:00:00+09:00', 'next-month-btn', [2027, 0]],
]) {
    test(`calendar ${from.slice(0, 10)} ${button} moves exactly one month`, () => {
        const h = harness();
        h.run('generateCalendar = (year, month) => { globalThis.renderedMonth = [year, month]; };');
        h.run(`renderCalendarModal(new Date(${JSON.stringify(from)}));`);
        h.document.getElementById(button).listeners.click();
        assert.deepEqual(Array.from(h.context.renderedMonth), expected);
    });
}

test('opening history before 05:00 on the first of the month shows the previous business month', () => {
    const h = harness();
    h.run("getBusinessDateString = () => '2026-09-30'; renderCalendarModal = date => { globalThis.openedMonth = [date.getFullYear(), date.getMonth()]; }; showHistory();");
    assert.deepEqual(Array.from(h.context.openedMonth), [2026, 8]);
});

test('HACCP history and PDF include the action/contact, with safe text and empty-value fallback', () => {
    const h = harness();
    h.run("currentState.category = 'HACCPチェック'; haccpMaster = { wash: { name: '手洗い' } };");
    h.context.log = {
        createdAt: { toDate: () => new Date('2026-09-30T12:00:00+09:00') },
        data: { checks: [
            { itemId: 'wash', status: '未実施', action: '経過観察', contact: 'メンテナンスセンター' },
            { itemId: 'wash', status: '実施', action: '<b>処置済</b>', contact: null },
        ] },
    };
    for (const forPrint of [false, true]) {
        const html = h.run(`generateLogDetailHTML(log, { forPrint: ${forPrint} })`);
        assert.match(html, /異常時の処置:<\/strong> 経過観察/);
        assert.match(html, /連絡先:<\/strong> メンテナンスセンター/);
        assert.match(html, /&lt;b&gt;処置済&lt;\/b&gt;/);
        assert.match(html, /連絡先:<\/strong> 未入力/);
    }
});
