/* ==========================================================================
   LUMEN - TODAY COMMAND CENTER & DAILY JOURNAL
   ========================================================================== */

let todayTasks = [];
let todayHabits = [];
let todayGoals = [];
let selectedTodayGoal = null;
let currentJournalDate = '';
let journalSaveTimer = null;
let journalIsDirty = false;
let journalIsLoading = false;
let todayToastTimer = null;

function escapeTodayText(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
}

function localIsoDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function initializeTodayHeader() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    document.getElementById('today-greeting').textContent = greeting;
    document.getElementById('today-date-label').textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function taskDateMeta(deadline) {
    if (!deadline) {
        return {
            label: 'Anytime',
            classes: 'bg-gray-50 text-textMuted border-gray-100'
        };
    }

    const target = parseLocalDate(deadline);
    const today = parseLocalDate(localIsoDate());
    const days = Math.round((target - today) / 86400000);

    if (days < 0) {
        return {
            label: `${Math.abs(days)}d overdue`,
            classes: 'bg-red-50 text-red-700 border-red-100'
        };
    }
    if (days === 0) {
        return {
            label: 'Due today',
            classes: 'bg-brand-light text-brand border-brand/20'
        };
    }
    if (days === 1) {
        return {
            label: 'Tomorrow',
            classes: 'bg-orange-50 text-orange-700 border-orange-100'
        };
    }

    return {
        label: target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        classes: 'bg-gray-50 text-textMuted border-gray-100'
    };
}

function sortTodayTasks(tasks) {
    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    return [...tasks]
        .filter(task => task.status !== 'Completed')
        .sort((a, b) => {
            if (a.deadline && b.deadline && a.deadline !== b.deadline) {
                return a.deadline.localeCompare(b.deadline);
            }
            if (a.deadline && !b.deadline) return -1;
            if (!a.deadline && b.deadline) return 1;
            return (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2);
        });
}

