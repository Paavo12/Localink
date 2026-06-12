// script.js – full backend integration

// ---------- GLOBALS ----------
let authToken = localStorage.getItem('token');
let currentUser = null;

// ---------- HELPER FUNCTIONS ----------
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
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // Unauthorized – clear token and redirect to login
    setAuthToken(null);
    if (!window.location.pathname.includes('login.html')) {
      window.location.href = 'login.html';
    }
    throw new Error('Session expired');
  }
  return res;
}

// ---------- AUTH ----------
async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (res.ok) {
    setAuthToken(data.token);
    currentUser = data.user;
    return true;
  } else {
    alert(data.error || 'Login failed');
    return false;
  }
}

async function logout() {
  setAuthToken(null);
  window.location.href = 'index.html';
}

async function loadCurrentUser() {
  if (!authToken) return null;
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
      return currentUser;
    }
  } catch (e) {}
  return null;
}

// ---------- BUSINESS FUNCTIONS ----------
async function fetchBusinesses(search = '', category = '') {
  let url = '/api/businesses';
  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (category) params.append('category', category);
  if (params.toString()) url += '?' + params.toString();
  const res = await fetch(url);
  return res.json();
}

async function fetchBusinessById(id) {
  const res = await fetch(`/api/businesses/${id}`);
  if (!res.ok) throw new Error('Business not found');
  return res.json();
}

// ---------- BOOKING & QUOTE ----------
async function createBooking(providerId, serviceName, startTime, notes = '') {
  if (!authToken) {
    alert('Please login to book');
    window.location.href = 'login.html';
    return false;
  }
  const res = await apiFetch('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({ providerId, serviceName, startTime, notes })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Booking request sent!');
    return true;
  } else {
    alert(data.error || 'Booking failed');
    return false;
  }
}

async function requestQuote(providerId, name, email, phone, message) {
  const res = await fetch('/api/quote-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, name, email, phone, message })
  });
  const data = await res.json();
  if (res.ok) {
    alert('Quote request sent! The business will contact you.');
    return true;
  } else {
    alert(data.error || 'Failed to send quote');
    return false;
  }
}

// ---------- ADMIN FUNCTIONS ----------
async function adminFetchUsers() {
  const res = await apiFetch('/api/admin/users');
  return res.json();
}

async function adminDeactivateUser(userId) {
  const res = await apiFetch(`/api/admin/users/${userId}/deactivate`, { method: 'PUT' });
  return res.ok;
}

async function adminReactivateUser(userId) {
  const res = await apiFetch(`/api/admin/users/${userId}/reactivate`, { method: 'PUT' });
  return res.ok;
}

async function adminDeleteUser(userId) {
  if (confirm('Permanently delete this user? This action cannot be undone.')) {
    const res = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (res.ok) alert('User deleted');
    else alert('Delete failed');
    return res.ok;
  }
  return false;
}

// ---------- UI HELPERS ----------
function updateNavbarForUser() {
  const loginLink = document.querySelector('.provider-login-link');
  const getListedBtn = document.querySelector('.get-listed-btn');
  const userMenu = document.querySelector('.user-menu');
  if (currentUser) {
    if (loginLink) loginLink.style.display = 'none';
    if (getListedBtn) getListedBtn.style.display = 'none';
    if (userMenu) {
      userMenu.style.display = 'flex';
      userMenu.innerHTML = `
        <span class="text-sm font-bold">${currentUser.full_name || currentUser.email}</span>
        <button id="logoutBtn" class="text-sm font-black text-gray-500 hover:text-[var(--text-main)]">Logout</button>
      `;
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
    }
  } else {
    if (loginLink) loginLink.style.display = 'inline-block';
    if (getListedBtn) getListedBtn.style.display = 'inline-block';
    if (userMenu) userMenu.style.display = 'none';
  }
}

