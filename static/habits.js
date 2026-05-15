/* ==========================================================================
   LUMEN - ROUTINES & REPORT CARD LOGIC (habits.js)
   ========================================================================== */

let currentHabitsData = []; 
let selectedForDeletion = new Set(); 

/**
 * Fetches the daily routines from the server and renders them.
 */
async function loadHabits() {
    // FIX: Updated ID to match the new routine HTML
    const container = document.getElementById('routine-matrix-container'); 

    try {
        const response = await fetch('/api/habits');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const habits = await response.json();
        currentHabitsData = habits; 
        
        container.innerHTML = ''; 

        // Friendly Empty State
        if (!habits || habits.length === 0) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center animate-slide-up">
                    <div class="w-16 h-16 bg-brand-light rounded-full flex items-center justify-center text-brand mb-4">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    </div>
                    <h3 class="text-lg font-bold text-textMain">No routines established</h3>
                    <p class="text-sm font-medium text-textMuted mt-1">Click 'New Routine' to start tracking your daily goals.</p>
                </div>
            `;
            updateDailyProgress(0, 0);
            loadRoutineReport(); // Ensure report card loads even if empty
            
            if (!document.getElementById('manage-modal-backdrop').classList.contains('hidden')) {
                renderManageList();
            }
            return;
        }

        const completedCount = habits.filter(h => h.completed).length;
        updateDailyProgress(completedCount, habits.length);

        habits.forEach((habit, index) => {
            const cardBg = habit.completed 
                ? 'bg-gradient-to-br from-brand to-[#868CFF] shadow-[0px_10px_20px_rgba(67,24,255,0.25)] border-transparent text-white' 
                : 'bg-white border-gray-100 shadow-sm hover:shadow-md hover:border-brand/30 text-textMain';
            
            const titleColor = habit.completed ? 'text-white' : 'text-textMain';
            const subtitleColor = habit.completed ? 'text-white/80' : 'text-textMuted';
            
            const checkmarkContainer = habit.completed
                ? 'bg-white text-brand border-white shadow-inner'
                : 'bg-gray-50 border-gray-200 text-transparent group-hover:border-brand/50';

            const formattedName = habit.name.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            const animationDelay = `${(index * 0.1) + 0.1}s`;

            const cardHtml = `
                <div id="routine-card-${habit.id}" class="animate-slide-up" style="animation-fill-mode: both; animation-delay: ${animationDelay};">
                    <button 
                        onclick="toggleHabit(${habit.id}, this)" 
                        class="w-full flex items-center justify-between p-6 rounded-2xl border transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-brand-light ${cardBg}"
                        data-completed="${habit.completed}"
                    >
                        <div class="flex items-center gap-4 text-left min-w-0 pr-4">
                            <div class="w-1.5 h-10 flex-shrink-0 rounded-full ${habit.completed ? 'bg-white/50' : 'bg-brand-light'}"></div>
                            <div class="min-w-0">
                                <span class="block font-bold text-lg tracking-tight truncate ${titleColor} transition-colors">${formattedName}</span>
                                <span class="block text-xs font-semibold uppercase tracking-wider mt-0.5 ${subtitleColor} transition-colors">Daily Routine</span>
                            </div>
                        </div>
                        <div class="w-8 h-8 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${checkmarkContainer}">
                            <svg class="w-5 h-5 transition-transform duration-300 ${habit.completed ? 'scale-100' : 'scale-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                    </button>
                </div>
            `;
            container.innerHTML += cardHtml;
        });

        if (!document.getElementById('manage-modal-backdrop').classList.contains('hidden')) {
            renderManageList();
        }

        // Trigger the report card update
        loadRoutineReport();

    } catch (error) {
        console.error("Failed to load Routines:", error);
        container.innerHTML = `<p class="col-span-full text-center text-sm font-medium text-accent-pink bg-red-50 p-4 rounded-2xl border border-red-100">Failed to sync routines. Ensure your database is connected.</p>`;
    }
}

/**
 * NEW: Fetches the 7-day performance data and populates the Report Card
 */
async function loadRoutineReport() {
    try {
        const response = await fetch('/api/habits/report');
        if (!response.ok) return;
        const data = await response.json();

        // 1. Update Score & Progress Bar
        document.getElementById('weekly-score').innerText = `${data.score}%`;
        document.getElementById('weekly-progress-bar').style.width = `${data.score}%`;

        // 2. Update Encouragement Message based on psychological thresholds
        const msgEl = document.getElementById('routine-report-msg');
        if (data.score === 100) {
            msgEl.innerText = "Flawless consistency! Keep it up.";
            msgEl.className = "text-sm font-bold text-accent-mint mt-1";
        } else if (data.score >= 70) {
            msgEl.innerText = "Great momentum this week.";
            msgEl.className = "text-sm font-medium text-brand mt-1";
        } else if (data.score >= 40) {
            msgEl.innerText = "You're getting there. Stay focused.";
            msgEl.className = "text-sm font-medium text-textMuted mt-1";
        } else {
            msgEl.innerText = "Let's build better routines. You've got this!";
            msgEl.className = "text-sm font-medium text-accent-pink mt-1";
        }

        // 3. Populate 7-day visual blocks
        const daysContainer = document.getElementById('weekly-days-container');
        daysContainer.innerHTML = '';
        
        data.days.forEach(day => {
            let colorClass = 'bg-gray-50 text-textMuted border border-gray-100'; // Default / Missed
            
            if (day.total > 0) {
                if (day.percentage === 100) {
                    colorClass = 'bg-brand text-white shadow-sm border border-transparent';
                } else if (day.percentage >= 50) {
                    colorClass = 'bg-brand-light text-brand border border-transparent';
                }
            }

            daysContainer.innerHTML += `
                <div class="flex flex-col items-center gap-1.5 flex-1">
                    <div class="w-full h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-colors ${colorClass}">
                        ${day.completed}
                    </div>
                    <span class="text-[10px] font-bold text-textMuted uppercase">${day.day_name}</span>
                </div>
            `;
        });

    } catch (error) {
        console.error("Failed to load report card:", error);
    }
}

async function toggleHabit(id, btnElement) {
    btnElement.style.transform = 'scale(0.95)';
    setTimeout(() => { btnElement.style.transform = ''; }, 150);

    try {
        const response = await fetch('/api/habits/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ habit_id: id })
        });
        if (!response.ok) throw new Error('Network response was not ok');
        loadHabits(); // This will refresh both the routine grid and the report card!
    } catch (error) { console.error("Routine toggle failed:", error); }
}

function updateDailyProgress(completed, total) {
    // FIX: Updated ID to match the new HTML
    const statusTextEl = document.getElementById('routine-status-text');
    if (!statusTextEl) return;

    if (total === 0) {
        statusTextEl.innerText = "No active routines.";
        statusTextEl.className = "text-textMuted font-bold";
        return;
    }

    const percentage = Math.round((completed / total) * 100);

    if (completed === total) {
        statusTextEl.innerText = "All routines completed! Outstanding work today.";
        statusTextEl.className = "text-accent-mint font-bold flex items-center gap-2";
        statusTextEl.innerHTML += `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
    } else if (percentage >= 50) {
        statusTextEl.innerText = `${completed} of ${total} completed. You're over halfway there!`;
        statusTextEl.className = "text-brand font-bold";
    } else if (completed === 0) {
        statusTextEl.innerText = `0 of ${total} completed. Ready to begin?`;
        statusTextEl.className = "text-textMuted font-bold";
    } else {
        statusTextEl.innerText = `${completed} of ${total} completed. Keep going.`;
        statusTextEl.className = "text-brand font-bold";
    }
}

