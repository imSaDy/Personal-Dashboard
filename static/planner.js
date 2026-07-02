/* ==========================================================================
   LUMEN - GRAPHICAL DAY PLANNER
   ========================================================================== */

const PLANNER_REQUEST_TIMEOUT_MS = 5000;
const plannerModeDetails = {
    work: {
        label: 'Focus',
        longLabel: 'Deep Work',
        defaultMinutes: 60,
        fallbackLabel: 'Focus session'
    },
    short: {
        label: 'Short Break',
        longLabel: 'Short Break',
        defaultMinutes: 15,
        fallbackLabel: 'Quick recovery'
    },
    long: {
        label: 'Long Break',
        longLabel: 'Long Break',
        defaultMinutes: 30,
        fallbackLabel: 'Extended recovery'
    }
};

let plannerSessions = [];
let plannerSelectedDay = 'tomorrow';
let plannerSelectedDate = '';
let plannerSelectedMode = 'work';
let plannerEditingId = null;
let plannerEditMode = 'work';
let plannerDeleteTargetId = null;
let plannerRequestSequence = 0;
let plannerLoadController = null;
let plannerLatestStatus = null;
let plannerStatusReceivedAt = 0;
let plannerQuickSessions = [];
let plannerPendingAction = null;
let plannerDesktopFloatEnabled = true;
let plannerDesktopFloatNative = true;
let plannerDesktopFloatLoading = true;
let plannerDesktopFloatVisible = false;
let plannerDesktopFloatSource = null;
let plannerDesktopFloatRequestInFlight = false;
let plannerFormTimeControlsReady = false;
let plannerEditTimeControlsReady = false;

function plannerLocalDate(offsetDays = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
    ].join('-');
}

