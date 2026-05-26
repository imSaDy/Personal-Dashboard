/* ==========================================================================
   LUMEN - PERSISTENT TIMESTAMP FOCUS TIMER (timer.js)
   ========================================================================== */

let currentMode = 'work';
let totalSeconds = 60 * 60;
let remainingSeconds = 60 * 60;
let timerInterval = null;
let isRunning = false;
let endTime = null;

// Modal State Trackers
let pendingSwitchMode = null;
let pendingSwitchMinutes = null;

const circleCircumference = 753.98;

function updateDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    
    document.getElementById('timer-display').innerText = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    document.title = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} - Lumen Timer`;

    const percentage = remainingSeconds / totalSeconds;
    const offset = circleCircumference - (percentage * circleCircumference);
    document.getElementById('timer-ring').style.strokeDashoffset = offset;
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
                if (mode === 'short') activeColor = 'text-accent-mint';
                if (mode === 'long') activeColor = 'text-[#FF9F1C]';
                
                btn.className = `px-5 py-2 rounded-xl text-sm font-bold transition-all bg-white shadow-sm ${activeColor} pointer-events-none`;
            } else {
                btn.className = "px-5 py-2 rounded-xl text-sm font-bold transition-all text-textMuted hover:text-textMain cursor-pointer";
            }
        }
    });

    const ring = document.getElementById('timer-ring');
    const statusText = document.getElementById('timer-status');
    const toggleBtn = document.getElementById('btn-toggle');
    const timeDisplay = document.getElementById('timer-display'); 
    
    ring.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    statusText.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    toggleBtn.classList.remove('bg-brand', 'hover:bg-brand/90', 'bg-accent-mint', 'hover:bg-accent-mint/90', 'bg-[#FF9F1C]', 'hover:bg-[#FF9F1C]/90');
    timeDisplay.classList.remove('text-textMain', 'hover:text-brand', 'text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    
    timeDisplay.classList.add('transition-colors', 'duration-1000');

    if (mode === 'work' || mode === 'custom') {
        ring.classList.add('text-brand');
        statusText.classList.add('text-brand');
        timeDisplay.classList.add('text-brand');
        toggleBtn.classList.add('bg-brand', 'hover:bg-brand/90');
        statusText.innerText = mode === 'work' ? "Ready to Focus" : "Custom Timer Ready";
    } else if (mode === 'short') {
        ring.classList.add('text-accent-mint');
        statusText.classList.add('text-accent-mint');
        timeDisplay.classList.add('text-accent-mint');
        toggleBtn.classList.add('bg-accent-mint', 'hover:bg-accent-mint/90');
        statusText.innerText = "Quick Breather";
    } else if (mode === 'long') {
        ring.classList.add('text-[#FF9F1C]');
        statusText.classList.add('text-[#FF9F1C]');
        timeDisplay.classList.add('text-[#FF9F1C]');
        toggleBtn.classList.add('bg-[#FF9F1C]', 'hover:bg-[#FF9F1C]/90');
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

    timerInterval = setInterval(() => {
        remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        updateDisplay();

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            localStorage.setItem('timer_is_running', 'false');
            
            document.getElementById('timer-status').innerText = "Session Complete!";
            document.getElementById('icon-pause').classList.add('hidden');
            document.getElementById('icon-play').classList.remove('hidden');
            document.getElementById('text-toggle').innerText = "Done";
            
            playBeepSequence(3);
        }
    }, 1000);
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
    isRunning = false;
    clearInterval(timerInterval);
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', remainingSeconds);
    
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Resume";
    document.getElementById('timer-status').innerText = "Timer Paused";
}

function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    
    remainingSeconds = totalSeconds;
    
    localStorage.setItem('timer_is_running', 'false');
    localStorage.setItem('timer_remaining_seconds', remainingSeconds);
    localStorage.setItem('timer_total_seconds', totalSeconds);

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

    if (isNaN(customMinutes) || customMinutes <= 0 || customMinutes > 999) {
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

document.addEventListener('DOMContentLoaded', loadTimerState);