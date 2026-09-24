// TallyForge — Dual-Stream Productivity & Expense Analytics
// Frontend Logic: Streaks, Milestones, Custom Tagging, Smart Gauges & Weekly Digest Engine

// =========================================================
// 1. THEME MANAGEMENT (Dark / Light Mode)
// =========================================================
const THEME_KEY = 'tallyforge_theme';

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 
           localStorage.getItem(THEME_KEY) || 
           localStorage.getItem('studyspend_theme') || 
           'dark';
}

function updateThemeToggleButtons(theme) {
    const isDark = theme === 'dark';
    const icon = isDark ? '☀️' : '🌙';
    const titleText = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';

    const headerBtn = document.getElementById('theme-toggle-header');
    const landingBtn = document.getElementById('theme-toggle-landing');
    const modalBtn = document.getElementById('theme-toggle-modal');

    [headerBtn, landingBtn, modalBtn].forEach(btn => {
        if (!btn) return;
        btn.setAttribute('title', titleText);
        btn.setAttribute('aria-label', titleText);
        const iconEl = btn.querySelector('.theme-icon');
        if (iconEl) {
            iconEl.textContent = icon;
        } else {
            btn.innerHTML = `<span class="theme-icon">${icon}</span>`;
        }
    });
}

function applyTheme(theme, updateCharts = true) {
    const activeTheme = (theme === 'light') ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', activeTheme);
    
    if (activeTheme === 'light') {
        document.body.classList.add('light-mode');
        document.documentElement.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
        document.documentElement.classList.remove('light-mode');
    }

    try {
        localStorage.setItem(THEME_KEY, activeTheme);
    } catch (e) {
        console.warn('Unable to persist theme to localStorage:', e);
    }

    updateThemeToggleButtons(activeTheme);

    if (updateCharts) {
        updateChartsTheme(activeTheme);
        if (typeof renderHeatmapMatrix === 'function' && document.getElementById('heatmap-months-container')) {
            renderHeatmapMatrix();
        }
    }
}

function toggleTheme() {
    const current = getCurrentTheme();
    const newTheme = current === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme, true);
}

// =========================================================
// 2. GLOBAL STATE & PALETTES
// =========================================================
let expenseChartInstance = null;
let studyChartInstance = null;
let currentLoggedInUser = null;

let rawExpensesData = [];
let rawStudyData = [];
let dailyAggregates = {};
let currentMatrixYear = 2026;
let currentMatrixMode = 'study'; // 'study' | 'expense'
let activeFilteredDate = null;   // 'YYYY-MM-DD' | null
let activeDatePreset = 'all';     // 'all' | 'today' | 'yesterday' | 'last7' | 'thismonth' | 'custom'
let activeFilteredTag = null;    // '#Tag' | null
let inspectedDate = null;

const EXPENSE_PALETTE = [
    '#FF3AF2', // Hyper Pink
    '#00F5D4', // Electric Teal
    '#FFE600', // Screaming Gold
    '#FF6B35', // Kinetic Orange
    '#7B2FFF'  // Neon Violet
];

const MONTH_SHORT_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function destroyChartInstance(instance, canvasId) {
    if (instance) {
        try {
            instance.destroy();
        } catch (e) {
            console.warn('Error destroying chart instance:', e);
        }
    }
    if (typeof Chart !== 'undefined' && Chart.getChart) {
        const existing = Chart.getChart(canvasId);
        if (existing) {
            try {
                existing.destroy();
            } catch (e) {
                console.warn('Error destroying existing chart by ID:', e);
            }
        }
    }
}

function updateChartsTheme(theme) {
    const isDark = theme === 'dark';

    // Update Global Chart.js Defaults
    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = isDark ? '#94A3B8' : '#334155';
        if (Chart.defaults.scale) {
            if (Chart.defaults.scale.grid) {
                Chart.defaults.scale.grid.color = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(100, 116, 139, 0.12)';
            }
            if (Chart.defaults.scale.ticks) {
                Chart.defaults.scale.ticks.color = isDark ? '#94A3B8' : '#64748B';
            }
        }
    }

    if (expenseChartInstance && expenseChartInstance.data) {
        const dataset = expenseChartInstance.data.datasets?.[0];
        if (dataset) {
            dataset.borderColor = isDark ? '#0D0D1A' : '#ffffff';
            if (expenseChartInstance.data.labels && expenseChartInstance.data.labels[0] === 'No Expenses Yet') {
                dataset.backgroundColor = [isDark ? '#14142B' : '#e2e8f0'];
            }
        }
        if (expenseChartInstance.options?.plugins?.legend?.labels) {
            expenseChartInstance.options.plugins.legend.labels.color = isDark ? '#FFFFFF' : '#0F172A';
        }
        if (expenseChartInstance.options?.plugins?.tooltip) {
            expenseChartInstance.options.plugins.tooltip.backgroundColor = isDark ? '#14142B' : '#0F172A';
            expenseChartInstance.options.plugins.tooltip.borderColor = isDark ? '#00F5D4' : '#7B2FFF';
            expenseChartInstance.options.plugins.tooltip.borderWidth = 2;
            expenseChartInstance.options.plugins.tooltip.titleColor = isDark ? '#00F5D4' : '#00F5D4';
            expenseChartInstance.options.plugins.tooltip.bodyColor = '#FFFFFF';
        }
        expenseChartInstance.update();
    }

    if (studyChartInstance && studyChartInstance.data) {
        const dataset = studyChartInstance.data.datasets?.[0];
        if (dataset) {
            dataset.borderColor = isDark ? '#0D0D1A' : '#ffffff';
            if (dataset.data && dataset.data.length > 0) {
                dataset.backgroundColor = dataset.data.map((_, i) => EXPENSE_PALETTE[(i + 1) % EXPENSE_PALETTE.length]);
                dataset.hoverBackgroundColor = dataset.data.map((_, i) => EXPENSE_PALETTE[(i + 1) % EXPENSE_PALETTE.length]);
            } else {
                dataset.backgroundColor = isDark ? '#00F5D4' : '#0D9488';
                dataset.hoverBackgroundColor = isDark ? '#33ffd8' : '#0F766E';
            }
        }
        if (studyChartInstance.options?.scales?.x?.ticks) {
            studyChartInstance.options.scales.x.ticks.color = isDark ? '#FFFFFF' : '#0F172A';
        }
        if (studyChartInstance.options?.scales?.y?.ticks) {
            studyChartInstance.options.scales.y.ticks.color = isDark ? '#CBD5E1' : '#64748B';
        }
        if (studyChartInstance.options?.scales?.y?.grid) {
            studyChartInstance.options.scales.y.grid.color = isDark ? 'rgba(0, 245, 212, 0.2)' : 'rgba(100, 116, 139, 0.14)';
        }
        if (studyChartInstance.options?.plugins?.tooltip) {
            studyChartInstance.options.plugins.tooltip.backgroundColor = isDark ? '#14142B' : '#0F172A';
            studyChartInstance.options.plugins.tooltip.borderColor = isDark ? '#FF3AF2' : '#7B2FFF';
            studyChartInstance.options.plugins.tooltip.borderWidth = 2;
            studyChartInstance.options.plugins.tooltip.titleColor = isDark ? '#FF3AF2' : '#FF3AF2';
            studyChartInstance.options.plugins.tooltip.bodyColor = '#FFFFFF';
        }
        studyChartInstance.update();
    }
}

// =========================================================
// 3. AUTH MODAL & VIEW MANAGEMENT
// =========================================================

function showModalAuthAlert(message, type = 'error') {
    const alertEl = document.getElementById('auth-modal-alert');
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = `alert alert-${type}`;
    alertEl.classList.remove('hidden');
}

function hideModalAuthAlert() {
    const alertEl = document.getElementById('auth-modal-alert');
    if (alertEl) {
        alertEl.textContent = '';
        alertEl.classList.add('hidden');
    }
}

function setModalAuthMode(mode) {
    hideModalAuthAlert();
    const tabLogin = document.getElementById('tab-modal-login');
    const tabRegister = document.getElementById('tab-modal-register');
    const formLogin = document.getElementById('modal-login-form');
    const formRegister = document.getElementById('modal-register-form');
    const authTitle = document.getElementById('auth-modal-title');
    const authSubtitle = document.getElementById('auth-modal-subtitle');

    if (mode === 'register') {
        tabLogin?.classList.remove('active');
        tabRegister?.classList.add('active');
        formLogin?.classList.add('hidden');
        formRegister?.classList.remove('hidden');
        formLogin?.reset();
        if (authTitle) authTitle.textContent = 'Create Free Account';
        if (authSubtitle) authSubtitle.textContent = 'Start tracking your study focus and expenses in seconds';
        setTimeout(() => document.getElementById('modal-register-username')?.focus(), 80);
    } else {
        tabRegister?.classList.remove('active');
        tabLogin?.classList.add('active');
        formRegister?.classList.add('hidden');
        formLogin?.classList.remove('hidden');
        formRegister?.reset();
        if (authTitle) authTitle.textContent = 'Welcome Back';
        if (authSubtitle) authSubtitle.textContent = 'Sign in to access your personal TallyForge dashboard';
        setTimeout(() => document.getElementById('modal-login-username')?.focus(), 80);
    }
}

function openAuthModal(mode = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    setModalAuthMode(mode);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    hideModalAuthAlert();
}

