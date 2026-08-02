/* ==========================================================================
   LUMEN - PERSISTENT TIMESTAMP FOCUS TIMER (timer.js)
   ========================================================================== */

let currentMode = 'work';
let totalSeconds = 60 * 60;
let remainingSeconds = 60 * 60;
let timerInterval = null;
let isRunning = false;
let endTime = null;
let nativeFloatingState = {
    enabled: true,
    native: true,
    visible: false,
    source: null,
    loading: true
};
let nativeFloatingRefreshInterval = null;
let nativeFloatingSyncTimeout = null;
let nativeFloatingLastSignature = '';
let nativeFloatingRequestInFlight = false;
let pendingScheduledSession = null;
let latestTimerScheduleStatus = null;
let latestTimerScheduleStatusAt = 0;

// Modal State Trackers
let pendingSwitchMode = null;
let pendingSwitchMinutes = null;

const circleCircumference = 753.98;

function formatTimerValue(secondsValue) {
    const safeSeconds = Math.max(0, Math.floor(secondsValue));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getTimerModeDetails() {
    const modes = {
        work: { label: 'Deep Work', color: '#4318FF', softColor: '#7B61FF' },
        short: { label: 'Short Break', color: '#05B98C', softColor: '#3DD6AE' },
        long: { label: 'Long Break', color: '#F59E0B', softColor: '#FBCB62' },
        custom: { label: 'Custom Focus', color: '#4318FF', softColor: '#7B61FF' }
    };
    return modes[currentMode] || modes.work;
}

function getTimerStatusCopy() {
    if (remainingSeconds <= 0) return 'Session complete';
    if (isRunning) {
        if (currentMode === 'short') return 'Taking a breather';
        if (currentMode === 'long') return 'Recharging';
        return 'Focus in progress';
    }
    if (remainingSeconds < totalSeconds) return 'Timer paused';
    if (currentMode === 'short') return 'Quick breather ready';
    if (currentMode === 'long') return 'Extended break ready';
    return 'Ready to focus';
}

function getTimerToggleCopy() {
    if (remainingSeconds <= 0) return 'Restart';
    if (isRunning) return 'Pause';
    if (remainingSeconds < totalSeconds) return 'Resume';
    return 'Start';
}

function getStoredScheduledSession() {
    try {
        return JSON.parse(localStorage.getItem('timer_schedule_active') || 'null');
    } catch (error) {
        return null;
    }
}

function renderScheduledSessionBanner(session = getStoredScheduledSession()) {
    const banner = document.getElementById('scheduled-session-banner');
    const title = document.getElementById('scheduled-session-title');
    const time = document.getElementById('scheduled-session-time');
    const icon = document.getElementById('scheduled-session-icon');
    if (!banner || !title || !time || !icon) return;

    if (!session) {
        banner.classList.add('hidden');
        return;
    }

    const details = {
        work: { label: 'Scheduled focus', classes: ['bg-brand-light', 'text-brand'] },
        short: { label: 'Scheduled short break', classes: ['bg-accent-mintLight', 'text-emerald-700'] },
        long: { label: 'Scheduled long break', classes: ['bg-orange-50', 'text-orange-700'] }
    }[session.session_type] || {
        label: 'Scheduled session',
        classes: ['bg-brand-light', 'text-brand']
    };

    icon.className = `w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${details.classes.join(' ')}`;
    title.textContent = session.label || details.label;
    time.textContent = `${session.start_time} – ${session.end_time} · ${session.duration_minutes} min`;
    banner.classList.remove('hidden');
}

function clearScheduledTimerContext() {
    localStorage.removeItem('timer_schedule_active');
    renderScheduledSessionBanner(null);
}

function cancelScheduledTimerSession() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    remainingSeconds = 0;
    endTime = null;
    localStorage.removeItem('timer_schedule_active');
    localStorage.removeItem('timer_schedule_claim');
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', '0');
    localStorage.removeItem('timer_end_time');
    renderScheduledSessionBanner(null);

    document.getElementById('icon-pause')?.classList.add('hidden');
    document.getElementById('icon-play')?.classList.remove('hidden');
    const toggleCopy = document.getElementById('text-toggle');
    const statusCopy = document.getElementById('timer-status');
    if (toggleCopy) toggleCopy.innerText = 'Start';
    if (statusCopy) statusCopy.innerText = 'Planned session removed';
    if (document.getElementById('timer-display')) updateDisplay();
}