function renderTodayTasks() {
    const container = document.getElementById('today-task-list');
    const openTasks = sortTodayTasks(todayTasks);

    if (!openTasks.length) {
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 py-10 px-5 text-center">
                <div class="w-12 h-12 rounded-2xl bg-accent-mintLight text-accent-mint flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                    </svg>
                </div>
                <p class="text-sm font-bold text-textMain">Your task list is clear</p>
                <p class="text-xs font-medium text-textMuted mt-1">A rare and beautiful sight. Enjoy it.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = openTasks.slice(0, 5).map(task => {
        const dateMeta = taskDateMeta(task.deadline);
        const priorityClasses = task.priority === 'High'
            ? 'bg-red-50 text-red-700'
            : task.priority === 'Low'
                ? 'bg-accent-mintLight text-emerald-700'
                : 'bg-[#FFF7E6] text-orange-700';

        return `
            <div id="today-task-${task.id}" class="flex items-center gap-4 rounded-2xl border border-gray-100 px-4 py-3.5 hover:border-brand/20 hover:shadow-card transition-all duration-300 group">
                <input type="checkbox" class="checkbox-custom flex-shrink-0" onchange="toggleTodayTask(${task.id}, this)" aria-label="Complete ${escapeTodayText(task.title)}">
                <div class="min-w-0 flex-1">
                    <p class="text-sm font-bold leading-snug text-textMain break-words">${escapeTodayText(task.title)}</p>
                    <div class="flex items-center gap-2 mt-1.5">
                        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${priorityClasses}">${escapeTodayText(task.priority || 'Medium')}</span>
                        <span class="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${dateMeta.classes}">${dateMeta.label}</span>
                    </div>
                </div>
                <svg class="w-4 h-4 text-gray-200 group-hover:text-brand transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
            </div>
        `;
    }).join('');
}

function renderTodayRoutines() {
    const container = document.getElementById('today-routine-list');

    if (!todayHabits.length) {
        container.innerHTML = `
            <div class="md:col-span-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 py-9 px-5 text-center">
                <p class="text-sm font-bold text-textMain">No routines yet</p>
                <a href="/habits" class="inline-block text-xs font-bold text-brand mt-2 hover:underline">Create your first routine</a>
            </div>
        `;
        return;
    }

    container.innerHTML = todayHabits.map(habit => `
        <button onclick="toggleTodayRoutine(${habit.id}, this)" class="flex items-center justify-between gap-4 rounded-2xl border px-4 py-4 text-left transition-all duration-300 ${
            habit.completed
                ? 'bg-gradient-to-br from-brand to-[#7B61FF] border-transparent text-white shadow-md shadow-brand/15'
                : 'bg-white border-gray-100 text-textMain hover:border-brand/20 hover:shadow-card'
        }">
            <div class="min-w-0">
                <p class="text-sm font-bold truncate">${escapeTodayText(habit.name)}</p>
                <p class="text-[9px] font-bold uppercase tracking-widest mt-1 ${habit.completed ? 'text-white/70' : 'text-textMuted'}">${habit.completed ? 'Done today' : 'Tap to complete'}</p>
            </div>
            <div class="w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                habit.completed
                    ? 'bg-white border-white text-brand'
                    : 'bg-gray-50 border-gray-200 text-transparent'
            }">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
        </button>
    `).join('');
}

function renderTodayGoalSelector() {
    const selector = document.getElementById('today-goal-selector');
    const activeGoals = todayGoals.filter(goal => goal.status !== 'Completed');

    selector.innerHTML = '<option value="">No goal selected</option>' + activeGoals
        .map(goal => `<option value="${goal.id}">${escapeTodayText(goal.title)}</option>`)
        .join('');
    selector.value = selectedTodayGoal ? String(selectedTodayGoal.id) : '';
}

function renderTodayFocusGoal() {
    const container = document.getElementById('today-focus-goal-card');
    const progressDisplay = document.getElementById('today-goal-progress');

    if (!selectedTodayGoal) {
        progressDisplay.textContent = '--';
        container.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 p-6 text-center">
                <div class="w-12 h-12 rounded-2xl bg-white text-textMuted flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                </div>
                <p class="text-sm font-bold text-textMain">Pick one clear direction</p>
                <p class="text-xs font-medium text-textMuted mt-1">Your selected goal will stay here for the day.</p>
            </div>
        `;
        return;
    }

    const progress = Number(selectedTodayGoal.progress || 0);
    const targetDate = selectedTodayGoal.target_date
        ? parseLocalDate(selectedTodayGoal.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'No target date';
    progressDisplay.textContent = progress;

    container.innerHTML = `
        <div class="rounded-2xl border border-brand/10 bg-gradient-to-br from-brand-light to-white p-5">
            <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-[9px] font-bold text-brand uppercase tracking-widest mb-1">Today's direction</p>
                    <h4 class="text-lg font-bold text-textMain leading-snug">${escapeTodayText(selectedTodayGoal.title)}</h4>
                </div>
                <span class="text-[9px] font-bold text-textMuted bg-white border border-gray-100 px-2.5 py-1.5 rounded-lg whitespace-nowrap">${targetDate}</span>
            </div>
            ${selectedTodayGoal.description ? `<p class="text-xs font-medium text-textMuted leading-relaxed mt-3">${escapeTodayText(selectedTodayGoal.description)}</p>` : ''}
            <div class="flex items-center justify-between mt-5 mb-2">
                <span class="text-[9px] font-bold text-textMuted uppercase tracking-widest">Progress</span>
                <span class="text-sm font-black text-brand">${progress}%</span>
            </div>
            <div class="h-2.5 bg-white rounded-full overflow-hidden border border-brand/5">
                <div class="h-full bg-brand rounded-full transition-all duration-500" style="width: ${progress}%"></div>
            </div>
        </div>
    `;
}

function updateTodayMetrics(metrics) {
    const completedHabits = todayHabits.filter(habit => habit.completed).length;
    document.getElementById('today-focus-hours').textContent = Number(metrics.total_hours || 0).toFixed(1).replace('.0', '');
    document.getElementById('today-open-tasks').textContent = todayTasks.filter(task => task.status !== 'Completed').length;
    document.getElementById('today-routines-done').textContent = completedHabits;
    document.getElementById('today-routines-total').textContent = `/ ${todayHabits.length}`;
}

async function loadTodayDashboard() {
    try {
        const responses = await Promise.all([
            fetch('/api/tasks'),
            fetch('/api/habits'),
            fetch('/api/metrics?timeframe=daily'),
            fetch('/api/goals'),
            fetch('/api/today/focus')
        ]);

        if (responses.some(response => !response.ok)) throw new Error('Today data could not be loaded.');

        const [tasks, habits, metrics, goals, focusResult] = await Promise.all(
            responses.map(response => response.json())
        );

        todayTasks = tasks;
        todayHabits = habits;
        todayGoals = goals;
        selectedTodayGoal = focusResult.goal;

        renderTodayTasks();
        renderTodayRoutines();
        renderTodayGoalSelector();
        renderTodayFocusGoal();
        updateTodayMetrics(metrics);
    } catch (error) {
        console.error('Today dashboard load failed:', error);
        showTodayToast(error.message || 'Today could not be loaded.', true);
    }
}

async function toggleTodayTask(taskId, checkbox) {
    checkbox.disabled = true;
    try {
        const response = await fetch(`/api/tasks/${taskId}/toggle`, { method: 'PUT' });
        if (!response.ok) throw new Error('Task update failed.');
        const row = document.getElementById(`today-task-${taskId}`);
        if (row) {
            row.style.opacity = '0';
            row.style.transform = 'translateX(18px)';
        }
        setTimeout(loadTodayDashboard, 220);
    } catch (error) {
        checkbox.checked = false;
        checkbox.disabled = false;
        showTodayToast(error.message, true);
    }
}

async function toggleTodayRoutine(habitId, button) {
    button.disabled = true;
    try {
        const response = await fetch('/api/habits/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ habit_id: habitId })
        });
        if (!response.ok) throw new Error('Routine update failed.');
        await loadTodayDashboard();
        if (typeof loadMomentumStreak === 'function') loadMomentumStreak();
    } catch (error) {
        button.disabled = false;
        showTodayToast(error.message, true);
    }
}

async function selectTodayGoal() {
    const selector = document.getElementById('today-goal-selector');
    selector.disabled = true;
    try {
        const response = await fetch('/api/today/focus', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: selector.value || null })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Goal selection failed.');
        selectedTodayGoal = result.goal;
        renderTodayFocusGoal();
        showTodayToast(selectedTodayGoal ? 'Goal of the day updated.' : 'Daily goal cleared.');
    } catch (error) {
        renderTodayGoalSelector();
        showTodayToast(error.message, true);
    } finally {
        selector.disabled = false;
    }
}

function journalFields() {
    return {
        focus_note: document.getElementById('journal-focus-note').value.trim(),
        win_note: document.getElementById('journal-win-note').value.trim(),
        tomorrow_note: document.getElementById('journal-tomorrow-note').value.trim()
    };
}

function setJournalStatus(message, state = 'idle') {
    const dot = document.getElementById('journal-save-dot');
    const text = document.getElementById('journal-save-status');
    const colorByState = {
        idle: 'bg-gray-300',
        dirty: 'bg-[#FF9F1C]',
        saving: 'bg-brand animate-pulse',
        saved: 'bg-accent-mint',
        error: 'bg-red-500'
    };
    dot.className = `w-2 h-2 rounded-full ${colorByState[state] || colorByState.idle}`;
    text.textContent = message;
}

function scheduleJournalSave() {
    if (journalIsLoading) return;
    journalIsDirty = true;
    setJournalStatus('Unsaved changes · autosaving soon', 'dirty');
    clearTimeout(journalSaveTimer);
    journalSaveTimer = setTimeout(() => saveJournalEntry(true), 900);
}

async function saveJournalEntry(silent = false, dateOverride = null) {
    const entryDate = dateOverride || currentJournalDate;
    if (!entryDate) return true;

    clearTimeout(journalSaveTimer);
    const saveButton = document.getElementById('journal-save-button');
    const originalHtml = saveButton.innerHTML;
    saveButton.disabled = true;
    if (!silent) saveButton.textContent = 'Saving...';
    setJournalStatus('Saving entry...', 'saving');

    try {
        const response = await fetch(`/api/journal/${entryDate}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(journalFields())
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Journal save failed.');

        journalIsDirty = false;
        const savedTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        setJournalStatus(`Saved at ${savedTime}`, 'saved');
        loadRecentJournalEntries();
        if (!silent) showTodayToast('Journal entry saved.');
        return true;
    } catch (error) {
        setJournalStatus(error.message || 'Journal save failed.', 'error');
        if (!silent) showTodayToast(error.message, true);
        return false;
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalHtml;
    }
}

async function loadJournalEntry(entryDate) {
    journalIsLoading = true;
    clearTimeout(journalSaveTimer);

    try {
        const response = await fetch(`/api/journal/${entryDate}`);
        if (!response.ok) throw new Error('Journal entry could not be loaded.');
        const entry = await response.json();

        currentJournalDate = entryDate;
        document.getElementById('journal-date').value = entryDate;
        document.getElementById('journal-focus-note').value = entry.focus_note || '';
        document.getElementById('journal-win-note').value = entry.win_note || '';
        document.getElementById('journal-tomorrow-note').value = entry.tomorrow_note || '';
        journalIsDirty = false;
        setJournalStatus(entry.updated_at ? 'Entry loaded · autosave is on' : 'Ready to write · autosave is on', entry.updated_at ? 'saved' : 'idle');
    } catch (error) {
        setJournalStatus(error.message, 'error');
        showTodayToast(error.message, true);
    } finally {
        journalIsLoading = false;
    }
}

async function moveToJournalDate(nextDate) {
    if (journalIsDirty) {
        const saved = await saveJournalEntry(true, currentJournalDate);
        if (!saved) return;
    }
    await loadJournalEntry(nextDate);
}

function changeJournalDay(offset) {
    const baseDate = parseLocalDate(currentJournalDate || localIsoDate());
    baseDate.setDate(baseDate.getDate() + offset);
    moveToJournalDate(localIsoDate(baseDate));
}

function handleJournalDateChange() {
    const selectedDate = document.getElementById('journal-date').value;
    if (selectedDate) moveToJournalDate(selectedDate);
}

function goToJournalToday() {
    moveToJournalDate(localIsoDate());
}

function journalEntrySnippet(entry) {
    return entry.focus_note || entry.win_note || entry.tomorrow_note || 'Empty reflection';
}

async function loadRecentJournalEntries() {
    const container = document.getElementById('recent-journal-list');
    try {
        const response = await fetch('/api/journal?limit=7');
        if (!response.ok) throw new Error('Recent entries could not be loaded.');
        const entries = await response.json();

        if (!entries.length) {
            container.innerHTML = `
                <div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 py-10 px-4 text-center">
                    <p class="text-sm font-bold text-textMain">Your first page is waiting</p>
                    <p class="text-xs font-medium text-textMuted mt-1">Write a few lines and it will appear here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = entries.map(entry => {
            const date = parseLocalDate(entry.entry_date);
            const isSelected = entry.entry_date === currentJournalDate;
            return `
                <button onclick="moveToJournalDate('${entry.entry_date}')" class="w-full text-left rounded-2xl border p-4 transition-all duration-300 ${
                    isSelected
                        ? 'bg-brand-light border-brand/20'
                        : 'bg-white border-gray-100 hover:border-brand/20 hover:shadow-card'
                }">
                    <div class="flex items-center justify-between gap-3 mb-2">
                        <span class="text-[10px] font-bold uppercase tracking-wider ${isSelected ? 'text-brand' : 'text-textMuted'}">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        ${entry.entry_date === localIsoDate() ? '<span class="text-[9px] font-bold text-emerald-700 bg-accent-mintLight px-2 py-0.5 rounded-md">Today</span>' : ''}
                    </div>
                    <p class="text-xs font-semibold text-textMain leading-relaxed line-clamp-2">${escapeTodayText(journalEntrySnippet(entry))}</p>
                </button>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p class="py-8 text-center text-xs font-bold text-red-700">${escapeTodayText(error.message)}</p>`;
    }
}

function showTodayToast(message, isError = false) {
    const toast = document.getElementById('today-toast');
    const card = document.getElementById('today-toast-card');
    document.getElementById('today-toast-message').textContent = message;
    card.className = `${isError ? 'bg-red-700' : 'bg-textMain'} text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-3`;
    toast.classList.remove('translate-y-6', 'opacity-0');
    clearTimeout(todayToastTimer);
    todayToastTimer = setTimeout(() => toast.classList.add('translate-y-6', 'opacity-0'), 2400);
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTodayHeader();
    currentJournalDate = localIsoDate();
    document.getElementById('journal-date').value = currentJournalDate;
    loadTodayDashboard();
    loadJournalEntry(currentJournalDate);
    loadRecentJournalEntries();
});