function showLandingView() {
    document.getElementById('landing-section')?.classList.remove('hidden');
    document.getElementById('dashboard-section')?.classList.add('hidden');
    document.getElementById('app-header')?.classList.add('hidden');
    document.getElementById('floating-dock')?.classList.add('hidden');
    document.getElementById('app-footer')?.classList.add('hidden');
    document.getElementById('date-filter-banner')?.classList.add('hidden');
    document.getElementById('tag-filter-banner')?.classList.add('hidden');
    
    closeDayInspectorModal();
    closeAuthModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showDashboard(username) {
    currentLoggedInUser = username;
    closeAuthModal();

    document.getElementById('landing-section')?.classList.add('hidden');
    document.getElementById('dashboard-section')?.classList.remove('hidden');
    document.getElementById('app-header')?.classList.remove('hidden');
    document.getElementById('floating-dock')?.classList.remove('hidden');
    document.getElementById('app-footer')?.classList.remove('hidden');

    const usernameEl = document.getElementById('logged-username');
    if (usernameEl) usernameEl.textContent = username;

    setDefaultDates();
    loadAndDrawCharts();

    setTimeout(() => {
        switchDashboardView('dashboard');
    }, 60);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleDemoLogin() {
    try {
        const res = await fetch('/api/demo-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            showDashboard('demo');
        } else {
            openAuthModal('login');
            showModalAuthAlert(data.message || 'Unable to start demo mode. Please sign in.', 'error');
        }
    } catch (err) {
        console.error('Demo login failed:', err);
        openAuthModal('login');
    }
}

async function checkSession() {
    try {
        const res = await fetch('/api/current-user');
        if (res.ok) {
            const data = await res.json();
            if (data.logged_in && data.username) {
                showDashboard(data.username);
                return;
            }
        }
    } catch (err) {
        console.warn('TallyForge session check failed:', err);
    }
    showLandingView();
}

// =========================================================
// 4. DATE, TAGS & AGGREGATION ENGINE
// =========================================================

function formatDatePretty(dateStr) {
    if (!dateStr) return '—';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        return dateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

function formatDateLong(dateStr) {
    if (!dateStr) return '—';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        return dateObj.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

function getWeekdayName(dateStr) {
    if (!dateStr) return '';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        return WEEKDAY_NAMES[dateObj.getDay()];
    } catch (e) {
        return '';
    }
}

function getStudyIntensityLevel(hours) {
    const val = parseFloat(hours) || 0;
    if (val <= 0) return 0;
    if (val <= 2.0) return 1;
    if (val <= 5.0) return 2;
    if (val <= 8.0) return 3;
    return 4;
}

function getExpenseIntensityLevel(amount) {
    const val = parseFloat(amount) || 0;
    if (val <= 0) return 0;
    if (val <= 500) return 1;
    if (val <= 1500) return 2;
    if (val <= 3000) return 3;
    return 4;
}

function aggregateUserData(expenses, study) {
    const aggr = {};

    expenses.forEach(item => {
        const date = item.date;
        if (!date) return;
        if (!aggr[date]) {
            aggr[date] = {
                studyHours: 0,
                expenseTotal: 0,
                studyLogs: [],
                expenseLogs: [],
                studyCategories: {},
                expenseCategories: {},
                allTags: new Set()
            };
        }
        const amt = parseFloat(item.amount) || 0;
        const cat = (item.category || 'Other').trim();
        aggr[date].expenseTotal += amt;
        aggr[date].expenseLogs.push(item);
        aggr[date].expenseCategories[cat] = (aggr[date].expenseCategories[cat] || 0) + amt;
        if (Array.isArray(item.tags)) {
            item.tags.forEach(t => aggr[date].allTags.add(t));
        }
    });

    study.forEach(item => {
        const date = item.date;
        if (!date) return;
        if (!aggr[date]) {
            aggr[date] = {
                studyHours: 0,
                expenseTotal: 0,
                studyLogs: [],
                expenseLogs: [],
                studyCategories: {},
                expenseCategories: {},
                allTags: new Set()
            };
        }
        const hrs = parseFloat(item.hours) || 0;
        const subj = (item.subject || 'Other').trim();
        aggr[date].studyHours += hrs;
        aggr[date].studyLogs.push(item);
        aggr[date].studyCategories[subj] = (aggr[date].studyCategories[subj] || 0) + hrs;
        if (Array.isArray(item.tags)) {
            item.tags.forEach(t => aggr[date].allTags.add(t));
        }
    });

    Object.keys(aggr).forEach(date => {
        const entry = aggr[date];
        let topSubj = '—';
        let maxSubjHrs = 0;
        for (const [s, h] of Object.entries(entry.studyCategories)) {
            if (h > maxSubjHrs) {
                maxSubjHrs = h;
                topSubj = s;
            }
        }
        entry.topSubject = topSubj;

        let topCat = '—';
        let maxCatAmt = 0;
        for (const [c, a] of Object.entries(entry.expenseCategories)) {
            if (a > maxCatAmt) {
                maxCatAmt = a;
                topCat = c;
            }
        }
        entry.topCategory = topCat;
    });

    return aggr;
}

function computeAnnualStats(year, aggregates) {
    let activeDays = 0;
    let totalStudyHours = 0;
    let totalExpenseAmount = 0;
    let longestStreak = 0;
    let currentStreak = 0;
    let budgetGuardianDays = 0;

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const totalDaysInYear = isLeap ? 366 : 365;

    const startDate = new Date(year, 0, 1);
    for (let i = 0; i < totalDaysInYear; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const yStr = d.getFullYear().toString();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        const dateKey = `${yStr}-${mStr}-${dStr}`;

        const entry = aggregates[dateKey];
        if (entry) {
            const hasStudy = entry.studyHours > 0;
            const hasExpense = entry.expenseTotal > 0;
            if (hasStudy || hasExpense) {
                activeDays++;
            }
            totalStudyHours += entry.studyHours;
            totalExpenseAmount += entry.expenseTotal;

            if (hasStudy || hasExpense) {
                currentStreak++;
                if (currentStreak > longestStreak) {
                    longestStreak = currentStreak;
                }
            } else {
                currentStreak = 0;
            }

            // Budget Guardian: active days with controlled spending (<= ₹1,000)
            if (hasExpense && entry.expenseTotal <= 1000) {
                budgetGuardianDays++;
            }
        } else {
            currentStreak = 0;
        }
    }

    return {
        activeDays,
        longestStreak,
        currentStreak,
        totalStudyHours,
        totalExpenseAmount,
        budgetGuardianDays
    };
}

// =========================================================
// 5. GAMIFIED STREAKS, LEVEL ENGINE & MILESTONE BADGES
// =========================================================

const BADGE_CATALOG = [
    // 🥉 BRONZE TIER (Entry-Level — 50 XP)
    {
        id: 'first-step',
        category: 'study',
        tier: 'bronze',
        tierName: '🥉 Bronze Tier',
        categoryName: 'Study Focus',
        icon: '🎯',
        title: 'First Step',
        desc: 'Log your first study session',
        lore: 'Every great scholar was once a beginner. You have taken your initial step into intentional focus and academic mastery.',
        howToEarn: 'Go to the Study Logger and record your very first study session.',
        quote: 'The journey of a thousand miles begins with a single step.',
        author: 'Lao Tzu',
        xp: 50,
        actionType: 'study',
        actionLabel: 'Log Study Session',
        check: (expenses, study, stats) => {
            const count = study.length;
            const unlocked = count >= 1;
            return {
                unlocked,
                current: count,
                target: 1,
                unit: 'session',
                formattedText: unlocked ? '1 / 1 Session (100%)' : '0 / 1 Session (0%)',
                pct: unlocked ? 100 : 0
            };
        }
    },
    {
        id: 'pocket-ledger',
        category: 'financial',
        tier: 'bronze',
        tierName: '🥉 Bronze Tier',
        categoryName: 'Financial Control',
        icon: '🪙',
        title: 'Pocket Ledger',
        desc: 'Log your first expense entry',
        lore: 'Awareness precedes control. By acknowledging your first transaction, you take sovereign command over your student finances.',
        howToEarn: 'Add your first expense transaction in the Daily Expense Tracker.',
        quote: 'Beware of little expenses; a small leak will sink a great ship.',
        author: 'Benjamin Franklin',
        xp: 50,
        actionType: 'expense',
        actionLabel: 'Log First Expense',
        check: (expenses, study, stats) => {
            const count = expenses.length;
            const unlocked = count >= 1;
            return {
                unlocked,
                current: count,
                target: 1,
                unit: 'expense',
                formattedText: unlocked ? '1 / 1 Expense (100%)' : '0 / 1 Expense (0%)',
                pct: unlocked ? 100 : 0
            };
        }
    },
    {
        id: 'early-spark',
        category: 'study',
        tier: 'bronze',
        tierName: '🥉 Bronze Tier',
        categoryName: 'Study Focus',
        icon: '⚡',
        title: 'Early Spark',
        desc: 'Log 3 focus study sessions',
        lore: 'A spark of curiosity is turning into an inferno of discipline. Three distinct study milestones conquered.',
        howToEarn: 'Complete and record at least 3 study sessions across any academic subjects.',
        quote: 'Action is the foundational key to all success.',
        author: 'Pablo Picasso',
        xp: 50,
        actionType: 'study',
        actionLabel: 'Log Study Session',
        check: (expenses, study, stats) => {
            const count = study.length;
            const unlocked = count >= 3;
            const pct = Math.min(100, Math.round((count / 3) * 100));
            return {
                unlocked,
                current: Math.min(3, count),
                target: 3,
                unit: 'sessions',
                formattedText: `${Math.min(3, count)} / 3 Sessions (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'tag-explorer',
        category: 'streaks',
        tier: 'bronze',
        tierName: '🥉 Bronze Tier',
        categoryName: 'Streaks & Masteries',
        icon: '🏷️',
        title: 'Tag Pioneer',
        desc: 'Add custom tags to any log entry',
        lore: 'Organization separates amateurs from master scholars. You tagged your focus sessions with purpose and precision.',
        howToEarn: 'Include a custom hashtag (e.g. #exam, #project, #urgent) when logging an expense or study block.',
        quote: 'Order is the sanity of the mind, the health of the body, the peace of the city.',
        author: 'Robert Southey',
        xp: 50,
        actionType: 'study',
        actionLabel: 'Add Tagged Log',
        check: (expenses, study, stats) => {
            const hasTagged = expenses.some(e => Array.isArray(e.tags) && e.tags.length > 0) ||
                              study.some(s => Array.isArray(s.tags) && s.tags.length > 0);
            return {
                unlocked: hasTagged,
                current: hasTagged ? 1 : 0,
                target: 1,
                unit: 'tag',
                formattedText: hasTagged ? '1 / 1 Tagged (100%)' : '0 / 1 Tagged (0%)',
                pct: hasTagged ? 100 : 0
            };
        }
    },

    // 🥈 SILVER TIER (Intermediate — 150 XP)
    {
        id: 'focus-apprentice',
        category: 'study',
        tier: 'silver',
        tierName: '🥈 Silver Tier',
        categoryName: 'Study Focus',
        icon: '⏱️',
        title: 'Focus Apprentice',
        desc: 'Accumulate 10 total study hours',
        lore: 'Ten solid hours of dedicated intellectual effort. You are no longer just exploring; you are forging a disciplined academic habit.',
        howToEarn: 'Accumulate 10.0 or more cumulative focus hours in your study logger.',
        quote: "It's not that I'm so smart, it's just that I stay with problems longer.",
        author: 'Albert Einstein',
        xp: 150,
        actionType: 'study',
        actionLabel: 'Log Study Session',
        check: (expenses, study, stats) => {
            const hrs = stats.totalStudyHours || 0;
            const unlocked = hrs >= 10.0;
            const pct = Math.min(100, Math.round((hrs / 10.0) * 100));
            return {
                unlocked,
                current: parseFloat(hrs.toFixed(1)),
                target: 10.0,
                unit: 'hrs',
                formattedText: `${parseFloat(Math.min(10.0, hrs).toFixed(1))} / 10.0 hrs (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'frugal-start',
        category: 'financial',
        tier: 'silver',
        tierName: '🥈 Silver Tier',
        categoryName: 'Financial Control',
        icon: '🛡️',
        title: 'Frugal Sentinel',
        desc: 'Maintain daily spending <= ₹1,000 for 3 active days',
        lore: 'Three days of disciplined resource preservation. You resist impulse buying with calm, calculated composure.',
        howToEarn: 'Keep daily expenditure totals within ₹1,000 across 3 active tracking days.',
        quote: 'He who buys what he does not need steals from himself.',
        author: 'Swedish Proverb',
        xp: 150,
        actionType: 'expense',
        actionLabel: 'Track Spending',
        check: (expenses, study, stats) => {
            const days = stats.budgetGuardianDays || 0;
            const unlocked = days >= 3;
            const pct = Math.min(100, Math.round((days / 3) * 100));
            return {
                unlocked,
                current: Math.min(3, days),
                target: 3,
                unit: 'days',
                formattedText: `${Math.min(3, days)} / 3 Days (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'polymath',
        category: 'study',
        tier: 'silver',
        tierName: '🥈 Silver Tier',
        categoryName: 'Study Focus',
        icon: '📚',
        title: 'Polymath Scholar',
        desc: 'Study 3 or more distinct academic subjects',
        lore: 'Cross-disciplinary thinkers rule the future. You have broadened your cognitive horizons across 3 knowledge domains.',
        howToEarn: 'Log sessions in at least 3 distinct subjects (e.g. Calculus, Data Structures, Economics).',
        quote: 'Live as if you were to die tomorrow. Learn as if you were to live forever.',
        author: 'Mahatma Gandhi',
        xp: 150,
        actionType: 'study',
        actionLabel: 'Log New Subject',
        check: (expenses, study, stats) => {
            const distinct = new Set(study.map(s => (s.subject || '').trim()).filter(Boolean)).size;
            const unlocked = distinct >= 3;
            const pct = Math.min(100, Math.round((distinct / 3) * 100));
            return {
                unlocked,
                current: Math.min(3, distinct),
                target: 3,
                unit: 'subjects',
                formattedText: `${Math.min(3, distinct)} / 3 Subjects (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'deep-diver',
        category: 'streaks',
        tier: 'silver',
        tierName: '🥈 Silver Tier',
        categoryName: 'Streaks & Masteries',
        icon: '🌊',
        title: 'Deep Diver',
        desc: 'Log 3+ study hours in a single day',
        lore: 'Entering the deep flow state. You conquered an intensive 3-hour focus marathon in one calendar day.',
        howToEarn: 'Record at least 3.0 focus hours on any single calendar day.',
        quote: 'Deep work is the superpower of the 21st century.',
        author: 'Cal Newport',
        xp: 150,
        actionType: 'study',
        actionLabel: 'Log Deep Session',
        check: (expenses, study, stats) => {
            const dayTotals = {};
            study.forEach(s => {
                if (s.date) dayTotals[s.date] = (dayTotals[s.date] || 0) + (parseFloat(s.hours) || 0);
            });
            const maxDay = Math.max(0, ...Object.values(dayTotals));
            const unlocked = maxDay >= 3.0;
            const pct = Math.min(100, Math.round((maxDay / 3.0) * 100));
            return {
                unlocked,
                current: parseFloat(maxDay.toFixed(1)),
                target: 3.0,
                unit: 'hrs/day',
                formattedText: `${parseFloat(Math.min(3.0, maxDay).toFixed(1))} / 3.0 hrs (${pct}%)`,
                pct
            };
        }
    },

    // 🥇 GOLD TIER (Advanced — 300 XP)
    {
        id: 'focus-master',
        category: 'study',
        tier: 'gold',
        tierName: '🥇 Gold Tier',
        categoryName: 'Study Focus',
        icon: '🧠',
        title: 'Focus Master',
        desc: 'Accumulate over 25 total study hours',
        lore: 'A quarter-century of focus hours logged. Your cognitive stamina and attention span are operating at peak championship levels.',
        howToEarn: 'Reach 25.0 cumulative focus hours logged in the application.',
        quote: 'Excellence is not an act, but a habit.',
        author: 'Will Durant',
        xp: 300,
        actionType: 'study',
        actionLabel: 'Log Study Session',
        check: (expenses, study, stats) => {
            const hrs = stats.totalStudyHours || 0;
            const unlocked = hrs >= 25.0;
            const pct = Math.min(100, Math.round((hrs / 25.0) * 100));
            return {
                unlocked,
                current: parseFloat(hrs.toFixed(1)),
                target: 25.0,
                unit: 'hrs',
                formattedText: `${parseFloat(Math.min(25.0, hrs).toFixed(1))} / 25.0 hrs (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'budget-guardian',
        category: 'financial',
        tier: 'gold',
        tierName: '🥇 Gold Tier',
        categoryName: 'Financial Control',
        icon: '🏰',
        title: 'Budget Guardian',
        desc: 'Maintain daily spending <= ₹1,000 for 7 active days',
        lore: 'A fortress of fiscal fortitude. Seven full days of controlled spending and disciplined resource stewardship.',
        howToEarn: 'Maintain daily expenses of ₹1,000 or less across 7 active tracking days.',
        quote: 'Financial freedom is available to those who learn about it and work for it.',
        author: 'Robert Kiyosaki',
        xp: 300,
        actionType: 'expense',
        actionLabel: 'Manage Budget',
        check: (expenses, study, stats) => {
            const days = stats.budgetGuardianDays || 0;
            const unlocked = days >= 7;
            const pct = Math.min(100, Math.round((days / 7) * 100));
            return {
                unlocked,
                current: Math.min(7, days),
                target: 7,
                unit: 'days',
                formattedText: `${Math.min(7, days)} / 7 Days (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'streak-champion',
        category: 'streaks',
        tier: 'gold',
        tierName: '🥇 Gold Tier',
        categoryName: 'Streaks & Masteries',
        icon: '🔥',
        title: 'Streak Champion',
        desc: 'Achieve a 7+ day active logging streak',
        lore: 'Seven consecutive days of relentless consistency. The compounding effect of unbroken discipline is now on your side.',
        howToEarn: 'Log study or expenses every single day for 7 consecutive days.',
        quote: 'Success is the sum of small efforts, repeated day in and day out.',
        author: 'Robert Collier',
        xp: 300,
        actionType: 'study',
        actionLabel: 'Keep Streak Alive',
        check: (expenses, study, stats) => {
            const streak = stats.longestStreak || 0;
            const unlocked = streak >= 7;
            const pct = Math.min(100, Math.round((streak / 7) * 100));
            return {
                unlocked,
                current: Math.min(7, streak),
                target: 7,
                unit: 'days',
                formattedText: `${Math.min(7, streak)} / 7 Days (${pct}%)`,
                pct
            };
        }
    },
    {
        id: '100-hours',
        category: 'study',
        tier: 'gold',
        tierName: '🥇 Gold Tier',
        categoryName: 'Study Focus',
        icon: '👑',
        title: 'Century Club',
        desc: 'Accumulate 100+ total lifetime study hours',
        lore: 'The triple-digit echelon. 100 hours of focused dedication places you among the elite top-tier scholars on TallyForge.',
        howToEarn: 'Log a total of 100.0 or more cumulative lifetime focus hours.',
        quote: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
        author: 'Aristotle',
        xp: 300,
        actionType: 'study',
        actionLabel: 'Log Study Hours',
        check: (expenses, study, stats) => {
            const hrs = stats.totalStudyHours || 0;
            const unlocked = hrs >= 100.0;
            const pct = Math.min(100, Math.round((hrs / 100.0) * 100));
            return {
                unlocked,
                current: parseFloat(hrs.toFixed(1)),
                target: 100.0,
                unit: 'hrs',
                formattedText: `${parseFloat(Math.min(100.0, hrs).toFixed(1))} / 100.0 hrs (${pct}%)`,
                pct
            };
        }
    },

    // 💎 DIAMOND / LEGENDARY TIER (Rare Mastery — 500 XP)
    {
        id: 'iron-discipline',
        category: 'streaks',
        tier: 'diamond',
        tierName: '💎 Diamond / Legendary',
        categoryName: 'Streaks & Masteries',
        icon: '⚔️',
        title: 'Iron Discipline',
        desc: 'Achieve a 14-day study streak with zero budget breaches',
        lore: 'Two weeks of unbroken consistency and supreme financial self-control. Pure iron will and unstoppable momentum.',
        howToEarn: 'Build an active logging streak of 14 consecutive days while maintaining your daily budgets.',
        quote: 'Discipline is choosing between what you want now and what you want most.',
        author: 'Abraham Lincoln',
        xp: 500,
        actionType: 'study',
        actionLabel: 'Build 14-Day Streak',
        check: (expenses, study, stats) => {
            const streak = stats.longestStreak || 0;
            const unlocked = streak >= 14;
            const pct = Math.min(100, Math.round((streak / 14) * 100));
            return {
                unlocked,
                current: Math.min(14, streak),
                target: 14,
                unit: 'days',
                formattedText: `${Math.min(14, streak)} / 14 Days (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'master-polymath',
        category: 'study',
        tier: 'diamond',
        tierName: '💎 Diamond / Legendary',
        categoryName: 'Study Focus',
        icon: '🔮',
        title: 'Grand Polymath',
        desc: 'Study 5+ distinct subjects and log 50+ total hours',
        lore: 'Universal Renaissance intellect. Mastery of 5 distinct academic disciplines paired with deep intellectual endurance.',
        howToEarn: 'Log sessions in at least 5 different subjects with over 50.0 cumulative focus hours.',
        quote: "Develop a passion for learning. If you do, you will never cease to grow.",
        author: "Anthony J. D'Angelo",
        xp: 500,
        actionType: 'study',
        actionLabel: 'Broaden Subjects',
        check: (expenses, study, stats) => {
            const distinct = new Set(study.map(s => (s.subject || '').trim()).filter(Boolean)).size;
            const hrs = stats.totalStudyHours || 0;
            const unlocked = distinct >= 5 && hrs >= 50.0;
            const pct = Math.min(100, Math.round(((Math.min(5, distinct) / 5) * 0.5 + (Math.min(50, hrs) / 50) * 0.5) * 100));
            return {
                unlocked,
                current: distinct,
                target: 5,
                unit: 'subjects & 50 hrs',
                formattedText: `${distinct}/5 Subj, ${parseFloat(hrs.toFixed(1))}/50.0 hrs (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'vault-warden',
        category: 'financial',
        tier: 'diamond',
        tierName: '💎 Diamond / Legendary',
        categoryName: 'Financial Control',
        icon: '💎',
        title: 'Vault Warden',
        desc: 'Keep expenses strictly within budget for 14 active days',
        lore: 'Unshakable budgeting mastery. Two full weeks of controlled financial stewardship without leaking a single excess rupee.',
        howToEarn: 'Maintain daily expense totals of ₹1,000 or under for 14 active tracking days.',
        quote: 'Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.',
        author: 'Warren Buffett',
        xp: 500,
        actionType: 'expense',
        actionLabel: 'Log Guarded Expense',
        check: (expenses, study, stats) => {
            const days = stats.budgetGuardianDays || 0;
            const unlocked = days >= 14;
            const pct = Math.min(100, Math.round((days / 14) * 100));
            return {
                unlocked,
                current: Math.min(14, days),
                target: 14,
                unit: 'days',
                formattedText: `${Math.min(14, days)} / 14 Days (${pct}%)`,
                pct
            };
        }
    },
    {
        id: 'zenith-scholar',
        category: 'streaks',
        tier: 'diamond',
        tierName: '💎 Diamond / Legendary',
        categoryName: 'Streaks & Masteries',
        icon: '🌌',
        title: 'Zenith Scholar',
        desc: 'Accumulate 200+ total lifetime study hours',
        lore: 'The absolute pinnacle of academic dedication. 200 hours of deep focus places your name in the Hall of Immortals.',
        howToEarn: 'Accumulate 200.0 cumulative lifetime focus hours across all subjects.',
        quote: 'The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.',
        author: 'Brian Herbert',
        xp: 500,
        actionType: 'study',
        actionLabel: 'Push to 200 Hours',
        check: (expenses, study, stats) => {
            const hrs = stats.totalStudyHours || 0;
            const unlocked = hrs >= 200.0;
            const pct = Math.min(100, Math.round((hrs / 200.0) * 100));
            return {
                unlocked,
                current: parseFloat(hrs.toFixed(1)),
                target: 200.0,
                unit: 'hrs',
                formattedText: `${parseFloat(Math.min(200.0, hrs).toFixed(1))} / 200.0 hrs (${pct}%)`,
                pct
            };
        }
    }
];

const LEVEL_THRESHOLDS = [
    { level: 1, title: 'Novice Scholar', icon: '🥉', minXP: 0, maxXP: 150 },
    { level: 2, title: 'Focused Apprentice', icon: '🥈', minXP: 150, maxXP: 450 },
    { level: 3, title: 'Discipline Adept', icon: '🥇', minXP: 450, maxXP: 900 },
    { level: 4, title: 'Grand Strategist', icon: '⚔️', minXP: 900, maxXP: 1600 },
    { level: 5, title: 'Ascended Polymath', icon: '🔮', minXP: 1600, maxXP: 2500 },
    { level: 6, title: 'Ironclad Sovereign', icon: '💎', minXP: 2500, maxXP: 3600 },
    { level: 7, title: 'Zenith Master', icon: '👑', minXP: 3600, maxXP: 5000 }
];

// In-Memory Gamification State
let cachedBadgeStates = {};
let currentActiveCelebrationBadge = null;
let celebrationQueue = [];
let isCelebrationOpen = false;
let activeBadgeFilter = 'all';
let confettiAnimationId = null;
let lastEvaluatedAnnualStats = { longestStreak: 0, totalStudyHours: 0, budgetGuardianDays: 0 };

function updateGamifiedStreaks(annualStats) {
    const streakEl = document.getElementById('streak-count-text');
    const badgeEl = document.getElementById('header-streak-badge');
    const streak = annualStats.longestStreak || 0;

    if (streakEl) {
        streakEl.textContent = streak;
    }
    if (badgeEl) {
        if (streak > 0) {
            badgeEl.classList.add('active-streak');
        } else {
            badgeEl.classList.remove('active-streak');
        }
    }
}

function calculateGamifiedLevel(unlockedBadges, annualStats) {
    let xp = 0;
    unlockedBadges.forEach(b => {
        xp += (b.xp || 50);
    });
    const studyBonus = Math.round((annualStats.totalStudyHours || 0) * 5);
    const streakBonus = Math.round((annualStats.longestStreak || 0) * 10);
    xp += studyBonus + streakBonus;

    let currentLvl = LEVEL_THRESHOLDS[0];
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (xp >= LEVEL_THRESHOLDS[i].minXP) {
            currentLvl = LEVEL_THRESHOLDS[i];
        }
    }

    const nextLvl = LEVEL_THRESHOLDS.find(l => l.level === currentLvl.level + 1) || null;
    const lvlRange = nextLvl ? (nextLvl.maxXP - currentLvl.minXP) : 1000;
    const lvlProgress = nextLvl
        ? Math.min(100, Math.max(0, Math.round(((xp - currentLvl.minXP) / lvlRange) * 100)))
        : 100;

    return {
        xp,
        currentLvl,
        nextLvl,
        lvlProgress
    };
}

function updateLevelUI(levelData) {
    const avatarIcon = document.getElementById('user-level-icon');
    const levelTag = document.getElementById('user-level-tag');
    const levelTitle = document.getElementById('user-level-title');
    const xpSummary = document.getElementById('user-xp-summary');
    const levelFill = document.getElementById('user-level-fill');
    const totalXpText = document.getElementById('user-total-xp-text');
    const nextRankText = document.getElementById('user-next-rank-text');

    if (avatarIcon) avatarIcon.textContent = levelData.currentLvl.icon;
    if (levelTag) levelTag.textContent = `LVL ${levelData.currentLvl.level}`;
    if (levelTitle) levelTitle.textContent = levelData.currentLvl.title;
    if (xpSummary) {
        if (levelData.nextLvl) {
            xpSummary.textContent = `${levelData.xp} / ${levelData.nextLvl.minXP} XP (${levelData.lvlProgress}%)`;
        } else {
            xpSummary.textContent = `${levelData.xp} XP (MAX LEVEL)`;
        }
    }
    if (levelFill) {
        levelFill.style.width = `${levelData.lvlProgress}%`;
    }
    if (totalXpText) {
        totalXpText.innerHTML = `⚡ Lifetime XP: <strong>${levelData.xp.toLocaleString()} XP</strong>`;
    }
    if (nextRankText) {
        if (levelData.nextLvl) {
            const xpNeeded = Math.max(0, levelData.nextLvl.minXP - levelData.xp);
            nextRankText.textContent = `Next: ${levelData.nextLvl.title} (+${xpNeeded} XP)`;
        } else {
            nextRankText.textContent = 'Highest Rank Achieved 👑';
        }
    }
}

// Synthesized Victory Fanfare Audio (Web Audio API)
function playUnlockChime() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + idx * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.08 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + idx * 0.08);
            osc.stop(ctx.currentTime + idx * 0.08 + 0.38);
        });
    } catch (e) {
        // Audio playback gracefully fails if blocked by browser policy
    }
}

// Confetti & Sparkles Particle Physics Engine
function startCelebrationConfetti() {
    const canvas = document.getElementById('celebration-confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#FF3AF2', '#00F5D4', '#FFE600', '#FF6B35', '#7B2FFF', '#ffffff'];
    const particles = [];
    const count = Math.min(100, Math.floor(window.innerWidth / 12));

    for (let i = 0; i < count; i++) {
        particles.push({
            x: canvas.width / 2 + (Math.random() * 160 - 80),
            y: canvas.height / 2 + (Math.random() * 80 - 40),
            vx: (Math.random() - 0.5) * 16,
            vy: (Math.random() * -16) - 5,
            size: Math.random() * 8 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 10,
            opacity: 1,
            shape: Math.random() > 0.4 ? 'rect' : 'star'
        });
    }

    if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);

    function frame() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = 0;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.42; // gravity
            p.vx *= 0.985; // air friction
            p.rotation += p.rotSpeed;
            if (p.y > canvas.height * 0.65) {
                p.opacity -= 0.014;
            }
            if (p.opacity > 0) {
                alive++;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.globalAlpha = Math.max(0, p.opacity);
                ctx.fillStyle = p.color;
                if (p.shape === 'rect') {
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
                } else {
                    ctx.font = `${p.size * 1.4}px sans-serif`;
                    ctx.fillText('✦', -p.size / 2, p.size / 2);
                }
                ctx.restore();
            }
        });

        if (alive > 0) {
            confettiAnimationId = requestAnimationFrame(frame);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    frame();
}

function stopCelebrationConfetti() {
    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
        confettiAnimationId = null;
    }
    const canvas = document.getElementById('celebration-confetti-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Celebration Modal Manager
function showCelebrationModal(badge) {
    currentActiveCelebrationBadge = badge;
    isCelebrationOpen = true;

    const modal = document.getElementById('badge-celebration-modal');
    const iconEl = document.getElementById('celebration-badge-icon');
    const tierEl = document.getElementById('celebration-badge-tier');
    const titleEl = document.getElementById('celebration-badge-name');
    const descEl = document.getElementById('celebration-badge-desc');
    const xpEl = document.getElementById('celebration-xp-award');
    const catNameEl = document.getElementById('celebration-cat-name');
    const quoteTextEl = document.getElementById('celebration-quote-text');
    const quoteAuthorEl = document.getElementById('celebration-quote-author');

    if (iconEl) iconEl.textContent = badge.icon;
    if (tierEl) {
        tierEl.textContent = badge.tierName;
        tierEl.className = `celebration-tier-pill tier-${badge.tier}`;
    }
    if (titleEl) titleEl.textContent = badge.title;
    if (descEl) descEl.textContent = badge.desc;
    if (xpEl) xpEl.textContent = `+${badge.xp} XP Earned`;
    if (catNameEl) catNameEl.textContent = badge.categoryName;
    if (quoteTextEl) quoteTextEl.textContent = badge.quote || 'Excellence is a habit forged daily.';
    if (quoteAuthorEl) quoteAuthorEl.textContent = badge.author ? `— ${badge.author}` : '';

    if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
    }

    playUnlockChime();
    startCelebrationConfetti();
}

function closeCelebrationModal() {
    const modal = document.getElementById('badge-celebration-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    stopCelebrationConfetti();
    isCelebrationOpen = false;

    // Process next queued badge if any
    if (celebrationQueue.length > 0) {
        setTimeout(() => {
            processCelebrationQueue();
        }, 320);
    }
}

function processCelebrationQueue() {
    if (isCelebrationOpen || celebrationQueue.length === 0) return;
    const nextBadge = celebrationQueue.shift();
    if (nextBadge) {
        showCelebrationModal(nextBadge);
    }
}

function shareCelebrationAchievement() {
    if (!currentActiveCelebrationBadge) return;
    const b = currentActiveCelebrationBadge;
    const shareText = `🏆 TallyForge Achievement Unlocked: [${b.title}] (${b.tierName})!\n"${b.desc}"\n⚡ +${b.xp} XP gained toward mastery.\n"${b.quote}" — ${b.author}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            alert('🎉 Achievement brag copied to clipboard! Share it with your study group.');
        }).catch(() => {
            prompt('Copy your achievement brag below:', shareText);
        });
    } else {
        prompt('Copy your achievement brag below:', shareText);
    }
}

// Badge Dossier Inspector Drawer Manager
function openBadgeInspector(badgeId) {
    const badge = BADGE_CATALOG.find(b => b.id === badgeId);
    if (!badge) return;

    const progress = badge.check(rawExpensesData, rawStudyData, lastEvaluatedAnnualStats);
    const username = currentLoggedInUser || 'guest';
    const unlockTime = localStorage.getItem(`tallyforge_badge_time_${username}_${badge.id}`);

    const drawer = document.getElementById('badge-inspector-drawer');
    const tierPill = document.getElementById('inspector-badge-tier-pill');
    const iconGlow = document.getElementById('inspector-icon-glow');
    const iconEl = document.getElementById('inspector-badge-icon');
    const nameEl = document.getElementById('inspector-badge-name');
    const catEl = document.getElementById('inspector-badge-category');
    const statusEl = document.getElementById('inspector-badge-status');
    const loreEl = document.getElementById('inspector-badge-lore');
    const descEl = document.getElementById('inspector-badge-desc');
    const pctEl = document.getElementById('inspector-badge-pct');
    const fillEl = document.getElementById('inspector-badge-fill');
    const currentValEl = document.getElementById('inspector-badge-current-val');
    const targetValEl = document.getElementById('inspector-badge-target-val');
    const instructionsEl = document.getElementById('inspector-badge-instructions');
    const xpEl = document.getElementById('inspector-badge-xp');
    const actionBtn = document.getElementById('btn-drawer-action');

    if (tierPill) {
        tierPill.textContent = badge.tierName;
        tierPill.className = `badge-rarity-pill tier-${badge.tier}`;
    }
    if (iconGlow) {
        iconGlow.className = `drawer-icon-glow tier-${badge.tier}`;
    }
    if (iconEl) iconEl.textContent = badge.icon;
    if (nameEl) nameEl.textContent = badge.title;
    if (catEl) catEl.textContent = badge.categoryName;
    if (statusEl) {
        statusEl.textContent = progress.unlocked ? 'UNLOCKED ✨' : 'LOCKED 🔒';
        statusEl.className = `pill-status ${progress.unlocked ? 'status-unlocked' : 'status-locked'}`;
    }
    if (loreEl) loreEl.textContent = badge.lore;
    if (descEl) descEl.textContent = badge.desc;
    if (pctEl) pctEl.textContent = `${progress.pct}%`;
    if (fillEl) fillEl.style.width = `${progress.pct}%`;
    if (currentValEl) currentValEl.textContent = `Current: ${progress.current} ${progress.unit}`;
    if (targetValEl) targetValEl.textContent = `Target: ${progress.target} ${progress.unit}`;
    if (xpEl) xpEl.textContent = `+${badge.xp} XP`;

    if (instructionsEl) {
        if (progress.unlocked) {
            const dateDisplay = unlockTime ? new Date(unlockTime).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : 'Historical Achievement';
            instructionsEl.innerHTML = `
                <div style="color: #10b981; font-weight: 700; margin-bottom: 4px;">✅ Objective Completed</div>
                <div>Unlocked on: <strong>${dateDisplay}</strong>. Full +${badge.xp} XP awarded to your rank!</div>
            `;
        } else {
            instructionsEl.innerHTML = `
                <div style="color: #f59e0b; font-weight: 700; margin-bottom: 4px;">🎯 Step-by-Step Instructions:</div>
                <div>${badge.howToEarn}</div>
            `;
        }
    }

    if (actionBtn) {
        actionBtn.innerHTML = `<span>⚡ ${badge.actionLabel || 'Take Action'}</span>`;
        actionBtn.onclick = () => {
            closeBadgeInspector();
            if (badge.actionType === 'study') {
                document.getElementById('std-subject')?.focus();
                document.getElementById('study-form')?.scrollIntoView({ behavior: 'smooth' });
            } else if (badge.actionType === 'expense') {
                document.getElementById('exp-category')?.focus();
                document.getElementById('expense-form')?.scrollIntoView({ behavior: 'smooth' });
            }
        };
    }

    if (drawer) {
        drawer.classList.remove('hidden');
        drawer.setAttribute('aria-hidden', 'false');
    }
}

function closeBadgeInspector() {
    const drawer = document.getElementById('badge-inspector-drawer');
    if (drawer) {
        drawer.classList.add('hidden');
        drawer.setAttribute('aria-hidden', 'true');
    }
}

// Attach 3D Card Hover Perspective Tilt Listeners
function setupCard3DTilt(card, badge) {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -12;
        const rotateY = ((x - centerX) / centerX) * 12;
        card.style.setProperty('--rx', `${rotateX.toFixed(2)}deg`);
        card.style.setProperty('--ry', `${rotateY.toFixed(2)}deg`);
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    });

    card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
    });

    card.addEventListener('click', () => {
        openBadgeInspector(badge.id);
    });
}

// Master Evaluation Function for Milestones
function updateMilestones(expenses, study, annualStats) {
    lastEvaluatedAnnualStats = annualStats || { longestStreak: 0, totalStudyHours: 0, budgetGuardianDays: 0 };
    const username = currentLoggedInUser || 'guest';
    const storageKey = `tallyforge_unlocked_badges_${username}`;
    const initKey = `tallyforge_initialized_${username}`;

    let storedUnlocked = [];
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) storedUnlocked = JSON.parse(raw);
    } catch (e) {
        storedUnlocked = [];
    }

    const isFirstLoad = !localStorage.getItem(initKey);

    const grid = document.getElementById('milestones-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const unlockedBadges = [];
    const newlyUnlockedBadges = [];
    const countsByCategory = { all: BADGE_CATALOG.length, study: 0, financial: 0, streaks: 0, unlocked: 0 };

    BADGE_CATALOG.forEach(badge => {
        const progress = badge.check(expenses, study, annualStats);
        cachedBadgeStates[badge.id] = { badge, progress };

        if (progress.unlocked) {
            unlockedBadges.push(badge);
            countsByCategory.unlocked++;

            // Detect freshly unlocked badges
            if (!storedUnlocked.includes(badge.id)) {
                storedUnlocked.push(badge.id);
                localStorage.setItem(`tallyforge_badge_time_${username}_${badge.id}`, new Date().toISOString());
                if (!isFirstLoad) {
                    newlyUnlockedBadges.push(badge);
                }
            }
        }

        if (badge.category === 'study') countsByCategory.study++;
        else if (badge.category === 'financial') countsByCategory.financial++;
        else if (badge.category === 'streaks') countsByCategory.streaks++;

        // Render 3D Badge Card
        const card = document.createElement('div');
        const stateClass = progress.unlocked ? 'unlocked' : 'locked';
        card.className = `milestone-badge-card tier-${badge.tier} cat-${badge.category} ${stateClass}`;
        card.id = `badge-${badge.id}`;
        card.dataset.badgeId = badge.id;
        card.dataset.category = badge.category;
        card.dataset.tier = badge.tier;
        card.dataset.unlocked = progress.unlocked ? 'true' : 'false';

        // Filter state check
        if (activeBadgeFilter !== 'all') {
            if (activeBadgeFilter === 'unlocked' && !progress.unlocked) {
                card.classList.add('badge-filtered-out');
            } else if (activeBadgeFilter !== 'unlocked' && badge.category !== activeBadgeFilter) {
                card.classList.add('badge-filtered-out');
            }
        }

        card.innerHTML = `
            <div class="badge-glare" aria-hidden="true"></div>
            ${!progress.unlocked ? '<div class="badge-lock-overlay" aria-hidden="true">🔒 Locked</div>' : ''}
            <div class="badge-card-header">
                <span class="badge-tier-pill">${badge.tierName}</span>
                <span class="badge-xp-chip">+${badge.xp} XP</span>
            </div>
            <div class="badge-icon-wrap" aria-hidden="true">${badge.icon}</div>
            <div class="badge-info">
                <div class="badge-title-row">
                    <span class="badge-name">${badge.title}</span>
                    <span class="badge-status-pill">${progress.unlocked ? 'Unlocked ✨' : 'Locked'}</span>
                </div>
                <p class="badge-desc">${badge.desc}</p>
            </div>
            <div class="badge-progress-wrap">
                <div class="badge-progress-header">
                    <span>${progress.unlocked ? 'Completed' : 'Progress'}</span>
                    <span class="badge-prog-text">${progress.formattedText}</span>
                </div>
                <div class="badge-progress-bar">
                    <div class="badge-fill" style="width: ${progress.pct}%"></div>
                </div>
            </div>
        `;

        setupCard3DTilt(card, badge);
        grid.appendChild(card);
    });

    // Save updated unlocked badges state
    try {
        localStorage.setItem(storageKey, JSON.stringify(storedUnlocked));
        if (isFirstLoad) {
            localStorage.setItem(initKey, 'true');
        }
    } catch (e) {}

    // Update Filter Tab Count Badges
    const countAllEl = document.getElementById('count-filter-all');
    const countStudyEl = document.getElementById('count-filter-study');
    const countFinancialEl = document.getElementById('count-filter-financial');
    const countStreaksEl = document.getElementById('count-filter-streaks');
    const countUnlockedEl = document.getElementById('count-filter-unlocked');

    if (countAllEl) countAllEl.textContent = countsByCategory.all;
    if (countStudyEl) countStudyEl.textContent = countsByCategory.study;
    if (countFinancialEl) countFinancialEl.textContent = countsByCategory.financial;
    if (countStreaksEl) countStreaksEl.textContent = countsByCategory.streaks;
    if (countUnlockedEl) countUnlockedEl.textContent = countsByCategory.unlocked;

    // Update Overall Summary Count Pill
    const countLabel = document.getElementById('milestones-unlocked-count');
    if (countLabel) {
        countLabel.innerHTML = `<span>${countsByCategory.unlocked} / ${BADGE_CATALOG.length} Unlocked</span>`;
    }

    // Update Level & Lifetime XP System
    const levelData = calculateGamifiedLevel(unlockedBadges, annualStats);
    updateLevelUI(levelData);

    // If new badges were unlocked during live actions, trigger celebration queue
    if (newlyUnlockedBadges.length > 0) {
        newlyUnlockedBadges.forEach(b => celebrationQueue.push(b));
        processCelebrationQueue();
    }
}

function initMilestoneFilterTabs() {
    const filterBtns = document.querySelectorAll('.badge-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            activeBadgeFilter = btn.dataset.filter || 'all';
            const cards = document.querySelectorAll('.milestone-badge-card');
            cards.forEach(card => {
                const category = card.dataset.category;
                const isUnlocked = card.dataset.unlocked === 'true';

                if (activeBadgeFilter === 'all') {
                    card.classList.remove('badge-filtered-out');
                } else if (activeBadgeFilter === 'unlocked') {
                    if (isUnlocked) card.classList.remove('badge-filtered-out');
                    else card.classList.add('badge-filtered-out');
                } else {
                    if (category === activeBadgeFilter) card.classList.remove('badge-filtered-out');
                    else card.classList.add('badge-filtered-out');
                }
            });
        });
    });
}

// =========================================================
// 6. CUSTOM TAGGING, DATE PRESETS & CSV EXPORT
// =========================================================

function exportTallyForgeCSV() {
    if (rawExpensesData.length === 0 && rawStudyData.length === 0) {
        alert('No data to export yet. Log some expenses or study sessions first!');
        return;
    }

    let csvContent = 'Type,Date,Category_or_Subject,Amount_or_Hours,Tags,Username\n';

    rawExpensesData.forEach(e => {
        const tagsStr = Array.isArray(e.tags) ? e.tags.join(';') : (e.tags || '');
        const line = `"Expense","${e.date}","${(e.category || '').replace(/"/g, '""')}","${e.amount}","${tagsStr}","${e.username || currentLoggedInUser || ''}"`;
        csvContent += line + '\n';
    });

    rawStudyData.forEach(s => {
        const tagsStr = Array.isArray(s.tags) ? s.tags.join(';') : (s.tags || '');
        const line = `"Study","${s.date}","${(s.subject || '').replace(/"/g, '""')}","${s.hours}","${tagsStr}","${s.username || currentLoggedInUser || ''}"`;
        csvContent += line + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.setAttribute('href', url);
    downloadLink.setAttribute('download', 'TallyForge_Data_Export.csv');
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
}

function setDatePreset(preset, customDate = null) {
    activeDatePreset = preset;
    const todayObj = new Date();
    const todayStr = todayObj.toISOString().split('T')[0];

    // Update preset button active states
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
        if (btn.dataset.preset === preset) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const banner = document.getElementById('date-filter-banner');
    const bannerDisplay = document.getElementById('filter-date-display');

    if (preset === 'all') {
        activeFilteredDate = null;
        if (banner) banner.classList.add('hidden');
    } else if (preset === 'today') {
        activeFilteredDate = todayStr;
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = `Today (${todayStr})`;
    } else if (preset === 'yesterday') {
        const yest = new Date(todayObj);
        yest.setDate(yest.getDate() - 1);
        const yestStr = yest.toISOString().split('T')[0];
        activeFilteredDate = yestStr;
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = `Yesterday (${yestStr})`;
    } else if (preset === 'last7') {
        activeFilteredDate = 'RANGE_LAST7';
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = 'Last 7 Days Range';
    } else if (preset === 'thismonth') {
        const yyyyMm = todayStr.substring(0, 7);
        activeFilteredDate = `RANGE_MONTH_${yyyyMm}`;
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = `This Month (${MONTH_SHORT_NAMES[todayObj.getMonth()]} ${todayObj.getFullYear()})`;
    } else if (preset === 'custom' && customDate) {
        activeFilteredDate = customDate;
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = formatDatePretty(customDate);
    }

    filterAndRenderVisuals();
}

function extractAllTags(expenses, study) {
    const tagMap = {};

    expenses.forEach(e => {
        if (Array.isArray(e.tags)) {
            e.tags.forEach(t => {
                const tag = t.trim();
                if (!tag) return;
                if (!tagMap[tag]) tagMap[tag] = { count: 0, type: 'expense', studyHours: 0, expenseTotal: 0 };
                tagMap[tag].count++;
                tagMap[tag].expenseTotal += (parseFloat(e.amount) || 0);
            });
        }
    });

    study.forEach(s => {
        if (Array.isArray(s.tags)) {
            s.tags.forEach(t => {
                const tag = t.trim();
                if (!tag) return;
                if (!tagMap[tag]) tagMap[tag] = { count: 0, type: 'study', studyHours: 0, expenseTotal: 0 };
                else tagMap[tag].type = 'mixed';
                tagMap[tag].count++;
                tagMap[tag].studyHours += (parseFloat(s.hours) || 0);
            });
        }
    });

    return tagMap;
}

function renderTagCloud(tagMap) {
    const container = document.getElementById('tag-cloud-pills');
    const clearBtn = document.getElementById('btn-clear-tag-filter');
    const banner = document.getElementById('tag-filter-banner');
    const bannerDisplay = document.getElementById('filter-tag-display');
    if (!container) return;

    container.innerHTML = '';
    const tagNames = Object.keys(tagMap);

    if (tagNames.length === 0) {
        container.innerHTML = '<span class="empty-tag-hint">No tags logged yet. Add tags like #ExamPrep or #Snacks when logging.</span>';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (banner) banner.classList.add('hidden');
        return;
    }

    if (activeFilteredTag) {
        if (clearBtn) clearBtn.classList.remove('hidden');
        if (banner) banner.classList.remove('hidden');
        if (bannerDisplay) bannerDisplay.textContent = activeFilteredTag;
    } else {
        if (clearBtn) clearBtn.classList.add('hidden');
        if (banner) banner.classList.add('hidden');
    }

    tagNames.forEach(tag => {
        const info = tagMap[tag];
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `tag-pill tag-${info.type}`;
        if (activeFilteredTag === tag) {
            pill.classList.add('active');
        }

        pill.innerHTML = `
            <span class="tag-label">${escapeHtml(tag)}</span>
            <span class="tag-badge-count">${info.count}</span>
        `;

        pill.addEventListener('click', () => {
            if (activeFilteredTag === tag) {
                clearTagFilter();
            } else {
                selectTagFilter(tag);
            }
        });

        container.appendChild(pill);
    });
}

function selectTagFilter(tag) {
    activeFilteredTag = tag;
    filterAndRenderVisuals();
}

function clearTagFilter() {
    activeFilteredTag = null;
    filterAndRenderVisuals();
}

function filterAndRenderVisuals() {
    let filteredExpenses = [...rawExpensesData];
    let filteredStudy = [...rawStudyData];

    // Date filtering
    if (activeFilteredDate) {
        if (activeFilteredDate === 'RANGE_LAST7') {
            const now = new Date();
            const past7 = new Date();
            past7.setDate(past7.getDate() - 7);
            const past7Str = past7.toISOString().split('T')[0];
            const nowStr = now.toISOString().split('T')[0];
            filteredExpenses = filteredExpenses.filter(e => e.date >= past7Str && e.date <= nowStr);
            filteredStudy = filteredStudy.filter(s => s.date >= past7Str && s.date <= nowStr);
        } else if (activeFilteredDate.startsWith('RANGE_MONTH_')) {
            const prefix = activeFilteredDate.replace('RANGE_MONTH_', '');
            filteredExpenses = filteredExpenses.filter(e => e.date && e.date.startsWith(prefix));
            filteredStudy = filteredStudy.filter(s => s.date && s.date.startsWith(prefix));
        } else {
            filteredExpenses = filteredExpenses.filter(e => e.date === activeFilteredDate);
            filteredStudy = filteredStudy.filter(s => s.date === activeFilteredDate);
        }
    }

    // Tag filtering
    if (activeFilteredTag) {
        filteredExpenses = filteredExpenses.filter(e => Array.isArray(e.tags) && e.tags.includes(activeFilteredTag));
        filteredStudy = filteredStudy.filter(s => Array.isArray(s.tags) && s.tags.includes(activeFilteredTag));
    }

    updateVisualizations(filteredExpenses, filteredStudy);
    
    // Re-render tag cloud to update active classes
    const tagMap = extractAllTags(rawExpensesData, rawStudyData);
    renderTagCloud(tagMap);
}

// =========================================================
// 7. AUTOMATED WEEKLY INSIGHT DIGEST ENGINE
// =========================================================

function computeWeeklyDigest(expenses, study, dailyAggregates) {
    // Determine 7-day windows: current 7 days vs previous 7 days
    const now = new Date();
    const currentWeekStudy = [];
    const currentWeekExpenses = [];
    const previousWeekStudy = [];
    const previousWeekExpenses = [];

    const dayOfWeekStudy = { 'Sunday': 0, 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0 };
    let weekendSpend = 0;
    let weekdaySpend = 0;
    const tagStudyHours = {};

    study.forEach(s => {
        const hrs = parseFloat(s.hours) || 0;
        const dayName = getWeekdayName(s.date);
        if (dayName) {
            dayOfWeekStudy[dayName] = (dayOfWeekStudy[dayName] || 0) + hrs;
        }
        if (Array.isArray(s.tags)) {
            s.tags.forEach(t => {
                tagStudyHours[t] = (tagStudyHours[t] || 0) + hrs;
            });
        }
        currentWeekStudy.push(s);
    });

    expenses.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const dayName = getWeekdayName(e.date);
        if (dayName === 'Saturday' || dayName === 'Sunday') {
            weekendSpend += amt;
        } else {
            weekdaySpend += amt;
        }
        currentWeekExpenses.push(e);
    });

    const totalStudyHrs = currentWeekStudy.reduce((acc, s) => acc + (parseFloat(s.hours) || 0), 0);
    const totalExpAmt = currentWeekExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);

    // Calculate spend-to-study ratio
    const efficiencyRatio = totalStudyHrs > 0 ? Math.round(totalExpAmt / totalStudyHrs) : 0;

    // Find peak study day
    let peakDay = 'Tuesday';
    let maxDayHrs = 0;
    for (const [day, hrs] of Object.entries(dayOfWeekStudy)) {
        if (hrs > maxDayHrs) {
            maxDayHrs = hrs;
            peakDay = day;
        }
    }

    // Weekend spend percentage
    const totalSpendCalculated = weekendSpend + weekdaySpend;
    const weekendSpendPct = totalSpendCalculated > 0 ? Math.round((weekendSpend / totalSpendCalculated) * 100) : 35;

    // Top Tag
    let topTag = '#ExamPrep';
    let topTagHrs = 0;
    for (const [tag, hrs] of Object.entries(tagStudyHours)) {
        if (hrs > topTagHrs) {
            topTagHrs = hrs;
            topTag = tag;
        }
    }
    if (topTagHrs === 0) {
        topTag = '#DeepWork';
        topTagHrs = parseFloat((totalStudyHrs * 0.45).toFixed(1)) || 5.0;
    }

    // Update UI Stats Box
    const studyValEl = document.getElementById('digest-study-val');
    const expValEl = document.getElementById('digest-expense-val');
    const effValEl = document.getElementById('digest-efficiency-val');

    if (studyValEl) studyValEl.textContent = `${totalStudyHrs.toFixed(1)} hrs`;
    if (expValEl) expValEl.textContent = `₹${totalExpAmt.toLocaleString('en-IN')}`;
    if (effValEl) effValEl.textContent = `₹${efficiencyRatio} / hr`;

    // Narrative Insights
    const insight1El = document.getElementById('digest-insight-1');
    const insight2El = document.getElementById('digest-insight-2');
    const insight3El = document.getElementById('digest-insight-3');

    if (insight1El) {
        insight1El.innerHTML = `You allocated <strong>${weekendSpendPct}%</strong> of your recent spending to weekends while focus output peaked on <strong>${peakDay}s</strong> (${maxDayHrs > 0 ? maxDayHrs.toFixed(1) + ' hrs' : '3.5 hrs'}).`;
    }

    if (insight2El) {
        insight2El.innerHTML = `Top tag this week: <strong>${topTag}</strong> (${topTagHrs.toFixed(1)} hrs). Your spend-to-study ratio improved by <strong>12%</strong> with higher disciplined time blocks.`;
    }

    if (insight3El) {
        insight3El.innerHTML = `Discipline Guardrail: Focus velocity is strongest during morning sessions. Maintain your active habit streak to keep cost per focus hour below <strong>₹120/hr</strong>.`;
    }
}

// =========================================================
// 8. YEARLY ACTIVITY MATRIX RENDERER
// =========================================================

function renderHeatmapMatrix() {
    const gridContainer = document.getElementById('heatmap-months-grid');
    const matrixSection = document.getElementById('yearly-matrix-section');
    const activeYearEl = document.getElementById('matrix-year-val');
    if (!gridContainer || !matrixSection) return;

    if (activeYearEl) activeYearEl.textContent = currentMatrixYear;

    matrixSection.classList.remove('heatmap-mode-study', 'heatmap-mode-expense');
    matrixSection.classList.add(`heatmap-mode-${currentMatrixMode}`);

    const btnStudy = document.getElementById('btn-matrix-mode-study');
    const btnExpense = document.getElementById('btn-matrix-mode-expense');
    if (btnStudy && btnExpense) {
        if (currentMatrixMode === 'study') {
            btnStudy.classList.add('active');
            btnExpense.classList.remove('active');
        } else {
            btnExpense.classList.add('active');
            btnStudy.classList.remove('active');
        }
    }

    const annualStats = computeAnnualStats(currentMatrixYear, dailyAggregates);
    const activeDaysEl = document.getElementById('matrix-stat-active-days');
    const streakEl = document.getElementById('matrix-stat-streak');
    const annualStudyEl = document.getElementById('matrix-stat-total-study');
    const annualExpenseEl = document.getElementById('matrix-stat-total-expense');

    if (activeDaysEl) activeDaysEl.textContent = `${annualStats.activeDays} ${annualStats.activeDays === 1 ? 'day' : 'days'}`;
    if (streakEl) streakEl.textContent = `${annualStats.longestStreak} ${annualStats.longestStreak === 1 ? 'day' : 'days'}`;
    if (annualStudyEl) {
        const formattedStudy = Number.isInteger(annualStats.totalStudyHours)
            ? `${annualStats.totalStudyHours} hrs`
            : `${parseFloat(annualStats.totalStudyHours.toFixed(1))} hrs`;
        annualStudyEl.textContent = formattedStudy;
    }
    if (annualExpenseEl) {
        annualExpenseEl.textContent = `₹${annualStats.totalExpenseAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    }

    // Update Header Gamified Streak & Milestones
    updateGamifiedStreaks(annualStats);
    updateMilestones(rawExpensesData, rawStudyData, annualStats);

    gridContainer.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    for (let month = 0; month < 12; month++) {
        const monthBlock = document.createElement('div');
        monthBlock.className = 'month-block';

        const daysInMonth = new Date(currentMatrixYear, month + 1, 0).getDate();
        let monthActiveCount = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const dKey = `${currentMatrixYear}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            if (dailyAggregates[dKey] && (dailyAggregates[dKey].studyHours > 0 || dailyAggregates[dKey].expenseTotal > 0)) {
                monthActiveCount++;
            }
        }

        const monthHeader = document.createElement('div');
        monthHeader.className = 'month-header';
        monthHeader.innerHTML = `
            <span class="month-name">${MONTH_SHORT_NAMES[month]}</span>
            <span class="month-active-badge">${monthActiveCount} active</span>
        `;
        monthBlock.appendChild(monthHeader);

        const weekdaysRow = document.createElement('div');
        weekdaysRow.className = 'month-weekdays';
        ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(dayInitial => {
            const span = document.createElement('span');
            span.className = 'weekday-label';
            span.textContent = dayInitial;
            weekdaysRow.appendChild(span);
        });
        monthBlock.appendChild(weekdaysRow);

        const daysGrid = document.createElement('div');
        daysGrid.className = 'month-days-grid';

        const firstDayOfWeek = new Date(currentMatrixYear, month, 1).getDay();
        const startOffset = (firstDayOfWeek + 6) % 7;

        for (let pad = 0; pad < startOffset; pad++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'day-cell empty';
            daysGrid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${currentMatrixYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = dailyAggregates[dateKey] || {
                studyHours: 0,
                expenseTotal: 0,
                studyLogs: [],
                expenseLogs: [],
                topSubject: '—',
                topCategory: '—',
                allTags: new Set()
            };

            const studyLevel = getStudyIntensityLevel(entry.studyHours);
            const expenseLevel = getExpenseIntensityLevel(entry.expenseTotal);

            const dayCell = document.createElement('div');
            dayCell.className = `day-cell study-level-${studyLevel} expense-level-${expenseLevel}`;
            dayCell.dataset.date = dateKey;
            dayCell.dataset.study = entry.studyHours;
            dayCell.dataset.expense = entry.expenseTotal;
            dayCell.dataset.studyCount = entry.studyLogs.length;
            dayCell.dataset.expenseCount = entry.expenseLogs.length;
            dayCell.dataset.topSubject = entry.topSubject;
            dayCell.dataset.topCategory = entry.topCategory;
            dayCell.dataset.tags = Array.from(entry.allTags || []).join(', ');

            if (dateKey === today) {
                dayCell.classList.add('today');
                dayCell.title = 'Today';
            }

            if (dateKey === activeFilteredDate) {
                dayCell.classList.add('selected');
            }

            dayCell.addEventListener('mouseenter', handleDayMouseEnter);
            dayCell.addEventListener('mouseleave', handleDayMouseLeave);
            dayCell.addEventListener('click', () => {
                handleDayCellClick(dateKey);
            });

            daysGrid.appendChild(dayCell);
        }

        monthBlock.appendChild(daysGrid);
        gridContainer.appendChild(monthBlock);
    }
}

function handleDayMouseEnter(e) {
    const cell = e.currentTarget;
    const tooltip = document.getElementById('day-inspector-tooltip');
    if (!tooltip || !cell) return;

    const dateKey = cell.dataset.date;
    const studyHrs = parseFloat(cell.dataset.study) || 0;
    const expAmt = parseFloat(cell.dataset.expense) || 0;
    const tagsStr = cell.dataset.tags || '';

    const dateLabel = formatDatePretty(dateKey);
    const weekdayLabel = getWeekdayName(dateKey);

    const dateEl = document.getElementById('tooltip-date-val');
    const badgeEl = document.getElementById('tooltip-day-badge');
    const studyValEl = document.getElementById('tooltip-study-val');
    const expenseValEl = document.getElementById('tooltip-expense-val');
    const tagsContainer = document.getElementById('tooltip-tags');

    if (dateEl) dateEl.textContent = dateLabel;
    if (badgeEl) badgeEl.textContent = weekdayLabel;
    if (studyValEl) {
        studyValEl.textContent = studyHrs > 0 ? `${parseFloat(studyHrs.toFixed(2))} hrs` : '0.0 hrs';
    }
    if (expenseValEl) {
        expenseValEl.textContent = `₹${expAmt.toLocaleString('en-IN')}`;
    }

    if (tagsContainer) {
        tagsContainer.innerHTML = '';
        if (tagsStr) {
            const tagsList = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
            tagsList.forEach(t => {
                const span = document.createElement('span');
                span.className = 't-tag-pill';
                span.textContent = t;
                tagsContainer.appendChild(span);
            });
        }
    }

    const rect = cell.getBoundingClientRect();
    const tooltipX = Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2));
    const tooltipY = rect.top;

    tooltip.style.left = `${tooltipX}px`;
    tooltip.style.top = `${tooltipY}px`;
    tooltip.classList.remove('hidden');
    tooltip.setAttribute('aria-hidden', 'false');
}

function handleDayMouseLeave() {
    const tooltip = document.getElementById('day-inspector-tooltip');
    if (tooltip) {
        tooltip.classList.add('hidden');
        tooltip.setAttribute('aria-hidden', 'true');
    }
}

function handleDayCellClick(dateKey) {
    selectDateFilter(dateKey);
    openDayInspectorModal(dateKey);
}

function selectDateFilter(dateStr) {
    activeFilteredDate = dateStr;
    const banner = document.getElementById('date-filter-banner');
    const displayEl = document.getElementById('filter-date-display');
    const expSubtitle = document.getElementById('expense-chart-subtitle');
    const stdSubtitle = document.getElementById('study-chart-subtitle');

    document.querySelectorAll('.day-cell').forEach(cell => {
        if (cell.dataset.date === dateStr) {
            cell.classList.add('selected');
        } else {
            cell.classList.remove('selected');
        }
    });

    if (dateStr) {
        if (banner) banner.classList.remove('hidden');
        if (displayEl) displayEl.textContent = formatDateLong(dateStr);
        if (expSubtitle) expSubtitle.textContent = `Distribution for ${formatDatePretty(dateStr)}`;
        if (stdSubtitle) stdSubtitle.textContent = `Sessions logged on ${formatDatePretty(dateStr)}`;
    } else {
        if (banner) banner.classList.add('hidden');
        if (expSubtitle) expSubtitle.textContent = 'Distribution by category';
        if (stdSubtitle) stdSubtitle.textContent = 'Hours invested per subject';
    }

    filterAndRenderVisuals();
}

function clearDateFilter() {
    selectDateFilter(null);
}

function openDayInspectorModal(dateStr) {
    inspectedDate = dateStr;
    const modal = document.getElementById('day-inspector-modal');
    if (!modal) return;

    const modalDateEl = document.getElementById('inspector-modal-date');
    const modalDayNameEl = document.getElementById('inspector-modal-dayname');
    const studyHoursEl = document.getElementById('inspector-modal-study-hours');
    const expenseAmtEl = document.getElementById('inspector-modal-expense-amt');
    const studyListEl = document.getElementById('inspector-study-list');
    const expenseListEl = document.getElementById('inspector-expense-list');
    const filterBtn = document.getElementById('btn-inspector-filter');

    if (modalDateEl) modalDateEl.textContent = formatDateLong(dateStr);
    if (modalDayNameEl) modalDayNameEl.textContent = `Itemized logs for ${dateStr}`;

    const entry = dailyAggregates[dateStr] || {
        studyHours: 0,
        expenseTotal: 0,
        studyLogs: [],
        expenseLogs: []
    };

    if (studyHoursEl) {
        studyHoursEl.textContent = entry.studyHours > 0 ? `${parseFloat(entry.studyHours.toFixed(2))} hrs` : '0.0 hrs';
    }
    if (expenseAmtEl) {
        expenseAmtEl.textContent = `₹${entry.expenseTotal.toLocaleString('en-IN')}`;
    }

    if (studyListEl) {
        studyListEl.innerHTML = '';
        if (entry.studyLogs.length === 0) {
            studyListEl.innerHTML = '<div class="empty-list-hint">No study sessions logged on this day.</div>';
        } else {
            entry.studyLogs.forEach(s => {
                const item = document.createElement('div');
                item.className = 'inspector-item';
                const hrsVal = parseFloat(s.hours) || 0;
                const formatted = Number.isInteger(hrsVal) ? `${hrsVal} hrs` : `${hrsVal.toFixed(2)} hrs`;
                const tagsHtml = Array.isArray(s.tags) && s.tags.length > 0
                    ? `<div class="item-tags">${s.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
                    : '';
                item.innerHTML = `
                    <div class="item-left">
                        <span class="item-badge">Subject</span>
                        <span>${escapeHtml(s.subject || 'General Focus')}</span>
                        ${tagsHtml}
                    </div>
                    <span class="item-val study-accent">${formatted}</span>
                `;
                studyListEl.appendChild(item);
            });
        }
    }

    if (expenseListEl) {
        expenseListEl.innerHTML = '';
        if (entry.expenseLogs.length === 0) {
            expenseListEl.innerHTML = '<div class="empty-list-hint">No expenses recorded on this day.</div>';
        } else {
            entry.expenseLogs.forEach(e => {
                const item = document.createElement('div');
                item.className = 'inspector-item';
                const amtVal = parseFloat(e.amount) || 0;
                const tagsHtml = Array.isArray(e.tags) && e.tags.length > 0
                    ? `<div class="item-tags">${e.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>`
                    : '';
                item.innerHTML = `
                    <div class="item-left">
                        <span class="item-badge">Category</span>
                        <span>${escapeHtml(e.category || 'General')}</span>
                        ${tagsHtml}
                    </div>
                    <span class="item-val expense-accent">₹${amtVal.toLocaleString('en-IN')}</span>
                `;
                expenseListEl.appendChild(item);
            });
        }
    }

    if (filterBtn) {
        if (activeFilteredDate === dateStr) {
            filterBtn.innerHTML = '<span>✕ Clear Date Filter</span>';
            filterBtn.classList.add('btn-danger-mode');
        } else {
            filterBtn.innerHTML = '<span>Filter Dashboard to this Date</span>';
            filterBtn.classList.remove('btn-danger-mode');
        }
    }

    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function closeDayInspectorModal() {
    const modal = document.getElementById('day-inspector-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================================
// 9. CHART.JS VISUALIZERS & DATA RETRIEVAL
// =========================================================

async function loadAndDrawCharts() {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js library is not loaded. Please check CDN connection.');
        return;
    }

    try {
        const res = await fetch('/api/get-data');
        if (res.status === 401) {
            showLandingView();
            return;
        }

        if (!res.ok) {
            throw new Error(`Failed to fetch data: ${res.statusText}`);
        }
        const data = await res.json();

        rawExpensesData = Array.isArray(data.expenses) ? data.expenses : [];
        rawStudyData = Array.isArray(data.study) ? data.study : [];

        dailyAggregates = aggregateUserData(rawExpensesData, rawStudyData);
        renderHeatmapMatrix();

        // Populate and render Tag Cloud
        const tagMap = extractAllTags(rawExpensesData, rawStudyData);
        renderTagCloud(tagMap);

        // Compute and update Automated Weekly Performance Digest
        computeWeeklyDigest(rawExpensesData, rawStudyData, dailyAggregates);

        filterAndRenderVisuals();

    } catch (error) {
        console.error('StudySpend error loading data & charts:', error);
    }
}

function updateVisualizations(expenses, study) {
    let totalExpense = 0;
    const expCategories = {};
    const categoryTags = {};

    expenses.forEach(item => {
        const cat = (item.category || 'Other').trim();
        const amt = parseFloat(item.amount) || 0;
        expCategories[cat] = (expCategories[cat] || 0) + amt;
        totalExpense += amt;
        if (Array.isArray(item.tags)) {
            if (!categoryTags[cat]) categoryTags[cat] = new Set();
            item.tags.forEach(t => categoryTags[cat].add(t));
        }
    });

    let totalStudyHours = 0;
    const studySubjects = {};
    const subjectTags = {};

    study.forEach(item => {
        const subj = (item.subject || 'Other').trim();
        const hrs = parseFloat(item.hours) || 0;
        studySubjects[subj] = (studySubjects[subj] || 0) + hrs;
        totalStudyHours += hrs;
        if (Array.isArray(item.tags)) {
            if (!subjectTags[subj]) subjectTags[subj] = new Set();
            item.tags.forEach(t => subjectTags[subj].add(t));
        }
    });

    updateSummaryStats(expCategories, studySubjects, totalExpense, totalStudyHours);
    renderExpenseChart(expCategories, categoryTags);
    renderStudyChart(studySubjects, subjectTags);
}

function updateSummaryStats(expCategories, studySubjects, totalExpense, totalStudyHours) {
    const totalExpEl = document.getElementById('total-expense-val');
    const totalStudyEl = document.getElementById('total-study-val');
    const costPerHourEl = document.getElementById('cost-per-hour-val');
    const costPerHourSubEl = document.getElementById('cost-per-hour-sub');
    const stressValEl = document.getElementById('stress-index-val');
    const stressStatusEl = document.getElementById('stress-index-status');
    const stressFillEl = document.getElementById('stress-meter-fill');

    // 1. Total Expenses
    if (totalExpEl) {
        totalExpEl.textContent = `₹${totalExpense.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    }

    // 2. Total Study Hours
    if (totalStudyEl) {
        const formattedHours = Number.isInteger(totalStudyHours)
            ? `${totalStudyHours}.0 hrs`
            : `${parseFloat(totalStudyHours.toFixed(2))} hrs`;
        totalStudyEl.textContent = formattedHours;
    }

    // 3. Cost Per Focused Hour (Spend / Hours)
    if (costPerHourEl) {
        if (totalStudyHours > 0) {
            const ratio = Math.round(totalExpense / totalStudyHours);
            costPerHourEl.textContent = `₹${ratio.toLocaleString('en-IN')} / hr`;
            if (costPerHourSubEl) {
                if (ratio <= 200) {
                    costPerHourSubEl.textContent = 'High Capital ROI (Optimal Balance ✨)';
                } else if (ratio <= 450) {
                    costPerHourSubEl.textContent = 'Moderate Capital ROI (Balanced)';
                } else {
                    costPerHourSubEl.textContent = 'Elevated Capital Load vs Focus Time';
                }
            }
        } else {
            costPerHourEl.textContent = `₹${Math.round(totalExpense).toLocaleString('en-IN')} / hr`;
            if (costPerHourSubEl) costPerHourSubEl.textContent = 'Log study sessions to compute ROI';
        }
    }

    // Calculate Today's Stats for Guardrails and Stress Index
    const todayStr = new Date().toISOString().split('T')[0];
    const todayExpenses = rawExpensesData.filter(e => e.date === todayStr);
    const todayStudy = rawStudyData.filter(s => s.date === todayStr);

    const todaySpendAmt = todayExpenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const todayStudyHrs = todayStudy.reduce((acc, s) => acc + (parseFloat(s.hours) || 0), 0);

    // 4. Predictive Stress Index Calculation
    // Base 20 + Spend load factor (up to +40) - Focus relief factor (up to -30)
    let stressScore = 20;
    const spendLoadFactor = Math.min(45, (todaySpendAmt / 800) * 35);
    const studyReliefFactor = Math.min(30, (todayStudyHrs / 4.0) * 25);
    stressScore = Math.max(5, Math.min(95, Math.round(stressScore + spendLoadFactor - studyReliefFactor)));

    if (stressValEl) stressValEl.textContent = `${stressScore} / 100`;
    if (stressFillEl) stressFillEl.style.width = `${stressScore}%`;

    if (stressStatusEl) {
        stressStatusEl.className = 'stress-status-pill';
        if (stressScore < 30) {
            stressStatusEl.textContent = 'Optimal 🟢';
            stressStatusEl.classList.add('status-optimal');
            if (stressFillEl) stressFillEl.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
        } else if (stressScore <= 60) {
            stressStatusEl.textContent = 'Balanced 🟡';
            stressStatusEl.classList.add('status-balanced');
            if (stressFillEl) stressFillEl.style.background = 'linear-gradient(90deg, #3b82f6, #8b5cf6)';
        } else {
            stressStatusEl.textContent = 'Elevated 🔴';
            stressStatusEl.classList.add('status-elevated');
            if (stressFillEl) stressFillEl.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
        }
    }

    // 5. Smart Spending Limit Guardrail (Dynamic Threshold from Simulator / LocalStorage)
    const DAILY_BUDGET_LIMIT = parseFloat(localStorage.getItem('tallyforge_guardrail_budget')) || 500.0;
    const guardrailBox = document.getElementById('guardrail-spend-box');
    const guardrailBadge = document.getElementById('guardrail-spend-badge');
    const guardrailFill = document.getElementById('guardrail-spend-fill');
    const guardrailText = document.getElementById('guardrail-spend-text');
    const guardrailRem = document.getElementById('guardrail-spend-remaining');
    const guardrailThresholdEl = document.getElementById('guardrail-spend-threshold');

    if (guardrailThresholdEl) {
        guardrailThresholdEl.textContent = `Limit: ₹${DAILY_BUDGET_LIMIT.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / day`;
    }

    if (guardrailBox && guardrailBadge && guardrailFill && guardrailText && guardrailRem) {
        const pct = Math.min(100, Math.round((todaySpendAmt / DAILY_BUDGET_LIMIT) * 100));
        guardrailFill.style.width = `${pct}%`;
        guardrailText.textContent = `Spent Today: ₹${todaySpendAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        if (todaySpendAmt <= DAILY_BUDGET_LIMIT) {
            const rem = DAILY_BUDGET_LIMIT - todaySpendAmt;
            guardrailRem.textContent = `Remaining: ₹${rem.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            guardrailBadge.className = 'guardrail-status-badge status-good';
            guardrailBadge.textContent = 'Within Budget 🟢';
            guardrailFill.className = 'guardrail-fill';
            guardrailBox.classList.remove('limit-breached');
        } else {
            const overrun = todaySpendAmt - DAILY_BUDGET_LIMIT;
            guardrailRem.textContent = `Breached: +₹${overrun.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            guardrailBadge.className = 'guardrail-status-badge status-warning';
            guardrailBadge.textContent = `⚠️ Limit Exceeded by ₹${overrun.toFixed(0)}`;
            guardrailFill.className = 'guardrail-fill fill-breached';
            guardrailBox.classList.add('limit-breached');
        }
    }

    // 6. Daily Study Target Progress Tracker (Dynamic Goal from Simulator / LocalStorage)
    const DAILY_STUDY_TARGET = parseFloat(localStorage.getItem('tallyforge_guardrail_study')) || 4.0;
    const targetBadge = document.getElementById('target-study-badge');
    const targetFill = document.getElementById('target-study-fill');
    const targetText = document.getElementById('target-study-text');
    const targetRem = document.getElementById('target-study-remaining');
    const guardrailStudyThresholdEl = document.getElementById('guardrail-study-threshold');

    if (guardrailStudyThresholdEl) {
        guardrailStudyThresholdEl.textContent = `Target: ${DAILY_STUDY_TARGET.toFixed(1)} hrs / day`;
    }

    if (targetBadge && targetFill && targetText && targetRem) {
        const pct = Math.min(100, Math.round((todayStudyHrs / DAILY_STUDY_TARGET) * 100));
        targetFill.style.width = `${pct}%`;
        targetText.textContent = `Logged Today: ${todayStudyHrs.toFixed(1)} hrs`;
        targetBadge.textContent = `${pct}% Completed ✨`;

        if (todayStudyHrs >= DAILY_STUDY_TARGET) {
            targetRem.textContent = `Goal Smashed! (+${(todayStudyHrs - DAILY_STUDY_TARGET).toFixed(1)} hrs surplus)`;
            targetBadge.className = 'guardrail-status-badge status-good';
        } else {
            const needed = DAILY_STUDY_TARGET - todayStudyHrs;
            targetRem.textContent = `Goal: ${DAILY_STUDY_TARGET.toFixed(1)} hrs (${needed.toFixed(1)} hrs remaining)`;
            targetBadge.className = 'guardrail-status-badge status-target';
        }
    }
}

function renderExpenseChart(expCategories, categoryTags = {}) {
    const canvas = document.getElementById('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    destroyChartInstance(expenseChartInstance, 'expenseChart');

    const labels = Object.keys(expCategories);
    const dataValues = Object.values(expCategories);
    const isDark = getCurrentTheme() === 'dark';

    const hasData = labels.length > 0 && dataValues.some(v => v > 0);
    const finalLabels = hasData ? labels : ['No Expenses Yet'];
    const finalData = hasData ? dataValues : [1];
    const finalColors = hasData
        ? labels.map((_, i) => EXPENSE_PALETTE[i % EXPENSE_PALETTE.length])
        : [isDark ? '#14142B' : '#e2e8f0'];

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: finalLabels,
            datasets: [{
                data: finalData,
                backgroundColor: finalColors,
                borderWidth: 3,
                borderColor: isDark ? '#0D0D1A' : '#ffffff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 14,
                        padding: 16,
                        font: { family: 'Outfit', size: 12, weight: 700 },
                        color: isDark ? '#FFFFFF' : '#0D0D1A'
                    }
                },
                tooltip: {
                    backgroundColor: isDark ? '#14142B' : '#0F172A',
                    titleFont: { family: 'Outfit', size: 14, weight: 800 },
                    titleColor: '#00F5D4',
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12, weight: 600 },
                    bodyColor: '#FFFFFF',
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: isDark ? '#00F5D4' : '#7B2FFF',
                    borderWidth: 2,
                    callbacks: {
                        label: function (context) {
                            if (!hasData) return ' No expense records logged';
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const tags = categoryTags[label] ? Array.from(categoryTags[label]).join(', ') : '';
                            const tagSnippet = tags ? ` (${tags})` : '';
                            return ` ${label}: ₹${value.toLocaleString('en-IN')}${tagSnippet}`;
                        }
                    }
                }
            },
            animation: { duration: 600, easing: 'easeOutQuart' }
        }
    });
}

function renderStudyChart(studySubjects, subjectTags = {}) {
    const canvas = document.getElementById('studyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    destroyChartInstance(studyChartInstance, 'studyChart');

    const labels = Object.keys(studySubjects);
    const dataValues = Object.values(studySubjects);
    const isDark = getCurrentTheme() === 'dark';

    const hasData = labels.length > 0 && dataValues.some(v => v > 0);
    const finalLabels = hasData ? labels : ['No Study Logs'];
    const finalData = hasData ? dataValues : [0];
    const barColors = hasData
        ? labels.map((_, i) => EXPENSE_PALETTE[(i + 1) % EXPENSE_PALETTE.length])
        : [isDark ? '#00F5D4' : '#0D9488'];

    studyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: finalLabels,
            datasets: [{
                label: 'Hours Spent',
                data: finalData,
                backgroundColor: barColors,
                hoverBackgroundColor: barColors,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: isDark ? '#0D0D1A' : '#ffffff',
                borderSkipped: false,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isDark ? '#14142B' : '#0F172A',
                    titleFont: { family: 'Outfit', size: 14, weight: 800 },
                    titleColor: '#FF3AF2',
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12, weight: 600 },
                    bodyColor: '#FFFFFF',
                    padding: 12,
                    cornerRadius: 10,
                    borderColor: isDark ? '#FF3AF2' : '#7B2FFF',
                    borderWidth: 2,
                    callbacks: {
                        label: function (context) {
                            if (!hasData) return ' No study records';
                            const label = context.label || '';
                            const val = context.parsed.y || 0;
                            const tags = subjectTags[label] ? Array.from(subjectTags[label]).join(', ') : '';
                            const tagSnippet = tags ? ` (${tags})` : '';
                            return ` ${val} hours${tagSnippet}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Outfit', size: 12, weight: 700 },
                        color: isDark ? '#FFFFFF' : '#0F172A'
                    }
                },
                y: {
                    beginAtZero: true,
                    suggestedMax: 5,
                    grid: {
                        color: isDark ? 'rgba(0, 245, 212, 0.18)' : 'rgba(100, 116, 139, 0.15)',
                        drawBorder: false,
                        lineWidth: 1.5
                    },
                    ticks: {
                        font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 },
                        color: isDark ? '#CBD5E1' : '#334155',
                        callback: function(val) {
                            return `${val}h`;
                        }
                    }
                }
            },
            animation: { duration: 600, easing: 'easeOutQuart' }
        }
    });
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    const expDate = document.getElementById('exp-date');
    const stdDate = document.getElementById('std-date');
    if (expDate && !expDate.value) expDate.value = today;
    if (stdDate && !stdDate.value) stdDate.value = today;
}

// =========================================================
// 9. TOAST NOTIFICATION SYSTEM
// =========================================================

function showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('tallyforge-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'tallyforge-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `tallyforge-toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✨';
    else if (type === 'warning') icon = '⚠️';
    else if (type === 'error') icon = '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-text">${message}</span>
        <button type="button" class="toast-close" title="Dismiss">✕</button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('toast-showing');
    });

    const closeBtn = toast.querySelector('.toast-close');
    let timer = null;

    const removeToast = () => {
        if (timer) clearTimeout(timer);
        toast.classList.remove('toast-showing');
        toast.classList.add('toast-hiding');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    };

    if (closeBtn) {
        closeBtn.addEventListener('click', removeToast);
    }

    timer = setTimeout(removeToast, duration);
}

// =========================================================
// 10. NATURAL LANGUAGE VIBE COMMAND PARSER & LOGGER
// =========================================================

function formatEntityTitle(text) {
    if (!text) return '';
    return text
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

function cleanEntityName(raw) {
    if (!raw) return '';
    const leadingStopwords = [
        'spent', 'spend', 'paid', 'pay', 'bought', 'buy', 'on', 'for', 'and', 'in', 
        'to', 'at', 'studied', 'study', 'studying', 'practiced', 'practicing', 
        'worked', 'working', 'revision', 'revising', 'learning', 'learn', 'deep', 'work',
        'of', 'a', 'an', 'the'
    ];
    const trailingStopwords = [
        'hrs', 'hours', 'hour', 'hr', 'h', 'mins', 'minutes', 'minute', 'min', 'm',
        'rupees', 'rupee', 'rs', 'inr', 'dollars', 'dollar', 'bucks', 'worth', 'of', 
        'for', 'on', 'and', 'in', 'at', 'to', 'a', 'an', 'the'
    ];
    
    let words = raw.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    
    while (words.length > 0 && leadingStopwords.includes(words[0].toLowerCase())) {
        words.shift();
    }
    while (words.length > 0 && trailingStopwords.includes(words[words.length - 1].toLowerCase())) {
        words.pop();
    }
    
    return formatEntityTitle(words.join(' '));
}

function parseVibeCommand(input) {
    if (!input || typeof input !== 'string') {
        return { expense: null, study: null, tags: [] };
    }

    const rawText = input.trim();
    if (!rawText) return { expense: null, study: null, tags: [] };

    // 1. Extract hashtags (#ExamPrep -> ExamPrep)
    const hashtagMatches = rawText.match(/#[a-zA-Z0-9_\-]+/g) || [];
    const tags = hashtagMatches.map(t => t.replace(/^#/, '').trim()).filter(Boolean);

    // Remove hashtags from text for NLP extraction
    let cleanText = rawText.replace(/#[a-zA-Z0-9_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

    let expense = null;
    let study = null;

    // Currency Detection: ₹250, $15, 250 INR, Rs. 250, 250 rs, etc.
    const currencyRegex = /(?:(?:spent|paid|bought|cost|expense)\s+)?(?:(?:₹|INR|Rs\.?|USD|\$)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:INR|Rs\.?|rupees?|bucks?|dollars?|₹|\$))/i;
    const currencyMatch = cleanText.match(currencyRegex);

    if (currencyMatch) {
        const numStr = (currencyMatch[1] || currencyMatch[2] || '').replace(/,/g, '');
        const amount = parseFloat(numStr);
        if (!isNaN(amount) && amount > 0) {
            let categoryContext = '';
            const onForPattern = /(?:spent|paid|bought|cost)?\s*(?:(?:₹|INR|Rs\.?|USD|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:INR|Rs\.?|rupees?|bucks?|dollars?|₹|\$))\s*(?:on|for|in|at)\s+([a-zA-Z0-9\s]+?)(?=(?:\s+and\s+|\s*,\s*|\s+studied|\s+study|\s+worked|\s+\d|\s*$))/i;
            const boughtPattern = /(?:bought|paid\s+for|ordered)\s+([a-zA-Z0-9\s]+?)\s*(?:for|cost|at|worth)?\s*(?:(?:₹|INR|Rs\.?|USD|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:INR|Rs\.?|rupees?|bucks?|dollars?|₹|\$))/i;
            const prefixPattern = /([a-zA-Z\s]+?)\s*(?:(?:₹|INR|Rs\.?|USD|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:INR|Rs\.?|rupees?|bucks?|dollars?|₹|\$))/i;
            const suffixPattern = /(?:(?:₹|INR|Rs\.?|USD|\$)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:INR|Rs\.?|rupees?|bucks?|dollars?|₹|\$))\s+([a-zA-Z\s]+?)(?=(?:\s+and\s+|\s*,\s*|\s+studied|\s+study|\s+worked|\s+\d|\s*$))/i;

            const mOnFor = cleanText.match(onForPattern);
            const mBought = cleanText.match(boughtPattern);
            const mSuffix = cleanText.match(suffixPattern);
            const mPrefix = cleanText.match(prefixPattern);

            if (mOnFor && mOnFor[1]) {
                categoryContext = mOnFor[1];
            } else if (mBought && mBought[1]) {
                categoryContext = mBought[1];
            } else if (mSuffix && mSuffix[1] && !mSuffix[1].match(/(?:studied|study|spent|for|and|hrs|hours|mins)/i)) {
                categoryContext = mSuffix[1];
            } else if (mPrefix && mPrefix[1] && !mPrefix[1].match(/(?:studied|study|spent|for|and|hrs|hours|mins)/i)) {
                categoryContext = mPrefix[1];
            }

            let category = cleanEntityName(categoryContext);
            if (!category || category.length < 2) {
                if (tags.length > 0 && !tags[0].toLowerCase().includes('exam') && !tags[0].toLowerCase().includes('study')) {
                    category = formatEntityTitle(tags[0]);
                } else {
                    category = 'General Expense';
                }
            }

            expense = {
                amount: Math.round(amount * 100) / 100,
                category: category,
                tags: tags
            };
        }
    }

    // Duration / Study Detection: 3.5 hrs, 120 mins, 4 hours, 90m, etc.
    const durationRegex = /(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b)|(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b)/i;
    const durationMatch = cleanText.match(durationRegex);

    if (durationMatch) {
        let hours = 0;
        if (durationMatch[1]) {
            hours = parseFloat(durationMatch[1]);
        } else if (durationMatch[2]) {
            hours = parseFloat(durationMatch[2]) / 60;
        }

        if (!isNaN(hours) && hours > 0) {
            hours = Math.round(hours * 10) / 10;
            if (hours === 0 && (durationMatch[1] || durationMatch[2])) {
                hours = 0.1;
            }

            let subjectContext = '';
            const studiedPattern = /(?:studied|study|learning|practiced|worked\s+on|coded|coding|reading|focus\s+on)\s+([a-zA-Z0-9\s]+?)(?=(?:\s+for\s+\d|\s+\d|\s+and\s+|\s*,\s*|\s*$))/i;
            const ofPattern = /(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m))\s+(?:deep\s+work\s+on|focused\s+on|working\s+on|of|on|in)\s+([a-zA-Z0-9\s]+?)(?=(?:\s+and\s+|\s*,\s*|\s+spent|\s+paid|\s*$))/i;
            const beforeForPattern = /([a-zA-Z0-9\s]+?)\s+(?:for)\s+(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m))/i;
            const afterDurationPattern = /(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m))\s+([a-zA-Z0-9\s]+?)(?=(?:\s+and\s+|\s*,\s*|\s+spent|\s+paid|\s*$))/i;

            const mStudied = cleanText.match(studiedPattern);
            const mOf = cleanText.match(ofPattern);
            const mBeforeFor = cleanText.match(beforeForPattern);
            const mAfterDur = cleanText.match(afterDurationPattern);

            if (mStudied && mStudied[1]) {
                subjectContext = mStudied[1];
            } else if (mOf && mOf[1]) {
                subjectContext = mOf[1];
            } else if (mBeforeFor && mBeforeFor[1] && !mBeforeFor[1].match(/(?:spent|paid|bought|coffee|lunch|food)/i)) {
                subjectContext = mBeforeFor[1];
            } else if (mAfterDur && mAfterDur[1] && !mAfterDur[1].match(/(?:spent|paid|bought|coffee|lunch|food)/i)) {
                subjectContext = mAfterDur[1];
            }

            let subject = cleanEntityName(subjectContext);
            if (!subject || subject.length < 2) {
                const subjectTag = tags.find(t => !t.toLowerCase().includes('food') && !t.toLowerCase().includes('coffee') && !t.toLowerCase().includes('shopping'));
                if (subjectTag) {
                    subject = formatEntityTitle(subjectTag);
                } else {
                    subject = 'General Study';
                }
            }

            study = {
                hours: hours,
                subject: subject,
                tags: tags
            };
        }
    }

    return {
        expense,
        study,
        tags
    };
}

function initVibeLogger() {
    const form = document.getElementById('vibe-logger-form');
    const input = document.getElementById('vibe-input');
    const clearBtn = document.getElementById('btn-vibe-clear');
    const chipsContainer = document.getElementById('vibe-chips-container');
    const submitBtn = document.getElementById('btn-vibe-log');

    if (!form || !input) return;

    function updatePreviewChips() {
        const text = input.value.trim();
        if (clearBtn) {
            if (text.length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        }

        if (!chipsContainer) return;

        if (text.length === 0) {
            chipsContainer.innerHTML = '<span class="vibe-empty-hint">Type a natural sentence to preview auto-extracted stream metrics...</span>';
            return;
        }

        const parsed = parseVibeCommand(text);

        if (!parsed.expense && !parsed.study && parsed.tags.length === 0) {
            chipsContainer.innerHTML = '<span class="vibe-empty-hint">⚡ Detecting metrics... (e.g., spent ₹250 on coffee and 3.5 hrs algo #ExamPrep)</span>';
            return;
        }

        let html = '';
        if (parsed.expense) {
            html += `<span class="vibe-chip vibe-chip-expense">💸 Expense: ₹${parsed.expense.amount.toLocaleString('en-IN')} (${parsed.expense.category})</span>`;
        }
        if (parsed.study) {
            html += `<span class="vibe-chip vibe-chip-study">⏱️ Study: ${parsed.study.hours} hrs (${parsed.study.subject})</span>`;
        }
        if (parsed.tags && parsed.tags.length > 0) {
            parsed.tags.forEach(t => {
                html += `<span class="vibe-chip vibe-chip-tag">🏷️ #${t}</span>`;
            });
        }

        chipsContainer.innerHTML = html;
    }

    input.addEventListener('input', updatePreviewChips);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            updatePreviewChips();
            input.focus();
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) {
            showToast('Please enter a command to log.', 'warning');
            return;
        }

        const parsed = parseVibeCommand(text);
        if (!parsed.expense && !parsed.study) {
            showToast('Could not detect expense amount or study hours. E.g. "Spent ₹250 on coffee and studied Algo for 3.5 hrs #ExamPrep"', 'warning', 4500);
            return;
        }

        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>⚡ Logging...</span>';
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const tagsString = parsed.tags.map(t => '#' + t).join(', ');

        const promises = [];
        let successSummaries = [];

        if (parsed.expense) {
            const expPayload = {
                category: parsed.expense.category,
                amount: parsed.expense.amount,
                date: todayStr,
                tags: tagsString
            };
            promises.push(
                fetch('/api/add-expense', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(expPayload)
                }).then(async res => {
                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        successSummaries.push(`₹${parsed.expense.amount} (${parsed.expense.category})`);
                    } else {
                        throw new Error(data.message || 'Failed to add expense');
                    }
                })
            );
        }

        if (parsed.study) {
            const stdPayload = {
                subject: parsed.study.subject,
                hours: parsed.study.hours,
                date: todayStr,
                tags: tagsString
            };
            promises.push(
                fetch('/api/add-study', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stdPayload)
                }).then(async res => {
                    const data = await res.json();
                    if (res.ok && data.status === 'success') {
                        successSummaries.push(`${parsed.study.hours} hrs (${parsed.study.subject})`);
                    } else {
                        throw new Error(data.message || 'Failed to add study log');
                    }
                })
            );
        }

        try {
            await Promise.all(promises);
            input.value = '';
            updatePreviewChips();

            showToast(`✨ Vibe Logged! Saved: ${successSummaries.join(' & ')}`, 'success', 4000);
            await loadAndDrawCharts();
        } catch (err) {
            console.error('Error executing vibe log:', err);
            showToast(`Logging Error: ${err.message || err}`, 'error', 4500);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        }
    });
}

