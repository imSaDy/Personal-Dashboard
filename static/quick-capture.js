/* ==========================================================================
   LUMEN - GLOBAL QUICK CAPTURE
   ========================================================================== */

let quickCaptureStatusTimeout = null;

function showQuickCaptureStatus(message, isError = false) {
    const status = document.getElementById('quick-capture-status');
    if (!status) return;

    status.textContent = message;
    status.className = `absolute left-5 top-full mt-2 ${
        isError ? 'bg-red-500' : 'bg-textMain'
    } text-white text-xs font-bold px-3 py-2 rounded-xl shadow-lg opacity-100 visible translate-y-0 transition-all duration-200 pointer-events-none whitespace-nowrap`;

    clearTimeout(quickCaptureStatusTimeout);
    quickCaptureStatusTimeout = setTimeout(() => {
        status.classList.add('opacity-0', 'invisible', 'translate-y-1');
        status.classList.remove('opacity-100', 'visible', 'translate-y-0');
    }, 2200);
}

async function submitQuickTask() {
    const input = document.getElementById('quick-task-input');
    const button = document.getElementById('quick-task-button');
    if (!input || !button) return;

    const title = input.value.trim();
    if (!title) {
        input.focus();
        showQuickCaptureStatus('Type a task first.', true);
        return;
    }

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `
        <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3"></circle>
            <path class="opacity-90" fill="currentColor" d="M12 3a9 9 0 018.66 6.55l-2.88.82A6 6 0 0012 6V3z"></path>
        </svg>
    `;

    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                deadline: null,
                priority: 'Medium'
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Task capture failed.');

        input.value = '';
        showQuickCaptureStatus('Task captured ✓');
        if (typeof loadTasks === 'function') loadTasks();
        if (typeof loadTodayDashboard === 'function') loadTodayDashboard();
    } catch (error) {
        showQuickCaptureStatus(error.message || 'Task capture failed.', true);
    } finally {
        button.disabled = false;
        button.innerHTML = originalHtml;
    }
}
