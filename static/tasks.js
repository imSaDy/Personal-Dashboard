/* ==========================================================================
   LIFE OS - TASK MANAGER & BOUNTY BOARD LOGIC (tasks.js)
   ========================================================================== */

/**
 * Utility: Formats dates and calculates remaining days.
 * Now returns a rich HTML string with a premium two-line layout and color-coded status pills.
 * @param {string} dateString - The raw date string from the database
 * @returns {string} The formatted HTML for the table cell
 */
function formatTaskDate(dateString) {
    if (!dateString) {
        return `
            <div class="flex flex-col">
                <span class="text-textMain font-medium">No deadline</span>
                <span class="text-[10px] font-bold text-textMuted uppercase tracking-wider mt-1">Whenever</span>
            </div>`;
    }
    
    // Parse the date safely considering timezones
    const [year, month, day] = dateString.split('-');
    const taskDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = taskDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const formattedDate = taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // Generate the rich HTML based on the remaining days
    if (diffDays === 0) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-brand font-bold">Today</span>
                <span class="bg-brand-light text-brand text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-brand/20 animate-pulse">Due Now</span>
            </div>`;
    } else if (diffDays === 1) {
        return `
            <div class="flex flex-col items-start">
                <span class="text-textMain font-bold">Tomorrow</span>
                <span class="bg-orange-50 text-orange-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-orange-100">1 day left</span>
            </div>`;
    } else if (diffDays < 0) {
        const absDays = Math.abs(diffDays);
        return `
            <div class="flex flex-col items-start">
                <span class="text-accent-pink font-bold">${formattedDate}</span>
                <span class="bg-red-50 text-red-500 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border border-red-100 shadow-sm shadow-red-100/50">Overdue by ${absDays}d</span>
            </div>`;
    } else {
        // Standard future date
        let pillColor = diffDays <= 3 ? 'bg-orange-50 text-orange-500 border-orange-100' : 'bg-gray-50 text-textMuted border-gray-100';
        return `
            <div class="flex flex-col items-start">
                <span class="text-textMuted font-medium">${formattedDate}</span>
                <span class="${pillColor} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md mt-1 border shadow-sm">${diffDays} days left</span>
            </div>`;
    }
}

/**
 * Utility: Animates a number counting up from 0 to its target value.
 */
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); 
        obj.innerHTML = Math.floor(easeOut * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

/**
 * Core: Fetches tasks from the server and renders the active board.
 */
async function loadTasks() {
    const tbody = document.getElementById('task-table-body');
    const countDisplay = document.getElementById('open-tasks-count');

    try {
        const response = await fetch('/api/tasks');
        
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const tasks = await response.json();
        
        tbody.innerHTML = ''; 

        // Update the Open Tasks Counter
        const openTasks = tasks.filter(t => t.status !== 'Completed').length;
        if (countDisplay) {
            const currentVal = parseInt(countDisplay.innerText) || 0;
            animateValue(countDisplay, currentVal, openTasks, 800);
        }

        // Premium Empty State
        if (tasks.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="py-12 text-center animate-slide-up">
                        <div class="flex flex-col items-center justify-center">
                            <div class="w-16 h-16 bg-brand-light rounded-full flex items-center justify-center text-brand mb-4 shadow-sm">
                                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                            </div>
                            <h3 class="text-lg font-bold text-textMain">All caught up!</h3>
                            <p class="text-sm font-medium text-textMuted mt-1">Your bounty board is completely clear.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        // Render rows
        tasks.forEach((task, index) => {
            // 1. Upgraded Premium Pastel Priority Badges (Gradients + Borders)
            let priorityBadge = '';
            if (task.priority === 'High') {
                priorityBadge = 'bg-gradient-to-r from-red-50 to-rose-100 text-rose-600 border border-rose-200 shadow-sm';
            } else if (task.priority === 'Medium') {
                priorityBadge = 'bg-gradient-to-r from-amber-50 to-orange-100 text-amber-600 border border-amber-200 shadow-sm';
            } else {
                priorityBadge = 'bg-gradient-to-r from-emerald-50 to-teal-100 text-teal-600 border border-teal-200 shadow-sm';
            }

            // 2. State styling (Completed vs Pending)
            const isCompleted = task.status === 'Completed';
            const titleStyle = isCompleted ? 'line-through text-textMuted font-medium' : 'text-textMain font-bold';
            const rowOpacity = isCompleted ? 'opacity-50 hover:opacity-100 bg-gray-50/50' : 'bg-white hover:-translate-y-0.5 hover:shadow-card z-10 relative';
            const checkboxChecked = isCompleted ? 'checked' : '';

            // Calculate staggered animation delay
            const animationDelay = `${(index * 0.05) + 0.1}s`;

            // 3. Build Row (Upgraded padding and transitions)
            const tr = document.createElement('tr');
            tr.className = `border-b border-gray-100 transition-all duration-300 group hover:bg-gray-50/80 animate-slide-up ${rowOpacity}`;
            tr.id = `task-row-${task.id}`;
            tr.style.animationFillMode = 'both';
            tr.style.animationDelay = animationDelay;
            
            tr.innerHTML = `
                <td class="py-5 pl-4 sm:pl-2">
                    <div class="flex items-center">
                        <input type="checkbox" 
                            id="chk-${task.id}" 
                            class="checkbox-custom transform group-hover:scale-110 transition-transform duration-200" 
                            ${checkboxChecked} 
                            onchange="toggleTask(${task.id}, this)">
                    </div>
                </td>
                <td class="py-5 px-4 transition-all duration-300 ${titleStyle} text-[15px]" id="title-${task.id}">
                    ${task.title}
                </td>
                <td class="py-4 px-4 text-sm font-medium">
                    ${formatTaskDate(task.deadline)}
                </td>
                <td class="py-5 px-4">
                    <span class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider ${priorityBadge}">
                        ${task.priority}
                    </span>
                </td>
                <td class="py-5 pr-4 sm:pr-2 text-right">
                    <button onclick="deleteTask(${task.id})" class="text-textMuted hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all duration-200 transform hover:scale-105 font-bold text-xs bg-white border border-gray-100 shadow-sm rounded-lg px-4 py-2 focus:opacity-100 outline-none">
                        Purge
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) { 
        console.error("Failed to load tasks:", error); 
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-accent-pink font-bold bg-red-50/50 rounded-xl">Error loading board data. Ensure server is running.</td></tr>`;
    }
}