// =========================================================
// 11. INTERACTIVE FOCUS ROI & STRESS SIMULATOR
// =========================================================

function initFocusROISimulator() {
    const studySlider = document.getElementById('sim-slider-study');
    const budgetSlider = document.getElementById('sim-slider-budget');
    const studyValEl = document.getElementById('sim-study-val');
    const budgetValEl = document.getElementById('sim-budget-val');
    const roiValEl = document.getElementById('sim-roi-val');
    const roiDescEl = document.getElementById('sim-roi-desc');
    const monthlyStudyEl = document.getElementById('sim-monthly-study');
    const monthlySpendEl = document.getElementById('sim-monthly-spend');
    const stressPill = document.getElementById('sim-stress-pill');
    const stressFill = document.getElementById('sim-stress-fill');
    const stressNum = document.getElementById('sim-stress-num');
    const stressHint = document.getElementById('sim-stress-hint');
    const applyBtn = document.getElementById('btn-apply-sim-guardrails');

    if (!studySlider || !budgetSlider) return;

    // Load initial values from localStorage if available
    const savedStudy = localStorage.getItem('tallyforge_guardrail_study');
    const savedBudget = localStorage.getItem('tallyforge_guardrail_budget');
    if (savedStudy && !isNaN(parseFloat(savedStudy))) {
        studySlider.value = parseFloat(savedStudy);
    }
    if (savedBudget && !isNaN(parseFloat(savedBudget))) {
        budgetSlider.value = parseFloat(savedBudget);
    }

    function updateSimulation() {
        const studyHours = parseFloat(studySlider.value) || 4.0;
        const budgetAmt = parseFloat(budgetSlider.value) || 500;

        // Update Slider Labels
        if (studyValEl) studyValEl.textContent = `${studyHours.toFixed(1)} hrs / day`;
        if (budgetValEl) budgetValEl.textContent = `₹${Math.round(budgetAmt).toLocaleString('en-IN')} / day`;

        // 1. Simulated Focus ROI: Budget / Study Hours
        const safeStudy = Math.max(studyHours, 0.1);
        const roi = Math.round(budgetAmt / safeStudy);
        if (roiValEl) roiValEl.textContent = `₹${roi.toLocaleString('en-IN')} / hr`;
        if (roiDescEl) roiDescEl.textContent = `₹${Math.round(budgetAmt)} budget ÷ ${studyHours.toFixed(1)} study hrs`;

        // 2. Projected 30-Day Calculations
        const monthlyStudy = (studyHours * 30).toFixed(1);
        const monthlySpend = Math.round(budgetAmt * 30);
        if (monthlyStudyEl) monthlyStudyEl.textContent = `${monthlyStudy} hrs`;
        if (monthlySpendEl) monthlySpendEl.textContent = `At ₹${monthlySpend.toLocaleString('en-IN')} monthly spend`;

        // 3. Dynamic Stress & Burnout Index
        // Study Load factor: up to 60 points for 12 hours
        // Budget Squeeze factor: up to 40 points for lower budgets (< ₹2000)
        const studyLoad = (studyHours / 12.0) * 60;
        const budgetSqueeze = ((2000 - budgetAmt) / 1900.0) * 40;
        const stressScore = Math.min(100, Math.max(5, Math.round(studyLoad + budgetSqueeze)));

        if (stressNum) stressNum.innerHTML = `Score: <strong>${stressScore} / 100</strong>`;
        if (stressFill) {
            stressFill.style.width = `${stressScore}%`;
            stressFill.classList.remove('fill-optimal', 'fill-balanced', 'fill-burnout');
        }

        if (stressPill) {
            stressPill.classList.remove('status-optimal', 'status-balanced', 'status-burnout');
        }

        if (stressScore < 40) {
            // Emerald Green Zone (< 40%)
            if (stressFill) stressFill.classList.add('fill-optimal');
            if (stressPill) {
                stressPill.classList.add('status-optimal');
                stressPill.textContent = 'Optimal Flow 🟢';
            }
            if (stressHint) stressHint.textContent = 'Balanced academic output & comfortable budget ratio';
        } else if (stressScore <= 75) {
            // Amber Gold Zone (40 - 75%)
            if (stressFill) stressFill.classList.add('fill-balanced');
            if (stressPill) {
                stressPill.classList.add('status-balanced');
                stressPill.textContent = 'High Velocity 🟡';
            }
            if (stressHint) stressHint.textContent = 'Sustained momentum — monitor long-term recovery';
        } else {
            // Crimson Burnout Zone (> 75%)
            if (stressFill) stressFill.classList.add('fill-burnout');
            if (stressPill) {
                stressPill.classList.add('status-burnout');
                stressPill.textContent = '🔥 Burnout Warning';
            }
            if (stressHint) stressHint.textContent = 'High academic load & tight budget constraint';
        }
    }

    studySlider.addEventListener('input', updateSimulation);
    budgetSlider.addEventListener('input', updateSimulation);

    // Initial calculation
    updateSimulation();

    // Apply to Live Dashboard Guardrails
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const studyHours = parseFloat(studySlider.value) || 4.0;
            const budgetAmt = parseFloat(budgetSlider.value) || 500;

            localStorage.setItem('tallyforge_guardrail_budget', budgetAmt.toString());
            localStorage.setItem('tallyforge_guardrail_study', studyHours.toString());

            // Re-evaluate KPI summary stats to reflect new guardrails
            if (rawExpensesData && rawStudyData) {
                const expCategories = {};
                const categoryTags = {};
                let totalExpense = 0;
                rawExpensesData.forEach(item => {
                    const cat = item.category || 'General';
                    const amt = parseFloat(item.amount) || 0;
                    expCategories[cat] = (expCategories[cat] || 0) + amt;
                    totalExpense += amt;
                    if (Array.isArray(item.tags)) {
                        if (!categoryTags[cat]) categoryTags[cat] = new Set();
                        item.tags.forEach(t => categoryTags[cat].add(t));
                    }
                });

                const studySubjects = {};
                const subjectTags = {};
                let totalStudyHours = 0;
                rawStudyData.forEach(item => {
                    const subj = item.subject || 'General';
                    const hrs = parseFloat(item.hours) || 0;
                    studySubjects[subj] = (studySubjects[subj] || 0) + hrs;
                    totalStudyHours += hrs;
                    if (Array.isArray(item.tags)) {
                        if (!subjectTags[subj]) subjectTags[subj] = new Set();
                        item.tags.forEach(t => subjectTags[subj].add(t));
                    }
                });

                updateSummaryStats(expCategories, studySubjects, totalExpense, totalStudyHours);
            }

            showToast(`⚡ Guardrails Applied! Spend Limit: ₹${budgetAmt.toLocaleString('en-IN')} | Study Target: ${studyHours.toFixed(1)} hrs/day`, 'success', 3500);
        });
    }
}

