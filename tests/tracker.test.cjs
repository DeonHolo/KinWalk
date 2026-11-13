const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = require('../app/src/main/assets/tracker-data.js');
const assets = path.join(__dirname, '../app/src/main/assets');
const backup = () => data.normalizeData(data.defaults);
const food = changes => ({ id: 123, time: '2026-11-12T12:00:00.000Z', name: 'Rice', calories: 200, ...changes });

function app(saved, options = {}) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) {
            const listeners = {};
            elements.set(id, { value: '', style: {}, checked: false, dataset: {}, listeners,
                addEventListener: (type, listener) => { listeners[type] = listener; },
                before() {}, classList: { add() {}, remove() {} } });
        }
        return elements.get(id);
    };
    const calls = [], alerts = [], listeners = new Map();
    let persisted = saved ? JSON.stringify(saved) : null;
    const bridge = options.browser ? undefined : {
        setTrackingCutoff: hour => calls.push(['cutoff', hour]),
        setWalkingEnabled: enabled => calls.push(['walking', enabled]),
        clearStepData: () => calls.push(['clearSteps']),
        getSteps: () => JSON.stringify(options.sensor || { available: true, permission: false, steps: 0 }),
        saveFile: (...args) => calls.push(['file', ...args])
    };
    const window = {
        KinAndroid: bridge,
        addEventListener: (type, listener) => listeners.set(type, listener),
        dispatchEvent: event => { calls.push(['event', event.type]); listeners.get(event.type)?.(event); }
    };
    const context = vm.createContext({
        KinData: data, window, Event: class { constructor(type) { this.type = type; } },
        document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [],
            querySelector: element, createElement: type => element(type + elements.size) },
        localStorage: { getItem: () => persisted, setItem: (_, value) => { persisted = value; } },
        alert: message => alerts.push(message), confirm: () => options.confirm !== false,
        setInterval() {}, setTimeout() {}, console
    });
    vm.runInContext(fs.readFileSync(path.join(assets, 'app.js'), 'utf8'), context);
    return { element, calls, alerts, window, context,
        state: () => JSON.parse(vm.runInContext('JSON.stringify(db)', context)),
        persisted: () => persisted && JSON.parse(persisted),
        runGarden: () => {
            const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
            for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(script, context);
        } };
}

test('legacy backups receive missing habits and walking defaults', () => {
    const old = backup();
    delete old.habits;
    delete old.settings.walkingCleared;
    assert.deepEqual(data.normalizeData(old).habits, {});
    assert.equal(data.normalizeData(old).settings.walkingCleared, false);
});

test('normalizing data never shares mutable default arrays or settings', () => {
    const first = backup();
    first.food.push(food());
    first.settings.walkingCleared = true;
    assert.equal(backup().food.length, 0);
    assert.equal(backup().settings.walkingCleared, false);
});

test('malformed collection and entry data is rejected before replacing saved data', () => {
    for (const value of [null, [], 123, 'tracker']) assert.throws(() => data.normalizeData(value));
    assert.throws(() => data.normalizeData({ food: 'invalid' }));
    assert.throws(() => data.normalizeData({ food: [null] }));
    assert.throws(() => data.normalizeData({ food: [food({ time: 'not-a-date' })] }));
    assert.throws(() => data.normalizeData({ food: [food({ calories: Infinity })] }));
    assert.throws(() => data.normalizeData({ food: [food({ calories: -10 })] }));
});

test('entry IDs cannot inject markup or ambiguously delete duplicate records', () => {
    assert.throws(() => data.normalizeData({ food: [food({ id: '" onclick="alert(1)' })] }));
    assert.throws(() => data.normalizeData({ food: [food(), food()] }));
});

test('settings reject invalid day boundaries, reference values and clearance strings', () => {
    for (const boundary of [-1, 24, 2.5, '', null, true]) {
        assert.throws(() => data.normalizeData({ settings: { boundary } }));
    }
    for (const target of [0, -2000, 5001, Infinity, 'invalid']) {
        assert.throws(() => data.normalizeData({ settings: { target } }));
    }
    assert.throws(() => data.normalizeData({ settings: { walkingCleared: 'false' } }));
    assert.throws(() => data.normalizeData({ settings: { clearance: 'cleared' } }));
});

test('legacy numeric strings, optional measurements and habits survive a round trip', () => {
    const old = backup();
    old.food = [food({ calories: '200' })];
    old.weights = [{ id: 42, time: '2026-11-12T12:00:00Z', weight: '110', waist: '', hips: '100' }];
    old.habits['2026-11-12'] = true;
    const result = data.normalizeData(old);
    assert.equal(result.food[0].calories, 200);
    assert.equal(result.weights[0].hips, 100);
    assert.equal(result.habits['2026-11-12'], true);
    assert.deepEqual(data.normalizeData(JSON.parse(JSON.stringify(result))), result);
});

test('night-shift day changes at the configured local cutoff', () => {
    assert.equal(data.trackingDay(new Date(2026, 10, 13, 9, 59), 10), '2026-11-12');
    assert.equal(data.trackingDay(new Date(2026, 10, 13, 10, 0), 10), '2026-11-13');
    assert.equal(data.trackingDay(new Date(2026, 0, 1, 1, 0), 10), '2025-12-31');
    assert.equal(data.trackingDay(new Date(2026, 10, 13, 0, 0), 0), '2026-11-13');
});

test('browser preview works without the Android bridge', () => {
    const ui = app(undefined, { browser: true });
    ui.window.addWater(250);
    assert.equal(ui.element('homeWater').textContent, '250 mL');
    assert.equal(ui.persisted().water[0].ml, 250);
});

