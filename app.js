// Supabase Configuration
const SUPABASE_URL = 'https://fkllmapqtlahiozucgmz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrbGxtYXBxdGxhaGlvenVjZ216Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODA1MjYsImV4cCI6MjA4ODg1NjUyNn0.WS_P9W4YGjuT3GAObUFh-ZKzIUes3Deff5hvV7RIN3o';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// State
let currentUser = null;
let currentProfile = null;
let transactions = [];
let categories = [];
let charts = {};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    checkSession();
    setupEventListeners();
    initUI();
});

async function checkSession() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (session) {
        onLoginSuccess(session.user);
    } else {
        showView('auth');
    }
}

function setupEventListeners() {
    // Nav Links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = e.target.getAttribute('data-view');
            showView(view);
        });
    });

    // Login Form
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Register Form
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Transaction Form
    document.getElementById('transaction-form').addEventListener('submit', handleNewTransaction);

    // Pending Form
    document.getElementById('pending-form').addEventListener('submit', handleNewPendingPayment);
}

function initUI() {
    // Set default date to today for transaction form
    document.getElementById('t-date').valueAsDate = new Date();
}

// View Management
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');

    // Update Nav
    document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('data-view') === viewId);
    });

    // Refresh data if needed
    if (viewId === 'dashboard') loadDashboard();
    if (viewId === 'transactions') loadTransactions();
    if (viewId === 'budget') loadPendingPayments();
    if (viewId === 'admin') loadAdminPanel();
}

// Authentication Handlers
async function handleLogin(e) {
    e.preventDefault();
    const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const alert = document.getElementById('login-alert');

    if (!emailInput || !password) {
        showAlert(alert, '⚠️ Completa tu correo y contraseña.', 'warning');
        return;
    }

    // Handle special admin cases
    let email = emailInput;
    if ((emailInput === '@admin' || emailInput === 'admin') && password === 'admin') {
        email = 'admin@cashflow.local';
    } else if (emailInput === '@admin' || emailInput === 'admin') {
        showAlert(alert, '❌ Credenciales incorrectas.', 'error');
        return;
    }

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
        if (error.message.includes('Email not confirmed')) {
            showAlert(alert, '📩 Debes verificar tu correo antes de iniciar sesión.', 'warning');
        } else if (error.message.includes('Invalid login credentials') && email === 'admin@cashflow.local') {
            // Suggest creating the admin if it doesn't exist
            showAlert(alert, '⚠️ La cuenta admin no existe aún. Por favor regístrate con admin@cashflow.local y contraseña admin.', 'warning');
        } else {
            showAlert(alert, '❌ Correo o contraseña incorrectos.', 'error');
        }
    } else {
        showAlert(alert, '✅ Sesión iniciada correctamente.', 'success');
        setTimeout(() => onLoginSuccess(data.user), 1500);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const nombre = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const alert = document.getElementById('register-alert');

    if (password !== confirm) {
        showAlert(alert, '❌ Las contraseñas no coinciden.', 'error');
        return;
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        showAlert(alert, '🔒 La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.', 'warning');
        return;
    }

    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { nombre: nombre }
        }
    });

    if (error) {
        showAlert(alert, `⚠️ ${error.message}`, 'error');
    } else {
        showAlert(alert, '✅ Cuenta creada correctamente. Revisa tu correo para verificarla.', 'success');
    }
}

async function onLoginSuccess(user) {
    currentUser = user;
    
    // Fetch Profile
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error) {
        console.error("Error fetching profile:", error);
    }
    currentProfile = profile;

    // UI Updates
    document.getElementById('logged-in-nav').style.display = 'flex';
    document.getElementById('welcome-user').innerText = `Hola, ${profile ? profile.nombre : 'Usuario'}`;
    
    // Auth Controls
    document.getElementById('auth-controls').innerHTML = `
        <button class="btn btn-outline" onclick="handleLogout()">
            <ion-icon name="log-out-outline"></ion-icon>
            <span>Salir</span>
        </button>
    `;

    // Admin Access
    if (profile && profile.role === 'admin') {
        document.getElementById('admin-link').style.display = 'inline';
    }

    showView('dashboard');
    loadCategories();
}

