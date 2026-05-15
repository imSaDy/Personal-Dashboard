/* ==========================================================================
   LIFE OS - HABIT & ROUTINE LOGIC (habits.js)
   ========================================================================== */

/**
 * Fetches the daily habits from the server and renders them.
 * Includes a staggered animation effect for a premium feel.
 */
async function loadHabits() {
    const container = document.getElementById('habit-matrix-container');

    try {
        const response = await fetch('/api/habits');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const habits = await response.json();
        
        container.innerHTML = ''; 

        // Premium Empty State
        if (!habits || habits.length === 0) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center py-12 text-center animate-slide-up">
                    <div class="w-16 h-16 bg-brand-light rounded-full flex items-center justify-center text-brand mb-4">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                    </div>
                    <h3 class="text-lg font-bold text-textMain">No routines established</h3>
                    <p class="text-sm font-medium text-textMuted mt-1">Click 'New Routine' to start building your matrix.</p>
                </div>
            `;
            updateDailyProgress(0, 0);
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

            const formattedName = habit.name
                .toLowerCase()
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');

            const animationDelay = `${(index * 0.1) + 0.1}s`;

            const buttonHtml = `
                <button 
                    onclick="toggleHabit(${habit.id}, this)" 
                    class="w-full flex items-center justify-between p-6 rounded-2xl border transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-brand-light group animate-slide-up ${cardBg}"
                    style="animation-fill-mode: both; animation-delay: ${animationDelay};"
                    data-completed="${habit.completed}"
                >
                    <div class="flex items-center gap-4 text-left">
                        <div class="w-1.5 h-10 rounded-full ${habit.completed ? 'bg-white/50' : 'bg-brand-light'}"></div>
                        <div>
                            <span class="block font-bold text-lg tracking-tight ${titleColor} transition-colors">
                                ${formattedName}
                            </span>
                            <span class="block text-xs font-semibold uppercase tracking-wider mt-0.5 ${subtitleColor} transition-colors">
                                Daily Protocol
                            </span>
                        </div>
                    </div>
                    <div class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${checkmarkContainer}">
                        <svg class="w-5 h-5 transition-transform duration-300 ${habit.completed ? 'scale-100' : 'scale-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                </button>
            `;
            container.innerHTML += buttonHtml;
        });

    } catch (error) {
        console.error("Failed to load Habit Matrix:", error);
        container.innerHTML = `<p class="col-span-full text-center text-sm font-medium text-accent-pink bg-red-50 p-4 rounded-2xl border border-red-100">Failed to sync matrix. Ensure your database is connected.</p>`;
    }
}

async function toggleHabit(id, btnElement) {
    btnElement.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btnElement.style.transform = '';
    }, 150);

    try {
        const response = await fetch('/api/habits/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ habit_id: id })
        });
        if (!response.ok) throw new Error('Network response was not ok');
        loadHabits();
    } catch (error) {
        console.error("Habit toggle failed:", error);
    }
}

function updateDailyProgress(completed, total) {
    const statusTextEl = document.getElementById('habit-status-text');
    if (!statusTextEl) return;

    if (total === 0) {
        statusTextEl.innerText = "No active routines.";
        statusTextEl.className = "text-textMuted font-bold";
        return;
    }

    const percentage = Math.round((completed / total) * 100);

    if (completed === total) {
        statusTextEl.innerText = "Matrix Complete! Outstanding work today.";
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
   NEW ROUTINE MODAL LOGIC
   ========================================================================== */

/**
 * Opens the modal with a smooth scale-in and fade-in animation.
 */
function openRoutineModal() {
    const backdrop = document.getElementById('routine-modal-backdrop');
    const card = document.getElementById('routine-modal-card');

    // Remove hidden class to render element, then trigger CSS transitions
    backdrop.classList.remove('hidden');
    
    setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        card.classList.add('scale-100');
        document.getElementById('new-routine-name').focus();
    }, 10);
}

/**
 * Closes the modal and clears the input field.
 */
function closeRoutineModal() {
    const backdrop = document.getElementById('routine-modal-backdrop');
    const card = document.getElementById('routine-modal-card');
    const input = document.getElementById('new-routine-name');

    // Trigger CSS fade out
    backdrop.classList.add('opacity-0');
    card.classList.remove('scale-100');
    card.classList.add('scale-95');

    // Wait for animation to finish before hiding
    setTimeout(() => {
        backdrop.classList.add('hidden');
        input.value = ''; // Reset the input field
        input.blur();
    }, 300); // 300ms matches Tailwind's duration-300
}

/**
 * Validates and submits the new routine to the Flask backend.
 */
async function submitNewRoutine() {
    const input = document.getElementById('new-routine-name');
    const routineName = input.value.trim();

    // Premium Validation: Shake the input field if empty
    if (!routineName) {
        input.parentElement.style.transform = 'translateX(5px)';
        setTimeout(() => input.parentElement.style.transform = 'translateX(-5px)', 100);
        setTimeout(() => input.parentElement.style.transform = 'translateX(0)', 200);
        input.focus();
        return;
    }

    const submitBtn = document.querySelector('#routine-modal-card .btn-primary');
    const originalBtnHTML = submitBtn.innerHTML;

    // Set Loading State
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8h8a8 8 0 01-16 0z"></path></svg>
        Saving...
    `;

    try {
        const response = await fetch('/api/habits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: routineName })
        });

        if (!response.ok) throw new Error("Failed to save routine");

        // Success! Close modal and refresh matrix
        closeRoutineModal();
        loadHabits();

    } catch (error) {
        console.error("Error creating routine:", error);
        alert("System Error: Could not create routine.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHTML;
    }
}

// Boot up the module when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", loadHabits);