test('restoring an older backup is atomic and synchronizes native walking and cutoff', async () => {
    const ui = app();
    const restored = backup();
    restored.settings.boundary = 6;
    restored.settings.walkingCleared = true;
    delete restored.habits;
    const input = { files: [{ text: async () => JSON.stringify(restored) }], value: 'backup.json' };
    await ui.element('importFile').onchange({ target: input });
    assert.equal(ui.state().settings.walkingCleared, true);
    assert.deepEqual(ui.state().habits, {});
    assert.equal(input.value, '');
    assert.deepEqual(ui.calls.slice(-3), [['cutoff', 6], ['walking', true], ['event', 'kinwalk:datachange']]);
});

test('invalid backup leaves existing saved data and native settings intact', async () => {
    const initial = backup();
    initial.food = [food()];
    const ui = app(initial);
    const callsBefore = ui.calls.length;
    const invalid = backup();
    invalid.food = [food({ time: 'bad date' })];
    await ui.element('importFile').onchange({ target: { files: [{ text: async () => JSON.stringify(invalid) }] } });
    assert.deepEqual(ui.state(), initial);
    assert.deepEqual(ui.persisted(), initial);
    assert.equal(ui.calls.length, callsBefore);
    assert.match(ui.alerts[0], /Could not import backup/);
});

test('cancelled restore leaves current records unchanged', async () => {
    const initial = backup();
    initial.food = [food()];
    const ui = app(initial, { confirm: false });
    await ui.element('importFile').onchange({ target: { files: [{ text: async () => JSON.stringify(backup()) }] } });
    assert.equal(ui.state().food.length, 1);
});

test('reset clears native steps, revokes tracking, restores cutoff and updates walking UI', () => {
    const initial = backup();
    initial.settings = { ...initial.settings, boundary: 18, walkingCleared: true };
    const ui = app(initial);
    ui.element('reset').onclick();
    assert.deepEqual(ui.calls.slice(-4), [['clearSteps'], ['cutoff', 10], ['walking', false], ['event', 'kinwalk:datachange']]);
    assert.deepEqual(ui.persisted(), backup());
});

test('cancelled reset does not erase or disable tracking', () => {
    const ui = app(undefined, { confirm: false });
    const before = ui.calls.length;
    ui.element('reset').onclick();
    assert.equal(ui.calls.length, before);
    assert.equal(ui.persisted(), null);
});

test('settings reject invalid calorie references without persisting them', () => {
    const ui = app();
    ui.element('boundary').value = '10';
    ui.element('calTarget').value = '-200';
    ui.element('saveSettings').onclick();
    assert.equal(ui.state().settings.target, 2000);
    assert.equal(ui.persisted(), null);
    assert.match(ui.alerts[0], /1,000 to 5,000/);
});

test('rendering escapes user text and data attributes', () => {
    const ui = app();
    const rendered = vm.runInContext('entryHtml({id: \'" onclick="bad()\', time: new Date().toISOString()}, "food", "<img src=x onerror=bad()>")', ui.context);
    assert.ok(rendered.includes('&lt;img'));
    assert.ok(rendered.includes('data-id="&quot; onclick=&quot;bad()"'));
    assert.ok(!rendered.includes('<img'));
});

test('CSV export quotes values and neutralizes spreadsheet formulas', () => {
    const initial = backup();
    initial.food = [food({ name: '=HYPERLINK("https://example.test")' })];
    const ui = app(initial);
    ui.element('exportCsv').onclick();
    const file = ui.calls.find(call => call[0] === 'file');
    assert.ok(file[2].includes('"\'=HYPERLINK(""https://example.test"")"'));
});

test('all local script assets are available to the offline Android WebView', () => {
    const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
    const java = fs.readFileSync(path.join(assets, '../java/com/kin/fitness/MainActivity.java'), 'utf8');
    for (const [, asset] of html.matchAll(/<script src="([^"]+)"/g)) {
        assert.ok(fs.existsSync(path.join(assets, asset)), asset + ' must exist');
        assert.ok(java.includes('"/' + asset + '"'), asset + ' must be served by Android');
    }
});

test('Walk Garden loads without native hardware and keeps phone-only controls disabled', () => {
    const initial = backup();
    initial.settings.walkingCleared = true;
    const ui = app(initial, { browser: true });
    ui.runGarden();
    assert.equal(ui.element('walkClear').checked, true);
    assert.equal(ui.element('walkPermission').disabled, true);
    assert.match(ui.element('walkStatus').textContent, /preview cannot access your phone sensor/);
});

test('reset immediately relocks a previously active garden and updates its checkbox', () => {
    const initial = backup();
    initial.settings.walkingCleared = true;
    const ui = app(initial, { sensor: { available: true, permission: true, steps: 800 } });
    ui.runGarden();
    assert.equal(ui.element('walkCount').textContent, '800');
    ui.element('reset').onclick();
    assert.equal(ui.element('walkClear').checked, false);
    assert.equal(ui.element('walkSafety').style.display, 'block');
    assert.equal(ui.element('walkCount').textContent, '\u2014');
    assert.equal(ui.element('walkPermission').disabled, true);
    assert.match(ui.element('walkStatus').textContent, /Waiting for medical clearance/);
});

test('restoring clearance immediately updates garden controls and native state', async () => {
    const ui = app();
    ui.runGarden();
    const restored = backup();
    restored.settings.walkingCleared = true;
    await ui.element('importFile').onchange({ target: { files: [{ text: async () => JSON.stringify(restored) }] } });
    assert.equal(ui.element('walkClear').checked, true);
    assert.equal(ui.element('walkPermission').disabled, false);
    assert.equal(ui.element('walkSafety').style.display, 'none');
});