function formatScheduledCountdown(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderTimerScheduleStatus(status) {
    const preview = document.getElementById('timer-schedule-preview');
    const previewTitle = document.getElementById('timer-schedule-preview-title');
    const previewTime = document.getElementById('timer-schedule-preview-time');
    const previewCountdown = document.getElementById('timer-schedule-preview-countdown');
    const currentNext = document.getElementById('scheduled-session-next');
    if (!preview || !previewTitle || !previewTime || !previewCountdown || !currentNext) return;

    latestTimerScheduleStatus = status;
    latestTimerScheduleStatusAt = Date.now();
    const modeLabels = {
        work: 'Deep Work',
        short: 'Short Break',
        long: 'Long Break'
    };

    if (status?.active_session && status.next_session) {
        currentNext.textContent = `Next: ${modeLabels[status.next_session.session_type]} at ${status.next_session.start_time}`;
        currentNext.classList.remove('hidden');
    } else {
        currentNext.classList.add('hidden');
    }

    if (
        status?.automation_enabled === false
        || status?.active_session
        || !status?.next_session
    ) {
        preview.classList.add('hidden');
        return;
    }

    previewTitle.textContent = status.next_session.label
        || modeLabels[status.next_session.session_type]
        || 'Scheduled timer';
    previewTime.textContent = `${modeLabels[status.next_session.session_type]} · starts at ${status.next_session.start_time}`;
    preview.classList.remove('hidden');
    updateTimerScheduleCountdown();
}

function updateTimerScheduleCountdown() {
    const countdown = document.getElementById('timer-schedule-preview-countdown');
    if (!countdown || !latestTimerScheduleStatus?.next_session) return;
    const elapsed = Math.floor((Date.now() - latestTimerScheduleStatusAt) / 1000);
    countdown.textContent = formatScheduledCountdown(
        Math.max(
            0,
            Number(latestTimerScheduleStatus.seconds_until_next || 0) - elapsed
        )
    );
}

function applyScheduledTimerSession(session) {
    if (!session || !['work', 'short', 'long'].includes(session.session_type)) return;
    const scheduledEndTime = Number(session.end_time_ms)
        || Number(localStorage.getItem('timer_end_time'));
    const scheduledTotalSeconds = Number(session.duration_minutes) * 60;
    const scheduledRemainingSeconds = Math.max(
        0,
        Math.ceil((scheduledEndTime - Date.now()) / 1000)
    );
    if (!scheduledEndTime || !scheduledTotalSeconds || scheduledRemainingSeconds <= 0) return;

    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    currentMode = session.session_type;
    totalSeconds = scheduledTotalSeconds;
    remainingSeconds = scheduledRemainingSeconds;
    endTime = scheduledEndTime;

    localStorage.setItem('timer_current_mode', currentMode);
    localStorage.setItem('timer_total_seconds', String(totalSeconds));
    localStorage.setItem('timer_remaining_seconds', String(remainingSeconds));
    localStorage.setItem('timer_end_time', String(endTime));
    localStorage.setItem('timer_is_running', 'true');
    localStorage.setItem('timer_schedule_active', JSON.stringify(session));

    executeModeSwitch(currentMode, totalSeconds / 60, false);
    remainingSeconds = scheduledRemainingSeconds;
    startTimer(true);
    renderScheduledSessionBanner(session);
}

function updateDisplay() {
    const formattedTime = formatTimerValue(remainingSeconds);
    
    document.getElementById('timer-display').innerText = formattedTime;
    
    document.title = `${formattedTime} - Lumen Timer`;

    const percentage = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
    const offset = circleCircumference - (percentage * circleCircumference);
    document.getElementById('timer-ring').style.strokeDashoffset = offset;

    const progressCopy = document.getElementById('timer-progress-copy');
    if (progressCopy) {
        const sessionMinutes = Math.ceil(totalSeconds / 60);
        const remainingPercentage = Math.max(0, Math.min(100, Math.round(percentage * 100)));
        progressCopy.innerText = `${sessionMinutes} min session · ${remainingPercentage}% remaining`;
    }

    renderFloatingTimer();
}

function nativeFloatingTimerPayload() {
    const details = getTimerModeDetails();
    return {
        mode: currentMode,
        label: details.label,
        status: getTimerStatusCopy(),
        total_seconds: Math.max(1, Math.round(totalSeconds)),
        remaining_seconds: Math.max(0, Math.round(remainingSeconds)),
        end_time_ms: isRunning && endTime ? Number(endTime) : 0,
        is_running: Boolean(isRunning)
    };
}

async function requestNativeFloating(options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
        const response = await fetch('/api/desktop-floating', {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(
                payload.message
                || `Desktop floating request failed: ${response.status}`
            );
        }
        return payload;
    } finally {
        clearTimeout(timeout);
    }
}

function applyNativeFloatingState(payload = {}) {
    nativeFloatingState.enabled = payload.enabled !== false;
    nativeFloatingState.native = payload.native !== false;
    nativeFloatingState.visible = Boolean(payload.window_visible);
    nativeFloatingState.source = payload.window_source || null;
    nativeFloatingState.loading = false;
    updateFloatingTimerButton();
}

async function refreshNativeFloatingState() {
    if (nativeFloatingRequestInFlight) return;
    nativeFloatingRequestInFlight = true;
    try {
        applyNativeFloatingState(await requestNativeFloating());
    } catch (error) {
        nativeFloatingState.loading = false;
        nativeFloatingState.native = false;
        updateFloatingTimerButton();
    } finally {
        nativeFloatingRequestInFlight = false;
    }
}

async function syncNativeFloatingTimer() {
    try {
        await requestNativeFloating({
            method: 'POST',
            body: JSON.stringify({
                action: 'sync',
                source: 'manual',
                timer: nativeFloatingTimerPayload()
            })
        });
    } catch (error) {
        // The next local state change retries without interrupting the timer.
    }
}

function renderFloatingTimer() {
    const payload = nativeFloatingTimerPayload();
    const signature = JSON.stringify({
        mode: payload.mode,
        total_seconds: payload.total_seconds,
        remaining_seconds: payload.is_running
            ? null
            : payload.remaining_seconds,
        end_time_ms: payload.end_time_ms,
        is_running: payload.is_running,
        status: payload.status
    });
    if (signature === nativeFloatingLastSignature) return;
    nativeFloatingLastSignature = signature;
    clearTimeout(nativeFloatingSyncTimeout);
    nativeFloatingSyncTimeout = setTimeout(syncNativeFloatingTimer, 100);
}

function updateFloatingTimerButton() {
    const button = document.getElementById('floating-timer-button');
    const label = document.getElementById('floating-timer-label');
    const hint = document.getElementById('floating-timer-hint');
    if (!button || !label || !hint) return;

    const visible = nativeFloatingState.visible;
    button.disabled = nativeFloatingState.loading || !nativeFloatingState.native;
    button.setAttribute('aria-pressed', String(visible));
    label.innerText = nativeFloatingState.loading
        ? 'Checking desktop timer…'
        : visible ? 'Hide desktop timer' : 'Show desktop timer';
    hint.innerText = nativeFloatingState.native
        ? visible
            ? 'Visible outside the browser'
            : 'Native window · always on top'
        : 'Start Lumen from the Windows shortcut';
    button.classList.toggle('border-brand/20', visible);
    button.classList.toggle('bg-white', !visible);
    button.classList.toggle('bg-brand-light', visible);
    button.classList.toggle('text-textMain', !visible);
    button.classList.toggle('text-brand', visible);
    button.classList.toggle('opacity-50', !nativeFloatingState.native);
    button.classList.toggle('pointer-events-none', !nativeFloatingState.native);
}

async function openFloatingTimer() {
    const button = document.getElementById('floating-timer-button');
    if (button) button.disabled = true;
    try {
        const result = await requestNativeFloating({
            method: 'POST',
            body: JSON.stringify({
                action: 'open',
                source: 'manual',
                timer: nativeFloatingTimerPayload()
            })
        });
        applyNativeFloatingState(result);
        nativeFloatingState.visible = true;
        nativeFloatingState.source = 'manual';
    } catch (error) {
        nativeFloatingState.native = false;
        if (button) {
            button.title = error.message
                || 'The desktop timer could not be opened.';
        }
    } finally {
        if (button) button.disabled = false;
        updateFloatingTimerButton();
        setTimeout(refreshNativeFloatingState, 1200);
    }
}

async function closeFloatingTimer() {
    const button = document.getElementById('floating-timer-button');
    if (button) button.disabled = true;
    try {
        await requestNativeFloating({
            method: 'POST',
            body: JSON.stringify({ action: 'close' })
        });
        nativeFloatingState.visible = false;
        nativeFloatingState.source = null;
    } finally {
        if (button) button.disabled = false;
        updateFloatingTimerButton();
        setTimeout(refreshNativeFloatingState, 1200);
    }
}

function toggleFloatingTimer() {
    if (nativeFloatingState.visible) {
        closeFloatingTimer();
    } else {
        openFloatingTimer();
    }
}

function initializeFloatingTimerFeature() {
    updateFloatingTimerButton();
    refreshNativeFloatingState();
    clearInterval(nativeFloatingRefreshInterval);
    nativeFloatingRefreshInterval = setInterval(
        refreshNativeFloatingState,
        1500
    );
}

function setTimerMode(mode, minutes, forceSave = true) {
    if (forceSave && mode === currentMode) return;

    // Safety Intercept: Summon custom modal instead of browser alert
    if (isRunning) {
        pendingSwitchMode = mode;
        pendingSwitchMinutes = minutes;
        openConfirmSwitchModal();
        return;
    }

    executeModeSwitch(mode, minutes, forceSave);
}

function executeModeSwitch(mode, minutes, forceSave = true) {
    // Failsafe pause before resetting memory
    if (isRunning) pauseTimer();

    if (forceSave) clearScheduledTimerContext();

    currentMode = mode;
    totalSeconds = minutes * 60;
    remainingSeconds = totalSeconds;
    
    if (forceSave) {
        localStorage.setItem('timer_current_mode', currentMode);
        localStorage.setItem('timer_total_seconds', totalSeconds);
        localStorage.setItem('timer_remaining_seconds', remainingSeconds);
    }

    // Update Pill Buttons
    ['work', 'short', 'long'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (btn) {
            if (m === mode) {
                let activeColor = 'text-brand';
                if (mode === 'short') activeColor = 'text-emerald-700';
                if (mode === 'long') activeColor = 'text-orange-700';
                
                btn.className = `px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all bg-white shadow-sm ${activeColor} pointer-events-none flex items-center gap-1.5`;
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.className = "px-3 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all text-textMuted hover:text-textMain cursor-pointer flex items-center gap-1.5";
                btn.setAttribute('aria-pressed', 'false');
            }
        }
    });

    const ring = document.getElementById('timer-ring');
    const statusText = document.getElementById('timer-status');
    const toggleBtn = document.getElementById('btn-toggle');
    const timeDisplay = document.getElementById('timer-display'); 
    
    ring.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    statusText.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]', 'text-emerald-700', 'text-orange-700');
    toggleBtn.classList.remove('bg-brand', 'hover:bg-brand/90', 'bg-accent-mint', 'hover:bg-accent-mint/90', 'bg-[#FF9F1C]', 'hover:bg-[#FF9F1C]/90', 'bg-emerald-600', 'hover:bg-emerald-700', 'bg-emerald-800', 'bg-orange-600', 'hover:bg-orange-700', 'bg-orange-700', 'hover:bg-orange-800');
    timeDisplay.classList.remove('text-textMain', 'hover:text-brand', 'text-brand', 'text-accent-mint', 'text-[#FF9F1C]', 'text-emerald-700', 'text-orange-700');
    
    timeDisplay.classList.add('transition-colors', 'duration-1000');

    if (mode === 'work' || mode === 'custom') {
        ring.classList.add('text-brand');
        statusText.classList.add('text-brand');
        timeDisplay.classList.add('text-brand');
        toggleBtn.classList.add('bg-brand', 'hover:bg-brand/90');
        statusText.innerText = mode === 'work' ? "Ready to Focus" : "Custom Timer Ready";
    } else if (mode === 'short') {
        ring.classList.add('text-accent-mint');
        statusText.classList.add('text-emerald-700');
        timeDisplay.classList.add('text-emerald-700');
        toggleBtn.classList.add('bg-emerald-700', 'hover:bg-emerald-800');
        statusText.innerText = "Quick Breather";
    } else if (mode === 'long') {
        ring.classList.add('text-[#FF9F1C]');
        statusText.classList.add('text-orange-700');
        timeDisplay.classList.add('text-orange-700');
        toggleBtn.classList.add('bg-orange-700', 'hover:bg-orange-800');
        statusText.innerText = "Extended Break";
    }

    updateDisplay();
}

