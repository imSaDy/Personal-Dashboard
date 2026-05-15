/* ==========================================================================
   LUMEN - PREMIUM CHART LOGIC (charts.js)
   ========================================================================== */

let activityChart = null;
let currentChartType = 'bar'; // Can be 'bar', 'doughnut', or 'line'
let currentTimeframe = 'weekly'; 
let cachedData = { totals: [], timeline: [] }; // Holds the dual-payload from database

/**
 * Changes the chart type, updates UI toggle buttons (if they exist), and redraws.
 */
function setChartType(type) {
    currentChartType = type;
    
    // Safely update Toggle UI styles
    ['bar', 'doughnut', 'line'].forEach(t => {
        const btn = document.getElementById(`btn-chart-${t}`);
        if (btn) {
            if (t === type) {
                btn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all bg-white shadow-sm text-brand pointer-events-none";
            } else {
                btn.className = "px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-textMuted hover:text-textMain cursor-pointer";
            }
        }
    });
    
    // Instantly redraw chart without needing a new server request
    if (cachedData.totals && cachedData.totals.length > 0) {
        renderChart();
    }
}

/**
 * Fetches data from the backend and initializes the chart render.
 */
async function loadChartData(timeframe = 'weekly') {
    currentTimeframe = timeframe;

    try {
        const response = await fetch(`/api/analytics?timeframe=${timeframe}`);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        if (!data || !data.totals || data.totals.length === 0) {
            cachedData = { totals: [], timeline: [] };
            renderEmptyChartState();
            return;
        }

        // Cache the dual-payload data
        cachedData = data;
        
        renderChart();
    } catch (error) {
        console.error("Failed to load chart data:", error);
    }
}

/**
 * Renders an empty state directly onto the canvas if no data exists.
 */
function renderEmptyChartState() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (activityChart) activityChart.destroy();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 14px Poppins';
    ctx.fillStyle = '#A3AED0';
    ctx.fillText('No activity logged for this period.', canvas.width / 2, canvas.height / 2);
}

/**
 * Formats the raw database timestamps into beautiful UI labels for the Line Chart.
 */
function formatChartLabel(rawPeriod) {
    if (!rawPeriod) return '';
    try {
        if (currentTimeframe === 'daily') {
            const hour = parseInt(rawPeriod);
            return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
        }
        if (currentTimeframe === 'weekly') {
            // Converts "YYYY-MM-DD" to "Mon", "Tue"
            const parts = rawPeriod.split('-');
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        }
        if (currentTimeframe === 'monthly') {
            // Converts "YYYY-WW" to "Wk 42"
            return `Wk ${rawPeriod.split('-')[1]}`;
        }
        if (currentTimeframe === 'yearly') {
            // Converts "YYYY-MM" to "Jan", "Feb"
            const parts = rawPeriod.split('-');
            const date = new Date(parts[0], parts[1] - 1, 1);
            return date.toLocaleDateString('en-US', { month: 'short' });
        }
    } catch (e) {
        console.error("Label formatting failed", e);
    }
    return rawPeriod;
}

/**
 * Builds and renders the highly-styled Chart.js instance.
 */
