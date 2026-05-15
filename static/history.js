/* ==========================================================================
   LIFE OS - RECENT ACTIVITY LOGIC (history.js)
   ========================================================================== */

/**
 * A curated palette of pastel and vibrant colors from our design system.
 * We will use these to create colorful indicator dots for each activity.
 */
const activityColors = [
    'bg-brand text-white',             // Vibrant Blue/Purple
    'bg-accent-mint text-white',       // Soft Success Green
    'bg-accent-pink text-textMain',    // Soft Pink
    'bg-accent-orange text-textMain',  // Soft Orange
    'bg-[#868CFF] text-white',         // Light Indigo
    'bg-[#FCE4EC] text-[#D81B60]'      // Soft Rose
];

/**
 * Generates a consistent color for an activity based on its name.
 * Uses a simple string hashing algorithm so "Deep Work" always gets the same color.
 * * @param {string} str - The activity name
 * @returns {string} Tailwind classes for the background and text color
 */
function getStringColor(str) {
    if (!str) return activityColors[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    return activityColors[hash % activityColors.length];
}

/**
 * Formats a timestamp into a clean, readable string (e.g., "Today", "Yesterday", or "Oct 24")
 * * @param {string} dateString - The raw timestamp from the database
 * @returns {string} Formatted date
 */
function formatLogDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

/**
 * Fetches recent logs from the backend and renders them to the DOM.
 */
async function loadRecentLogs() {
    const container = document.getElementById('recent-logs-container');
    
    try {
        const response = await fetch('/api/logs/recent');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const logs = await response.json();
        
        // Clear the skeleton loader or old data
        container.innerHTML = ''; 
        
        // Premium Empty State
        if (!logs || logs.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center py-6 text-center animate-slide-up">
                    <div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-textMuted mb-3">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <p class="text-sm font-semibold text-textMain">No recent logs found</p>
                    <p class="text-xs font-medium text-textMuted mt-1">Your timeline is completely clear.</p>
                </div>
            `;
            return;
        }

        // Render each log entry
        logs.forEach((log) => {
            const colorClass = getStringColor(log.activity);
            const formattedDate = formatLogDate(log.date);
            const hourLabel = log.hours === 1 ? 'hr' : 'hrs';
            
            // Create the row element
            const logRow = document.createElement('div');
            // 'group' class is required for the delete button hover effect
            logRow.className = `flex items-center justify-between p-4 rounded-2xl bg-white border border-transparent hover:border-gray-100 hover:bg-gray-50/80 transition-all duration-300 group shadow-sm hover:shadow-md mb-3`;
            logRow.id = `log-entry-${log.id}`;
            
            logRow.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center font-bold text-sm shadow-sm">
                        ${log.activity.charAt(0).toUpperCase()}
                    </div>
                    
                    <div>
                        <p class="text-sm font-bold text-textMain tracking-tight">${log.activity}</p>
                        <p class="text-[11px] font-semibold text-textMuted uppercase tracking-wider mt-0.5">${formattedDate}</p>
                    </div>
                </div>
                
                <div class="flex items-center gap-4">
                    <div class="bg-surface px-3 py-1 rounded-lg border border-gray-100 shadow-sm text-sm font-bold text-brand">
                        ${log.hours} ${hourLabel}
                    </div>
                    
                    <button onclick="deleteLog(${log.id})" 
                        class="text-textMuted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all duration-200 transform hover:scale-110 focus:outline-none focus:opacity-100 p-1" 
                        title="Delete Entry">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                    </button>
                </div>
            `;
            
            container.appendChild(logRow);
        });

    } catch (error) {
        console.error("Failed to load history:", error);
        container.innerHTML = `<p class="text-sm font-medium text-red-500 bg-red-50 p-4 rounded-xl text-center">Failed to load data. Ensure your server is running.</p>`;
    }
}

/**
 * Handles the deletion of a time log.
 * Includes a smooth exit animation before making the API call.
 * * @param {number} id - The ID of the log to delete
 */
async function deleteLog(id) {
    // Standard browser confirmation (Can be upgraded to a custom modal later)
    if (!confirm("Are you sure you want to remove this activity log?")) return;

    const rowElement = document.getElementById(`log-entry-${id}`);
    
    try {
        // Optimistic UI update: Animate out immediately for a snappy feel
        if (rowElement) {
            rowElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            rowElement.style.opacity = '0';
            rowElement.style.transform = 'scale(0.95)';
        }

        const response = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
        
        if (!response.ok) {
            throw new Error(`Deletion failed with status: ${response.status}`);
        }

        // Wait for the animation to finish (300ms) before physically removing data
        setTimeout(() => {
            // Refresh the list from the server to ensure synchronization
            loadRecentLogs();
            
            // If the charts module is loaded on this page, refresh the chart automatically!
            if (typeof loadChartData === "function") {
                loadChartData();
            }
        }, 300);

    } catch (error) {
        console.error("Delete failed:", error);
        // If it failed, bounce the row back into view
        if (rowElement) {
            rowElement.style.opacity = '1';
            rowElement.style.transform = 'scale(1)';
        }
        alert("System Error: Could not delete the entry.");
    }
}

// Automatically load the history when the page DOM is fully parsed
document.addEventListener("DOMContentLoaded", loadRecentLogs);