function toggleTimer() {
    const textToggle = document.getElementById('text-toggle').innerText;
    if (textToggle === "Done") {
        resetTimer();
        return;
    }

    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer(resumingFromStorage = false) {
    isRunning = true;
    clearInterval(timerInterval);
    
    if (!resumingFromStorage) {
        endTime = Date.now() + (remainingSeconds * 1000);
        localStorage.setItem('timer_end_time', endTime);
        localStorage.setItem('timer_is_running', 'true');
    } else {
        endTime = parseInt(localStorage.getItem('timer_end_time'), 10);
    }

    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Pause";
    
    document.getElementById('timer-status').innerText = 
        currentMode === 'short' ? "Taking a Breather..." : 
        currentMode === 'long' ? "Recharging..." : 
        currentMode === 'custom' ? "Focusing (Custom)..." :
        "Focusing...";

    updateDisplay();
    timerInterval = setInterval(tickTimer, 1000);
}

function tickTimer() {
    if (!isRunning) {
        renderFloatingTimer();
        return;
    }

    remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    updateDisplay();

    if (remainingSeconds <= 0) {
        completeTimerSession();
    }
}

function completeTimerSession() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    remainingSeconds = 0;
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', '0');

    document.getElementById('timer-status').innerText = "Session Complete!";
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Done";
    updateDisplay();
    clearScheduledTimerContext();

    playBeepSequence(3);
}

