/* ==========================================================================
   LUMEN - MOMENTUM STREAK WIDGET (streak.js)
   ========================================================================== */

async function loadMomentumStreak() {
    const textEl = document.getElementById('streak-score-text');
    const iconEl = document.getElementById('streak-fire-icon');
    
    if (!textEl || !iconEl) return;

    try {
        const response = await fetch('/api/habits/report');
        if (!response.ok) throw new Error("Failed to fetch streak data");

        const data = await response.json();
        const score = data.score;
        
        animateStreakValue(textEl, 0, score, 1000);

        const parentEl = iconEl.parentElement;
        
        // Reset colors and ALL animation classes so we start fresh
        iconEl.classList.remove('text-gray-300', 'text-[#FF9F1C]', 'text-red-500', 'animate-flame-red', 'animate-flame-orange');
        parentEl.classList.remove('bg-gray-50', 'bg-orange-50', 'bg-red-50', 'border-gray-100', 'border-orange-100', 'border-red-100', 'group-hover:bg-white');

        // Apply exact palette and specific animations from the Consistency Guide
        if (score >= 80) {
            parentEl.classList.add('bg-red-50', 'border-red-100');
            iconEl.classList.add('text-red-500', 'animate-flame-red');
        } else if (score >= 40) {
            parentEl.classList.add('bg-orange-50', 'border-orange-100');
            iconEl.classList.add('text-[#FF9F1C]', 'animate-flame-orange');
        } else {
            // Building Habit state remains frozen and gray
            parentEl.classList.add('bg-gray-50', 'border-gray-100');
            iconEl.classList.add('text-gray-300');
        }
    } catch (error) {
        console.error("Streak error:", error);
        textEl.innerText = "--%";
    }
}

function animateStreakValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 4); 
        const current = easeOut * (end - start) + start;
        
        obj.innerText = Math.floor(current) + '%';
        
        if (progress < 1) window.requestAnimationFrame(step);
        else obj.innerText = end + '%';
    };
    window.requestAnimationFrame(step);
}

document.addEventListener('DOMContentLoaded', loadMomentumStreak);