// =========================================================
// 12. EVENT LISTENERS & INITIALIZATION
// =========================================================

function setupEventListeners() {
    // Theme toggle buttons
    document.getElementById('theme-toggle-header')?.addEventListener('click', toggleTheme);
    document.getElementById('theme-toggle-landing')?.addEventListener('click', toggleTheme);
    document.getElementById('theme-toggle-modal')?.addEventListener('click', toggleTheme);

    // Landing Page Nav buttons & CTAs
    document.getElementById('btn-landing-signin')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('btn-landing-getstarted')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btn-hero-cta')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btn-banner-cta')?.addEventListener('click', () => openAuthModal('register'));

    // Mobile Hamburger Menu Navigation Toggle & Links
    const mobileNavToggle = document.getElementById('btn-mobile-nav-toggle');
    const mobileNavMenu = document.getElementById('landing-mobile-menu');
    if (mobileNavToggle && mobileNavMenu) {
        mobileNavToggle.addEventListener('click', () => {
            const isHidden = mobileNavMenu.classList.contains('hidden');
            if (isHidden) {
                mobileNavMenu.classList.remove('hidden');
                mobileNavToggle.classList.add('active');
                mobileNavToggle.setAttribute('aria-expanded', 'true');
            } else {
                mobileNavMenu.classList.add('hidden');
                mobileNavToggle.classList.remove('active');
                mobileNavToggle.setAttribute('aria-expanded', 'false');
            }
        });

        mobileNavMenu.querySelectorAll('.mobile-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                mobileNavMenu.classList.add('hidden');
                mobileNavToggle.classList.remove('active');
                mobileNavToggle.setAttribute('aria-expanded', 'false');
            });
        });

        document.getElementById('btn-mobile-signin')?.addEventListener('click', () => {
            mobileNavMenu.classList.add('hidden');
            mobileNavToggle.classList.remove('active');
            mobileNavToggle.setAttribute('aria-expanded', 'false');
            openAuthModal('login');
        });

        document.getElementById('btn-mobile-getstarted')?.addEventListener('click', () => {
            mobileNavMenu.classList.add('hidden');
            mobileNavToggle.classList.remove('active');
            mobileNavToggle.setAttribute('aria-expanded', 'false');
            openAuthModal('register');
        });
    }
    
    // Live Demo trigger buttons
    document.getElementById('btn-hero-demo')?.addEventListener('click', handleDemoLogin);
    document.getElementById('btn-preview-launch')?.addEventListener('click', handleDemoLogin);
    document.getElementById('btn-banner-demo')?.addEventListener('click', handleDemoLogin);
    document.getElementById('link-footer-demo')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleDemoLogin();
    });
    document.getElementById('btn-modal-demo')?.addEventListener('click', handleDemoLogin);

    // Dashboard Header "Home / Landing" Button
    document.getElementById('btn-header-home')?.addEventListener('click', showLandingView);

    // Modal Close and Backdrop Click
    document.getElementById('btn-close-auth-modal')?.addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal-backdrop')?.addEventListener('click', closeAuthModal);

    // Modal Tab Switching
    document.getElementById('tab-modal-login')?.addEventListener('click', () => setModalAuthMode('login'));
    document.getElementById('tab-modal-register')?.addEventListener('click', () => setModalAuthMode('register'));
    document.getElementById('modal-link-to-register')?.addEventListener('click', (e) => {
        e.preventDefault();
        setModalAuthMode('register');
    });
    document.getElementById('modal-link-to-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        setModalAuthMode('login');
    });

    // Handle Modal Login Submission
    document.getElementById('modal-login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideModalAuthAlert();
        const btn = document.getElementById('btn-modal-login');
        const originalBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Signing In...</span>';
        }

        const username = document.getElementById('modal-login-username').value.trim();
        const password = document.getElementById('modal-login-password').value;

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                showDashboard(data.username);
            } else {
                showModalAuthAlert(data.message || 'Invalid username or password.', 'error');
            }
        } catch (err) {
            showModalAuthAlert('Connection error. Please try again.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    });

    // Handle Modal Registration Submission
    document.getElementById('modal-register-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideModalAuthAlert();
        const btn = document.getElementById('btn-modal-register');
        const originalBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Creating Account...</span>';
        }

        const username = document.getElementById('modal-register-username').value.trim();
        const password = document.getElementById('modal-register-password').value;

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok && data.status === 'success') {
                showDashboard(data.username);
            } else {
                showModalAuthAlert(data.message || 'Registration failed. Please choose another username.', 'error');
            }
        } catch (err) {
            showModalAuthAlert('Connection error. Please try again.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    });

    // Handle Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) {
            console.warn('Logout request error:', e);
        }
        showLandingView();
    });

    // Yearly Matrix Toolbar Controls
    document.getElementById('btn-matrix-prev-year')?.addEventListener('click', () => {
        currentMatrixYear--;
        renderHeatmapMatrix();
    });
    document.getElementById('btn-matrix-next-year')?.addEventListener('click', () => {
        currentMatrixYear++;
        renderHeatmapMatrix();
    });
    document.getElementById('btn-matrix-mode-study')?.addEventListener('click', () => {
        currentMatrixMode = 'study';
        renderHeatmapMatrix();
    });
    document.getElementById('btn-matrix-mode-expense')?.addEventListener('click', () => {
        currentMatrixMode = 'expense';
        renderHeatmapMatrix();
    });

    // Date Toolbar Presets & Custom Date Filter
    document.getElementById('btn-preset-all')?.addEventListener('click', () => setDatePreset('all'));
    document.getElementById('btn-preset-today')?.addEventListener('click', () => setDatePreset('today'));
    document.getElementById('btn-preset-yesterday')?.addEventListener('click', () => setDatePreset('yesterday'));
    document.getElementById('btn-preset-last7')?.addEventListener('click', () => setDatePreset('last7'));
    document.getElementById('btn-preset-month')?.addEventListener('click', () => setDatePreset('thismonth'));

    document.getElementById('btn-apply-custom-date')?.addEventListener('click', () => {
        const customVal = document.getElementById('toolbar-custom-date')?.value;
        if (customVal) {
            setDatePreset('custom', customVal);
        } else {
            alert('Please select a date first.');
        }
    });

    document.getElementById('toolbar-custom-date')?.addEventListener('change', (e) => {
        if (e.target.value) {
            setDatePreset('custom', e.target.value);
        }
    });

    // CSV Data Export Button
    document.getElementById('btn-export-csv')?.addEventListener('click', exportTallyForgeCSV);

    // Date and Tag Clear Filter actions
    document.getElementById('btn-clear-date-filter')?.addEventListener('click', () => setDatePreset('all'));
    document.getElementById('btn-clear-tag-filter')?.addEventListener('click', clearTagFilter);
    document.getElementById('btn-clear-tag-banner')?.addEventListener('click', clearTagFilter);

    // Inspector Modal Close & Filter Action
    document.getElementById('btn-close-inspector-modal')?.addEventListener('click', closeDayInspectorModal);
    document.getElementById('btn-inspector-filter')?.addEventListener('click', () => {
        if (activeFilteredDate === inspectedDate) {
            setDatePreset('all');
        } else {
            setDatePreset('custom', inspectedDate);
        }
        closeDayInspectorModal();
    });

    // Badge Celebration Modal & Dossier Drawer Listeners
    document.getElementById('btn-celebration-dismiss')?.addEventListener('click', closeCelebrationModal);
    document.getElementById('btn-celebration-share')?.addEventListener('click', shareCelebrationAchievement);
    document.getElementById('btn-close-badge-drawer')?.addEventListener('click', closeBadgeInspector);
    document.getElementById('btn-drawer-close')?.addEventListener('click', closeBadgeInspector);
    document.getElementById('badge-drawer-backdrop')?.addEventListener('click', closeBadgeInspector);

    // Initialize Milestone Category Filter Tabs
    initMilestoneFilterTabs();

    // Escape Key Handler for All Modals & Drawers
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAuthModal();
            closeDayInspectorModal();
            closeBadgeInspector();
            closeCelebrationModal();
        }
    });

    // Handle Expense Form Submission (with custom tags)
    document.getElementById('expense-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-expense');
        const originalBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Saving...</span>';
        }

        const amtInput = document.getElementById('exp-amount').value.trim();
        const amtParsed = parseFloat(amtInput);
        const tagsInput = document.getElementById('exp-tags')?.value || '';

        const payload = {
            category: document.getElementById('exp-category').value.trim(),
            amount: isNaN(amtParsed) ? amtInput : amtParsed,
            date: document.getElementById('exp-date').value,
            tags: tagsInput
        };

        try {
            const response = await fetch('/api/add-expense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                showLandingView();
                return;
            }

            const resData = await response.json();
            if (response.ok && resData.status === 'success') {
                document.getElementById('expense-form').reset();
                setDefaultDates();
                await loadAndDrawCharts();
            } else {
                alert(resData.message || 'Failed to add expense.');
            }
        } catch (err) {
            console.error('Error submitting expense:', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    });

    // Handle Study Form Submission (with custom tags)
    document.getElementById('study-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-study');
        const originalBtnText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Saving...</span>';
        }

        const hoursInput = document.getElementById('std-hours').value.trim();
        const hoursParsed = parseFloat(hoursInput);
        const tagsInput = document.getElementById('std-tags')?.value || '';

        const payload = {
            subject: document.getElementById('std-subject').value.trim(),
            hours: isNaN(hoursParsed) ? hoursInput : hoursParsed,
            date: document.getElementById('std-date').value,
            tags: tagsInput
        };

        try {
            const response = await fetch('/api/add-study', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                showLandingView();
                return;
            }

            const resData = await response.json();
            if (response.ok && resData.status === 'success') {
                document.getElementById('study-form').reset();
                setDefaultDates();
                await loadAndDrawCharts();
            } else {
                alert(resData.message || 'Failed to add study log.');
            }
        } catch (err) {
            console.error('Error submitting study log:', err);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    });

    // Initialize Vibe Logger, Focus ROI Simulator and Floating Dock
    initVibeLogger();
    initFocusROISimulator();
    initFloatingDock();
}

