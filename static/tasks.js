/* ==========================================================================
   LIFE OS - TASK MANAGER LOGIC (tasks.js)
   ========================================================================== */

let currentTasksData = []; // Stores tasks globally so we can easily populate the edit modal

/**
 * Utility: Formats dates and calculates remaining days.
 */
function formatTaskDate(dateString) {
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
                <span class="bg-orange-50 text-orange-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-orange-100">1 day left</span>
            </div>`;
    } else if (diffDays < 0) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-accent-pink font-bold">${formattedDate}</span>
                <span class="bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-red-100 shadow-sm shadow-red-100/50">Overdue by ${Math.abs(diffDays)}d</span>
            </div>`;
    } else {
        let pillColor = diffDays <= 3 ? 'bg-orange-50 text-orange-500 border-orange-100' : 'bg-gray-50 text-textMuted border-gray-100';
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
async function loadTasks() {
    const tbody = document.getElementById('task-table-body');
    const countDisplay = document.getElementById('open-tasks-count');

    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const tasks = await response.json();
        currentTasksData = tasks; // Save globally for easy editing
        
        tbody.innerHTML = ''; 

        const openTasks = tasks.filter(t => t.status !== 'Completed').length;
        if (countDisplay) {
            const currentVal = parseInt(countDisplay.innerText) || 0;
            animateValue(countDisplay, currentVal, openTasks, 800);
        }

        if (tasks.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="5" class="py-12 text-center text-textMuted font-medium animate-slide-up">No active tasks found.</td></tr>
            `;
            return;
        }

        tasks.forEach((task, index) => {
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
            const animationDelay = `${(index * 0.05) + 0.1}s`;

            const tr = document.createElement('tr');
            tr.className = `border-b border-gray-100 transition-all duration-300 group animate-slide-up ${rowClasses}`;
            tr.id = `task-row-${task.id}`;
            tr.style.animationFillMode = 'both';
            tr.style.animationDelay = animationDelay;
            
            tr.innerHTML = `
                <td class="py-5 pl-4 sm:pl-2">
                    <div class="flex items-center">
                        <input type="checkbox" id="chk-${task.id}" class="checkbox-custom transform group-hover:scale-110 transition-transform duration-200" ${checkboxChecked} onchange="toggleTask(${task.id}, this)">
                    </div>
                </td>
                <td class="py-5 px-4 transition-all duration-300 ${titleStyle} text-[15px]" id="title-${task.id}">
                    ${task.title}
                </td>
                <td class="py-4 px-4 text-sm font-medium">
                    ${formatTaskDate(task.deadline)}
                </td>
                <td class="py-5 px-4">
                    ${priorityBadge}
                </td>
                <td class="py-5 pr-4 sm:pr-2">
                    <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button onclick="openEditModal(${task.id})" class="p-2 text-textMuted hover:text-brand hover:bg-brand-light rounded-lg transition-colors outline-none" title="Edit Task">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                        </button>
                        <button onclick="openDeleteTaskModal(${task.id})" class="p-2 text-textMuted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors outline-none" title="Delete Task">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) { 
        console.error("Failed to load tasks:", error); 
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

    const submitBtn = document.querySelector('#delete-task-modal-card .bg-red-500');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Purging...`;

    const rowElement = document.getElementById(`task-row-${id}`);
    
    try {
        // Optimistic UI update: Animate out immediately while the server works
        if (rowElement) {
            rowElement.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            rowElement.style.opacity = '0';
            rowElement.style.transform = 'translateX(30px) scale(0.95)';
        }

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
        if (rowElement) {
            rowElement.style.opacity = '1';
            rowElement.style.transform = 'translateX(0) scale(1)';
        }
        alert("System Error: Could not delete the task.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}

document.addEventListener("DOMContentLoaded", loadTasks);