/**
 * Handles the creation of a new task.
 */
async function submitTask() {
    const titleInput = document.getElementById('task-title');
    const deadlineInput = document.getElementById('task-deadline');
    const priorityInput = document.getElementById('task-priority');
    const submitBtn = document.querySelector('button[onclick="submitTask()"]');

    if (!titleInput.value.trim()) {
        titleInput.focus();
        titleInput.parentElement.style.transform = 'translateX(5px)';
        setTimeout(() => titleInput.parentElement.style.transform = 'translateX(-5px)', 100);
        setTimeout(() => titleInput.parentElement.style.transform = 'translateX(0)', 200);
        return;
    }

    const originalBtnContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-16 0z"></path></svg>
    `;

    try {
        await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                title: titleInput.value.trim(), 
                deadline: deadlineInput.value, 
                priority: priorityInput.value 
            })
        });
        
        titleInput.value = ''; 
        deadlineInput.value = ''; 
        priorityInput.value = 'Medium';
        titleInput.blur(); 
        
        loadTasks();
    } catch (error) { 
        console.error("Task submission failed", error); 
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
    }
}

/**
 * Handles toggling task status (Complete / Pending).
 */
async function toggleTask(id, checkboxEl) {
    const titleEl = document.getElementById(`title-${id}`);
    const rowEl = document.getElementById(`task-row-${id}`);
    
    // Optimistic UI Update
    if (checkboxEl.checked) {
        titleEl.classList.remove('text-textMain', 'font-bold');
        titleEl.classList.add('text-textMuted', 'line-through', 'font-medium');
        rowEl.classList.add('opacity-50', 'bg-gray-50/50');
        rowEl.classList.remove('hover:-translate-y-0.5', 'hover:shadow-card', 'z-10');
    } else {
        titleEl.classList.remove('text-textMuted', 'line-through', 'font-medium');
        titleEl.classList.add('text-textMain', 'font-bold');
        rowEl.classList.remove('opacity-50', 'bg-gray-50/50');
        rowEl.classList.add('hover:-translate-y-0.5', 'hover:shadow-card', 'z-10');
    }

    try {
        await fetch(`/api/tasks/${id}/toggle`, { method: 'PUT' });
        setTimeout(loadTasks, 600); // Slight delay so user can see the strikethrough before it re-sorts
    } catch (error) {
        console.error("Toggle failed", error);
        checkboxEl.checked = !checkboxEl.checked;
    }
}

/**
 * Handles task deletion with a smooth slide-out animation.
 */
async function deleteTask(id) {
    if (!confirm("Are you sure you want to permanently delete this task?")) return; 
    
    const rowEl = document.getElementById(`task-row-${id}`);
    
    try {
        if (rowEl) {
            rowEl.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            rowEl.style.opacity = '0';
            rowEl.style.transform = 'translateX(30px) scale(0.95)';
        }

        const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        if (response.ok) {
            setTimeout(loadTasks, 300); 
        }
    } catch (error) {
        console.error("Delete failed", error);
        if (rowEl) {
            rowEl.style.opacity = '1';
            rowEl.style.transform = 'translateX(0) scale(1)';
        }
    }
}

document.addEventListener("DOMContentLoaded", loadTasks);