function playBeepSequence(beepsRemaining) {
    if (beepsRemaining <= 0) return;
    let audio = new Audio('/static/beep.mp3');
    audio.play()
        .then(() => {
            setTimeout(() => playBeepSequence(beepsRemaining - 1), 350);
        })
        .catch(e => console.log("Audio presentation blocked by browser context."));
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    if (endTime) {
        remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    }
    if (remainingSeconds <= 0) {
        completeTimerSession();
        return;
    }
    isRunning = false;
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', remainingSeconds);

    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Resume";
    document.getElementById('timer-status').innerText = "Timer Paused";
    updateDisplay();
}

function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    endTime = null;
    
    remainingSeconds = totalSeconds;
    
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', remainingSeconds);
    localStorage.setItem('timer_total_seconds', totalSeconds);
    localStorage.removeItem('timer_end_time');
    clearScheduledTimerContext();

    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Start";
    
    if (currentMode === 'work') document.getElementById('timer-status').innerText = "Ready to Focus";
    else if (currentMode === 'short') document.getElementById('timer-status').innerText = "Quick Breather";
    else if (currentMode === 'long') document.getElementById('timer-status').innerText = "Extended Break";
    else document.getElementById('timer-status').innerText = "Custom Timer Ready";

    updateDisplay();
}

