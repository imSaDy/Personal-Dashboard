/* ==========================================================================
   LUMEN - GOALS PAGE
   ========================================================================== */

let currentGoals = [];
let currentGoalFilter = 'all';
let goalToastTimeout = null;

function escapeGoalText(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
}

function formatGoalDescription(value) {
    return escapeGoalText(value).replace(/\n/g, '<br>');
}

function getGoalDateMeta(dateString, isCompleted) {
    if (!dateString) {
        return {
            label: 'No target date',
            detail: 'Open horizon',
            classes: 'bg-gray-50 text-textMuted border-gray-100'
        };
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const target = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const daysLeft = Math.ceil((target - today) / 86400000);
    const label = target.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: target.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });

    if (isCompleted) {
        return {
            label,
            detail: 'Reached',
            classes: 'bg-accent-mintLight text-emerald-700 border-[#CFF0E6]'
        };
    }
    if (daysLeft < 0) {
        return {
            label,
            detail: `${Math.abs(daysLeft)}d overdue`,
            classes: 'bg-red-50 text-red-700 border-red-100'
        };
    }
    if (daysLeft === 0) {
        return {
            label: 'Today',
            detail: 'Target day',
            classes: 'bg-brand-light text-brand border-brand/20'
        };
    }
    if (daysLeft <= 7) {
        return {
            label,
            detail: `${daysLeft}d left`,
            classes: 'bg-orange-50 text-orange-700 border-orange-100'
        };
    }

    return {
        label,
        detail: `${daysLeft}d left`,
        classes: 'bg-gray-50 text-textMuted border-gray-100'
    };
}

function getProgressPalette(progress, isCompleted) {
    if (isCompleted) {
        return {
            bar: 'bg-accent-mint',
            accent: 'bg-accent-mint',
            badge: 'bg-accent-mintLight text-emerald-700 border-[#CFF0E6]'
        };
    }
    if (progress >= 60) {
        return {
            bar: 'bg-brand',
            accent: 'bg-brand',
            badge: 'bg-brand-light text-brand border-brand/20'
        };
    }
    return {
        bar: 'bg-[#FF9F1C]',
        accent: 'bg-[#FF9F1C]',
        badge: 'bg-[#FFF7E6] text-orange-700 border-[#FFEAC2]'
    };
}

function updateGoalMetrics() {
    const activeGoals = currentGoals.filter(goal => goal.status !== 'Completed');
    const completedGoals = currentGoals.filter(goal => goal.status === 'Completed');
    const overallProgress = currentGoals.length
        ? Math.round(currentGoals.reduce((total, goal) => total + Number(goal.progress || 0), 0) / currentGoals.length)
        : 0;

    document.getElementById('active-goals-count').textContent = activeGoals.length;
    document.getElementById('completed-goals-count').textContent = completedGoals.length;
    document.getElementById('overall-goal-progress').textContent = overallProgress;
}

function getFilteredGoals() {
    if (currentGoalFilter === 'active') {
        return currentGoals.filter(goal => goal.status !== 'Completed');
    }
    if (currentGoalFilter === 'completed') {
        return currentGoals.filter(goal => goal.status === 'Completed');
    }
    return currentGoals;
}