async function handleLogout() {
    await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    document.getElementById('logged-in-nav').style.display = 'none';
    document.getElementById('auth-controls').innerHTML = ``;
    showView('auth');
}

// Data Loading
async function loadCategories() {
    const { data, error } = await sb.from('categories').select('*');
    if (!error) {
        categories = data;
        const select = document.getElementById('t-category');
        select.innerHTML = categories.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        
        // Add default categories if empty
        if (categories.length === 0) {
            const defaults = ['Comida', 'Transporte', 'Vivienda', 'Salario', 'Inversión'];
            for (const name of defaults) {
                await sb.from('categories').insert({ nombre: name, user_id: currentUser.id });
            }
            loadCategories();
        }
    }
}

async function loadDashboard() {
    const { data, error } = await sb.from('transactions').select(`
        *,
        categories (nombre)
    `).order('fecha', { ascending: false });

    if (!error) {
        transactions = data;
        updateStats();
        renderCharts();
    }
}

function updateStats() {
    const income = transactions.filter(t => t.tipo === 'ingreso').reduce((acc, t) => acc + Number(t.monto), 0);
    const expense = transactions.filter(t => t.tipo === 'gasto').reduce((acc, t) => acc + Number(t.monto), 0);
    const balance = income - expense;

    document.getElementById('stat-income').innerText = formatCurrency(income);
    document.getElementById('stat-expense').innerText = formatCurrency(expense);
    document.getElementById('stat-balance').innerText = formatCurrency(balance);
    document.getElementById('stat-net').innerText = formatCurrency(balance);
}

// Transactions
async function handleNewTransaction(e) {
    e.preventDefault();
    const type = document.getElementById('t-type').value;
    const amount = document.getElementById('t-amount').value;
    const date = document.getElementById('t-date').value;
    const desc = document.getElementById('t-desc').value;
    const catId = document.getElementById('t-category').value;

    const { error } = await sb.from('transactions').insert({
        user_id: currentUser.id,
        tipo: type,
        monto: amount,
        fecha: date,
        descripcion: desc,
        categoria_id: catId
    });

    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        closeModal('transaction-modal');
        loadDashboard();
        e.target.reset();
        initUI();
    }
}