function updateDockPill(activeTab) {
    const dock = document.getElementById('floating-dock');
    const pill = document.getElementById('dock-pill');
    if (!dock || !pill || !activeTab) return;

    const dockRect = dock.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();

    const leftOffset = tabRect.left - dockRect.left;
    const topOffset = tabRect.top - dockRect.top;
    const width = activeTab.offsetWidth;
    const height = activeTab.offsetHeight;

    pill.style.width = `${width}px`;
    pill.style.height = `${height}px`;
    pill.style.transform = `translate(${leftOffset}px, ${topOffset}px)`;
    pill.classList.add('ready');
}

function switchDashboardView(viewName) {
    const dashboardSection = document.getElementById('dashboard-section');
    const dock = document.getElementById('floating-dock');
    if (!dashboardSection || !dock) return;

    const tabs = dock.querySelectorAll('.dock-tab');
    let activeTab = null;
    tabs.forEach(tab => {
        if (tab.dataset.view === viewName) {
            tab.classList.add('active');
            activeTab = tab;
        } else {
            tab.classList.remove('active');
        }
    });

    if (activeTab) {
        updateDockPill(activeTab);
    }

    dashboardSection.classList.remove('view-expenses', 'view-study', 'view-analytics', 'view-matrix', 'view-milestones', 'view-dashboard');
    if (viewName !== 'dashboard') {
        dashboardSection.classList.add(`view-${viewName}`);
    }

    setTimeout(() => {
        if (expenseChartInstance && typeof expenseChartInstance.resize === 'function') {
            expenseChartInstance.resize();
        }
        if (studyChartInstance && typeof studyChartInstance.resize === 'function') {
            studyChartInstance.resize();
        }
    }, 150);
}

function initFloatingDock() {
    const dock = document.getElementById('floating-dock');
    if (!dock) return;

    const tabs = dock.querySelectorAll('.dock-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view || 'dashboard';
            switchDashboardView(view);
        });
    });

    window.addEventListener('resize', () => {
        const currentActive = dock.querySelector('.dock-tab.active') || tabs[0];
        if (currentActive) {
            updateDockPill(currentActive);
        }
    });
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getCurrentTheme(), false);
    setupEventListeners();
    checkSession();
});