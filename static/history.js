/* ==========================================================================
   LUMEN - RECENT ACTIVITY LOGIC (history.js)
   ========================================================================== */

let currentLogsData = []; // Store globally to populate the edit modal easily

/**
 * A curated palette of pastel and vibrant colors from our design system.
 */
const activityColors = [
    'bg-brand text-white',             // Vibrant Blue/Purple
    'bg-accent-mint text-white',       // Soft Success Green
    'bg-[#FFCEE6] text-[#D81B60]',     // Soft Pink
    'bg-[#FFDCA8] text-[#E65100]',     // Soft Orange
    'bg-[#868CFF] text-white',         // Light Indigo
    'bg-[#E6FAF5] text-[#00897B]'      // Soft Mint Light
];

function getStringColor(str) {
    if (!str) return activityColors[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    return activityColors[hash % activityColors.length];
}

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

async function loadRecentLogs() {
    const container = document.getElementById('recent-logs-container');
    if (!container) return; 
    
    try {
        const response = await fetch('/api/logs/recent');
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const logs = await response.json();
        currentLogsData = logs; 
        
        container.innerHTML = ''; 
        
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

        logs.forEach((log, index) => {
            const colorClass = getStringColor(log.activity);
            const formattedDate = formatLogDate(log.date);
            const hourLabel = log.hours === 1 ? 'hr' : 'hrs';
            const animationDelay = `${(index * 0.05) + 0.1}s`;
            
            const logRow = document.createElement('div');
            logRow.className = `flex items-center w-full mb-3 animate-slide-up group`;
            logRow.id = `log-entry-${log.id}`;
            logRow.style.animationFillMode = 'both';
            logRow.style.animationDelay = animationDelay;
            
            logRow.innerHTML = `
                <div class="flex-1 flex items-center justify-between p-4 rounded-2xl bg-white border border-transparent group-hover:border-gray-100 transition-all duration-1000 ease-in-out transform-gpu shadow-sm min-w-0 z-10 relative">
                    <div class="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 pr-3">
                        <div class="w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                            ${log.activity.charAt(0).toUpperCase()}
                        </div>
                        
                        <div class="min-w-0 flex-1">
                            <p class="text-sm font-bold text-textMain tracking-tight truncate block w-full">${log.activity}</p>
                            <p class="text-[11px] font-semibold text-textMuted uppercase tracking-wider mt-0.5">${formattedDate}</p>
                        </div>
                    </div>
                    
                    <div class="flex-shrink-0">
                        <div class="bg-surface px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm text-sm font-bold text-brand">
                            ${log.hours} ${hourLabel}
                        </div>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 overflow-hidden transition-all duration-1000 ease-in-out transform-gpu max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 group-hover:ml-2 flex-shrink-0">
                    <button onclick="openEditLogModal(${log.id})" class="p-2 bg-white border border-gray-100 text-textMuted hover:text-brand hover:bg-brand-light rounded-xl shadow-sm transition-colors outline-none flex-shrink-0 flex items-center justify-center" title="Edit Log">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="openDeleteModal(${log.id})" class="p-2 bg-white border border-gray-100 text-textMuted hover:text-red-500 hover:bg-red-50 rounded-xl shadow-sm transition-colors outline-none flex-shrink-0 flex items-center justify-center" title="Delete Entry">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            `;
            
            container.appendChild(logRow);
        });

    } catch (error) {
        console.error("Failed to load history:", error);
        container.innerHTML = `<p class="text-sm font-medium text-red-500 bg-red-50 p-4 rounded-xl text-center">Failed to load data.</p>`;
    }
}

/* ==========================================================================
   EDIT LOG MODAL LOGIC
   ========================================================================== */

function openEditLogModal(id) {
    const log = currentLogsData.find(l => l.id === id);
    if (!log) return;

    document.getElementById('edit-log-id').value = log.id;
    document.getElementById('edit-log-activity').value = log.activity;
    document.getElementById('edit-log-hours').value = log.hours;

    const backdrop = document.getElementById('edit-log-modal-backdrop');
    const card = document.getElementById('edit-log-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('edit-log-activity').focus();
    }, 10);
}

function closeEditLogModal() {
    const backdrop = document.getElementById('edit-log-modal-backdrop');
    const card = document.getElementById('edit-log-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function submitEditLog() {
    const id = document.getElementById('edit-log-id').value;
    const activityInput = document.getElementById('edit-log-activity').value.trim();
    const hoursInput = parseFloat(document.getElementById('edit-log-hours').value);

    if (!activityInput) return document.getElementById('edit-log-activity').focus();
    if (isNaN(hoursInput) || hoursInput <= 0) return document.getElementById('edit-log-hours').focus();

    const submitBtn = document.querySelector('#edit-log-modal-card .btn-primary');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Saving...`;

    try {
        const response = await fetch(`/api/logs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activity: activityInput, hours: hoursInput })
        });
        
        if (!response.ok) throw new Error("Update failed");
        
        closeEditLogModal();
        
        loadRecentLogs();
        if (typeof updateSummaryMetrics === "function") updateSummaryMetrics();

    } catch (error) {
        console.error(error);
        alert("Failed to update log.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}

/* ==========================================================================
   DELETE CONFIRMATION MODAL LOGIC
   ========================================================================== */

function openDeleteModal(id) {
    document.getElementById('delete-target-id').value = id;
    
    const backdrop = document.getElementById('delete-modal-backdrop');
    const card = document.getElementById('delete-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeDeleteModal() {
    const backdrop = document.getElementById('delete-modal-backdrop');
    const card = document.getElementById('delete-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function executeDeleteLog() {
    const id = document.getElementById('delete-target-id').value;
    if (!id) return;

    const submitBtn = document.querySelector('#delete-modal-card .bg-red-500');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Deleting...`;

    const rowElement = document.getElementById(`log-entry-${id}`);
    
    try {
        if (rowElement) {
            rowElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            rowElement.style.opacity = '0';
            rowElement.style.transform = 'scale(0.95)';
        }

        const response = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
        
        if (!response.ok) {
            throw new Error(`Deletion failed with status: ${response.status}`);
        }

        closeDeleteModal();

        setTimeout(() => {
            loadRecentLogs();
            if (typeof updateSummaryMetrics === "function") updateSummaryMetrics();
        }, 300);

    } catch (error) {
        console.error("Delete failed:", error);
        if (rowElement) {
            rowElement.style.opacity = '1';
            rowElement.style.transform = 'scale(1)';
        }
        alert("System Error: Could not delete the entry.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById('recent-logs-container')) {
        loadRecentLogs();
    }
});