function loadTimerState() {
    currentMode = localStorage.getItem('timer_current_mode') || 'work';
    totalSeconds = parseInt(localStorage.getItem('timer_total_seconds'), 10) || (60 * 60);
    const storedIsRunning = localStorage.getItem('timer_is_running') === 'true';

    executeModeSwitch(currentMode, totalSeconds / 60, false);

    if (storedIsRunning) {
        endTime = parseInt(localStorage.getItem('timer_end_time'), 10) || 0;
        remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        
        if (remainingSeconds > 0) {
            startTimer(true);
        } else {
            remainingSeconds = 0;
            isRunning = false;
            localStorage.setItem('timer_is_running', 'false');
            localStorage.setItem('timer_remaining_seconds', '0');
            
            document.getElementById('timer-status').innerText = "Session Complete!";
            document.getElementById('icon-pause').classList.add('hidden');
            document.getElementById('icon-play').classList.remove('hidden');
            document.getElementById('text-toggle').innerText = "Done";
            
            updateDisplay();
        }
    } else {
        remainingSeconds = parseInt(localStorage.getItem('timer_remaining_seconds'), 10);
        if (isNaN(remainingSeconds)) remainingSeconds = totalSeconds;
        
        if (remainingSeconds < totalSeconds && remainingSeconds > 0) {
            document.getElementById('text-toggle').innerText = "Resume";
            document.getElementById('timer-status').innerText = "Timer Paused";
        } else if (remainingSeconds <= 0) {
            document.getElementById('text-toggle').innerText = "Done";
            document.getElementById('timer-status').innerText = "Session Complete!";
        }
        
        updateDisplay();
    }
}