function plannerDateObject(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function plannerTimeToMinutes(value) {
    const [hours, minutes] = String(value || '00:00').split(':').map(Number);
    return (hours * 60) + minutes;
}

function plannerMinutesToTime(totalMinutes) {
    const safeMinutes = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
    return `${String(Math.floor(safeMinutes / 60)).padStart(2, '0')}:${String(safeMinutes % 60).padStart(2, '0')}`;
}

function plannerFormatDuration(totalMinutes) {
    const minutes = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${remainder}m`;
    if (!remainder) return `${hours} hr${hours === 1 ? '' : 's'}`;
    return `${hours}h ${remainder}m`;
}

function plannerFormatSeconds(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function plannerFormatClock(value) {
    const [hours, minutes] = value.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function escapePlannerText(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
}

function setPlannerFormStatus(message = '', type = 'error') {
    const status = document.getElementById('planner-form-status');
    if (!status) return;
    status.textContent = message;
    status.className = message
        ? `text-xs font-bold rounded-xl px-4 py-3 ${
            type === 'success'
                ? 'bg-accent-mintLight text-emerald-700'
                : 'bg-red-50 text-red-700'
        }`
        : 'hidden';
}

function setPlannerEditStatus(message = '', type = 'error') {
    const status = document.getElementById('planner-edit-status');
    if (!status) return;
    status.textContent = message;
    status.className = message
        ? `text-xs font-bold rounded-xl px-4 py-3 ${
            type === 'success'
                ? 'bg-accent-mintLight text-emerald-700'
                : 'bg-red-50 text-red-700'
        }`
        : 'hidden';
}

async function plannerFetch(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PLANNER_REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.message || `Request failed: ${response.status}`);
        }
        return payload;
    } finally {
        clearTimeout(timeout);
    }
}

function plannerNumericInput(id, fallback) {
    const value = Number(document.getElementById(id)?.value);
    return Number.isFinite(value) ? value : fallback;
}

function generatePlannerQuickSessions() {
    const startTime = document.getElementById('planner-quick-start')?.value;
    const endTime = document.getElementById('planner-quick-end')?.value;
    const focusMinutes = Math.round(plannerNumericInput('planner-quick-focus', 50));
    const shortMinutes = Math.round(plannerNumericInput('planner-quick-short', 10));
    const longMinutes = Math.round(plannerNumericInput('planner-quick-long', 30));
    const longAfter = Math.round(plannerNumericInput('planner-quick-cycle', 3));
    const start = plannerTimeToMinutes(startTime);
    const end = plannerTimeToMinutes(endTime);

    if (
        !startTime
        || !endTime
        || end <= start
        || focusMinutes < 20
        || focusMinutes > 180
        || shortMinutes < 5
        || shortMinutes > 60
        || longMinutes < 10
        || longMinutes > 120
        || longAfter < 2
        || longAfter > 4
    ) {
        return [];
    }

    const sessions = [];
    let cursor = start;
    let focusCount = 0;
    while (cursor < end && sessions.length < 64) {
        const focusEnd = Math.min(cursor + focusMinutes, end);
        if (focusEnd - cursor < 15) break;
        focusCount += 1;
        sessions.push({
            session_type: 'work',
            label: `Focus block ${focusCount}`,
            start_time: plannerMinutesToTime(cursor),
            end_time: plannerMinutesToTime(focusEnd)
        });
        cursor = focusEnd;
        if (cursor >= end) break;

        const useLongBreak = focusCount % longAfter === 0;
        const breakMinutes = useLongBreak ? longMinutes : shortMinutes;
        const breakEnd = Math.min(cursor + breakMinutes, end);
        if (breakEnd - cursor < 5) break;
        sessions.push({
            session_type: useLongBreak ? 'long' : 'short',
            label: useLongBreak ? 'Long recharge' : 'Short reset',
            start_time: plannerMinutesToTime(cursor),
            end_time: plannerMinutesToTime(breakEnd)
        });
        cursor = breakEnd;
    }
    return sessions;
}

function renderPlannerQuickPreview() {
    plannerQuickSessions = generatePlannerQuickSessions();
    const count = document.getElementById('planner-quick-count');
    const summary = document.getElementById('planner-quick-summary');
    const strip = document.getElementById('planner-quick-mini-strip');
    const saveButton = document.getElementById('planner-quick-save');
    const saveLabel = document.getElementById('planner-quick-save-label');
    if (!count || !summary || !strip || !saveButton || !saveLabel) return;

    const focusMinutes = plannerQuickSessions
        .filter(session => session.session_type === 'work')
        .reduce(
            (total, session) => total
                + plannerTimeToMinutes(session.end_time)
                - plannerTimeToMinutes(session.start_time),
            0
        );
    const recoveryMinutes = plannerQuickSessions
        .filter(session => session.session_type !== 'work')
        .reduce(
            (total, session) => total
                + plannerTimeToMinutes(session.end_time)
                - plannerTimeToMinutes(session.start_time),
            0
        );

    count.textContent = `${plannerQuickSessions.length} session${plannerQuickSessions.length === 1 ? '' : 's'}`;
    summary.textContent = plannerQuickSessions.length
        ? `${plannerFormatDuration(focusMinutes)} focus · ${plannerFormatDuration(recoveryMinutes)} recovery`
        : 'Choose a valid day range and session durations.';
    saveButton.disabled = plannerQuickSessions.length === 0;
    saveButton.classList.toggle('opacity-50', plannerQuickSessions.length === 0);
    saveButton.classList.toggle('pointer-events-none', plannerQuickSessions.length === 0);
    saveLabel.textContent = plannerSessions.length
        ? 'Replace & build this day'
        : 'Build this day';

    strip.replaceChildren();
    if (!plannerQuickSessions.length) return;
    const planStart = plannerTimeToMinutes(plannerQuickSessions[0].start_time);
    const planEnd = plannerTimeToMinutes(plannerQuickSessions.at(-1).end_time);
    const planSpan = Math.max(1, planEnd - planStart);
    plannerQuickSessions.forEach(session => {
        const segment = document.createElement('span');
        const duration = (
            plannerTimeToMinutes(session.end_time)
            - plannerTimeToMinutes(session.start_time)
        );
        segment.className = `planner-quick-segment planner-quick-${session.session_type}`;
        segment.style.flexGrow = String(duration / planSpan);
        segment.title = `${session.label}: ${session.start_time} – ${session.end_time}`;
        strip.appendChild(segment);
    });
}

function openPlannerQuickBuild() {
    const backdrop = document.getElementById('planner-quick-backdrop');
    const card = document.getElementById('planner-quick-card');
    const status = document.getElementById('planner-quick-status');
    status.classList.add('hidden');
    status.textContent = '';
    renderPlannerQuickPreview();
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('planner-quick-start')?.focus();
    });
}

function closePlannerQuickBuild() {
    const backdrop = document.getElementById('planner-quick-backdrop');
    const card = document.getElementById('planner-quick-card');
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => backdrop.classList.add('hidden'), 200);
}

async function applyPlannerQuickBuild() {
    renderPlannerQuickPreview();
    if (!plannerQuickSessions.length) return;
    const button = document.getElementById('planner-quick-save');
    const status = document.getElementById('planner-quick-status');
    button.disabled = true;
    button.classList.add('opacity-60', 'pointer-events-none');
    status.classList.add('hidden');
    try {
        await plannerFetch('/api/schedule/bulk', {
            method: 'POST',
            body: JSON.stringify({
                plan_date: plannerSelectedDate,
                sessions: plannerQuickSessions,
                replace_existing: plannerSessions.length > 0
            })
        });
        closePlannerQuickBuild();
        await loadPlannerSessions();
        resetPlannerForm();
        setPlannerFormStatus('Your full-day rhythm is ready.', 'success');
        window.LumenScheduleRunner?.syncNow();
    } catch (error) {
        status.textContent = error.name === 'AbortError'
            ? 'Building the plan took too long. Please try again.'
            : error.message;
        status.classList.remove('hidden');
    } finally {
        button.disabled = false;
        button.classList.remove('opacity-60', 'pointer-events-none');
    }
}

function openPlannerAction(action) {
    plannerPendingAction = action;
    const backdrop = document.getElementById('planner-action-backdrop');
    const card = document.getElementById('planner-action-card');
    const icon = document.getElementById('planner-action-icon');
    const title = document.getElementById('planner-action-title');
    const copy = document.getElementById('planner-action-copy');
    const confirm = document.getElementById('planner-action-confirm');
    const clearing = action === 'clear';

    icon.className = `w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
        clearing ? 'bg-red-50 text-red-700' : 'bg-brand-light text-brand'
    }`;
    title.textContent = clearing ? 'Clear this entire day?' : 'Copy today into tomorrow?';
    copy.textContent = clearing
        ? 'Every block on the selected day will be removed.'
        : 'Tomorrow’s existing sessions will be replaced by today’s rhythm.';
    confirm.textContent = clearing ? 'Clear day' : 'Copy & replace';
    confirm.className = `px-4 py-3 rounded-xl text-xs font-bold text-white transition-colors ${
        clearing ? 'bg-red-500 hover:bg-red-600' : 'bg-brand hover:bg-brand/90'
    }`;
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        confirm.focus();
    });
}

function closePlannerAction() {
    const backdrop = document.getElementById('planner-action-backdrop');
    const card = document.getElementById('planner-action-card');
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        plannerPendingAction = null;
    }, 200);
}

function requestPlannerCopy() {
    openPlannerAction('copy');
}

function requestPlannerClear() {
    if (!plannerSessions.length) return;
    openPlannerAction('clear');
}

async function confirmPlannerAction() {
    const action = plannerPendingAction;
    if (!action) return;
    const button = document.getElementById('planner-action-confirm');
    button.disabled = true;
    const originalCopy = button.textContent;
    button.textContent = action === 'clear' ? 'Clearing…' : 'Copying…';
    try {
        if (action === 'clear') {
            await plannerFetch(
                `/api/schedule?date=${encodeURIComponent(plannerSelectedDate)}`,
                { method: 'DELETE' }
            );
            closePlannerAction();
            await loadPlannerSessions();
            resetPlannerForm();
            setPlannerFormStatus('The selected day is clear.', 'success');
        } else {
            await plannerFetch('/api/schedule/copy', {
                method: 'POST',
                body: JSON.stringify({
                    source_date: plannerLocalDate(0),
                    target_date: plannerLocalDate(1),
                    replace_existing: true
                })
            });
            closePlannerAction();
            selectPlannerDay('tomorrow');
            setPlannerFormStatus('Today’s rhythm was copied into tomorrow.', 'success');
        }
        window.LumenScheduleRunner?.syncNow();
    } catch (error) {
        closePlannerAction();
        setPlannerFormStatus(
            error.name === 'AbortError'
                ? 'The action took too long. Please try again.'
                : error.message
        );
    } finally {
        button.disabled = false;
        button.textContent = originalCopy;
    }
}

function plannerAutomationEnabled() {
    return window.LumenScheduleRunner?.isEnabled?.()
        ?? localStorage.getItem('lumen_schedule_automation_enabled') !== 'false';
}

function renderPlannerAutomationToggle() {
    const toggle = document.getElementById('planner-automation-toggle');
    if (!toggle) return;
    const enabled = plannerAutomationEnabled();
    toggle.classList.toggle('is-on', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.title = enabled
        ? 'Pause future automatic timer starts'
        : 'Enable automatic timer starts';
}

function togglePlannerAutomation() {
    const enabled = !plannerAutomationEnabled();
    renderPlannerAutomationToggle();
    window.LumenScheduleRunner?.setEnabled(enabled);
    setTimeout(renderPlannerAutomationToggle, 0);
    if (!enabled) {
        renderPlannerAutomation({
            ...(plannerLatestStatus || {}),
            automation_enabled: false
        });
    }
}

function renderPlannerAutoFloat() {
    const button = document.getElementById('planner-auto-float-button');
    const icon = document.getElementById('planner-auto-float-icon');
    const label = document.getElementById('planner-auto-float-label');
    const hint = document.getElementById('planner-auto-float-hint');
    const state = document.getElementById('planner-auto-float-state');
    if (!button || !icon || !label || !hint || !state) return;

    const visible = plannerDesktopFloatVisible && plannerDesktopFloatNative;
    const autoToggle = document.getElementById(
        'planner-desktop-auto-toggle'
    );
    button.disabled = plannerDesktopFloatLoading || !plannerDesktopFloatNative;
    button.setAttribute('aria-pressed', String(visible));
    button.classList.toggle('opacity-50', !plannerDesktopFloatNative);
    button.classList.toggle('pointer-events-none', !plannerDesktopFloatNative);
    button.classList.toggle('bg-brand-light', visible);
    button.classList.toggle('border-brand/20', visible);
    button.classList.toggle('bg-gray-50', !visible);
    button.classList.toggle('border-gray-100', !visible);
    icon.classList.toggle('bg-brand', visible);
    icon.classList.toggle('text-white', visible);
    icon.classList.toggle('bg-white', !visible);
    icon.classList.toggle('text-brand', !visible);
    state.classList.toggle('bg-accent-mint', visible);
    state.classList.toggle('animate-pulse', visible);
    state.classList.toggle('bg-gray-300', !visible);
    autoToggle?.classList.toggle('is-on', plannerDesktopFloatEnabled);
    autoToggle?.setAttribute(
        'aria-pressed',
        String(plannerDesktopFloatEnabled)
    );

    if (plannerDesktopFloatLoading) {
        label.textContent = 'Checking desktop timer…';
        hint.textContent = 'Connecting to the Lumen desktop companion';
    } else if (!plannerDesktopFloatNative) {
        label.textContent = 'Desktop floating unavailable';
        hint.textContent = 'The native companion is available on Windows';
    } else if (visible) {
        label.textContent = 'Hide desktop timer';
        hint.textContent = 'The native window is visible outside the browser';
    } else if (plannerLatestStatus?.active_session) {
        label.textContent = 'Show current session';
        hint.textContent = 'Reopen the native window for this time block';
    } else {
        label.textContent = 'Desktop timer is ready';
        hint.textContent = plannerDesktopFloatEnabled
            ? 'It will appear when the next planned block starts'
            : 'Automatic opening is paused';
    }
}

async function loadPlannerDesktopFloat() {
    if (plannerDesktopFloatRequestInFlight) return;
    plannerDesktopFloatRequestInFlight = true;
    try {
        const result = await plannerFetch('/api/desktop-floating');
        plannerDesktopFloatEnabled = Boolean(result.enabled);
        plannerDesktopFloatNative = Boolean(result.native);
        plannerDesktopFloatVisible = Boolean(result.window_visible);
        plannerDesktopFloatSource = result.window_source || null;
    } catch (failure) {
        plannerDesktopFloatNative = false;
    } finally {
        plannerDesktopFloatRequestInFlight = false;
        plannerDesktopFloatLoading = false;
        renderPlannerAutoFloat();
    }
}

async function togglePlannerAutoFloat() {
    const button = document.getElementById('planner-auto-float-button');
    const error = document.getElementById('planner-auto-float-error');
    if (!button || plannerDesktopFloatLoading || !plannerDesktopFloatNative) return;
    error.classList.add('hidden');
    error.textContent = '';
    button.disabled = true;

    try {
        if (!plannerDesktopFloatVisible && !plannerLatestStatus?.active_session) {
            throw new Error(
                'There is no active planned block yet. The window will open automatically when the next block starts.'
            );
        }
        const result = await plannerFetch('/api/desktop-floating', {
            method: 'POST',
            body: JSON.stringify({
                action: plannerDesktopFloatVisible ? 'close' : 'open',
                source: 'schedule'
            })
        });
        plannerDesktopFloatEnabled = Boolean(result.enabled);
        plannerDesktopFloatNative = Boolean(result.native);
        plannerDesktopFloatVisible = !plannerDesktopFloatVisible;
        plannerDesktopFloatSource = plannerDesktopFloatVisible
            ? 'schedule'
            : null;
    } catch (failure) {
        error.textContent = failure.name === 'AbortError'
            ? 'The desktop timer did not respond in time. Please try again.'
            : failure.message || 'The desktop timer setting could not be updated.';
        error.classList.remove('hidden');
    } finally {
        button.disabled = false;
        renderPlannerAutoFloat();
        setTimeout(loadPlannerDesktopFloat, 1200);
    }
}

async function togglePlannerDesktopAutoShow() {
    const toggle = document.getElementById('planner-desktop-auto-toggle');
    if (!toggle || plannerDesktopFloatLoading) return;
    toggle.disabled = true;
    try {
        const result = await plannerFetch('/api/desktop-floating', {
            method: 'PUT',
            body: JSON.stringify({
                enabled: !plannerDesktopFloatEnabled
            })
        });
        plannerDesktopFloatEnabled = Boolean(result.enabled);
        plannerDesktopFloatNative = Boolean(result.native);
    } finally {
        toggle.disabled = false;
        renderPlannerAutoFloat();
    }
}

function selectPlannerDay(day) {
    if (!['today', 'tomorrow'].includes(day)) return;
    plannerSelectedDay = day;
    plannerSelectedDate = plannerLocalDate(day === 'today' ? 0 : 1);

    ['today', 'tomorrow'].forEach(value => {
        const button = document.getElementById(`planner-day-${value}`);
        const active = value === day;
        button?.classList.toggle('is-active', active);
        button?.setAttribute('aria-pressed', String(active));
    });

    const date = plannerDateObject(plannerSelectedDate);
    const title = document.getElementById('planner-date-title');
    const eyebrow = document.getElementById('planner-date-eyebrow');
    if (title) {
        title.textContent = date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
    }
    if (eyebrow) {
        eyebrow.textContent = day === 'today' ? "Today's live flow" : "Tomorrow's rhythm";
    }

    resetPlannerForm();
    loadPlannerSessions();
}

function selectPlannerMode(mode, updateEndTime = true) {
    if (!plannerModeDetails[mode]) return;
    plannerSelectedMode = mode;
    Object.keys(plannerModeDetails).forEach(value => {
        const button = document.getElementById(`planner-mode-${value}`);
        const active = value === mode;
        button?.classList.toggle('is-active', active);
        button?.setAttribute('aria-pressed', String(active));
    });
    if (updateEndTime) syncPlannerEndTime();
}

function initializePlannerFormTimeControls() {
    if (plannerFormTimeControlsReady) return;
    ['start', 'end'].forEach(boundary => {
        const hourSelect = document.getElementById(
            `planner-${boundary}-hour`
        );
        const minuteSelect = document.getElementById(
            `planner-${boundary}-minute`
        );
        if (!hourSelect || !minuteSelect) return;

        for (let hour = 0; hour < 24; hour += 1) {
            const option = document.createElement('option');
            option.value = String(hour).padStart(2, '0');
            option.textContent = String(hour).padStart(2, '0');
            hourSelect.appendChild(option);
        }
        for (let minute = 0; minute < 60; minute += 5) {
            const option = document.createElement('option');
            option.value = String(minute).padStart(2, '0');
            option.textContent = String(minute).padStart(2, '0');
            minuteSelect.appendChild(option);
        }
    });
    plannerFormTimeControlsReady = true;
}

function setPlannerFormTimeValue(boundary, value, updatePreview = true) {
    if (!['start', 'end'].includes(boundary) || !value) return;
    initializePlannerFormTimeControls();
    const [rawHour, rawMinute] = value.split(':').map(Number);
    const hour = String(
        Math.max(0, Math.min(23, rawHour || 0))
    ).padStart(2, '0');
    const minute = String(
        Math.max(0, Math.min(59, rawMinute || 0))
    ).padStart(2, '0');
    const hiddenInput = document.getElementById(
        `planner-${boundary}-time`
    );
    const hourSelect = document.getElementById(
        `planner-${boundary}-hour`
    );
    const minuteSelect = document.getElementById(
        `planner-${boundary}-minute`
    );
    const summary = document.getElementById(
        `planner-${boundary}-summary`
    );
    if (!hiddenInput || !hourSelect || !minuteSelect || !summary) return;

    if (![...minuteSelect.options].some(option => option.value === minute)) {
        const option = document.createElement('option');
        option.value = minute;
        option.textContent = minute;
        minuteSelect.appendChild(option);
        [...minuteSelect.options]
            .sort((left, right) => Number(left.value) - Number(right.value))
            .forEach(item => minuteSelect.appendChild(item));
    }

    hiddenInput.value = `${hour}:${minute}`;
    hourSelect.value = hour;
    minuteSelect.value = minute;
    summary.textContent = plannerFormatClock(hiddenInput.value);
    if (updatePreview) updatePlannerDurationPreview();
}

function syncPlannerFormTimeFromParts(boundary) {
    const hour = document.getElementById(
        `planner-${boundary}-hour`
    )?.value;
    const minute = document.getElementById(
        `planner-${boundary}-minute`
    )?.value;
    if (hour === undefined || minute === undefined) return;
    setPlannerFormTimeValue(boundary, `${hour}:${minute}`, false);
    if (boundary === 'start') {
        syncPlannerEndTime();
    } else {
        updatePlannerDurationPreview();
    }
    setPlannerFormStatus();
}

function nudgePlannerFormTime(boundary, deltaMinutes) {
    const input = document.getElementById(`planner-${boundary}-time`);
    if (!input?.value) return;
    const nudgedMinutes = Math.max(
        0,
        Math.min(
            1439,
            plannerTimeToMinutes(input.value) + Number(deltaMinutes || 0)
        )
    );
    setPlannerFormTimeValue(
        boundary,
        plannerMinutesToTime(nudgedMinutes),
        false
    );
    if (boundary === 'start') {
        syncPlannerEndTime();
    } else {
        updatePlannerDurationPreview();
    }
    setPlannerFormStatus();
}

function syncPlannerEndTime() {
    const startInput = document.getElementById('planner-start-time');
    const endInput = document.getElementById('planner-end-time');
    if (!startInput?.value || !endInput) return;
    const defaultMinutes = plannerModeDetails[plannerSelectedMode].defaultMinutes;
    setPlannerFormTimeValue(
        'end',
        plannerMinutesToTime(
            plannerTimeToMinutes(startInput.value) + defaultMinutes
        ),
        false
    );
    updatePlannerDurationPreview();
}

function updatePlannerDurationPreview() {
    const start = plannerTimeToMinutes(
        document.getElementById('planner-start-time')?.value
    );
    const end = plannerTimeToMinutes(
        document.getElementById('planner-end-time')?.value
    );
    const duration = Math.max(0, end - start);
    const valid = end > start;
    const preview = document.getElementById('planner-duration-preview');
    const durationValue = document.getElementById(
        'planner-duration-value'
    );
    const startControl = document.getElementById('planner-start-control');
    const endControl = document.getElementById('planner-end-control');
    if (durationValue) {
        durationValue.textContent = valid
            ? plannerFormatDuration(duration)
            : 'End must be later';
    }
    preview?.classList.toggle('is-invalid', !valid);
    startControl?.classList.toggle('is-invalid', !valid);
    endControl?.classList.toggle('is-invalid', !valid);
    ['start', 'end'].forEach(boundary => {
        ['hour', 'minute'].forEach(part => {
            document
                .getElementById(`planner-${boundary}-${part}`)
                ?.setAttribute('aria-invalid', String(!valid));
        });
    });
}

function suggestNextPlannerTime() {
    if (!plannerSessions.length) return '09:00';
    const lastEnd = Math.max(
        ...plannerSessions.map(session => plannerTimeToMinutes(session.end_time))
    );
    return plannerMinutesToTime(Math.min(lastEnd, 22 * 60));
}

function resetPlannerForm() {
    const label = document.getElementById('planner-label');
    if (label) label.value = '';
    setPlannerFormTimeValue('start', suggestNextPlannerTime(), false);
    selectPlannerMode('work');
    setPlannerFormStatus();
}

function initializePlannerEditTimeControls() {
    if (plannerEditTimeControlsReady) return;
    ['start', 'end'].forEach(boundary => {
        const hourSelect = document.getElementById(
            `planner-edit-${boundary}-hour`
        );
        const minuteSelect = document.getElementById(
            `planner-edit-${boundary}-minute`
        );
        if (!hourSelect || !minuteSelect) return;

        for (let hour = 0; hour < 24; hour += 1) {
            const option = document.createElement('option');
            option.value = String(hour).padStart(2, '0');
            option.textContent = String(hour).padStart(2, '0');
            hourSelect.appendChild(option);
        }
        for (let minute = 0; minute < 60; minute += 5) {
            const option = document.createElement('option');
            option.value = String(minute).padStart(2, '0');
            option.textContent = String(minute).padStart(2, '0');
            minuteSelect.appendChild(option);
        }
    });
    plannerEditTimeControlsReady = true;
}

function setPlannerEditTimeValue(boundary, value, updatePreview = true) {
    if (!['start', 'end'].includes(boundary) || !value) return;
    initializePlannerEditTimeControls();
    const [rawHour, rawMinute] = value.split(':').map(Number);
    const hour = String(Math.max(0, Math.min(23, rawHour || 0))).padStart(2, '0');
    const minute = String(Math.max(0, Math.min(59, rawMinute || 0))).padStart(2, '0');
    const hiddenInput = document.getElementById(
        `planner-edit-${boundary}-time`
    );
    const hourSelect = document.getElementById(
        `planner-edit-${boundary}-hour`
    );
    const minuteSelect = document.getElementById(
        `planner-edit-${boundary}-minute`
    );
    const summary = document.getElementById(
        `planner-edit-${boundary}-summary`
    );
    if (!hiddenInput || !hourSelect || !minuteSelect || !summary) return;

    if (![...minuteSelect.options].some(option => option.value === minute)) {
        const option = document.createElement('option');
        option.value = minute;
        option.textContent = minute;
        minuteSelect.appendChild(option);
        [...minuteSelect.options]
            .sort((left, right) => Number(left.value) - Number(right.value))
            .forEach(item => minuteSelect.appendChild(item));
    }

    hiddenInput.value = `${hour}:${minute}`;
    hourSelect.value = hour;
    minuteSelect.value = minute;
    summary.textContent = plannerFormatClock(hiddenInput.value);
    if (updatePreview) updatePlannerEditDurationPreview();
}

function syncPlannerEditTimeFromParts(boundary) {
    const hour = document.getElementById(
        `planner-edit-${boundary}-hour`
    )?.value;
    const minute = document.getElementById(
        `planner-edit-${boundary}-minute`
    )?.value;
    if (hour === undefined || minute === undefined) return;
    setPlannerEditTimeValue(boundary, `${hour}:${minute}`);
    setPlannerEditStatus();
}

function nudgePlannerEditTime(boundary, deltaMinutes) {
    const input = document.getElementById(`planner-edit-${boundary}-time`);
    if (!input?.value) return;
    const nudgedMinutes = Math.max(
        0,
        Math.min(
            1439,
            plannerTimeToMinutes(input.value) + Number(deltaMinutes || 0)
        )
    );
    setPlannerEditTimeValue(boundary, plannerMinutesToTime(nudgedMinutes));
    setPlannerEditStatus();
}

function editPlannerSession(sessionId) {
    const session = plannerSessions.find(item => item.id === Number(sessionId));
    if (!session) return;
    plannerEditingId = session.id;
    document.getElementById('planner-edit-label').value = session.label || '';
    setPlannerEditTimeValue('start', session.start_time, false);
    setPlannerEditTimeValue('end', session.end_time, false);
    selectPlannerEditMode(session.session_type);
    updatePlannerEditDurationPreview();
    setPlannerEditStatus();

    const backdrop = document.getElementById('planner-edit-backdrop');
    const card = document.getElementById('planner-edit-card');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document
            .getElementById('planner-edit-start-hour')
            ?.focus({ preventScroll: true });
    });
}

function closePlannerEdit() {
    const backdrop = document.getElementById('planner-edit-backdrop');
    const card = document.getElementById('planner-edit-card');
    plannerEditingId = null;
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        setPlannerEditStatus();
    }, 200);
}

function selectPlannerEditMode(mode) {
    if (!plannerModeDetails[mode]) return;
    plannerEditMode = mode;
    Object.keys(plannerModeDetails).forEach(value => {
        const button = document.getElementById(`planner-edit-mode-${value}`);
        const active = value === mode;
        button?.classList.toggle('is-active', active);
        button?.setAttribute('aria-pressed', String(active));
    });
}

function updatePlannerEditDurationPreview() {
    const start = plannerTimeToMinutes(
        document.getElementById('planner-edit-start-time')?.value
    );
    const end = plannerTimeToMinutes(
        document.getElementById('planner-edit-end-time')?.value
    );
    const duration = Math.max(0, end - start);
    const valid = end > start;
    const preview = document.getElementById('planner-edit-duration-preview');
    const durationValue = document.getElementById(
        'planner-edit-duration-value'
    );
    const startControl = document.getElementById(
        'planner-edit-start-control'
    );
    const endControl = document.getElementById('planner-edit-end-control');
    if (durationValue) {
        durationValue.textContent = valid
            ? plannerFormatDuration(duration)
            : 'End must be later';
    }
    preview?.classList.toggle('is-invalid', !valid);
    startControl?.classList.toggle('is-invalid', !valid);
    endControl?.classList.toggle('is-invalid', !valid);
    ['start', 'end'].forEach(boundary => {
        ['hour', 'minute'].forEach(part => {
            document
                .getElementById(`planner-edit-${boundary}-${part}`)
                ?.setAttribute('aria-invalid', String(!valid));
        });
    });
}

async function savePlannerEditSession() {
    const sessionId = plannerEditingId;
    if (!sessionId) return;
    const button = document.getElementById('planner-edit-save');
    const label = document.getElementById('planner-edit-label').value.trim();
    const startTime = document.getElementById('planner-edit-start-time').value;
    const endTime = document.getElementById('planner-edit-end-time').value;
    if (!startTime || !endTime || startTime >= endTime) {
        setPlannerEditStatus('End time must be later than start time.');
        return;
    }

    button.disabled = true;
    button.classList.add('opacity-60', 'pointer-events-none');
    setPlannerEditStatus();
    try {
        await plannerFetch(`/api/schedule/${sessionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                plan_date: plannerSelectedDate,
                session_type: plannerEditMode,
                label,
                start_time: startTime,
                end_time: endTime
            })
        });
        await loadPlannerSessions();
        closePlannerEdit();
        resetPlannerForm();
        setPlannerFormStatus('Time block updated.', 'success');
        setTimeout(() => setPlannerFormStatus(), 1800);
        window.LumenScheduleRunner?.syncNow();
    } catch (error) {
        setPlannerEditStatus(
            error.name === 'AbortError'
                ? 'Updating took too long. Please try again.'
                : error.message
        );
    } finally {
        button.disabled = false;
        button.classList.remove('opacity-60', 'pointer-events-none');
    }
}