// ---------- PAGE SPECIFIC INITIALIZATION ----------
async function initSearchPage() {
  const searchInput = document.querySelector('#searchInput');
  const categorySelect = document.querySelector('#categorySelect');
  const gridContainer = document.getElementById('gridContainer');
  
  async function loadAndRender() {
    const search = searchInput ? searchInput.value : '';
    const category = categorySelect ? categorySelect.value : '';
    const businesses = await fetchBusinesses(search, category);
    if (gridContainer) {
      gridContainer.innerHTML = businesses.map(b => renderBusinessCard(b)).join('');
    }
  }
  
  if (searchInput) searchInput.addEventListener('input', loadAndRender);
  if (categorySelect) categorySelect.addEventListener('change', loadAndRender);
  await loadAndRender();
}

function renderBusinessCard(b) {
  return `
    <div class="group bg-[var(--card-bg)] p-6 rounded-[3rem] border border-[var(--border-main)] hover:shadow-2xl transition-all flex flex-col gap-6">
      <div class="h-48 w-full rounded-[2rem] overflow-hidden shrink-0 border-4 border-[var(--card-bg)] shadow-sm ring-1 ring-[var(--border-main)]">
        <img src="${b.logo_url || 'https://placehold.co/400x300'}" alt="${b.name}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
      </div>
      <div class="flex-1 flex flex-col px-2">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-black uppercase tracking-tighter group-hover:text-accent transition-colors leading-tight mb-2 text-[var(--text-main)]">${b.name}</h3>
            ${b.is_verified ? '<span class="badge-verified">Verified Pro</span>' : ''}
          </div>
          <div class="flex items-center gap-1 font-black text-[10px] italic py-1 px-3 bg-yellow-500/10 rounded-lg text-yellow-500">★ 5.0</div>
        </div>
        <p class="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-6 line-clamp-2">${b.description || ''}</p>
        <div class="mt-auto flex items-center justify-between pt-6 border-t border-dashed border-[var(--border-main)]">
          <span class="text-accent font-black tracking-tighter text-sm uppercase italic">Contact for price</span>
          <div class="flex gap-2">
            <a href="https://wa.me/${b.whatsapp_number || ''}" target="_blank" class="p-3 rounded-2xl bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
            </a>
            <a href="business.html?id=${b.id}" class="px-5 py-2.5 bg-accent text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:opacity-80 transition-all shadow-neon">View</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function initBusinessPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get('id');
  if (!id) {
    document.getElementById('businessContent').innerHTML = '<p class="text-center">No business ID provided.</p>';
    return;
  }
  try {
    const business = await fetchBusinessById(id);
    document.getElementById('businessName').textContent = business.business_name;
    document.getElementById('businessDesc').textContent = business.description;
    document.getElementById('businessAddress').textContent = business.address;
    document.getElementById('whatsappLink').href = `https://wa.me/${business.whatsapp_number}`;
    if (business.cover_image_url) {
      document.getElementById('coverImage').src = business.cover_image_url;
    }
    // populate map later
  } catch (err) {
    document.getElementById('businessContent').innerHTML = '<p class="text-center">Business not found.</p>';
  }
}

// ---------- THEME & MOBILE MENU (unchanged from previous) ----------
function initThemeAndMobile() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') html.classList.add('dark');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
    });
  }
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
  }
}

// ---------- RUN ON PAGE LOAD ----------
document.addEventListener('DOMContentLoaded', async () => {
  initThemeAndMobile();
  await loadCurrentUser();
  updateNavbarForUser();
  
  if (window.location.pathname.includes('search.html')) {
    initSearchPage();
  } else if (window.location.pathname.includes('business.html')) {
    initBusinessPage();
  } else if (window.location.pathname.includes('dashboard.html')) {
    // simple dashboard: show user info and logout
    const dashboardContent = document.getElementById('dashboardContent');
    if (currentUser) {
      dashboardContent.innerHTML = `
        <h2>Welcome, ${currentUser.full_name || currentUser.email}</h2>
        <p>Role: ${currentUser.role}</p>
        <button id="logoutBtnDashboard" class="btn-primary">Logout</button>
      `;
      document.getElementById('logoutBtnDashboard')?.addEventListener('click', logout);
    } else {
      dashboardContent.innerHTML = '<p>Please <a href="login.html">login</a> to view your dashboard.</p>';
    }
  } else if (window.location.pathname.includes('admin.html')) {
    if (currentUser && currentUser.role === 'admin') {
      // Admin page has its own JS (see admin.html)
    } else {
      window.location.href = 'login.html';
    }
  }
});