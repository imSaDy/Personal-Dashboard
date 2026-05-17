/* ==========================================================================
   LUMEN - CORE APPLICATION LOGIC (script.js)
   ========================================================================== */

/* ==========================================================================
   CUSTOM DROPDOWN LOGIC
   ========================================================================== */

function toggleDropdown() {
    const menu = document.getElementById('dropdown-menu');
    const arrow = document.getElementById('dropdown-arrow');
    
    if (menu.classList.contains('opacity-0')) {
        // Open Menu
        menu.classList.remove('opacity-0', 'invisible', '-translate-y-2');
        arrow.style.transform = 'rotate(180deg)';
    } else {
        // Close Menu
        closeDropdown();
    }
}

function closeDropdown() {
    const menu = document.getElementById('dropdown-menu');
    const arrow = document.getElementById('dropdown-arrow');
    
    if (menu && !menu.classList.contains('opacity-0')) {
        menu.classList.add('opacity-0', 'invisible', '-translate-y-2');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
}

function selectTimeframe(value, label) {
    // 1. Update the hidden input value
    const input = document.getElementById('timeframe-selector');
    if (input) input.value = value;
    
    // 2. Update the visible button text
    const textSpan = document.getElementById('dropdown-selected-text');
    if (textSpan) textSpan.innerText = label;

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
    
    // 5. Trigger the backend metric update
    if (typeof updateSummaryMetrics === 'function') {
        updateSummaryMetrics();
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
            showStatusMessage(`Successfully logged ${hours}h of ${activity}.`, 'success');
            
            activityInput.value = '';
            hoursInput.value = '';
            activityInput.blur();
            hoursInput.blur();

            if (typeof loadRecentLogs === "function") loadRecentLogs();
            if (typeof loadChartData === "function") loadChartData();
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

function animateValue(obj, start, end, duration, isFloat = false) {
    let startTimestamp = null;
    const step = (timestamp) => {
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

async function updateSummaryMetrics() {
    const selector = document.getElementById('timeframe-selector');
    const timeframe = selector ? selector.value : 'weekly';

    try {
        const response = await fetch(`/api/metrics?timeframe=${timeframe}`);
        if (!response.ok) throw new Error("Failed to fetch metrics");
        
        const data = await response.json();

        const totalHoursEl = document.getElementById('metric-total-hours');
        const currentHours = parseFloat(totalHoursEl.innerText) || 0;
        animateValue(totalHoursEl, currentHours, data.total_hours, 800, true);

        const activeTasksEl = document.getElementById('metric-active-tasks');
        const currentTasks = parseInt(activeTasksEl.innerText) || 0;
        animateValue(activeTasksEl, currentTasks, data.active_tasks, 800, false);

        const trendText = document.getElementById('metric-trend-text');
        const trendBadge = document.getElementById('metric-trend-badge');
        const trendLabel = document.getElementById('metric-trend-label');

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

        if (typeof loadChartData === "function") {
            loadChartData(timeframe);
        }

    } catch (error) {
        console.error("Metrics update failed:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById('metric-total-hours')) {
        updateSummaryMetrics();
    }
});