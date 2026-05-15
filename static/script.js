/* ==========================================================================
   LIFE OS - CORE APPLICATION LOGIC (script.js)
   ========================================================================== */

/**
 * Handles the main submission for logging new time and activities.
 */
async function submitLog() {
    const activityInput = document.getElementById('activity');
    const hoursInput = document.getElementById('hours');
    const submitBtn = document.querySelector('button[onclick="submitLog()"]');
    const originalBtnHTML = submitBtn.innerHTML;

    const activity = activityInput.value.trim();
    const hours = parseFloat(hoursInput.value);

    // Premium Client-Side Validation
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

    // Set Loading State
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
            showStatusMessage(`Successfully logged ${hours}h of ${activity}.`, 'success');
            
            activityInput.value = '';
            hoursInput.value = '';
            activityInput.blur();
            hoursInput.blur();

            // Refresh UI components
            if (typeof loadRecentLogs === "function") loadRecentLogs();
            if (typeof loadChartData === "function") loadChartData();
            
            // Instantly update top metrics
            updateSummaryMetrics();
        } else {
            showStatusMessage("Failed to save entry. Please try again.", 'error');
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

/**
 * A reusable helper function to display smooth status messages under the form.
 */
function showStatusMessage(message, type = 'success') {
    const statusMsg = document.getElementById('status-msg');
    
    statusMsg.className = 'text-center text-sm font-bold mt-4 transition-all duration-300 transform translate-y-0 opacity-100';
    
    if (type === 'success') {
        statusMsg.classList.add('text-accent-mint');
    } else {
        statusMsg.classList.add('text-accent-pink');
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

/**
 * Animates a number from a start value to an end value for a premium SaaS feel.
 */
function animateValue(obj, start, end, duration, isFloat = false) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); // Smooth deceleration
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

/**
 * Fetches the top-level aggregates from the database based on the selected timeframe.
 */
async function updateSummaryMetrics() {
    // 1. Get the timeframe from the dropdown (defaults to weekly if it doesn't exist)
    const selector = document.getElementById('timeframe-selector');
    const timeframe = selector ? selector.value : 'weekly';

    try {
        // 2. Fetch the data from our new Python API route
        const response = await fetch(`/api/metrics?timeframe=${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch metrics");
        
        const data = await response.json();

        // 3. Update Total Hours with animation
        const totalHoursEl = document.getElementById('metric-total-hours');
        const currentHours = parseFloat(totalHoursEl.innerText) || 0;
        animateValue(totalHoursEl, currentHours, data.total_hours, 800, true);

        // 4. Update Active Tasks with animation
        const activeTasksEl = document.getElementById('metric-active-tasks');
        const currentTasks = parseInt(activeTasksEl.innerText) || 0;
        animateValue(activeTasksEl, currentTasks, data.active_tasks, 800, false);

        // 5. Update Trend UI (Colors and text based on positive/negative growth)
        const trendText = document.getElementById('metric-trend-text');
        const trendBadge = document.getElementById('metric-trend-badge');
        const trendLabel = document.getElementById('metric-trend-label');

        // Capitalize the timeframe for the label (e.g. "Weekly Trend")
        trendLabel.innerText = `${timeframe.charAt(0).toUpperCase() + timeframe.slice(1)} Trend`;

        if (data.trend_percentage > 0) {
            trendText.innerText = 'Upward';
            trendBadge.innerText = `+${data.trend_percentage}%`;
            trendBadge.className = 'bg-accent-mintLight text-accent-mint text-xs font-bold px-2 py-1 rounded-md transition-colors duration-300';
        } else if (data.trend_percentage < 0) {
            trendText.innerText = 'Downward';
            trendBadge.innerText = `${data.trend_percentage}%`;
            trendBadge.className = 'bg-red-50 text-accent-pink text-xs font-bold px-2 py-1 rounded-md transition-colors duration-300';
        } else {
            trendText.innerText = 'Stable';
            trendBadge.innerText = `0%`;
            trendBadge.className = 'bg-gray-50 text-textMuted text-xs font-bold px-2 py-1 rounded-md transition-colors duration-300';
        }

        // 6. Keep the Chart in sync with the dropdown!
        if (typeof loadChartData === "function") {
            // We pass the timeframe so the chart updates its visual data too
            loadChartData(timeframe);
        }

    } catch (error) {
        console.error("Metrics update failed:", error);
    }
}

// Boot up the metrics when the page loads
document.addEventListener("DOMContentLoaded", () => {
    // Only run if we are actually on the dashboard page
    if (document.getElementById('metric-total-hours')) {
        updateSummaryMetrics();
    }
});