/* ==========================================================================
   LIFE OS - TASK MANAGER LOGIC (tasks.js)
   ========================================================================== */

let currentTasksData = []; // Stores tasks globally so we can easily populate the edit modal
let currentTaskFilter = 'open';

function escapeTaskText(value) {
    const element = document.createElement('div');
    element.textContent = value || '';
    return element.innerHTML;
}

/**
 * Utility: Formats dates and calculates remaining days.
 */
function formatTaskDate(dateString, isCompleted = false) {
    if (!dateString) {
        return `
            <div class="flex flex-col">
                <span class="text-textMain font-medium">No deadline</span>
                <span class="text-[10px] font-bold text-textMuted uppercase tracking-wider mt-1">Whenever</span>
            </div>`;
    }
    
    const [year, month, day] = dateString.split('-');
    const taskDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const formattedDate = taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (isCompleted) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-textMuted font-medium">${formattedDate}</span>
                <span class="bg-accent-mintLight text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-accent-mint/10">Completed</span>
            </div>`;
    }

    if (diffDays === 0) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-brand font-bold">Today</span>
                <span class="bg-brand-light text-brand text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-brand/20">Due Now</span>
            </div>`;
    } else if (diffDays === 1) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-textMain font-bold">Tomorrow</span>
                <span class="bg-orange-50 text-orange-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-orange-100">1 day left</span>
            </div>`;
    } else if (diffDays < 0) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-red-700 font-bold">${formattedDate}</span>
                <span class="bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-red-100 shadow-sm shadow-red-100/50">Overdue by ${Math.abs(diffDays)}d</span>
            </div>`;
    } else {
        let pillColor = diffDays <= 3 ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-gray-50 text-textMuted border-gray-100';
        return `
            <div class="flex flex-col items-start">
                <span class="text-textMuted font-medium">${formattedDate}</span>
                <span class="${pillColor} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border shadow-sm">${diffDays} days left</span>
            </div>`;
    }
}