function renderGoals() {
    const container = document.getElementById('goals-list');
    const goals = getFilteredGoals();

    updateGoalMetrics();

    if (!goals.length) {
        const isCompletelyEmpty = currentGoals.length === 0;
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 px-6 text-center animate-slide-up">
                <div class="w-16 h-16 rounded-2xl ${isCompletelyEmpty ? 'bg-brand-light text-brand' : 'bg-gray-50 text-textMuted'} flex items-center justify-center mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isCompletelyEmpty ? 'M12 6v6m0 0v6m0-6h6m-6 0H6' : 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'}"></path>
                    </svg>
                </div>
                <h4 class="text-lg font-bold text-textMain">${isCompletelyEmpty ? 'Your goal map is wide open' : 'Nothing in this view'}</h4>
                <p class="text-sm font-medium text-textMuted mt-1 max-w-sm">${isCompletelyEmpty ? 'Create a goal on the left and give your next chapter a clear direction.' : 'Try another filter to see the rest of your goals.'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = goals.map((goal, index) => {
        const isCompleted = goal.status === 'Completed';
        const progress = Number(goal.progress || 0);
        const palette = getProgressPalette(progress, isCompleted);
        const dateMeta = getGoalDateMeta(goal.target_date, isCompleted);
        const safeTitle = escapeGoalText(goal.title);
        const description = goal.description
            ? `<p class="text-sm font-medium text-textMuted mt-2 leading-relaxed max-w-2xl">${formatGoalDescription(goal.description)}</p>`
            : '';

        return `
            <article id="goal-card-${goal.id}" class="relative overflow-hidden border border-gray-100 rounded-2xl p-5 md:p-6 bg-white hover:shadow-card hover:-translate-y-0.5 transition-all duration-300 group animate-slide-up ${isCompleted ? 'opacity-75' : ''}" style="animation-fill-mode: both; animation-delay: ${index * 0.05}s;">
                <div class="absolute left-0 top-5 bottom-5 w-1 rounded-r-full ${palette.accent}"></div>

                <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pl-2">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                            <h4 class="text-base md:text-lg font-bold ${isCompleted ? 'text-textMuted line-through' : 'text-textMain'}">${safeTitle}</h4>
                            <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${palette.badge}">
                                ${isCompleted ? 'Completed' : 'In progress'}
                            </span>
                        </div>
                        ${description}
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-xl border ${dateMeta.classes}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                            ${dateMeta.label} · ${dateMeta.detail}
                        </span>
                        <button onclick="openEditGoalModal(${goal.id})" class="grid h-11 w-11 place-items-center text-textMuted hover:text-brand hover:bg-brand-light rounded-xl transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30" title="Edit goal" aria-label="Edit ${safeTitle}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                            </svg>
                        </button>
                        <button onclick="openDeleteGoalModal(${goal.id})" class="grid h-11 w-11 place-items-center text-textMuted hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200" title="Delete goal" aria-label="Delete ${safeTitle}">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="mt-5 pl-2">
                    <div class="flex items-center justify-between gap-4 mb-2">
                        <span class="text-[10px] font-bold text-textMuted uppercase tracking-widest">Progress</span>
                        <span class="text-sm font-black ${isCompleted ? 'text-emerald-700' : 'text-textMain'}">${progress}%</span>
                    </div>
                    <div class="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full ${palette.bar} transition-all duration-500" style="width: ${progress}%"></div>
                    </div>

                    <div class="flex flex-wrap items-center justify-between gap-3 mt-4">
                        <div class="flex items-center gap-2">
                            <button onclick="adjustGoalProgress(${goal.id}, -10)" ${progress === 0 ? 'disabled' : ''} class="w-11 h-11 rounded-xl border border-gray-100 bg-gray-50 text-textMuted hover:text-brand hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30" title="Decrease progress" aria-label="Decrease ${safeTitle} progress">−</button>
                            <button onclick="adjustGoalProgress(${goal.id}, 10)" ${progress === 100 ? 'disabled' : ''} class="w-11 h-11 rounded-xl border border-gray-100 bg-gray-50 text-textMuted hover:text-brand hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30" title="Increase progress" aria-label="Increase ${safeTitle} progress">+</button>
                        </div>

                        <button onclick="toggleGoalCompletion(${goal.id})" class="${isCompleted ? 'bg-gray-50 text-textMuted hover:text-textMain' : 'bg-brand-light text-brand hover:bg-brand hover:text-white'} px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="${isCompleted ? 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M4.582 9H9' : 'M5 13l4 4L19 7'}"></path>
                            </svg>
                            ${isCompleted ? 'Reopen at 90%' : 'Mark complete'}
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

async function loadGoals() {
    try {
        const response = await fetch('/api/goals');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        currentGoals = await response.json();
        renderGoals();
    } catch (error) {
        console.error('Failed to load goals:', error);
        document.getElementById('goals-list').innerHTML = `
            <div class="py-14 text-center">
                <p class="text-sm font-bold text-red-700">Goals could not be loaded.</p>
                <button onclick="loadGoals()" class="text-xs font-bold text-brand mt-3 hover:underline">Try again</button>
            </div>
        `;
    }
}

function setGoalFilter(filter) {
    currentGoalFilter = filter;
    document.querySelectorAll('[data-goal-filter]').forEach(button => {
        const isActive = button.dataset.goalFilter === filter;
        button.className = `px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            isActive
                ? 'bg-white shadow-sm text-brand'
                : 'text-textMuted hover:text-textMain'
        }`;
    });
    renderGoals();
}

function focusGoalComposer() {
    document.getElementById('goal-composer').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => document.getElementById('goal-title').focus(), 350);
}

async function submitGoal() {
    const titleInput = document.getElementById('goal-title');
    const descriptionInput = document.getElementById('goal-description');
    const targetDateInput = document.getElementById('goal-target-date');
    const submitButton = document.getElementById('create-goal-button');
    const title = titleInput.value.trim();

    if (!title) {
        titleInput.focus();
        showGoalToast('Give your goal a clear title.', true);
        return;
    }

    const originalHtml = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span>Creating...</span>';

    try {
        const response = await fetch('/api/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description: descriptionInput.value.trim(),
                target_date: targetDateInput.value || null
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Goal creation failed.');

        titleInput.value = '';
        descriptionInput.value = '';
        targetDateInput.value = '';
        currentGoalFilter = 'all';
        setGoalFilter('all');
        await loadGoals();
        showGoalToast('Goal added to your map.');
    } catch (error) {
        showGoalToast(error.message || 'Goal creation failed.', true);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalHtml;
    }
}

async function patchGoal(goalId, payload, successMessage) {
    const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Goal update failed.');

    const index = currentGoals.findIndex(goal => goal.id === goalId);
    if (index !== -1) currentGoals[index] = result.goal;
    await loadGoals();
    if (successMessage) showGoalToast(successMessage);
}

async function adjustGoalProgress(goalId, delta) {
    const goal = currentGoals.find(item => item.id === goalId);
    if (!goal) return;
    const nextProgress = Math.max(0, Math.min(100, Number(goal.progress) + delta));

    try {
        await patchGoal(goalId, { progress: nextProgress }, `Progress updated to ${nextProgress}%.`);
    } catch (error) {
        showGoalToast(error.message, true);
    }
}

async function toggleGoalCompletion(goalId) {
    const goal = currentGoals.find(item => item.id === goalId);
    if (!goal) return;
    const nextProgress = goal.status === 'Completed' ? 90 : 100;

    try {
        await patchGoal(
            goalId,
            { progress: nextProgress },
            goal.status === 'Completed' ? 'Goal reopened.' : 'Goal completed. Nicely done.'
        );
    } catch (error) {
        showGoalToast(error.message, true);
    }
}

function openEditGoalModal(goalId) {
    const goal = currentGoals.find(item => item.id === goalId);
    if (!goal) return;

    document.getElementById('edit-goal-id').value = goal.id;
    document.getElementById('edit-goal-title').value = goal.title;
    document.getElementById('edit-goal-description').value = goal.description || '';
    document.getElementById('edit-goal-target-date').value = goal.target_date || '';
    document.getElementById('edit-goal-progress').value = goal.progress;
    syncEditGoalProgressLabel();

    openGoalModal('edit-goal-modal-backdrop', 'edit-goal-modal-card');
    setTimeout(() => document.getElementById('edit-goal-title').focus(), 100);
}

function closeEditGoalModal() {
    closeGoalModal('edit-goal-modal-backdrop', 'edit-goal-modal-card');
}

function syncEditGoalProgressLabel() {
    const value = document.getElementById('edit-goal-progress').value;
    document.getElementById('edit-goal-progress-value').textContent = `${value}%`;
}

async function submitEditGoal() {
    const goalId = Number(document.getElementById('edit-goal-id').value);
    const titleInput = document.getElementById('edit-goal-title');
    const submitButton = document.getElementById('save-goal-button');
    const title = titleInput.value.trim();

    if (!title) return titleInput.focus();

    const originalHtml = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = 'Saving...';

    try {
        await patchGoal(goalId, {
            title,
            description: document.getElementById('edit-goal-description').value.trim(),
            target_date: document.getElementById('edit-goal-target-date').value || null,
            progress: Number(document.getElementById('edit-goal-progress').value)
        }, 'Goal updated.');
        closeEditGoalModal();
    } catch (error) {
        showGoalToast(error.message, true);
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalHtml;
    }
}

function openDeleteGoalModal(goalId) {
    document.getElementById('delete-goal-target-id').value = goalId;
    openGoalModal('delete-goal-modal-backdrop', 'delete-goal-modal-card');
}

function closeDeleteGoalModal() {
    closeGoalModal('delete-goal-modal-backdrop', 'delete-goal-modal-card');
}

async function executeDeleteGoal() {
    const goalId = Number(document.getElementById('delete-goal-target-id').value);
    const submitButton = document.getElementById('confirm-delete-goal-button');
    const card = document.getElementById(`goal-card-${goalId}`);
    const originalText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = 'Deleting...';

    try {
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'translateX(24px) scale(0.98)';
        }

        const response = await fetch(`/api/goals/${goalId}`, { method: 'DELETE' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Goal deletion failed.');

        closeDeleteGoalModal();
        await loadGoals();
        showGoalToast('Goal removed.');
    } catch (error) {
        if (card) {
            card.style.opacity = '';
            card.style.transform = '';
        }
        showGoalToast(error.message, true);
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
    }
}

function openGoalModal(backdropId, cardId) {
    const backdrop = document.getElementById(backdropId);
    const card = document.getElementById(cardId);
    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeGoalModal(backdropId, cardId) {
    const backdrop = document.getElementById(backdropId);
    const card = document.getElementById(cardId);
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');
    setTimeout(() => backdrop.classList.add('hidden'), 300);
}

function showGoalToast(message, isError = false) {
    const toast = document.getElementById('goal-toast');
    const card = document.getElementById('goal-toast-card');
    const icon = document.getElementById('goal-toast-icon');

    document.getElementById('goal-toast-message').textContent = message;
    card.className = `${isError ? 'bg-red-700' : 'bg-textMain'} text-white rounded-2xl shadow-2xl px-5 py-3.5 flex items-center gap-3`;
    icon.innerHTML = isError
        ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>'
        : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';

    toast.classList.remove('translate-y-6', 'opacity-0');
    clearTimeout(goalToastTimeout);
    goalToastTimeout = setTimeout(() => {
        toast.classList.add('translate-y-6', 'opacity-0');
    }, 2600);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        const editBackdrop = document.getElementById('edit-goal-modal-backdrop');
        const deleteBackdrop = document.getElementById('delete-goal-modal-backdrop');
        if (!deleteBackdrop.classList.contains('hidden')) closeDeleteGoalModal();
        else if (!editBackdrop.classList.contains('hidden')) closeEditGoalModal();
    }
});

document.addEventListener('DOMContentLoaded', loadGoals);