async function loadTransactions() {
    const { data, error } = await sb.from('transactions').select(`
        *,
        categories (nombre)
    `).order('fecha', { ascending: false });

    if (!error) {
        const tbody = document.querySelector('#transactions-table tbody');
        tbody.innerHTML = data.map(t => `
            <tr>
                <td>${t.fecha}</td>
                <td>${t.descripcion}</td>
                <td>${t.categories?.nombre || 'S/C'}</td>
                <td><span class="badge ${t.tipo === 'ingreso' ? 'badge-income' : 'badge-expense'}">${t.tipo.toUpperCase()}</span></td>
                <td>${formatCurrency(t.monto)}</td>
                <td>
                    <button class="btn" style="padding: 0.2rem;" onclick="deleteTransaction(${t.id})">
                        <ion-icon name="trash-outline" style="color: var(--error);"></ion-icon>
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

// Pending Payments Logic
async function loadPendingPayments() {
    const { data, error } = await sb.from('pending_payments').select('*').order('fecha_limite', { ascending: true });
    if (!error) {
        const container = document.getElementById('pending-payments-list');
        if (!container) return;
        
        container.innerHTML = data.map(p => `
            <div class="glass-panel" style="margin-bottom: 1rem; border-left: 4px solid ${p.estado === 'pendiente' ? 'var(--warning)' : 'var(--success)'}">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin-bottom: 0.25rem;">${p.descripcion}</h4>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">Vence: ${p.fecha_limite}</p>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700;">${formatCurrency(p.monto)}</div>
                        <button class="btn" style="padding: 0.2rem; margin-top: 0.5rem;" onclick="markAsPaid(${p.id})">
                            <ion-icon name="checkmark-circle-outline" style="color: var(--success); font-size: 1.2rem;"></ion-icon>
                        </button>
                    </div>
                </div>
            </div>
        `).join('') || '<p style="color: var(--text-muted); text-align: center; padding: 1rem;">No hay pagos pendientes.</p>';
    }
}

async function handleNewPendingPayment(e) {
    e.preventDefault();
    const desc = document.getElementById('p-desc').value;
    const amount = document.getElementById('p-amount').value;
    const date = document.getElementById('p-date').value;

    const { error } = await sb.from('pending_payments').insert({
        user_id: currentUser.id,
        descripcion: desc,
        monto: amount,
        fecha_limite: date,
        estado: 'pendiente'
    });

    if (error) {
        alert("Error: " + error.message);
    } else {
        closeModal('pending-modal');
        loadPendingPayments();
        e.target.reset();
    }
}
async function markAsPaid(id) {
    const { error } = await sb.from('pending_payments').update({ estado: 'pagado' }).eq('id', id);
    if (!error) loadPendingPayments();
}

async function deleteTransaction(id) {
    if (confirm("¿Eliminar esta transacción?")) {
        await sb.from('transactions').delete().eq('id', id);
        loadTransactions();
    }
}

// Admin Panel
async function loadAdminPanel() {
    const { data, error } = await sb.from('profiles').select('*');
    if (!error) {
        const tbody = document.getElementById('admin-users-table');
        tbody.innerHTML = data.map(u => `
            <tr>
                <td>${u.nombre}</td>
                <td>${u.email}</td>
                <td><span class="badge ${u.bloqueado ? 'badge-expense' : 'badge-income'}">${u.bloqueado ? 'Bloqueado' : 'Activo'}</span></td>
                <td>${u.verificado ? '✅' : '❌'}</td>
                <td>${new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-outline" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" onclick="toggleUserBlock('${u.id}', ${u.bloqueado})">
                        ${u.bloqueado ? 'Desbloquear' : 'Bloquear'}
                    </button>
                </td>
            </tr>
        `).join('');
    }
}

async function toggleUserBlock(id, currentStatus) {
    const { error } = await sb.from('profiles').update({ bloqueado: !currentStatus }).eq('id', id);
    if (!error) loadAdminPanel();
}

// Charts
function renderCharts() {
    const ctxComp = document.getElementById('chart-comparison').getContext('2d');
    const ctxCat = document.getElementById('chart-categories').getContext('2d');

    // Comparison Chart (Bar)
    if (charts.comparison) charts.comparison.destroy();
    
    const incomeTotal = transactions.filter(t => t.tipo === 'ingreso').reduce((acc, t) => acc + Number(t.monto), 0);
    const expenseTotal = transactions.filter(t => t.tipo === 'gasto').reduce((acc, t) => acc + Number(t.monto), 0);

    charts.comparison = new Chart(ctxComp, {
        type: 'bar',
        data: {
            labels: ['Ingresos', 'Gastos'],
            datasets: [{
                label: 'Monto Total',
                data: [incomeTotal, expenseTotal],
                backgroundColor: ['#10b981', '#ef4444'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } }
        }
    });

    // Categories Chart (Pie)
    if (charts.categories) charts.categories.destroy();
    
    const catData = {};
    transactions.filter(t => t.tipo === 'gasto').forEach(t => {
        const name = t.categories?.nombre || 'Otros';
        catData[name] = (catData[name] || 0) + Number(t.monto);
    });

    charts.categories = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catData),
            datasets: [{
                data: Object.values(catData),
                backgroundColor: ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8' } }
            }
        }
    });
}

// Helpers
function togglePassword(id) {
    const input = document.getElementById(id);
    input.type = input.type === 'password' ? 'text' : 'password';
}

function showAuthMode(mode) {
    document.getElementById('login-form-container').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('register-form-container').style.display = mode === 'register' ? 'block' : 'none';
}

function showAlert(el, msg, type) {
    el.innerText = msg;
    el.className = `alert alert-${type} show`;
    if (type === 'success') {
        setTimeout(() => el.classList.remove('show'), 3000);
    }
}

function formatCurrency(val) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);
}

function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