async function savePlannerSession() {
    const saveButton = document.getElementById('planner-save-button');
    const startTime = document.getElementById('planner-start-time').value;
    const endTime = document.getElementById('planner-end-time').value;
    const label = document.getElementById('planner-label').value.trim();

    if (!startTime || !endTime || startTime >= endTime) {
        setPlannerFormStatus('End time must be later than start time.');
        return;
    }

    saveButton.disabled = true;
    saveButton.classList.add('opacity-60', 'pointer-events-none');
    setPlannerFormStatus();

    try {
        await plannerFetch('/api/schedule', {
            method: 'POST',
            body: JSON.stringify({
                plan_date: plannerSelectedDate,
                session_type: plannerSelectedMode,
                label,
                start_time: startTime,
                end_time: endTime
            })
        });
        await loadPlannerSessions();
        resetPlannerForm();
        setPlannerFormStatus('Time block added to your flow.', 'success');
        setTimeout(() => setPlannerFormStatus(), 1800);
        window.LumenScheduleRunner?.syncNow();
    } catch (error) {
        setPlannerFormStatus(
            error.name === 'AbortError'
                ? 'Saving took too long. Please try again.'
                : error.message
        );
    } finally {
        saveButton.disabled = false;
        saveButton.classList.remove('opacity-60', 'pointer-events-none');
    }
}