/* ==========================================================================
   MODAL LOGIC (CUSTOM TIME & MODE SWITCH WARNING)
   ========================================================================== */

function openCustomTimeModal() {
    const backdrop = document.getElementById('custom-time-modal-backdrop');
    const card = document.getElementById('custom-time-modal-card');
    const input = document.getElementById('custom-minutes-input');

    input.value = Math.ceil(remainingSeconds / 60);

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        input.focus();
    }, 10);
}

function closeCustomTimeModal() {
    const backdrop = document.getElementById('custom-time-modal-backdrop');
    const card = document.getElementById('custom-time-modal-card');
    const input = document.getElementById('custom-minutes-input');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { 
        backdrop.classList.add('hidden'); 
        input.blur();
    }, 300);
}

function applyCustomTime() {
    const input = document.getElementById('custom-minutes-input');
    const customMinutes = parseInt(input.value, 10);

    if (isNaN(customMinutes) || customMinutes <= 0 || customMinutes > 180) {
        input.parentElement.style.transform = 'translateX(5px)';
        setTimeout(() => input.parentElement.style.transform = 'translateX(-5px)', 100);
        setTimeout(() => input.parentElement.style.transform = 'translateX(0)', 200);
        input.focus();
        return;
    }

    if (isRunning) pauseTimer();
    
    // FIX: Pass currentMode instead of 'custom' to preserve colors and tab selection!
    executeModeSwitch(currentMode, customMinutes, true);
    closeCustomTimeModal();
}

// ---- NEW: Interruption Warning Modal ----

function openConfirmSwitchModal() {
    const backdrop = document.getElementById('confirm-switch-modal-backdrop');
    const card = document.getElementById('confirm-switch-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeConfirmSwitchModal() {
    const backdrop = document.getElementById('confirm-switch-modal-backdrop');
    const card = document.getElementById('confirm-switch-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { 
        backdrop.classList.add('hidden'); 
        pendingSwitchMode = null;
        pendingSwitchMinutes = null;
    }, 300);
}

function confirmSwitchMode() {
    if (pendingSwitchMode) {
        executeModeSwitch(pendingSwitchMode, pendingSwitchMinutes, true);
    }
    closeConfirmSwitchModal();
}

document.addEventListener('DOMContentLoaded', () => {
    loadTimerState();
    initializeFloatingTimerFeature();
    renderScheduledSessionBanner();
    if (pendingScheduledSession) {
        applyScheduledTimerSession(pendingScheduledSession);
        pendingScheduledSession = null;
    }
    const currentScheduleStatus = window.LumenScheduleRunner?.getLastStatus();
    if (currentScheduleStatus) renderTimerScheduleStatus(currentScheduleStatus);
    setInterval(updateTimerScheduleCountdown, 1000);
});

window.addEventListener('lumen:scheduled-session-start', event => {
    if (document.readyState === 'loading') {
        pendingScheduledSession = event.detail;
        return;
    }
    applyScheduledTimerSession(event.detail);
});

window.addEventListener('lumen:scheduled-session-clear', () => {
    cancelScheduledTimerSession();
});

window.addEventListener('lumen:schedule-status', event => {
    renderTimerScheduleStatus(event.detail);
});

window.addEventListener('lumen:schedule-automation-change', () => {
    window.LumenScheduleRunner?.syncNow();
});

window.addEventListener('storage', event => {
    if (event.key !== 'timer_schedule_active') return;
    if (!event.newValue) {
        if (event.oldValue) cancelScheduledTimerSession();
        return;
    }
    try {
        applyScheduledTimerSession(JSON.parse(event.newValue));
    } catch (error) {
        console.warn('Scheduled timer context could not be synchronized.', error);
    }
});

document.addEventListener('keydown', event => {
    const target = event.target;
    if (target.matches('input, textarea, select, button, a') || target.isContentEditable) return;

    const modalIsOpen = [
        'custom-time-modal-backdrop',
        'confirm-switch-modal-backdrop'
    ].some(id => !document.getElementById(id)?.classList.contains('hidden'));
    if (modalIsOpen) return;

    if (event.code === 'Space') {
        event.preventDefault();
        toggleTimer();
    } else if (event.key.toLocaleLowerCase() === 'r') {
        resetTimer();
    } else if (event.key.toLocaleLowerCase() === 'c') {
        openCustomTimeModal();
    }
});
