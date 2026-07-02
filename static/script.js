/* ==========================================================================
   LUMEN - CORE APPLICATION LOGIC (script.js)
   ========================================================================== */

/* ==========================================================================
   CUSTOM DROPDOWN LOGIC
   ========================================================================== */

function toggleDropdown() {
    const menu = document.getElementById('dropdown-menu');
    const arrow = document.getElementById('dropdown-arrow');
    const trigger = document.getElementById('dropdown-trigger');
    
    if (menu.classList.contains('opacity-0')) {
        // Open Menu
        menu.classList.remove('opacity-0', 'invisible', '-translate-y-2');
        arrow.style.transform = 'rotate(180deg)';
        trigger?.setAttribute('aria-expanded', 'true');
    } else {
        // Close Menu
        closeDropdown();
    }
}

function closeDropdown() {
    const menu = document.getElementById('dropdown-menu');
    const arrow = document.getElementById('dropdown-arrow');
    const trigger = document.getElementById('dropdown-trigger');
    
    if (menu && !menu.classList.contains('opacity-0')) {
        menu.classList.add('opacity-0', 'invisible', '-translate-y-2');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        trigger?.setAttribute('aria-expanded', 'false');
    }
}

function selectTimeframe(value, label) {
    // 1. Update the hidden input value
    const input = document.getElementById('timeframe-selector');
    if (input) input.value = value;
    
    // 2. Update the visible button text
    const textSpan = document.getElementById('dropdown-selected-text');
    if (textSpan) textSpan.innerText = label;

    if (window.location.pathname === '/performance') {
        const url = new URL(window.location.href);
        if (value === 'weekly') {
            url.searchParams.delete('period');
        } else {
            url.searchParams.set('period', value);
        }
        window.history.replaceState({}, '', url);
    }

    // 3. Update the visual active states AND clone the icon
    const selectedIconContainer = document.getElementById('dropdown-selected-icon');

    document.querySelectorAll('.dropdown-item').forEach(btn => {
        // Find the specific icons inside this row
        const iconContainer = btn.querySelector('div svg'); 
        const check = btn.querySelector('.check-icon');
        
        if (btn.getAttribute('data-value') === value) {
            // -- THIS IS THE SELECTED ROW --
            btn.className = 'dropdown-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-brand bg-brand-light transition-all mb-1 group';
            iconContainer.className = 'w-4 h-4 opacity-100';
            check.className = 'w-4 h-4 text-brand opacity-100 check-icon transition-opacity';
            
            // Clone the icon, scale it to w-5 h-5, and put it in the main button
            if (selectedIconContainer) {
                const clonedSVG = iconContainer.cloneNode(true);
                clonedSVG.className = 'w-5 h-5';
                selectedIconContainer.innerHTML = '';
                selectedIconContainer.appendChild(clonedSVG);
            }
        } else {
            // -- THIS ROW IS NOT SELECTED --
            btn.className = 'dropdown-item w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold text-textMuted hover:text-brand hover:bg-brand-light transition-all mb-1 group';
            iconContainer.className = 'w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity';
            check.className = 'w-4 h-4 text-brand opacity-0 check-icon transition-opacity';
        }
    });
    
    // 4. Close the menu
    closeDropdown();
    
    // 5. Refresh metrics and chart independently so one slow response cannot block the other
    if (typeof refreshPerformanceReport === 'function') {
        refreshPerformanceReport(value);
    }
}

// Global click listener: Close the dropdown if the user clicks anywhere outside of it
document.addEventListener('click', (event) => {
    const container = document.getElementById('custom-dropdown-container');
    if (container && !container.contains(event.target)) {
        closeDropdown();
    }
});

/* ==========================================================================
   LOG ENTRY FORM LOGIC
   ========================================================================== */