function openPlannerDelete(sessionId) {
    plannerDeleteTargetId = Number(sessionId);
    const backdrop = document.getElementById('planner-delete-backdrop');
    const card = document.getElementById('planner-delete-card');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('planner-delete-confirm')?.focus();
    });
}

function closePlannerDelete() {
    const backdrop = document.getElementById('planner-delete-backdrop');
    const card = document.getElementById('planner-delete-card');
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => {
        backdrop.classList.add('hidden');
        plannerDeleteTargetId = null;
    }, 200);
}

async function confirmPlannerDelete() {
    if (!plannerDeleteTargetId) return;
    const sessionId = plannerDeleteTargetId;
    const button = document.getElementById('planner-delete-confirm');
    button.disabled = true;
    button.textContent = 'Removing…';
    try {
        await plannerFetch(`/api/schedule/${sessionId}`, { method: 'DELETE' });
        closePlannerDelete();
        if (plannerEditingId === sessionId) closePlannerEdit();
        await loadPlannerSessions();
        window.LumenScheduleRunner?.syncNow();
    } catch (error) {
        closePlannerDelete();
        setPlannerFormStatus(
            error.name === 'AbortError'
                ? 'Removing took too long. Please try again.'
                : error.message
        );
    } finally {
        button.disabled = false;
        button.textContent = 'Remove block';
    }
}

