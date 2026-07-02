/* ==========================================================================
   LUMEN - CROSS-PAGE AUTOMATED SCHEDULE RUNNER
   ========================================================================== */

(() => {
    const STATUS_URL = '/api/schedule/status';
    const REQUEST_TIMEOUT_MS = 3500;
    const POLL_INTERVAL_MS = 5000;
    let statusRequestInFlight = false;
    let lastStatus = null;
    let pollTimeout = null;
    let boundaryTimeout = null;
    let liveEndTime = 0;
    let floatingScheduleWindow = null;
    let floatingScheduleInterval = null;
    let floatingScheduleStatusAt = 0;
    let floatingScheduleWasActive = null;

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

    function scheduleFloatingSupported() {
        return 'documentPictureInPicture' in window;
    }

    function scheduleFloatingStyles() {
        return `
            @font-face {
                font-family: "Poppins";
                src: url("/static/fonts/Poppins-Regular.ttf") format("truetype");
                font-weight: 400 600;
            }
            @font-face {
                font-family: "Poppins";
                src: url("/static/fonts/Poppins-Bold.ttf") format("truetype");
                font-weight: 700 900;
            }
            :root {
                color-scheme: light;
                font-family: "Poppins", ui-sans-serif, system-ui, sans-serif;
                --accent: #4318FF;
                --accent-soft: #7B61FF;
            }
            * { box-sizing: border-box; }
            html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
            body {
                padding: 10px;
                color: #2B3674;
                background:
                    radial-gradient(circle at 92% 8%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 40%),
                    #F4F7FE;
                user-select: none;
            }
            button { font: inherit; }
            .widget {
                height: 100%;
                display: flex;
                flex-direction: column;
                padding: 15px;
                border: 1px solid rgba(255,255,255,.92);
                border-radius: 25px;
                background: rgba(255,255,255,.96);
                box-shadow: 0 16px 40px rgba(112,144,176,.2);
            }
            .header, .footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
            .brand { display: flex; align-items: center; gap: 8px; font-size: 9px; font-weight: 900; letter-spacing: .16em; }
            .brand-mark {
                width: 25px; height: 25px; display: grid; place-items: center; border-radius: 9px;
                color: white; background: linear-gradient(135deg, var(--accent), var(--accent-soft));
                box-shadow: 0 6px 14px color-mix(in srgb, var(--accent) 22%, transparent);
            }
            .armed {
                padding: 5px 8px; border-radius: 999px; color: #05B98C; background: #E6FAF5;
                font-size: 8px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
            }
            .close {
                width: 27px; height: 27px; border: 0; border-radius: 9px; color: #626F9C;
                background: #F4F7FE; cursor: pointer; font-size: 15px; line-height: 1;
            }
            .content { flex: 1; min-height: 0; display: grid; place-items: center; padding: 8px 0; }
            .timer-shell {
                position: relative; width: min(222px, calc(100vw - 62px)); aspect-ratio: 1;
                display: grid; place-items: center; transition: width .25s ease;
            }
            .ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
            .track, .progress { fill: none; stroke-width: 8; }
            .track { stroke: #EDF1F7; }
            .progress {
                stroke: var(--accent); stroke-linecap: round;
                filter: drop-shadow(0 4px 7px color-mix(in srgb, var(--accent) 18%, transparent));
                transition: stroke-dashoffset .7s linear, stroke .25s ease;
            }
            .copy { position: relative; z-index: 1; width: 76%; text-align: center; }
            .time {
                color: var(--accent); font-size: clamp(37px, 13vw, 49px); line-height: 1;
                font-weight: 900; letter-spacing: -.06em; font-variant-numeric: tabular-nums;
            }
            .status {
                margin-top: 9px; color: var(--accent); font-size: 8px; font-weight: 900;
                letter-spacing: .14em; text-transform: uppercase;
            }
            .label {
                max-width: 100%; margin-top: 6px; overflow: hidden; color: #626F9C;
                font-size: 9px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap;
            }
            .next {
                min-width: 0; overflow: hidden; color: #626F9C; font-size: 8px; font-weight: 700;
                text-overflow: ellipsis; white-space: nowrap;
            }
            body[data-active="false"] .timer-shell { width: min(150px, calc(100vw - 90px)); }
            body[data-active="false"] .time { font-size: 30px; }
            body[data-active="false"] .content { padding: 3px 0; }
            body[data-active="false"] .label { margin-top: 4px; }
            body[data-active="false"] .footer { border-top: 1px solid #F1F4F9; padding-top: 8px; }
            @media (max-height: 330px) {
                body { padding: 7px; }
                .widget { padding: 11px; border-radius: 20px; }
                .timer-shell { width: min(130px, calc(100vw - 105px)) !important; }
                .time { font-size: 27px !important; }
                .status { margin-top: 6px; }
            }
            @media (prefers-reduced-motion: reduce) {
                *, *::before, *::after { animation: none !important; transition: none !important; }
            }
        `;
    }

    function scheduleFloatingMarkup() {
        return `
            <section class="widget" aria-label="Lumen scheduled floating timer">
                <header class="header">
                    <div class="brand">
                        <span class="brand-mark" aria-hidden="true">L</span>
                        <span>LUMEN AUTO</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:7px">
                        <span id="schedule-float-armed" class="armed">Armed</span>
                        <button id="schedule-float-close" type="button" class="close" aria-label="Close floating timer">×</button>
                    </div>
                </header>
                <main class="content">
                    <div id="schedule-float-progress-shell" class="timer-shell" role="progressbar" aria-label="Scheduled timer" aria-valuemin="0" aria-valuemax="100">
                        <svg class="ring" viewBox="0 0 256 256" aria-hidden="true">
                            <circle class="track" cx="128" cy="128" r="120"></circle>
                            <circle id="schedule-float-ring" class="progress" cx="128" cy="128" r="120" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"></circle>
                        </svg>
                        <div class="copy">
                            <div id="schedule-float-time" class="time">--:--</div>
                            <div id="schedule-float-status" class="status">Floating armed</div>
                            <div id="schedule-float-label" class="label">Waiting for your next session</div>
                        </div>
                    </div>
                </main>
                <footer class="footer">
                    <span id="schedule-float-next" class="next">Keep this window open</span>
                </footer>
            </section>
        `;
    }

    function scheduleFloatingMode(sessionType) {
        return {
            work: { color: '#4318FF', soft: '#7B61FF' },
            short: { color: '#05B98C', soft: '#3DD6AE' },
            long: { color: '#F59E0B', soft: '#FBCB62' }
        }[sessionType] || { color: '#4318FF', soft: '#7B61FF' };
    }

    function resizeScheduleFloating(active) {
        if (!floatingScheduleWindow || floatingScheduleWasActive === active) return;
        floatingScheduleWasActive = active;
        try {
            floatingScheduleWindow.resizeTo(370, active ? 470 : 300);
        } catch (error) {
            // The widget remains responsive if the browser keeps the user-selected size.
        }
    }

    function renderScheduleFloating() {
        if (!floatingScheduleWindow || floatingScheduleWindow.closed) return;
        const floatingDocument = floatingScheduleWindow.document;
        const time = floatingDocument.getElementById('schedule-float-time');
        const status = floatingDocument.getElementById('schedule-float-status');
        const label = floatingDocument.getElementById('schedule-float-label');
        const next = floatingDocument.getElementById('schedule-float-next');
        const ring = floatingDocument.getElementById('schedule-float-ring');
        const progressShell = floatingDocument.getElementById('schedule-float-progress-shell');
        const armed = floatingDocument.getElementById('schedule-float-armed');
        if (!time || !status || !label || !next || !ring || !progressShell || !armed) return;

        const elapsed = Math.floor((Date.now() - floatingScheduleStatusAt) / 1000);
        const activeSession = lastStatus?.active_session;
        const nextSession = lastStatus?.next_session;
        const active = Boolean(
            isAutomationEnabled()
            && activeSession
            && Number(lastStatus.remaining_seconds) - elapsed > 0
        );
        const mode = scheduleFloatingMode(activeSession?.session_type || nextSession?.session_type);
        floatingDocument.documentElement.style.setProperty('--accent', mode.color);
        floatingDocument.documentElement.style.setProperty('--accent-soft', mode.soft);
        floatingDocument.body.dataset.active = String(active);
        resizeScheduleFloating(active);

        if (!isAutomationEnabled()) {
            time.textContent = 'PAUSED';
            status.textContent = 'Automation paused';
            label.textContent = 'Your day plan is still saved';
            next.textContent = 'Enable automation in Day Planner';
            armed.textContent = 'Paused';
            ring.style.strokeDashoffset = '100';
            progressShell.setAttribute('aria-valuenow', '0');
            floatingDocument.title = 'Automation paused · Lumen';
            return;
        }

        armed.textContent = active ? 'Live' : 'Armed';
        if (active) {
            const remaining = Math.max(
                0,
                Number(lastStatus.remaining_seconds) - elapsed
            );
            const total = Math.max(1, Number(activeSession.duration_minutes) * 60);
            const remainingPercentage = Math.max(
                0,
                Math.min(100, (remaining / total) * 100)
            );
            const copy = modeCopy[activeSession.session_type] || modeCopy.work;
            time.textContent = formatCountdown(remaining);
            status.textContent = copy.title;
            label.textContent = activeSession.label || copy.fallback;
            next.textContent = nextSession
                ? `Next: ${modeCopy[nextSession.session_type]?.fallback || 'Session'} at ${nextSession.start_time}`
                : `Ends at ${activeSession.end_time}`;
            ring.style.strokeDashoffset = String(100 - remainingPercentage);
            progressShell.setAttribute('aria-valuenow', String(Math.round(remainingPercentage)));
            floatingDocument.title = `${formatCountdown(remaining)} · ${copy.fallback}`;
            return;
        }

        const untilNext = Math.max(
            0,
            Number(lastStatus?.seconds_until_next || 0) - elapsed
        );
        time.textContent = nextSession ? formatCountdown(untilNext) : '--:--';
        status.textContent = nextSession ? 'Floating armed' : 'No session queued';
        label.textContent = nextSession
            ? `${nextSession.label || modeCopy[nextSession.session_type]?.fallback} · ${nextSession.start_time}`
            : 'Build your next rhythm in Day Planner';
        next.textContent = nextSession
            ? 'This window will start automatically'
            : 'Keep this window open';
        ring.style.strokeDashoffset = '100';
        progressShell.setAttribute('aria-valuenow', '0');
        floatingDocument.title = nextSession
            ? `${formatCountdown(untilNext)} until next · Lumen`
            : 'Floating armed · Lumen';
    }

    function notifyScheduleFloatingChange() {
        window.dispatchEvent(new CustomEvent('lumen:schedule-floating-change', {
            detail: {
                open: Boolean(
                    floatingScheduleWindow
                    && !floatingScheduleWindow.closed
                ),
                supported: scheduleFloatingSupported()
            }
        }));
    }

    function closeScheduleFloating() {
        const pipWindow = floatingScheduleWindow;
        if (pipWindow && floatingScheduleInterval !== null) {
            pipWindow.clearInterval(floatingScheduleInterval);
        }
        floatingScheduleInterval = null;
        floatingScheduleWindow = null;
        floatingScheduleWasActive = null;
        if (pipWindow && !pipWindow.closed) pipWindow.close();
        notifyScheduleFloatingChange();
    }

    async function openScheduleFloating() {
        if (!scheduleFloatingSupported()) {
            throw new Error('Floating timers require a current version of Chrome or Edge.');
        }
        if (floatingScheduleWindow && !floatingScheduleWindow.closed) {
            floatingScheduleWindow.focus();
            return floatingScheduleWindow;
        }

        const pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 370,
            height: 300
        });
        floatingScheduleWindow = pipWindow;
        floatingScheduleStatusAt = Date.now();
        const style = pipWindow.document.createElement('style');
        style.textContent = scheduleFloatingStyles();
        pipWindow.document.head.appendChild(style);
        pipWindow.document.body.innerHTML = scheduleFloatingMarkup();
        pipWindow.document
            .getElementById('schedule-float-close')
            .addEventListener('click', closeScheduleFloating);
        floatingScheduleInterval = pipWindow.setInterval(
            renderScheduleFloating,
            1000
        );
        pipWindow.addEventListener('pagehide', () => {
            if (floatingScheduleWindow === pipWindow) {
                if (floatingScheduleInterval !== null) {
                    pipWindow.clearInterval(floatingScheduleInterval);
                }
                floatingScheduleWindow = null;
                floatingScheduleInterval = null;
                floatingScheduleWasActive = null;
                notifyScheduleFloatingChange();
            }
        }, { once: true });
        renderScheduleFloating();
        notifyScheduleFloatingChange();
        return pipWindow;
    }

    function toggleScheduleFloating() {
        if (floatingScheduleWindow && !floatingScheduleWindow.closed) {
            closeScheduleFloating();
            return Promise.resolve(null);
        }
        return openScheduleFloating();
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
            session.start_time,
            session.end_time,
            session.updated_at
        ].join(':');
    }

    function activateScheduledSession(status) {
        const session = status.active_session;
        if (!isAutomationEnabled() || !session || status.remaining_seconds <= 0) return;

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
        if (statusRequestInFlight) return lastStatus;
        statusRequestInFlight = true;
        try {
            const status = await fetchScheduleStatus();
            status.automation_enabled = isAutomationEnabled();
            lastStatus = status;
            renderLivePill(status);
            floatingScheduleStatusAt = Date.now();
            renderScheduleFloating();
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
            pollTimeout = setTimeout(syncNow, POLL_INTERVAL_MS);
        }
    }

    window.LumenScheduleRunner = {
        syncNow,
        getLastStatus: () => lastStatus,
        isEnabled: isAutomationEnabled,
        isFloatingSupported: scheduleFloatingSupported,
        isFloatingOpen: () => Boolean(
            floatingScheduleWindow
            && !floatingScheduleWindow.closed
        ),
        toggleFloating: toggleScheduleFloating,
        closeFloating: closeScheduleFloating,
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
    window.addEventListener('pagehide', closeScheduleFloating, { once: true });
    setInterval(updateLivePillCountdown, 1000);
})();
