/* ==========================================================================
   LIFE OS - PREMIUM CHART LOGIC (charts.js)
   ========================================================================== */

let activityChart = null;

/**
 * Fetches data from the backend and initializes the chart render.
 * @param {string} timeframe - 'daily', 'weekly', 'monthly', or 'yearly'
 */
async function loadChartData(timeframe = 'weekly') {
    try {
        // We now pass the timeframe parameter to the Flask API
        const response = await fetch(`/api/analytics?timeframe=${timeframe}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            renderEmptyChartState();
            return;
        }

        const labels = data.map(item => item.activity);
        const hours = data.map(item => item.total_hours);
        
        renderChart(labels, hours);
    } catch (error) {
        console.error("Failed to load chart data:", error);
    }
}

/**
 * Renders an empty state directly onto the canvas if no data exists.
 */
function renderEmptyChartState() {
    const canvas = document.getElementById('analyticsChart');
    const ctx = canvas.getContext('2d');
    
    if (activityChart) activityChart.destroy();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 14px Poppins';
    ctx.fillStyle = '#A3AED0'; // textMuted color
    ctx.fillText('No activity logged for this period.', canvas.width / 2, canvas.height / 2);
}

/**
 * Builds and renders the highly-styled Chart.js instance.
 */
function renderChart(labels, dataPoints) {
    const canvas = document.getElementById('analyticsChart');
    const ctx = canvas.getContext('2d');
    
    if (activityChart) activityChart.destroy();

    // Premium Vertical Gradient for the Bars
    const barGradient = ctx.createLinearGradient(0, 0, 0, 400);
    barGradient.addColorStop(0, 'rgba(67, 24, 255, 0.9)');  /* Brand Purple */
    barGradient.addColorStop(1, 'rgba(134, 140, 255, 0.1)'); /* Soft transparent */

    // Hover Gradient
    const hoverGradient = ctx.createLinearGradient(0, 0, 0, 400);
    hoverGradient.addColorStop(0, 'rgba(67, 24, 255, 1)'); 
    hoverGradient.addColorStop(1, 'rgba(134, 140, 255, 0.3)');

    activityChart = new Chart(ctx, {
        type: 'bar', 
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Hours',
                data: dataPoints,
                backgroundColor: barGradient,
                hoverBackgroundColor: hoverGradient,
                borderWidth: 0, 
                borderRadius: 8, 
                borderSkipped: false, 
                barThickness: 32, 
                maxBarThickness: 45
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            
            animation: {
                y: {
                    duration: 1200,
                    easing: 'easeOutQuart' 
                }
            },
            
            plugins: {
                legend: { display: false },
                
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#2B3674',
                    bodyColor: '#4318FF',
                    bodyFont: { family: "'Poppins', sans-serif", size: 14, weight: 'bold' },
                    titleFont: { family: "'Poppins', sans-serif", size: 12, weight: '500' },
                    padding: 12,
                    cornerRadius: 12, 
                    borderColor: 'rgba(112, 144, 176, 0.1)',
                    borderWidth: 1,
                    displayColors: false, 
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} Hours Logged`;
                        }
                    },
                    boxShadow: '0px 10px 30px rgba(43, 54, 116, 0.1)'
                }
            },
            
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(163, 174, 208, 0.15)', 
                        drawBorder: false, 
                        borderDash: [5, 5] 
                    },
                    ticks: {
                        color: '#A3AED0', 
                        font: { family: "'Poppins', sans-serif", size: 11, weight: '500' },
                        padding: 10,
                        stepSize: 1 
                    }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { 
                        color: '#A3AED0',
                        font: { family: "'Poppins', sans-serif", size: 12, weight: '600' },
                        padding: 8
                    }
                }
            }
        }
    });
}

// Automatically load chart data when the page finishes loading
document.addEventListener("DOMContentLoaded", () => loadChartData('weekly'));