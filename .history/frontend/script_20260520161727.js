// script.js – full platform integration

let authToken = localStorage.getItem('token');
let currentUser = null;

function setAuthToken(token) {
  if (token) {
    localStorage.setItem('token', token);
    authToken = token;
  } else {
    localStorage.removeItem('token');
    authToken = null;
    currentUser = null;
  }
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !window.location.pathname.includes('login.html')) {
    setAuthToken(null);
    window.location.href = 'login.html';
    throw new Error('Session expired');
  }
  return res;
}

async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    setAuthToken(data.token);
    currentUser = data.user;
    return true;
  }
  alert(data.error || 'Login failed');
  return false;
}

async function logout() {
  setAuthToken(null);
  window.location.href = 'index.html';
}

async function loadCurrentUser() {
  if (!authToken) return null;
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) currentUser = await res.json();
  } catch(e) {}
  return currentUser;
}

// ---------- PAGE INITIALIZERS ----------
async function initSearchPage() {
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const searchBtn = document.getElementById('searchBtn');
  const grid = document.getElementById('gridContainer');
  async function fetchAndRender() {
    const search = searchInput?.value || '';
    const category = categorySelect?.value || '';
    const res = await fetch(`/api/businesses?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`);
    const businesses = await res.json();
    if (grid) {
      grid.innerHTML = businesses.map(b => `
        <div class="bg-[var(--card-bg)] p-6 rounded-3xl border">
          <h3 class="text-xl font-black">${b.name}</h3>
          <p class="text-gray-500 text-sm mt-2">${b.description?.substring(0, 100)}</p>
          <a href="business.html?id=${b.id}" class="btn-primary mt-4 inline-block">View</a>
        </div>
      `).join('');
    }
  }
  if (searchBtn) searchBtn.addEventListener('click', fetchAndRender);
  if (searchInput) searchInput.addEventListener('keyup', fetchAndRender);
  await fetchAndRender();
}

async function initBusinessPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  if (!id) return;
  const res = await fetch(`/api/businesses/${id}`);
  const business = await res.json();
  const container = document.getElementById('businessContent');
  if (!container) return;
  container.innerHTML = `
    <h1 class="text-5xl font-black mb-4">${business.business_name}</h1>
    <p class="text-gray-500 mb-6">${business.description}</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h2 class="text-2xl font-bold mb-4">Services</h2>
        ${business.services.map(s => `<div class="mb-4"><strong>${s.name}</strong> – N$${s.price} / ${s.duration_minutes} min</div>`).join('')}
      </div>
      <div>
        <h2 class="text-2xl font-bold mb-4">Reviews</h2>
        ${business.reviews.map(r => `<div class="mb-2">⭐ ${r.rating} – ${r.comment}</div>`).join('')}
      </div>
    </div>
    <a href="https://wa.me/${business.whatsapp_number}" class="btn-primary mt-8 inline-block">Contact on WhatsApp</a>
  `;
}

async function initDashboard() {
  if (!currentUser || currentUser.role !== 'provider') {
    document.getElementById('dashboardStats').innerHTML = '<p class="text-center">Please login as a provider</p>';
    return;
  }
  const statsRes = await apiFetch('/api/dashboard/stats');
  const stats = await statsRes.json();
  const statsDiv = document.getElementById('dashboardStats');
  statsDiv.innerHTML = `
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Total Bookings: ${stats.totalBookings}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Reviews: ${stats.totalReviews}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Quotes: ${stats.totalQuotes}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Profile Views: ${stats.profileViews}</div>
  `;
  const bookingsRes = await apiFetch('/api/dashboard/recent-bookings');
  const bookings = await bookingsRes.json();
  document.getElementById('recentBookings').innerHTML = bookings.map(b => `
    <div class="p-4 border rounded-xl mb-2">${b.client_name} – ${b.service_name} on ${new Date(b.start_time).toLocaleString()}</div>
  `).join('');
  const servicesRes = await apiFetch('/api/services/my');
  const services = await servicesRes.json();
  document.getElementById('servicesList').innerHTML = services.map(s => `
    <div class="flex justify-between p-4 border rounded-xl mb-2">
      <span>${s.name} – N$${s.price}</span>
      <button class="text-red-500 delete-service" data-id="${s.id}">Delete</button>
    </div>
  `).join('');
}

async function initAdmin() {
  if (!currentUser || currentUser.role !== 'admin') return window.location.href = 'login.html';
  const statsRes = await apiFetch('/api/admin/stats');
  const stats = await statsRes.json();
  document.getElementById('adminStats').innerHTML = `
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Providers: ${stats.totalProviders}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Bookings: ${stats.totalBookings}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Users: ${stats.totalUsers}</div>
    <div class="p-6 bg-[var(--card-bg)] rounded-2xl">Monthly Revenue: N$${stats.monthlyRevenue}</div>
  `;
  const pendingRes = await apiFetch('/api/admin/pending-verifications');
  const pending = await pendingRes.json();
  document.getElementById('pendingVerifications').innerHTML = pending.map(p => `
    <div class="border rounded-xl p-4 mb-4">
      <p><strong>${p.business_name}</strong> – ${p.email}</p>
      <button class="btn-primary approve-btn" data-id="${p.user_id}">Approve</button>
      <button class="btn-secondary reject-btn" data-id="${p.user_id}">Reject</button>
    </div>
  `).join('');
}

// Event listeners for dynamic buttons
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('approve-btn')) {
    const userId = e.target.dataset.id;
    await apiFetch(`/api/admin/verify-provider/${userId}`, { method: 'PUT' });
    location.reload();
  }
  if (e.target.classList.contains('reject-btn')) {
    const userId = e.target.dataset.id;
    await apiFetch(`/api/admin/reject-provider/${userId}`, { method: 'DELETE' });
    location.reload();
  }
  if (e.target.classList.contains('upgrade-btn')) {
    const tier = e.target.dataset.tier;
    const res = await apiFetch('/api/subscriptions/upgrade', { method: 'POST', body: JSON.stringify({ tier }) });
    if (res.ok) alert(`Upgraded to ${tier}!`);
  }
  if (e.target.id === 'logoutDashboard' || e.target.id === 'adminLogout') logout();
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadCurrentUser();
  const path = window.location.pathname;
  if (path.includes('search.html')) initSearchPage();
  if (path.includes('business.html')) initBusinessPage();
  if (path.includes('dashboard.html')) initDashboard();
  if (path.includes('admin.html')) initAdmin();
});