function plannerSessionState(session) {
    if (plannerSelectedDay !== 'today') return '';
    const now = new Date();
    const currentMinutes = (now.getHours() * 60) + now.getMinutes();
    const start = plannerTimeToMinutes(session.start_time);
    const end = plannerTimeToMinutes(session.end_time);
    if (currentMinutes >= start && currentMinutes < end) return 'is-live';
    if (currentMinutes >= end) return 'is-past';
    return 'is-upcoming';
}

function renderPlannerStats() {
    const focusMinutes = plannerSessions
        .filter(session => session.session_type === 'work')
        .reduce((total, session) => total + session.duration_minutes, 0);
    const breakMinutes = plannerSessions
        .filter(session => session.session_type !== 'work')
        .reduce((total, session) => total + session.duration_minutes, 0);
    const span = plannerSessions.length
        ? `${plannerFormatClock(plannerSessions[0].start_time)} – ${plannerFormatClock(plannerSessions.at(-1).end_time)}`
        : '—';

    document.getElementById('planner-stat-sessions').textContent = plannerSessions.length;
    document.getElementById('planner-stat-focus').textContent = plannerFormatDuration(focusMinutes);
    document.getElementById('planner-stat-breaks').textContent = plannerFormatDuration(breakMinutes);
    document.getElementById('planner-stat-span').textContent = span;
    const mapSummary = document.getElementById('planner-map-summary');
    if (mapSummary) {
        mapSummary.textContent = `${plannerFormatDuration(focusMinutes + breakMinutes)} planned`;
    }
    const clearButton = document.getElementById('planner-clear-button');
    if (clearButton) clearButton.disabled = plannerSessions.length === 0;
}

