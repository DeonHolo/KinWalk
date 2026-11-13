'use strict';

const KEY = 'kin_fitness_v1';
const defaults = KinData.defaults;
const $ = id => document.getElementById(id);
let db;
try {
    const saved = localStorage.getItem(KEY);
    db = KinData.normalizeData(saved ? JSON.parse(saved) : defaults);
} catch (error) {
    db = KinData.normalizeData(defaults);
    alert('Saved data could not be loaded: ' + error.message + '. Restore a valid backup before adding new entries.');
}

function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(db));
    } catch (error) {
        alert('Changes could not be saved on this device. Export a backup before closing the app.');
    }
    KinData.syncNative(db, window.KinAndroid);
    render();
    window.dispatchEvent(new Event('kinwalk:datachange'));
}

function pad(n) { return String(n).padStart(2, '0'); }
function dateKey(date) { return KinData.dateKey(date); }
function trackingDay(date) { return KinData.trackingDay(date, db.settings.boundary); }
function today() { return trackingDay(new Date()); }
function fmt(n) { return Math.round(n).toLocaleString(); }
function nowLocal() {
    const date = new Date();
    return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}
function itemsFor(type, day) { return db[type].filter(entry => trackingDay(entry.time) === day); }
function sum(items, key) { return items.reduce((total, entry) => total + Number(entry[key] || 0), 0); }
function remove(type, id) {
    if (!['food', 'water', 'weights', 'symptoms'].includes(type) || !confirm('Delete this entry?')) return;
    db[type] = db[type].filter(entry => entry.id !== id);
    save();
}
function entryHtml(entry, type, description) {
    return `<div class="entry"><div><b>${escapeHtml(description)}</b><br><small>${escapeHtml(new Date(entry.time).toLocaleString())}</small></div><button class="danger" data-remove="${type}" data-id="${escapeHtml(entry.id)}">Delete</button></div>`;
}

function render() {
    const day = today();
    const foods = itemsFor('food', day), waters = itemsFor('water', day);
    const calories = sum(foods, 'calories'), water = sum(waters, 'ml');
    const latest = [...db.weights].sort((a, b) => b.time.localeCompare(a.time))[0];
    $('dayLabel').textContent = `\u2022 ${day}`;
    $('homeCal').textContent = fmt(calories) + ' kcal';
    $('homeWater').textContent = fmt(water) + ' mL';
    $('homeWeight').textContent = (latest ? latest.weight : 110) + ' kg';
    $('homeHabit').textContent = db.habits[day] ? 'Completed \u2713' : 'Not yet';
    $('swapHome').checked = !!db.habits[day];
    $('calRef').textContent = `Reference: ${fmt(db.settings.target)} kcal`;
    $('calBar').style.width = Math.min(100, calories / db.settings.target * 100) + '%';
    const hourLabel = hour => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
    $('boundaryText').textContent = `${hourLabel(db.settings.boundary)} to ${hourLabel(db.settings.boundary)}`;
    $('boundary').value = db.settings.boundary;
    $('calTarget').value = db.settings.target;
    $('clearance').value = db.settings.clearance;
    const foodDay = $('foodDay').value || day;
    const dayFood = itemsFor('food', foodDay).sort((a, b) => b.time.localeCompare(a.time));
    $('foodList').innerHTML = dayFood.length ? dayFood.map(entry => entryHtml(entry, 'food', `${entry.name} - ${fmt(entry.calories)} kcal`)).join('') : '<p class="muted">No food entries for this tracking day.</p>';
    $('foodTotal').textContent = `Total: ${fmt(sum(dayFood, 'calories'))} kcal`;
    $('waterTotal').textContent = fmt(water) + ' mL';
    $('waterList').innerHTML = waters.length ? waters.sort((a, b) => b.time.localeCompare(a.time)).map(entry => entryHtml(entry, 'water', `${entry.ml} mL`)).join('') : '<p class="muted">No water logged yet.</p>';
    $('weightList').innerHTML = [...db.weights].sort((a, b) => b.time.localeCompare(a.time)).map(entry => entryHtml(entry, 'weights', `${entry.weight} kg${entry.waist ? ' \u2022 Waist ' + entry.waist + ' cm' : ''}${entry.hips ? ' \u2022 Hips ' + entry.hips + ' cm' : ''}`)).join('') || '<p class="muted">No weigh-ins yet.</p>';
    $('symptomList').innerHTML = [...db.symptoms].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 12).map(entry => entryHtml(entry, 'symptoms', `Energy ${entry.energy}/10 \u2022 ${entry.notes || 'No additional notes'}`)).join('') || '<p class="muted">No symptom entries yet.</p>';
    chart();
}