/* ==========================================================================
   MANAGE LOGIC (List & Checkboxes)
   ========================================================================== */

function openManageModal() {
    selectedForDeletion.clear();
    updateBulkDeleteButton();
    renderManageList();

    const backdrop = document.getElementById('manage-modal-backdrop');
    const card = document.getElementById('manage-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeManageModal() {
    const backdrop = document.getElementById('manage-modal-backdrop');
    const card = document.getElementById('manage-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

function renderManageList() {
    const listContainer = document.getElementById('manage-routine-list');
    listContainer.innerHTML = '';

    if (currentHabitsData.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-sm text-textMuted py-6 font-medium">No routines available to manage.</p>`;
        return;
    }

    currentHabitsData.forEach(habit => {
        const isChecked = selectedForDeletion.has(habit.id) ? 'checked' : '';
        const formattedName = habit.name.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

        const row = document.createElement('div');
        row.className = 'flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors';
        row.innerHTML = `
            <div class="flex items-center gap-4">
                <input type="checkbox" 
                       id="manage-chk-${habit.id}" 
                       class="checkbox-custom transform scale-90" 
                       ${isChecked} 
                       onchange="toggleDeleteSelection(${habit.id}, this.checked)">
                <label for="manage-chk-${habit.id}" class="text-sm font-bold text-textMain cursor-pointer select-none">${formattedName}</label>
            </div>
            <button onclick="openEditRoutineModal(${habit.id})" class="p-2 text-textMuted hover:text-brand hover:bg-brand-light rounded-lg transition-colors outline-none" title="Edit Name">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            </button>
        `;
        listContainer.appendChild(row);
    });
}

function toggleDeleteSelection(id, isChecked) {
    if (isChecked) {
        selectedForDeletion.add(id);
    } else {
        selectedForDeletion.delete(id);
    }
    updateBulkDeleteButton();
}

function updateBulkDeleteButton() {
    const btn = document.getElementById('btn-bulk-delete');
    const countSpan = document.getElementById('delete-count');

    if (selectedForDeletion.size > 0) {
        btn.classList.remove('hidden');
        countSpan.innerText = selectedForDeletion.size;
    } else {
        btn.classList.add('hidden');
    }
}

/* ==========================================================================
   BULK DELETE MODAL LOGIC
   ========================================================================== */

function openBulkDeleteModal() {
    if (selectedForDeletion.size === 0) return;
    
    document.getElementById('delete-habit-count-text').innerText = selectedForDeletion.size;
    
    const backdrop = document.getElementById('delete-habit-modal-backdrop');
    const card = document.getElementById('delete-habit-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
    }, 10);
}

function closeBulkDeleteModal() {
    const backdrop = document.getElementById('delete-habit-modal-backdrop');
    const card = document.getElementById('delete-habit-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function executeBulkDelete() {
    if (selectedForDeletion.size === 0) return;

    const btn = document.querySelector('#delete-habit-modal-card .bg-red-500');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Deleting...';

    try {
        const deletePromises = Array.from(selectedForDeletion).map(id => 
            fetch(`/api/habits/${id}`, { method: 'DELETE' })
        );
        
        await Promise.all(deletePromises);
        
        selectedForDeletion.clear();
        updateBulkDeleteButton();
        
        closeBulkDeleteModal();
        
        setTimeout(() => {
            loadHabits(); 
        }, 300);

    } catch (error) {
        console.error("Bulk delete failed:", error);
        alert("Failed to delete routines. Ensure your backend is running.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

/* ==========================================================================
   NEW & EDIT ROUTINE MODALS
   ========================================================================== */

function openRoutineModal() {
    const backdrop = document.getElementById('routine-modal-backdrop');
    const card = document.getElementById('routine-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('new-routine-name').focus();
    }, 10);
}

function closeRoutineModal() {
    const backdrop = document.getElementById('routine-modal-backdrop');
    const card = document.getElementById('routine-modal-card');
    const input = document.getElementById('new-routine-name');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => {
        backdrop.classList.add('hidden');
        input.value = ''; 
        input.blur();
    }, 300); 
}

async function submitNewRoutine() {
    const input = document.getElementById('new-routine-name');
    const routineName = input.value.trim();

    if (!routineName) {
        input.parentElement.style.transform = 'translateX(5px)';
        setTimeout(() => input.parentElement.style.transform = 'translateX(-5px)', 100);
        setTimeout(() => input.parentElement.style.transform = 'translateX(0)', 200);
        input.focus();
        return;
    }

    const submitBtn = document.querySelector('#routine-modal-card .btn-primary');
    const originalBtnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Saving...`;

    try {
        const response = await fetch('/api/habits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: routineName })
        });
        if (!response.ok) throw new Error("Failed to save routine");
        closeRoutineModal();
        loadHabits();
    } catch (error) {
        console.error(error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
    }
}

function openEditRoutineModal(id) {
    const habit = currentHabitsData.find(h => h.id === id);
    if (!habit) return;

    const formattedName = habit.name.toLowerCase().split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    document.getElementById('edit-routine-id').value = habit.id;
    document.getElementById('edit-routine-name').value = formattedName;

    const backdrop = document.getElementById('edit-routine-modal-backdrop');
    const card = document.getElementById('edit-routine-modal-card');

    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('edit-routine-name').focus();
    }, 10);
}

function closeEditRoutineModal() {
    const backdrop = document.getElementById('edit-routine-modal-backdrop');
    const card = document.getElementById('edit-routine-modal-card');

    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    setTimeout(() => { backdrop.classList.add('hidden'); }, 300);
}

async function submitEditRoutine() {
    const id = document.getElementById('edit-routine-id').value;
    const nameInput = document.getElementById('edit-routine-name');
    const newName = nameInput.value.trim();

    if (!newName) return nameInput.focus();

    const submitBtn = document.querySelector('#edit-routine-modal-card .btn-primary');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Saving...`;

    try {
        const response = await fetch(`/api/habits/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        if (!response.ok) throw new Error("Update failed");
        
        closeEditRoutineModal();
        loadHabits(); 
    } catch (error) {
        console.error(error);
        alert("Failed to update routine.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
    }
}

document.addEventListener("DOMContentLoaded", loadHabits);