function renderPlannerRhythmStrip() {
    const strip = document.getElementById('planner-rhythm-strip');
    if (!strip) return;
    strip.replaceChildren();

    plannerSessions.forEach(session => {
        const compactLayout = window.matchMedia('(max-width: 640px)').matches;
        const segment = document.createElement(compactLayout ? 'span' : 'button');
        const start = plannerTimeToMinutes(session.start_time);
        const width = Math.max(0.35, (session.duration_minutes / 1440) * 100);
        segment.className = `planner-rhythm-segment planner-rhythm-${session.session_type}`;
        if (session.duration_minutes < 30) segment.classList.add('is-compact');
        segment.style.left = `${(start / 1440) * 100}%`;
        segment.style.width = `${width}%`;
        segment.title = `${plannerFormatClock(session.start_time)} – ${plannerFormatClock(session.end_time)} · ${plannerModeDetails[session.session_type].longLabel}`;
        if (compactLayout) {
            segment.setAttribute('aria-hidden', 'true');
        } else {
            segment.type = 'button';
            segment.setAttribute('aria-label', segment.title);
            segment.onclick = () => editPlannerSession(session.id);
        }
        const label = document.createElement('span');
        label.textContent = session.session_type === 'work'
            ? 'F'
            : session.session_type === 'short' ? 'S' : 'L';
        label.setAttribute('aria-hidden', 'true');
        segment.appendChild(label);
        strip.appendChild(segment);
    });

    if (plannerSelectedDay === 'today') {
        const now = new Date();
        const nowMarker = document.createElement('span');
        const currentMinutes = (now.getHours() * 60) + now.getMinutes();
        nowMarker.className = 'planner-rhythm-now';
        nowMarker.style.left = `${(currentMinutes / 1440) * 100}%`;
        nowMarker.title = `Now · ${plannerFormatClock(plannerMinutesToTime(currentMinutes))}`;
        nowMarker.setAttribute('aria-hidden', 'true');
        strip.appendChild(nowMarker);
    }
}