function chart() {
    const entries = [...db.weights].sort((a, b) => a.time.localeCompare(b.time)).slice(-20);
    const svg = $('weightChart');
    if (!entries.length) {
        svg.innerHTML = '<text x="12" y="78" fill="#b6c4d8" font-size="13">Your weight chart will appear after check-ins.</text>';
        return;
    }
    const values = entries.map(entry => Number(entry.weight));
    const low = Math.min(...values, 60) - 3, high = Math.max(...values, 110) + 3;
    const position = (value, index) => [20 + (entries.length === 1 ? 150 : index * 300 / (entries.length - 1)), 140 - (value - low) / (high - low) * 115];
    const points = values.map((value, index) => position(value, index).join(',')).join(' ');
    svg.innerHTML = `<line x1="20" y1="140" x2="325" y2="140" stroke="#64748b"/><polyline points="${points}" fill="none" stroke="#64c5b2" stroke-width="3"/>${values.map((value, index) => {
        const [x, y] = position(value, index);
        return `<circle cx="${x}" cy="${y}" r="4" fill="#64c5b2"/>`;
    }).join('')}<text x="20" y="155" fill="#aab4c6" font-size="10">${escapeHtml(entries[0].time.slice(0, 10))}</text><text x="245" y="155" fill="#aab4c6" font-size="10">${escapeHtml(entries[entries.length - 1].time.slice(0, 10))}</text>`;
}

$('tabs').addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    document.querySelectorAll('.tab,.panel').forEach(element => element.classList.remove('active'));
    button.classList.add('active');
    $(button.dataset.tab).classList.add('active');
});
document.addEventListener('click', event => {
    const button = event.target.closest('[data-remove]');
    if (button) remove(button.dataset.remove, Number(button.dataset.id));
});
$('boundary').innerHTML = Array.from({ length: 24 }, (_, hour) => `<option value="${hour}">${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}</option>`).join('');
$('foodTime').value = nowLocal();
$('weightDate').value = dateKey(new Date());
$('foodDay').value = today();
$('foodDay').addEventListener('change', render);
$('swapHome').addEventListener('change', event => { db.habits[today()] = event.target.checked; save(); });
$('addFood').onclick = () => {
    const name = $('foodName').value.trim(), calories = Number($('foodCalories').value), time = $('foodTime').value;
    if (!name || !time || !Number.isFinite(Date.parse(time)) || $('foodCalories').value === '' || !Number.isFinite(calories) || calories < 0) {
        return alert('Enter a food name, estimated calories, and time.');
    }
    db.food.push({ id: Date.now() + Math.random(), name, calories, time: new Date(time).toISOString() });
    $('foodName').value = '';
    $('foodCalories').value = '';
    save();
};
window.addWater = ml => {
    if (!Number.isFinite(ml) || ml < 1 || ml > 5000) return alert('Enter a water amount from 1 to 5,000 mL.');
    db.water.push({ id: Date.now() + Math.random(), ml, time: new Date().toISOString() });
    $('customWater').value = '';
    save();
};
$('addWeight').onclick = () => {
    const weight = Number($('weightVal').value), date = $('weightDate').value;
    const waist = $('waistVal').value, hips = $('hipVal').value;
    if (!Number.isFinite(weight) || weight < 20 || weight > 500 || !date || !Number.isFinite(Date.parse(date)) ||
            [waist, hips].some(value => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 1 || Number(value) > 1000))) {
        return alert('Enter a valid weight and date, with positive measurements if provided.');
    }
    db.weights.push({ id: Date.now() + Math.random(), weight, waist, hips, time: new Date(date + 'T12:00:00').toISOString() });
    $('weightVal').value = '';
    save();
};
$('energyVal').oninput = event => { $('energyText').textContent = event.target.value; };
$('addSymptom').onclick = () => {
    db.symptoms.push({ id: Date.now() + Math.random(), energy: Number($('energyVal').value), notes: $('symptomNotes').value.trim(), time: new Date().toISOString() });
    $('symptomNotes').value = '';
    save();
};
$('clearance').onchange = event => { db.settings.clearance = event.target.value; save(); };
$('saveSettings').onclick = () => {
    const boundary = Number($('boundary').value), target = Number($('calTarget').value);
    if (!Number.isInteger(boundary) || boundary < 0 || boundary > 23 || !Number.isFinite(target) || target < 1000 || target > 5000) {
        return alert('Choose a tracking-day cutoff and a calorie reference from 1,000 to 5,000.');
    }
    db.settings.boundary = boundary;
    db.settings.target = target;
    $('foodDay').value = today();
    save();
    alert('Settings saved');
};

