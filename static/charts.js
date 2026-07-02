/* ==========================================================================
   LUMEN - PREMIUM CHART LOGIC (charts.js)
   ========================================================================== */

let activityChart = null;
let currentChartType = 'line'; // Can be 'bar', 'doughnut', or 'line'
let currentTimeframe = 'weekly';
let cachedData = { totals: [], timeline: [] }; // Holds the dual-payload from database
let chartRequestController = null;
let chartRequestSequence = 0;

const REPORT_REQUEST_TIMEOUT_MS = 6000;

const chartCopy = {
    line: {
        title: 'Momentum over time',
        subtitle: 'Your logged hours across this period'
    },
    doughnut: {
        title: 'Focus mix',
        subtitle: 'How your attention was distributed'
    },
    bar: {
        title: 'Activity comparison',
        subtitle: 'Hours invested in each area'
    }
};

function updateChartCopy() {
    const copy = chartCopy[currentChartType] || chartCopy.line;
    const title = document.getElementById('chart-title');
    const subtitle = document.getElementById('chart-subtitle');
    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
}

function setChartStatus(state, title = '', copy = '') {
    const overlay = document.getElementById('chart-status-overlay');
    const spinner = document.getElementById('chart-status-spinner');
    const titleElement = document.getElementById('chart-status-title');
    const copyElement = document.getElementById('chart-status-copy');
    const retryButton = document.getElementById('chart-retry-button');
    const canvas = document.getElementById('analyticsChart');
    if (!overlay) return;

    const isHidden = state === 'hidden';
    overlay.classList.toggle('is-hidden', isHidden);
    if (canvas) canvas.style.opacity = isHidden ? '1' : '0.18';
    if (isHidden) return;

    spinner.classList.toggle('hidden', state !== 'loading');
    retryButton.classList.toggle('hidden', state !== 'error');
    titleElement.textContent = title;
    copyElement.textContent = copy;
}

function compactActivityTotals(totals, limit = 7) {
    const sorted = [...(totals || [])].sort(
        (a, b) => Number(b.total_hours || 0) - Number(a.total_hours || 0)
    );
    if (sorted.length <= limit) return sorted;

    const visible = sorted.slice(0, limit - 1);
    const otherHours = sorted.slice(limit - 1).reduce(
        (sum, item) => sum + Number(item.total_hours || 0),
        0
    );
    return [...visible, { activity: 'Other', total_hours: Number(otherHours.toFixed(2)) }];
}

function colorsForActivities(activities) {
    const palette = window.LUMEN_ACTIVITY_PALETTE || [
        { solid: '#4318FF', soft: '#7B61FF' },
        { solid: '#05B98C', soft: '#3DD6AE' },
        { solid: '#FF5C7A', soft: '#FF8FA6' },
        { solid: '#F59E0B', soft: '#FBCB62' },
        { solid: '#2F80ED', soft: '#69A7F5' },
        { solid: '#B44BC0', soft: '#DA86E0' }
    ];
    const usedIndexes = new Set();

    return activities.map((activity, position) => {
        const preferredColor = typeof window.getLumenActivityColor === 'function'
            ? window.getLumenActivityColor(activity.activity)
            : palette[position % palette.length];
        let colorIndex = Math.max(0, palette.indexOf(preferredColor));
        if (usedIndexes.size < palette.length) {
            while (usedIndexes.has(colorIndex)) {
                colorIndex = (colorIndex + 5) % palette.length;
            }
            usedIndexes.add(colorIndex);
        } else {
            colorIndex = position % palette.length;
        }
        return palette[colorIndex];
    });
}