function renderPlannerTimeline() {
    const timeline = document.getElementById('planner-timeline');
    const empty = document.getElementById('planner-empty-state');
    if (!timeline || !empty) return;

    timeline.replaceChildren();
    empty.classList.toggle('hidden', plannerSessions.length > 0);
    timeline.classList.toggle('hidden', plannerSessions.length === 0);
    if (!plannerSessions.length) {
        renderPlannerStats();
        renderPlannerRhythmStrip();
        return;
    }

    const firstUpcomingIndex = plannerSessions.findIndex(
        session => plannerSessionState(session) === 'is-upcoming'
    );
    let previousEnd = null;
    plannerSessions.forEach((session, index) => {
        const start = plannerTimeToMinutes(session.start_time);
        if (previousEnd !== null && start > previousEnd) {
            const gap = document.createElement('div');
            gap.className = 'planner-gap';
            gap.innerHTML = `
                <span class="planner-gap-line"></span>
                <span class="planner-gap-copy">${plannerFormatDuration(start - previousEnd)} free</span>
            `;
            timeline.appendChild(gap);
        }

        const details = plannerModeDetails[session.session_type];
        const state = plannerSessionState(session);
        const safeLabel = escapePlannerText(session.label || details.fallbackLabel);
        const block = document.createElement('article');
        block.className = `planner-session planner-session-${session.session_type} ${state}`;
        block.style.minHeight = `${Math.max(88, Math.min(170, session.duration_minutes * 1.15))}px`;
        block.innerHTML = `
            <div class="planner-session-time">
                <span>${plannerFormatClock(session.start_time)}</span>
                <span class="planner-session-duration">${plannerFormatDuration(session.duration_minutes)}</span>
                <span>${plannerFormatClock(session.end_time)}</span>
            </div>
            <div class="planner-session-rail" aria-hidden="true">
                <span class="planner-session-dot"></span>
                <span class="planner-session-line"></span>
            </div>
            <div class="planner-session-card">
                <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="planner-session-mode">${details.longLabel}</span>
                        ${state === 'is-live' ? '<span class="planner-live-badge"><span></span>Live now</span>' : ''}
                        ${state === 'is-upcoming' && index === firstUpcomingIndex ? '<span class="planner-next-badge">Up next</span>' : ''}
                    </div>
                    <h4 class="text-base md:text-lg font-black text-textMain mt-2 truncate">${safeLabel}</h4>
                    <p class="text-[10px] font-semibold text-textMuted mt-1">${session.start_time} – ${session.end_time} · timer starts automatically</p>
                </div>
                <div class="planner-session-actions">
                    <button type="button" onclick="editPlannerSession(${session.id})" class="planner-session-action planner-session-action-edit" title="Edit block" aria-label="Edit ${safeLabel}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M4 20l4.5-1 10-10a2.5 2.5 0 10-3.5-3.5l-10 10L4 20z"></path></svg>
                    </button>
                    <button type="button" onclick="openPlannerDelete(${session.id})" class="planner-session-action planner-session-action-delete" title="Remove block" aria-label="Remove ${safeLabel}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-1 13H6L5 7m3 0V4h8v3M3 7h18"></path></svg>
                    </button>
                </div>
            </div>
        `;
        timeline.appendChild(block);
        previousEnd = plannerTimeToMinutes(session.end_time);
    });

    renderPlannerStats();
    renderPlannerRhythmStrip();
}