function download(name, contents, mime) {
    if (window.KinAndroid && typeof window.KinAndroid.saveFile === 'function') {
        window.KinAndroid.saveFile(name, contents, mime);
        return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([contents], { type: mime }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
$('export').onclick = () => download('fitness-backup-' + dateKey(new Date()) + '.json', JSON.stringify(db, null, 2), 'application/json');
$('exportCsv').onclick = () => {
    const rows = [['category', 'time', 'tracking_day', 'item', 'value', 'unit'],
        ...db.food.map(entry => ['food', entry.time, trackingDay(entry.time), entry.name, entry.calories, 'kcal']),
        ...db.water.map(entry => ['water', entry.time, trackingDay(entry.time), 'water', entry.ml, 'mL']),
        ...db.weights.map(entry => ['weight', entry.time, trackingDay(entry.time), 'weight', entry.weight, 'kg']),
        ...db.symptoms.map(entry => ['symptom', entry.time, trackingDay(entry.time), entry.notes, entry.energy, 'energy_1_10'])];
    // Prevent spreadsheet applications from treating user-entered notes as formulas.
    const cell = value => {
        const string = String(value ?? '');
        return '"' + (/^[\s]*[=+\-@]/.test(string) ? "'" + string : string).replaceAll('"', '""') + '"';
    };
    download('fitness-log-' + dateKey(new Date()) + '.csv', rows.map(row => row.map(cell).join(',')).join('\n'), 'text/csv');
};
$('importFile').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || !['food', 'water', 'weights', 'symptoms'].every(key => Array.isArray(parsed[key])) || !parsed.settings) {
            throw Error('Invalid backup');
        }
        const restored = KinData.normalizeData(parsed);
        if (confirm('Replace current data with this backup?')) {
            db = restored;
            $('foodDay').value = today();
            save();
        }
    } catch (error) {
        alert('Could not import backup: ' + error.message);
    } finally {
        event.target.value = '';
    }
};
$('reset').onclick = () => {
    if (!confirm('Permanently erase ALL saved tracker data, including phone step history, on this device?')) return;
    if (window.KinAndroid && typeof window.KinAndroid.clearStepData === 'function') window.KinAndroid.clearStepData();
    db = KinData.normalizeData(defaults);
    $('foodDay').value = today();
    save();
};

// Refresh date-dependent totals after an idle night-shift cutoff or resuming the app.
let renderedDay = today();
function refreshDay() {
    const day = today();
    if (day !== renderedDay) {
        if ($('foodDay').value === renderedDay) $('foodDay').value = day;
        renderedDay = day;
        render();
    }
}
window.addEventListener('focus', refreshDay);
document.addEventListener('visibilitychange', refreshDay);
setInterval(refreshDay, 30000);
KinData.syncNative(db, window.KinAndroid);
render();