function updatePerformanceInsight() {
    const topActivity = document.getElementById('metric-top-activity');
    const topShareLabel = document.getElementById('metric-top-share');
    const insightShare = document.getElementById('performance-top-share');
    const insightBar = document.getElementById('performance-top-share-bar');
    const insightTitle = document.getElementById('performance-signal-title');
    const insightCopy = document.getElementById('performance-signal-copy');

    if (!topActivity || !insightTitle) return;

    const totals = cachedData.totals || [];
    const totalHours = totals.reduce((sum, item) => sum + Number(item.total_hours || 0), 0);
    const top = totals.reduce((best, item) => (
        !best || Number(item.total_hours || 0) > Number(best.total_hours || 0) ? item : best
    ), null);
    const share = top && totalHours > 0
        ? Math.round((Number(top.total_hours || 0) / totalHours) * 100)
        : 0;
    const trend = Number(window.latestPerformanceMetrics?.trend_percentage || 0);

    topActivity.textContent = top?.activity || 'No data yet';
    topShareLabel.textContent = top ? `${share}% of logged time` : 'No focus mix yet';
    if (insightShare) insightShare.textContent = `${share}%`;
    if (insightBar) insightBar.style.width = `${share}%`;

    if (!top) {
        insightTitle.textContent = 'Start with one honest log';
        insightCopy.textContent = 'A single focused session is enough to begin turning your days into a useful pattern.';
    } else if (trend > 0) {
        insightTitle.textContent = 'Momentum is building';
        insightCopy.textContent = `${top.activity} led this period at ${share}% of your logged time. Protect what is working and keep the next step clear.`;
    } else if (trend < 0) {
        insightTitle.textContent = 'A quieter period';
        insightCopy.textContent = `${top.activity} still held the most attention. Use Today to choose one small move that restores your pace.`;
    } else {
        insightTitle.textContent = 'Your pace is steady';
        insightCopy.textContent = `${top.activity} was your strongest focus at ${share}%. Consistency matters more than a dramatic spike.`;
    }
}

/**
 * Changes the chart type, updates UI toggle buttons (if they exist), and redraws.
 */