function renderPlannerAutomation(status) {
    const title = document.getElementById('planner-automation-title');
    const copy = document.getElementById('planner-automation-copy');
    const timing = document.getElementById('planner-automation-timing');
    const timingLabel = document.getElementById('planner-automation-timing-label');
    if (!title || !copy || !status) return;
    plannerLatestStatus = status;
    plannerStatusReceivedAt = Date.now();
    renderPlannerAutomationToggle();
    renderPlannerAutoFloat();

    const automationEnabled = status.automation_enabled !== false
        && plannerAutomationEnabled();
    if (!automationEnabled) {
        title.textContent = 'Automation is paused';
        copy.textContent = 'Your plan is safe. Future timers will wait until automation is enabled again.';
        timing?.classList.add('hidden');
        return;
    }

    if (status.active_session) {
        const details = plannerModeDetails[status.active_session.session_type];
        title.textContent = `${details.longLabel} is running`;
        copy.textContent = `${status.active_session.label || details.fallbackLabel} · ${plannerFormatDuration(Math.ceil(status.remaining_seconds / 60))} remaining.`;
        timing?.classList.remove('hidden');
        if (timingLabel) timingLabel.textContent = 'Session ends in';
    } else if (status.next_session) {
        const details = plannerModeDetails[status.next_session.session_type];
        title.textContent = `Next: ${details.longLabel} at ${plannerFormatClock(status.next_session.start_time)}`;
        copy.textContent = status.next_session.label || 'Lumen is waiting and will start it automatically.';
        timing?.classList.remove('hidden');
        if (timingLabel) timingLabel.textContent = 'Next session starts in';
    } else {
        title.textContent = 'Automation is ready';
        copy.textContent = 'Keep Lumen open in any browser tab. The next timer will start automatically.';
        timing?.classList.add('hidden');
    }

    updatePlannerAutomationClock();
    if (plannerSelectedDay === 'today') renderPlannerTimeline();
}

function updatePlannerAutomationClock() {
    const countdown = document.getElementById('planner-automation-countdown');
    const progress = document.getElementById('planner-automation-progress');
    if (!countdown || !progress || !plannerLatestStatus || !plannerAutomationEnabled()) return;
    const elapsedSeconds = Math.floor(
        (Date.now() - plannerStatusReceivedAt) / 1000
    );

    if (plannerLatestStatus.active_session) {
        const remaining = Math.max(
            0,
            plannerLatestStatus.remaining_seconds - elapsedSeconds
        );
        const total = plannerLatestStatus.active_session.duration_minutes * 60;
        const completed = total > 0
            ? Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
            : 0;
        countdown.textContent = plannerFormatSeconds(remaining);
        progress.style.width = `${completed}%`;
        progress.className = 'h-full rounded-full bg-brand transition-[width] duration-700';
        return;
    }

    if (plannerLatestStatus.next_session) {
        const untilNext = Math.max(
            0,
            Number(plannerLatestStatus.seconds_until_next || 0) - elapsedSeconds
        );
        countdown.textContent = plannerFormatSeconds(untilNext);
        progress.style.width = '0%';
        progress.className = 'h-full rounded-full bg-accent-mint transition-[width] duration-700';
    }
}

async function loadPlannerSessions() {
    const requestSequence = ++plannerRequestSequence;
    if (plannerLoadController) plannerLoadController.abort();
    const requestController = new AbortController();
    plannerLoadController = requestController;
    const timeout = setTimeout(
        () => requestController.abort(),
        PLANNER_REQUEST_TIMEOUT_MS
    );
    const loadState = document.getElementById('planner-load-state');
    loadState.innerHTML = '<span class="w-2 h-2 rounded-full bg-brand animate-pulse"></span>Loading timeline';
    loadState.className = 'inline-flex items-center gap-2 text-[10px] font-bold text-textMuted bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl self-start md:self-auto';

    try {
        const response = await fetch(
            `/api/schedule?date=${encodeURIComponent(plannerSelectedDate)}`,
            { signal: requestController.signal, cache: 'no-store' }
        );
        if (!response.ok) throw new Error(`Timeline failed: ${response.status}`);
        const sessions = await response.json();
        if (requestSequence !== plannerRequestSequence) return;
        plannerSessions = sessions;
        if (plannerEditingId === null) {
            setPlannerFormTimeValue(
                'start',
                suggestNextPlannerTime(),
                false
            );
            syncPlannerEndTime();
        }
        renderPlannerTimeline();
        loadState.innerHTML = '<span class="w-2 h-2 rounded-full bg-accent-mint"></span>Plan saved locally';
        loadState.className = 'inline-flex items-center gap-2 text-[10px] font-bold text-emerald-700 bg-accent-mintLight border border-accent-mint/10 px-3 py-2 rounded-xl self-start md:self-auto';
    } catch (error) {
        if (requestSequence !== plannerRequestSequence) return;
        if (error.name === 'AbortError') {
            loadState.textContent = 'Timeline request timed out';
        } else {
            loadState.textContent = 'Timeline could not load';
        }
        loadState.className = 'inline-flex items-center gap-2 text-[10px] font-bold text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl self-start md:self-auto';
    } finally {
        clearTimeout(timeout);
        if (plannerLoadController === requestController) {
            plannerLoadController = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializePlannerFormTimeControls();
    initializePlannerEditTimeControls();
    renderPlannerAutomationToggle();
    renderPlannerAutoFloat();
    loadPlannerDesktopFloat();
    setInterval(loadPlannerDesktopFloat, 1500);
    selectPlannerDay('tomorrow');
    renderPlannerQuickPreview();

    const currentStatus = window.LumenScheduleRunner?.getLastStatus();
    if (currentStatus) renderPlannerAutomation(currentStatus);
    setInterval(updatePlannerAutomationClock, 1000);
});

window.addEventListener('lumen:schedule-status', event => {
    renderPlannerAutomation(event.detail);
});

window.addEventListener('lumen:schedule-automation-change', event => {
    renderPlannerAutomationToggle();
    renderPlannerAutomation({
        ...(plannerLatestStatus || {}),
        automation_enabled: event.detail.enabled
    });
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!document.getElementById('planner-edit-backdrop')?.classList.contains('hidden')) {
        closePlannerEdit();
    } else if (!document.getElementById('planner-action-backdrop')?.classList.contains('hidden')) {
        closePlannerAction();
    } else if (!document.getElementById('planner-delete-backdrop')?.classList.contains('hidden')) {
        closePlannerDelete();
    } else if (!document.getElementById('planner-quick-backdrop')?.classList.contains('hidden')) {
        closePlannerQuickBuild();
    }
});
