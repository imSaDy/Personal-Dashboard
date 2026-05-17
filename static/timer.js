/* ==========================================================================
   LUMEN - STATELESS FOCUS TIMER (timer.js)
   ========================================================================== */

let currentMode = 'work';
let totalSeconds = 60 * 60;
let remainingSeconds = 60 * 60;
let timerInterval = null;
let isRunning = false;

// The circumference of our SVG circle (2 * Math.PI * 120 radius)
const circleCircumference = 753.98;

function updateDisplay() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    
    // Update Text
    document.getElementById('timer-display').innerText = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update Document Title so user can see it in the browser tab
    document.title = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} - Lumen Timer`;

    // Update Ring Animation
    const percentage = remainingSeconds / totalSeconds;
    const offset = circleCircumference - (percentage * circleCircumference);
    document.getElementById('timer-ring').style.strokeDashoffset = offset;
}

function setTimerMode(mode, minutes) {
    if (isRunning) return; // Prevent changing modes while running

    currentMode = mode;
    totalSeconds = minutes * 60;
    remainingSeconds = totalSeconds;
    
    // UI Updates for the Pill Buttons
    ['work', 'short', 'long'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (m === mode) {
            btn.className = "px-5 py-2 rounded-xl text-sm font-bold transition-all bg-white shadow-sm text-brand pointer-events-none";
        } else {
            btn.className = "px-5 py-2 rounded-xl text-sm font-bold transition-all text-textMuted hover:text-textMain cursor-pointer";
        }
    });

    // Elements to recolor
    const ring = document.getElementById('timer-ring');
    const statusText = document.getElementById('timer-status');
    const toggleBtn = document.getElementById('btn-toggle');
    const timeDisplay = document.getElementById('timer-display'); 
    
    // First, strip away ALL possible color classes so we have a blank slate
    ring.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    statusText.classList.remove('text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    toggleBtn.classList.remove('bg-brand', 'hover:bg-brand/90', 'bg-accent-mint', 'hover:bg-accent-mint/90', 'bg-[#FF9F1C]', 'hover:bg-[#FF9F1C]/90');
    
    // Strip away the default dark text and hover effects from the time display
    timeDisplay.classList.remove('text-textMain', 'hover:text-brand', 'text-brand', 'text-accent-mint', 'text-[#FF9F1C]');
    
    // Ensure the text fades smoothly at the same speed as the SVG ring (1 second)
    timeDisplay.classList.add('transition-colors', 'duration-1000');

    // Apply the exact colors based on the mode
    if (mode === 'work') {
        ring.classList.add('text-brand');
        statusText.classList.add('text-brand');
        timeDisplay.classList.add('text-brand');
        toggleBtn.classList.add('bg-brand', 'hover:bg-brand/90');
        statusText.innerText = "Ready to Focus";
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
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    isRunning = true;
    document.getElementById('icon-play').classList.add('hidden');
    document.getElementById('icon-pause').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Pause";
    
    document.getElementById('timer-status').innerText = currentMode === 'work' ? "Focusing..." : "Recharging...";

    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateDisplay();

        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            document.getElementById('timer-status').innerText = "Session Complete!";
            document.getElementById('icon-pause').classList.add('hidden');
            document.getElementById('icon-play').classList.remove('hidden');
            document.getElementById('text-toggle').innerText = "Done";
            
            // Play a gentle notification sound (optional)
            let audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.play().catch(e => console.log("Audio play blocked by browser."));
        }
    }, 1000);
}

function pauseTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Resume";
    document.getElementById('timer-status').innerText = "Timer Paused";
}

function resetTimer() {
    isRunning = false;
    clearInterval(timerInterval);
    
    remainingSeconds = totalSeconds;
    
    document.getElementById('icon-pause').classList.add('hidden');
    document.getElementById('icon-play').classList.remove('hidden');
    document.getElementById('text-toggle').innerText = "Start";
    
    if (currentMode === 'work') document.getElementById('timer-status').innerText = "Ready to Focus";
    else if (currentMode === 'short') document.getElementById('timer-status').innerText = "Quick Breather";
    else document.getElementById('timer-status').innerText = "Extended Break";

    updateDisplay();
}

/* ==========================================================================
   CUSTOM TIME MODAL LOGIC
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

    totalSeconds = customMinutes * 60;
    remainingSeconds = totalSeconds;
    
    ['work', 'short', 'long'].forEach(m => {
        document.getElementById(`btn-mode-${m}`).className = "px-5 py-2 rounded-xl text-sm font-bold transition-all text-textMuted hover:text-textMain cursor-pointer";
    });

    document.getElementById('timer-status').innerText = "Custom Timer Ready";

    updateDisplay();
    closeCustomTimeModal();
}

// Initialize display on load and force the initial color state
document.addEventListener('DOMContentLoaded', () => {
    // Force the first load to be styled as Brand Purple
    const timeDisplay = document.getElementById('timer-display');
    timeDisplay.classList.remove('text-textMain', 'hover:text-brand');
    timeDisplay.classList.add('text-brand', 'transition-colors', 'duration-1000');
    
    // Apply the exact same smooth fade transition to the status text
    const statusText = document.getElementById('timer-status');
    statusText.classList.add('transition-colors', 'duration-1000');

    // NEW: Apply the smooth fade transition to the start button
    const toggleBtn = document.getElementById('btn-toggle');
    toggleBtn.classList.add('duration-1000');
    
    updateDisplay();
});