function setChartType(type) {
    if (!chartCopy[type]) return;
    currentChartType = type;
    updateChartCopy();
    
    // Safely update Toggle UI styles
    ['bar', 'doughnut', 'line'].forEach(t => {
        const btn = document.getElementById(`btn-chart-${t}`);
        if (btn) {
            if (t === type) {
                btn.className = "px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all bg-white shadow-sm text-brand pointer-events-none flex items-center gap-1.5";
                btn.setAttribute('aria-pressed', 'true');
            } else {
                btn.className = "px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-textMuted hover:text-textMain cursor-pointer flex items-center gap-1.5";
                btn.setAttribute('aria-pressed', 'false');
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
async function loadChartData(timeframe = currentTimeframe) {
    currentTimeframe = timeframe;
    const requestSequence = ++chartRequestSequence;
    if (chartRequestController) chartRequestController.abort();
    const requestController = new AbortController();
    chartRequestController = requestController;

    let didTimeout = false;
    const timeout = setTimeout(() => {
        didTimeout = true;
        requestController.abort();
    }, REPORT_REQUEST_TIMEOUT_MS);

    setChartStatus('loading', 'Loading report…', 'This should only take a moment.');

    try {
        const response = await fetch(`/api/analytics?timeframe=${timeframe}`, {
            signal: requestController.signal
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        if (requestSequence !== chartRequestSequence) return;
        
        if (!data || !data.totals || data.totals.length === 0) {
            cachedData = { totals: [], timeline: [] };
            renderEmptyChartState();
            updatePerformanceInsight();
            return;
        }

        // Cache the dual-payload data
        cachedData = data;
        
        updatePerformanceInsight();
        renderChart();
    } catch (error) {
        if (requestSequence !== chartRequestSequence) return;
        if (error.name === 'AbortError' && !didTimeout) return;

        console.error("Failed to load chart data:", error);
        setChartStatus(
            'error',
            didTimeout ? 'The report took too long' : 'The report could not load',
            didTimeout ? 'The request was stopped after 6 seconds. You can safely try again.' : 'Check the local server, then try again.'
        );
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Renders an empty state directly onto the canvas if no data exists.
 */
function renderEmptyChartState() {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;
    
    if (activityChart) {
        activityChart.destroy();
        activityChart = null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setChartStatus('empty', 'Nothing logged in this period', 'Add a time log below and this view will update automatically.');
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

    // Chart.js releases the old canvas context during destroy. Always destroy
    // first, then acquire a fresh context for the replacement instance.
    if (activityChart) {
        activityChart.destroy();
        activityChart = null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        setChartStatus('error', 'The chart could not start', 'Reload this page to reconnect the canvas.');
        return;
    }

    // ==========================================
    // PREMIUM GRADIENTS & COLORS
    // ==========================================
    
    // Smooth Area Gradient for the Line Chart (Now Brand Purple!)
    const lineGradient = ctx.createLinearGradient(0, 0, 0, 400);
    lineGradient.addColorStop(0, 'rgba(67, 24, 255, 0.4)'); // Soft purple wave
    lineGradient.addColorStop(1, 'rgba(67, 24, 255, 0.0)'); // Fades neatly into the background

    let chartLabels = [];
    let chartDatasets = [];
    const compactTotals = compactActivityTotals(cachedData.totals, currentChartType === 'bar' ? 8 : 7);
    const activityColors = colorsForActivities(compactTotals);
    const barGradients = activityColors.map(color => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color.solid);
        gradient.addColorStop(1, color.soft);
        return gradient;
    });
    const hoverGradients = activityColors.map(color => {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color.soft);
        gradient.addColorStop(1, color.solid);
        return gradient;
    });

    // ==========================================
    // DATA CONFIGURATION
    // ==========================================
    if (currentChartType === 'doughnut') {
        
        // 1. DOUGHNUT: Activity Breakdown
        chartLabels = compactTotals.map(item => item.activity);
        chartDatasets = [{
            label: 'Total Hours',
            data: compactTotals.map(item => item.total_hours),
            backgroundColor: activityColors.map(color => color.solid),
            hoverBackgroundColor: activityColors.map(color => color.soft),
            borderWidth: 4,
            borderColor: '#FFFFFF',
            hoverOffset: 6,
            cutout: '68%'
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
            pointRadius: currentTimeframe === 'daily' ? 2 : 4,
            pointHoverRadius: 6
        }];
        
    } else {
        
        // 3. BAR CHART: Activity Breakdown
        chartLabels = compactTotals.map(item => item.activity);
        chartDatasets = [{
            label: 'Total Hours',
            data: compactTotals.map(item => item.total_hours),
            // Map the dynamic gradients to each bar sequentially based on its index
            backgroundColor: compactTotals.map((_, i) => barGradients[i % barGradients.length]),
            hoverBackgroundColor: compactTotals.map((_, i) => hoverGradients[i % hoverGradients.length]),
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 42,
            categoryPercentage: 0.72,
            barPercentage: 0.84
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
            // A delayed resize can fire after a rapidly replaced chart has
            // already been destroyed. The fixed-height wrapper makes an
            // immediate resize both stable and safer.
            resizeDelay: 0,
            normalized: true,
            
            animation: {
                duration: 500,
                easing: 'easeOutQuart' 
            },

            interaction: {
                mode: 'index',
                intersect: false
            },
            
            plugins: {
                legend: { 
                    display: isDoughnut, // Only display legend for the ring chart
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        pointStyleWidth: 9,
                        boxWidth: 8,
                        padding: 14,
                        font: { family: "'Poppins', sans-serif", size: 11, weight: '500' },
                        color: '#626F9C'
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
                            const value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
                            if (isDoughnut) {
                                const total = context.dataset.data.reduce((sum, item) => sum + Number(item || 0), 0);
                                const share = total > 0 ? Math.round((Number(value) / total) * 100) : 0;
                                return ` ${context.label}: ${value} hrs (${share}%)`;
                            }
                            return ` ${value} hr${value !== 1 ? 's' : ''}`;
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
                        color: '#626F9C',
                        font: { family: "'Poppins', sans-serif", size: 11, weight: '500' },
                        padding: 10,
                        maxTicksLimit: 5,
                        callback: value => `${value}h`
                    }
                },
                x: {
                    display: !isDoughnut,
                    grid: { display: false, drawBorder: false },
                    ticks: { 
                        color: '#626F9C',
                        font: { family: "'Poppins', sans-serif", size: 11, weight: '600' },
                        padding: 8,
                        autoSkip: true,
                        maxRotation: 0,
                        minRotation: 0,
                        maxTicksLimit: currentTimeframe === 'daily' ? 8 : 12
                    }
                }
            }
        }
    });
    setChartStatus('hidden');
}

document.addEventListener("DOMContentLoaded", updateChartCopy);
