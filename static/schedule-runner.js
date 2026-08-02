/* ==========================================================================
   LUMEN - CROSS-PAGE AUTOMATED SCHEDULE RUNNER
   ========================================================================== */

(() => {
    const STATUS_URL = '/api/schedule/status';
    const REQUEST_TIMEOUT_MS = 3500;
    const POLL_INTERVAL_MS = 5000;
    let statusRequestInFlight = false;
    let syncRequestedWhileBusy = false;
    let lastStatus = null;
    let pollTimeout = null;
    let boundaryTimeout = null;
    let liveEndTime = 0;

    const modeCopy = {
        work: { title: 'Focus running', fallback: 'Deep Work' },
        short: { title: 'Short break', fallback: 'Quick recovery' },
        long: { title: 'Long break', fallback: 'Extended recovery' }
    };

    function isAutomationEnabled() {
        return localStorage.getItem('lumen_schedule_automation_enabled') !== 'false';
    }

    function formatCountdown(totalSeconds) {
        const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
        const hours = Math.floor(safeSeconds / 3600);
        const minutes = Math.floor((safeSeconds % 3600) / 60);
        const seconds = safeSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    function updateLivePillCountdown() {
        const pill = document.getElementById('schedule-live-pill');
        const countdown = document.getElementById('schedule-live-countdown');
        if (!pill || !countdown || pill.classList.contains('hidden')) return;
        countdown.textContent = formatCountdown((liveEndTime - Date.now()) / 1000);
    }

    function renderLivePill(status) {
        const pill = document.getElementById('schedule-live-pill');
        const mode = document.getElementById('schedule-live-mode');
        const label = document.getElementById('schedule-live-label');
        const countdown = document.getElementById('schedule-live-countdown');
        if (!pill || !mode || !label || !countdown) return;

        const session = status?.active_session;
        if (!isAutomationEnabled() || !session || status.remaining_seconds <= 0) {
            pill.classList.add('hidden');
            liveEndTime = 0;
            return;
        }

        const copy = modeCopy[session.session_type] || modeCopy.work;
        liveEndTime = Date.now() + (status.remaining_seconds * 1000);
        pill.dataset.sessionType = session.session_type;
        mode.textContent = copy.title;
        label.textContent = session.label || copy.fallback;
        pill.classList.remove('hidden');
        updateLivePillCountdown();
    }

    function scheduledSessionKey(status) {
        const session = status.active_session;
        if (!session) return '';
        return [
            status.date,
            session.id,
            session.session_type,
            session.label || '',
            session.start_time,
            session.end_time
        ].join(':');
    }

    function getStoredScheduledSession() {
        try {
            return JSON.parse(
                localStorage.getItem('timer_schedule_active') || 'null'
            );
        } catch (error) {
            return null;
        }
    }

    function clearStaleScheduledSession(status) {
        const storedSession = getStoredScheduledSession();
        if (!storedSession) return;
        if (status?.active_session && status.remaining_seconds > 0) return;

        localStorage.removeItem('timer_schedule_active');
        localStorage.removeItem('timer_schedule_claim');
        localStorage.setItem('timer_is_running', 'false');
        localStorage.setItem('timer_remaining_seconds', '0');
        localStorage.removeItem('timer_end_time');
        window.dispatchEvent(new CustomEvent(
            'lumen:scheduled-session-clear',
            { detail: storedSession }
        ));
    }

    function activateScheduledSession(status) {
        const session = status.active_session;
        if (!isAutomationEnabled()) return;
        if (!session || status.remaining_seconds <= 0) {
            clearStaleScheduledSession(status);
            return;
        }

        const sessionKey = scheduledSessionKey(status);
        if (localStorage.getItem('timer_schedule_claim') === sessionKey) return;

        const totalSeconds = session.duration_minutes * 60;
        const endTime = Date.now() + (status.remaining_seconds * 1000);
        const sessionContext = {
            ...session,
            schedule_date: status.date,
            schedule_key: sessionKey,
            end_time_ms: endTime
        };

        localStorage.setItem('timer_current_mode', session.session_type);
        localStorage.setItem('timer_total_seconds', String(totalSeconds));
        localStorage.setItem('timer_remaining_seconds', String(status.remaining_seconds));
        localStorage.setItem('timer_end_time', String(endTime));
        localStorage.setItem('timer_is_running', 'true');
        localStorage.setItem('timer_schedule_active', JSON.stringify(sessionContext));
        localStorage.setItem('timer_schedule_claim', sessionKey);

        window.dispatchEvent(new CustomEvent('lumen:scheduled-session-start', {
            detail: sessionContext
        }));
    }

    function armNextBoundary(status) {
        clearTimeout(boundaryTimeout);
        if (!Number.isFinite(status?.seconds_until_next)) return;
        const delay = Math.max(
            250,
            Math.min((status.seconds_until_next * 1000) + 150, 2147483000)
        );
        boundaryTimeout = setTimeout(syncNow, delay);
    }

    async function fetchScheduleStatus() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(STATUS_URL, {
                signal: controller.signal,
                cache: 'no-store'
            });
            if (!response.ok) throw new Error(`Schedule status failed: ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    async function syncNow() {
        if (statusRequestInFlight) {
            syncRequestedWhileBusy = true;
            return lastStatus;
        }
        statusRequestInFlight = true;
        try {
            const status = await fetchScheduleStatus();
            status.automation_enabled = isAutomationEnabled();
            lastStatus = status;
            renderLivePill(status);
            activateScheduledSession(status);
            armNextBoundary(status);
            window.dispatchEvent(new CustomEvent('lumen:schedule-status', {
                detail: status
            }));
            return status;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.warn('Schedule automation is temporarily unavailable.', error);
            }
            return lastStatus;
        } finally {
            statusRequestInFlight = false;
            clearTimeout(pollTimeout);
            const nextDelay = syncRequestedWhileBusy
                ? 0
                : POLL_INTERVAL_MS;
            syncRequestedWhileBusy = false;
            pollTimeout = setTimeout(syncNow, nextDelay);
        }
    }

    window.LumenScheduleRunner = {
        syncNow,
        getLastStatus: () => lastStatus,
        isEnabled: isAutomationEnabled,
        setEnabled(enabled) {
            localStorage.setItem(
                'lumen_schedule_automation_enabled',
                enabled ? 'true' : 'false'
            );
            if (enabled) {
                localStorage.removeItem('timer_schedule_claim');
            } else {
                renderLivePill(null);
            }
            window.dispatchEvent(new CustomEvent('lumen:schedule-automation-change', {
                detail: { enabled }
            }));
            return syncNow();
        }
    };

    document.addEventListener('DOMContentLoaded', syncNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') syncNow();
    });
    window.addEventListener('online', syncNow);
    window.addEventListener('storage', event => {
        if (event.key === 'lumen_schedule_automation_enabled') {
            if (!isAutomationEnabled()) renderLivePill(null);
            syncNow();
        }
    });
    setInterval(updateLivePillCountdown, 1000);
})();