async function submitLog() {
    const activityInput = document.getElementById('activity');
    const hoursInput = document.getElementById('hours');
    const submitBtn = document.querySelector('button[onclick="submitLog()"]');
    const originalBtnHTML = submitBtn.innerHTML;

    const activity = activityInput.value.trim();
    const hours = parseFloat(hoursInput.value);

    if (!activity) {
        showStatusMessage("Please enter an activity name.", 'error');
        activityInput.focus();
        return;
    }

    if (isNaN(hours) || hours <= 0) {
        showStatusMessage("Please enter a valid duration (greater than 0).", 'error');
        hoursInput.focus();
        return;
    }

    if (hours > 24) {
        showStatusMessage("You cannot log more than 24 hours in a single entry.", 'error');
        return;
    }

    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
    submitBtn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Saving...
    `;

    try {
        const response = await fetch('/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity, hours })
        });

        const result = await response.json();
        
        if (result.status === "success") {
            const savedActivity = result.activity || activity;
            showStatusMessage(`Successfully logged ${hours}h of ${savedActivity}.`, 'success');
            
            activityInput.value = '';
            hoursInput.value = '';
            activityInput.blur();
            hoursInput.blur();

            if (typeof loadRecentLogs === "function") loadRecentLogs();
            if (typeof refreshActivitySuggestions === "function") refreshActivitySuggestions();
            refreshPerformanceReport();
        } else {
            showStatusMessage(result.message || "Failed to save entry. Please try again.", 'error');
        }
    } catch (error) {
        console.error("Transmission failed", error);
        showStatusMessage("Network error. Check connection to server.", 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.innerHTML = originalBtnHTML;
    }
}

function showStatusMessage(message, type = 'success') {
    const statusMsg = document.getElementById('status-msg');
    
    statusMsg.className = 'text-center text-sm font-bold mt-4 transition-all duration-300 transform translate-y-0 opacity-100';
    
    if (type === 'success') {
        statusMsg.classList.add('text-emerald-700');
    } else {
        statusMsg.classList.add('text-red-700');
    }

    statusMsg.innerText = message;
    
    if (window.statusMsgTimeout) clearTimeout(window.statusMsgTimeout);

    window.statusMsgTimeout = setTimeout(() => {
        statusMsg.classList.replace('opacity-100', 'opacity-0');
        statusMsg.classList.replace('translate-y-0', 'translate-y-2');
        setTimeout(() => statusMsg.classList.add('hidden'), 300);
    }, 3500);
}

/* ==========================================================================
   DASHBOARD METRICS LOGIC
   ========================================================================== */

let metricsRequestController = null;
let metricsRequestSequence = 0;
const METRICS_REQUEST_TIMEOUT_MS = 6000;

function refreshPerformanceReport(timeframe = null) {
    const selector = document.getElementById('timeframe-selector');
    const selectedTimeframe = timeframe || selector?.value || 'weekly';
    updateSummaryMetrics(selectedTimeframe);
    if (typeof loadChartData === 'function') {
        loadChartData(selectedTimeframe);
    }
}

function animateValue(obj, start, end, duration, isFloat = false) {
    const animationVersion = Number(obj.dataset.animationVersion || 0) + 1;
    obj.dataset.animationVersion = String(animationVersion);
    let startTimestamp = null;
    const step = (timestamp) => {
        if (Number(obj.dataset.animationVersion) !== animationVersion) return;
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); 
        const current = easeOut * (end - start) + start;
        
        obj.innerHTML = isFloat ? current.toFixed(1) : Math.floor(current);
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = isFloat ? end.toFixed(1) : end;
        }
    };
    window.requestAnimationFrame(step);
}

async function updateSummaryMetrics(timeframeOverride = null) {
    const selector = document.getElementById('timeframe-selector');
    const timeframe = timeframeOverride || selector?.value || 'weekly';
    const periodLabels = {
        daily: 'Today',
        weekly: 'Last 7 days',
        monthly: 'Last 30 days',
        yearly: 'Last 12 months'
    };
    const requestSequence = ++metricsRequestSequence;
    if (metricsRequestController) metricsRequestController.abort();
    const requestController = new AbortController();
    metricsRequestController = requestController;
    let didTimeout = false;
    const timeout = setTimeout(() => {
        didTimeout = true;
        requestController.abort();
    }, METRICS_REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`/api/metrics?timeframe=${timeframe}`, {
            signal: requestController.signal
        });
        if (!response.ok) throw new Error("Failed to fetch metrics");
        
        const data = await response.json();
        if (requestSequence !== metricsRequestSequence) return;
        window.latestPerformanceMetrics = data;

        const totalHoursEl = document.getElementById('metric-total-hours');
        const currentHours = parseFloat(totalHoursEl.innerText) || 0;
        animateValue(totalHoursEl, currentHours, data.total_hours, 800, true);

        const activeTasksEl = document.getElementById('metric-active-tasks');
        const currentTasks = parseInt(activeTasksEl.innerText) || 0;
        animateValue(activeTasksEl, currentTasks, data.active_tasks, 800, false);

        const trendText = document.getElementById('metric-trend-text');
        const trendBadge = document.getElementById('metric-trend-badge');
        const trendLabel = document.getElementById('metric-trend-label');
        const periodLabel = document.getElementById('performance-period-label');

        if (periodLabel) periodLabel.innerText = periodLabels[timeframe] || periodLabels.weekly;
        trendLabel.innerText = 'Compared with previous period';

        if (data.trend_percentage > 0) {
            trendText.innerText = `+${data.trend_percentage}%`;
            trendBadge.innerText = 'Growing';
            trendBadge.className = 'bg-accent-mintLight text-emerald-700 text-[9px] font-bold px-2 py-1 rounded-md transition-colors duration-300';
        } else if (data.trend_percentage < 0) {
            trendText.innerText = `${data.trend_percentage}%`;
            trendBadge.innerText = 'Quieter';
            trendBadge.className = 'bg-red-50 text-red-700 text-[9px] font-bold px-2 py-1 rounded-md transition-colors duration-300';
        } else {
            trendText.innerText = '0%';
            trendBadge.innerText = 'Steady';
            trendBadge.className = 'bg-gray-50 text-textMuted text-[9px] font-bold px-2 py-1 rounded-md transition-colors duration-300';
        }

        if (typeof updatePerformanceInsight === "function") {
            updatePerformanceInsight();
        }

    } catch (error) {
        if (requestSequence !== metricsRequestSequence) return;
        if (error.name === 'AbortError' && !didTimeout) return;
        console.error("Metrics update failed:", error);
    } finally {
        clearTimeout(timeout);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById('metric-total-hours')) {
        const reportLabels = {
            daily: 'Daily Report',
            weekly: 'Weekly Report',
            monthly: 'Monthly Report',
            yearly: 'Yearly Report'
        };
        const requestedPeriod = new URLSearchParams(window.location.search).get('period');
        if (requestedPeriod && reportLabels[requestedPeriod]) {
            selectTimeframe(requestedPeriod, reportLabels[requestedPeriod]);
        } else {
            refreshPerformanceReport();
        }
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeDropdown();
        document.getElementById('dropdown-trigger')?.focus();
    }
});