function renderChart() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (activityChart) activityChart.destroy();

    // ==========================================
    // PREMIUM GRADIENTS & COLORS
    // ==========================================
    
    // Lumen's Custom Color Palette (RGB format for generating gradients)
    // Deepened slightly from pure pastels so they look vibrant on a white card
    const paletteRGB = [
        '67, 24, 255',   // Brand Purple
        '5, 205, 153',   // Mint Green
        '255, 120, 165', // Vibrant Pink
        '255, 170, 50',  // Vibrant Orange
        '134, 140, 255', // Light Indigo
        '20, 180, 160'   // Teal/Mint Alt
    ];

    // Generate dynamic multi-color gradients for the Bar Chart
    const barGradients = paletteRGB.map(rgb => {
        const grad = ctx.createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, `rgba(${rgb}, 1)`);    // Solid at the top
        grad.addColorStop(1, `rgba(${rgb}, 0.6)`);  // Rich and saturated at the bottom
        return grad;
    });

    const hoverGradients = paletteRGB.map(rgb => {
        const grad = ctx.createLinearGradient(0, 0, 0, 400);
        grad.addColorStop(0, `rgba(${rgb}, 1)`); 
        grad.addColorStop(1, `rgba(${rgb}, 0.8)`);
        return grad;
    });

    // Smooth Area Gradient for the Line Chart (Now Brand Purple!)
    const lineGradient = ctx.createLinearGradient(0, 0, 0, 400);
    lineGradient.addColorStop(0, 'rgba(67, 24, 255, 0.4)'); // Soft purple wave
    lineGradient.addColorStop(1, 'rgba(67, 24, 255, 0.0)'); // Fades neatly into the background

    const pastelHexColors = [
        '#4318FF', '#05CD99', '#FFCEE6', '#FFDCA8', '#868CFF', '#E6FAF5'
    ];

    let chartLabels = [];
    let chartDatasets = [];

    // ==========================================
    // DATA CONFIGURATION
    // ==========================================
    if (currentChartType === 'doughnut') {
        
        // 1. DOUGHNUT: Activity Breakdown
        chartLabels = cachedData.totals.map(item => item.activity);
        chartDatasets = [{
            label: 'Total Hours',
            data: cachedData.totals.map(item => item.total_hours),
            backgroundColor: pastelHexColors,
            borderWidth: 4,
            borderColor: '#FFFFFF',
            hoverOffset: 6
        }];
        
    } else if (currentChartType === 'line') {
        
        // 2. LINE CHART: Momentum Tracker (Hours over Time)
        chartLabels = cachedData.timeline.map(item => formatChartLabel(item.period));
        chartDatasets = [{
            label: 'Total Activity Time',
            data: cachedData.timeline.map(item => item.total_hours),
            borderColor: '#4318FF', // Brand Purple Line
            backgroundColor: lineGradient,
            borderWidth: 3,
            fill: true, 
            tension: 0.4, // Creates the smooth, flowing wave
            pointBackgroundColor: '#FFFFFF',
            pointBorderColor: '#4318FF',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
        }];
        
    } else {
        
        // 3. BAR CHART: Activity Breakdown
        chartLabels = cachedData.totals.map(item => item.activity);
        chartDatasets = [{
            label: 'Total Hours',
            data: cachedData.totals.map(item => item.total_hours),
            // Map the dynamic gradients to each bar sequentially based on its index
            backgroundColor: cachedData.totals.map((_, i) => barGradients[i % barGradients.length]),
            hoverBackgroundColor: cachedData.totals.map((_, i) => hoverGradients[i % hoverGradients.length]),
            borderRadius: 8,
            borderSkipped: false,
            barThickness: 32,
            maxBarThickness: 45
        }];
    }

    const isDoughnut = currentChartType === 'doughnut';

    // ==========================================
    // CHART RENDERING
    // ==========================================
    activityChart = new Chart(ctx, {
        type: currentChartType === 'line' ? 'line' : (isDoughnut ? 'doughnut' : 'bar'), 
        data: {
            labels: chartLabels,
            datasets: chartDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            
            animation: {
                duration: 800,
                easing: 'easeOutQuart' 
            },
            
            plugins: {
                legend: { 
                    display: isDoughnut, // Only display legend for the ring chart
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { family: "'Poppins', sans-serif", size: 12, weight: '500' },
                        color: '#A3AED0'
                    }
                },
                
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
                    displayColors: isDoughnut,
                    callbacks: {
                        label: function(context) {
                            const val = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                            return ` ${val} hr${val !== 1 ? 's' : ''}`;
                        }
                    },
                    boxShadow: '0px 10px 30px rgba(43, 54, 116, 0.1)'
                }
            },
            
            scales: {
                y: {
                    display: !isDoughnut, // Hide scales for ring
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(163, 174, 208, 0.15)', 
                        drawBorder: false, 
                        borderDash: [5, 5] 
                    },
                    ticks: {
                        color: '#A3AED0', 
                        font: { family: "'Poppins', sans-serif", size: 11, weight: '500' },
                        padding: 10
                    }
                },
                x: {
                    display: !isDoughnut,
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

document.addEventListener("DOMContentLoaded", () => loadChartData('weekly'));