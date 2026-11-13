(function (root) {
    'use strict';

    const defaults = {
        food: [], water: [], weights: [], symptoms: [], habits: {},
        settings: { boundary: 10, target: 2000, clearance: 'not-yet', walkingCleared: false }
    };
    const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const number = (value, min, max, field) => {
        if (value === '' || value === null || typeof value === 'boolean' ||
                !['number', 'string'].includes(typeof value)) throw Error('Invalid ' + field);
        const result = Number(value);
        if (!Number.isFinite(result) || result < min || result > max) throw Error('Invalid ' + field);
        return result;
    };
    const text = (value, field) => {
        if (typeof value !== 'string') throw Error('Invalid ' + field);
        return value;
    };
    const optionalMeasurement = value => value === '' || value === undefined || value === null ? '' :
        number(value, 1, 1000, 'measurement');

    function normalizeData(value) {
        if (!isObject(value)) throw Error('Backup must contain a tracker object');
        const result = { food: [], water: [], weights: [], symptoms: [], habits: {}, settings: { ...defaults.settings } };
        for (const category of ['food', 'water', 'weights', 'symptoms']) {
            if (value[category] !== undefined && !Array.isArray(value[category])) {
                throw Error('Invalid ' + category + ' entries');
            }
            const ids = new Set();
            result[category] = (value[category] || []).map(entry => {
                if (!isObject(entry)) throw Error('Invalid ' + category + ' entry');
                const id = number(entry.id, 0, Number.MAX_SAFE_INTEGER, 'entry ID');
                if (ids.has(id)) throw Error('Duplicate entry ID');
                ids.add(id);
                if (typeof entry.time !== 'string' || !Number.isFinite(Date.parse(entry.time))) {
                    throw Error('Invalid entry date');
                }
                const clean = { id, time: new Date(entry.time).toISOString() };
                if (category === 'food') {
                    clean.name = text(entry.name, 'food name');
                    clean.calories = number(entry.calories, 0, Number.MAX_SAFE_INTEGER, 'calories');
                } else if (category === 'water') {
                    clean.ml = number(entry.ml, 1, 5000, 'water amount');
                } else if (category === 'weights') {
                    clean.weight = number(entry.weight, 20, 500, 'weight');
                    clean.waist = optionalMeasurement(entry.waist);
                    clean.hips = optionalMeasurement(entry.hips);
                } else {
                    clean.energy = number(entry.energy, 1, 10, 'energy');
                    clean.notes = text(entry.notes ?? '', 'symptom notes');
                }
                return clean;
            });
        }
        if (value.habits !== undefined) {
            if (!isObject(value.habits)) throw Error('Invalid habits');
            for (const [day, completed] of Object.entries(value.habits)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof completed !== 'boolean') {
                    throw Error('Invalid daily habit');
                }
                result.habits[day] = completed;
            }
        }
        if (value.settings !== undefined) {
            if (!isObject(value.settings)) throw Error('Invalid settings');
            const settings = { ...defaults.settings, ...value.settings };
            const boundary = number(settings.boundary, 0, 23, 'tracking-day cutoff');
            if (!Number.isInteger(boundary)) throw Error('Tracking-day cutoff must be a whole hour');
            if (!['not-yet', 'appointment', 'assessed'].includes(settings.clearance)) throw Error('Invalid medical status');
            if (typeof settings.walkingCleared !== 'boolean') throw Error('Invalid walking clearance');
            result.settings = {
                boundary, target: number(settings.target, 1000, 5000, 'calorie reference'),
                clearance: settings.clearance, walkingCleared: settings.walkingCleared
            };
        }
        return result;
    }

    function dateKey(date) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function trackingDay(value, cutoff) {
        const date = new Date(value);
        date.setHours(date.getHours() - cutoff);
        return dateKey(date);
    }

    function syncNative(data, bridge) {
        if (!bridge) return;
        // Set the boundary first so a newly enabled sensor uses the restored day.
        if (typeof bridge.setTrackingCutoff === 'function') bridge.setTrackingCutoff(data.settings.boundary);
        if (typeof bridge.setWalkingEnabled === 'function') bridge.setWalkingEnabled(data.settings.walkingCleared === true);
    }

    const api = { defaults, normalizeData, dateKey, trackingDay, syncNative };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.KinData = api;
})(typeof window !== 'undefined' ? window : this);