/**
 * Utility: Animates a number.
 */
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); 
        obj.innerHTML = Math.floor(easeOut * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

/**
 * Core: Fetches tasks and renders board.
 */
function setTaskFilter(filter) {
    if (!['open', 'completed', 'all'].includes(filter)) return;
    currentTaskFilter = filter;
    ['open', 'completed', 'all'].forEach(value => {
        const button = document.getElementById(`task-filter-${value}`);
        if (!button) return;
        const isActive = value === filter;
        button.setAttribute('aria-pressed', String(isActive));
        button.className = `task-filter-button ${
            isActive ? 'bg-white text-brand shadow-sm' : 'text-textMuted hover:text-textMain'
        }`;
    });
    renderTasks();
}

function renderTasks() {
    const tbody = document.getElementById('task-table-body');
    const mobileList = document.getElementById('task-mobile-list');
    const countDisplay = document.getElementById('open-tasks-count');
    const resultCount = document.getElementById('task-result-count');
    const searchInput = document.getElementById('task-search');
    if (!tbody || !mobileList) return;

    const openTasks = currentTasksData.filter(task => task.status !== 'Completed').length;
    if (countDisplay) {
        const currentVal = parseInt(countDisplay.innerText) || 0;
        animateValue(countDisplay, currentVal, openTasks, 500);
    }

    const query = (searchInput?.value || '').trim().toLocaleLowerCase();
    const filteredTasks = currentTasksData.filter(task => {
        const matchesFilter = currentTaskFilter === 'all'
            || (currentTaskFilter === 'completed' && task.status === 'Completed')
            || (currentTaskFilter === 'open' && task.status !== 'Completed');
        return matchesFilter && (!query || task.title.toLocaleLowerCase().includes(query));
    });

    if (resultCount) {
        const filterLabel = currentTaskFilter === 'all' ? 'all tasks' : currentTaskFilter === 'completed' ? 'completed' : 'open';
        resultCount.textContent = `${filteredTasks.length} ${filterLabel}${query ? ` matching “${searchInput.value.trim()}”` : ''}`;
    }

    tbody.innerHTML = '';
    mobileList.innerHTML = '';

    if (!filteredTasks.length) {
        const emptyMessage = query
            ? 'No tasks match this search.'
            : currentTaskFilter === 'completed'
                ? 'Completed tasks will appear here.'
                : currentTaskFilter === 'open'
                    ? 'Nothing open — nicely done.'
                    : 'No tasks found.';
        tbody.innerHTML = `
            <tr><td colspan="5" class="py-14 text-center text-textMuted font-medium animate-slide-up">${emptyMessage}</td></tr>
        `;
        mobileList.innerHTML = `
            <div class="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-5 py-12 text-center text-sm font-semibold text-textMuted">
                ${emptyMessage}
            </div>
        `;
        return;
    }

    filteredTasks.forEach((task, index) => {
        let priorityBadge = '';
        if (task.priority === 'High') {
            priorityBadge = `<span class="status-badge badge-high"><span class="status-dot"></span>High</span>`;
        } else if (task.priority === 'Medium') {
            priorityBadge = `<span class="status-badge badge-medium"><span class="status-dot"></span>Medium</span>`;
        } else {
            priorityBadge = `<span class="status-badge badge-low"><span class="status-dot"></span>Low</span>`;
        }

        const isCompleted = task.status === 'Completed';
        const titleStyle = isCompleted ? 'line-through text-textMuted font-medium' : 'text-textMain font-bold';
        const rowClasses = isCompleted ? 'opacity-50 bg-gray-50/50' : 'table-row-premium z-10';
        const checkboxChecked = isCompleted ? 'checked' : '';
        const animationDelay = `${(index * 0.04) + 0.05}s`;
        const safeTitle = escapeTaskText(task.title);
        const checkboxLabel = `${
            isCompleted ? 'Mark as open' : 'Mark complete'
        }: ${safeTitle}`;

        const tr = document.createElement('tr');
        tr.className = `task-row border-b border-gray-100 transition-all duration-300 group animate-slide-up ${rowClasses}`;
        tr.id = `task-row-${task.id}`;
        tr.style.animationFillMode = 'both';
        tr.style.animationDelay = animationDelay;

        tr.innerHTML = `
            <td class="py-5 pl-4 sm:pl-2">
                <div class="flex items-center">
                    <input type="checkbox" id="chk-${task.id}" aria-label="${checkboxLabel}" class="checkbox-custom transform group-hover:scale-110 transition-transform duration-200" ${checkboxChecked} onchange="toggleTask(${task.id}, this)">
                </div>
            </td>
            <td class="py-5 px-4 transition-all duration-300 ${titleStyle} text-[15px]" id="title-${task.id}">
                ${safeTitle}
            </td>
            <td class="py-4 px-4 text-sm font-medium">
                ${formatTaskDate(task.deadline, isCompleted)}
            </td>
            <td class="py-5 px-4">
                ${priorityBadge}
            </td>
            <td class="py-5 pr-4 sm:pr-2">
                <div class="task-row-actions flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-all duration-200">
                    <button onclick="openEditModal(${task.id})" class="p-2 text-textMuted hover:text-brand hover:bg-brand-light rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand/30" title="Edit Task" aria-label="Edit ${safeTitle}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button onclick="openDeleteTaskModal(${task.id})" class="p-2 text-textMuted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-200" title="Delete Task" aria-label="Delete ${safeTitle}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);

        const mobileCard = document.createElement('article');
        mobileCard.id = `task-mobile-card-${task.id}`;
        mobileCard.className = `rounded-2xl border border-gray-100 bg-white p-4 shadow-sm animate-slide-up ${
            isCompleted ? 'opacity-60' : ''
        }`;
        mobileCard.style.animationFillMode = 'both';
        mobileCard.style.animationDelay = animationDelay;
        mobileCard.innerHTML = `
            <div class="flex items-start gap-3">
                <label for="mobile-chk-${task.id}" class="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl focus-within:ring-2 focus-within:ring-brand/20">
                    <input type="checkbox" id="mobile-chk-${task.id}" aria-label="${checkboxLabel}" class="checkbox-custom mt-0.5 flex-shrink-0" ${checkboxChecked} onchange="toggleTask(${task.id}, this)">
                    <span class="min-w-0 text-sm leading-snug ${titleStyle}">${safeTitle}</span>
                </label>
                <div class="flex flex-shrink-0 items-center gap-1">
                    <button type="button" onclick="openEditModal(${task.id})" class="grid h-11 w-11 place-items-center rounded-xl bg-brand-light text-brand transition-colors hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30" aria-label="Edit ${safeTitle}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    </button>
                    <button type="button" onclick="openDeleteTaskModal(${task.id})" class="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-500 transition-colors hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200" aria-label="Delete ${safeTitle}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-1 13H6L5 7m3 0V4h8v3M3 7h18"></path></svg>
                    </button>
                </div>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                <div>
                    <p class="mb-2 text-[9px] font-black uppercase tracking-wider text-textMuted">Due date</p>
                    ${formatTaskDate(task.deadline, isCompleted)}
                </div>
                <div>
                    <p class="mb-2 text-[9px] font-black uppercase tracking-wider text-textMuted">Priority</p>
                    ${priorityBadge}
                </div>
            </div>
        `;
        mobileList.appendChild(mobileCard);
    });
}

async function loadTasks() {
    const tbody = document.getElementById('task-table-body');
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const tasks = await response.json();
        currentTasksData = tasks;
        renderTasks();
    } catch (error) { 
        console.error("Failed to load tasks:", error); 
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-14 text-center text-red-700 font-semibold">Tasks could not be loaded.</td></tr>';
        }
        const mobileList = document.getElementById('task-mobile-list');
        if (mobileList) {
            mobileList.innerHTML = '<div class="rounded-2xl bg-red-50 px-5 py-10 text-center text-sm font-semibold text-red-700">Tasks could not be loaded.</div>';
        }
    }
}

/**
 * Creates a new task.
 */
async function submitTask() {
    const titleInput = document.getElementById('task-title');
    const deadlineInput = document.getElementById('task-deadline');
    const priorityInput = document.getElementById('task-priority');
    
    if (!titleInput.value.trim()) return titleInput.focus();

    try {
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: titleInput.value.trim(), deadline: deadlineInput.value, priority: priorityInput.value })
        });
        
        titleInput.value = ''; deadlineInput.value = ''; priorityInput.value = 'Medium';
        titleInput.blur(); 
        loadTasks();
    } catch (error) { console.error("Task submission failed", error); }
}

/**
 * Toggles status.
 */
async function toggleTask(id, checkboxEl) {
    try {
        await fetch(`/api/tasks/${id}/toggle`, { method: 'PUT' });
        loadTasks();
    } catch (error) { checkboxEl.checked = !checkboxEl.checked; }
}


/* ==========================================================================
   EDIT MODAL LOGIC
   ========================================================================== */

function openEditModal(taskId) {
    const task = currentTasksData.find(t => t.id === taskId);
    if (!task) return;

    // Populate modal inputs
    document.getElementById('edit-task-id').value = task.id;
    document.getElementById('edit-task-title').value = task.title;
    document.getElementById('edit-task-deadline').value = task.deadline || '';
    document.getElementById('edit-task-priority').value = task.priority;

    // Focus title to trigger the floating label
    document.getElementById('edit-task-title').focus();

    // Show modal with animation
    const backdrop = document.getElementById('edit-task-modal-backdrop');
    const card = document.getElementById('edit-task-modal-card');
    
    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeEditModal() {
    const backdrop = document.getElementById('edit-task-modal-backdrop');
    const card = document.getElementById('edit-task-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function submitEditTask() {
    const taskId = document.getElementById('edit-task-id').value;
    const newTitle = document.getElementById('edit-task-title').value.trim();
    const newDeadline = document.getElementById('edit-task-deadline').value;
    const newPriority = document.getElementById('edit-task-priority').value;

    if (!newTitle) return document.getElementById('edit-task-title').focus();

    const submitBtn = document.querySelector('#edit-task-modal-card .btn-primary');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Saving...`;

    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle, deadline: newDeadline, priority: newPriority })
        });

        if (!response.ok) throw new Error("Update failed");
        
        closeEditModal();
        loadTasks(); // Refresh board with updated data
    } catch (error) {
        console.error(error);
        alert("Failed to update task.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}


/* ==========================================================================
   DELETE CONFIRMATION MODAL LOGIC
   ========================================================================== */

function openDeleteTaskModal(id) {
    // Store the ID in the hidden input
    document.getElementById('delete-task-target-id').value = id;
    
    const backdrop = document.getElementById('delete-task-modal-backdrop');
    const card = document.getElementById('delete-task-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeDeleteTaskModal() {
    const backdrop = document.getElementById('delete-task-modal-backdrop');
    const card = document.getElementById('delete-task-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function executeDeleteTask() {
    const id = document.getElementById('delete-task-target-id').value;
    if (!id) return;

    const submitBtn = document.getElementById('confirm-delete-task-button');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Purging...`;

    const rowElement = document.getElementById(`task-row-${id}`);
    const mobileCard = document.getElementById(`task-mobile-card-${id}`);
    
    try {
        // Optimistic UI update: Animate out immediately while the server works
        [rowElement, mobileCard].filter(Boolean).forEach(element => {
            element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            element.style.opacity = '0';
            element.style.transform = 'translateX(30px) scale(0.95)';
        });

        const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        
        if (!response.ok) {
            throw new Error(`Deletion failed with status: ${response.status}`);
        }

        closeDeleteTaskModal();

        // Wait for the exit animation to finish before snapping the list shut
        setTimeout(() => {
            loadTasks(); 
        }, 300);

    } catch (error) {
        console.error("Delete failed:", error);
        [rowElement, mobileCard].filter(Boolean).forEach(element => {
            element.style.opacity = '1';
            element.style.transform = 'translateX(0) scale(1)';
        });
        alert("System Error: Could not delete the task.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}

document.addEventListener("DOMContentLoaded", loadTasks);
