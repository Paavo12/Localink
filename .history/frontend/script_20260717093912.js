// script.js – Final stable version (all features, fixed errors)
let authToken = localStorage.getItem('token');
let currentUser = null;

// XSS protection
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ========== TOAST NOTIFICATIONS ==========
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer') || createToastContainer();
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <span>${message}</span>
    <button class="toast-close" aria-label="Close notification">&times;</button>
  `;
  
  container.appendChild(toast);
  
  toast.querySelector('.toast-close').addEventListener('click', () => {
    removeToast(toast);
  });
  
  setTimeout(() => {
    removeToast(toast);
  }, duration);
  
  return toast;
}

function createToastContainer() {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

function removeToast(toast) {
  if (toast.classList.contains('hiding')) return;
  toast.classList.add('hiding');
  setTimeout(() => {
    toast.remove();
  }, 300);
}

function setAuthToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
  authToken = token;
}

async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !location.pathname.includes('login')) {
    setAuthToken(null);
    location.href = 'login.html';
    throw new Error('Session expired');
  }
  return res;
}

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
    localStorage.setItem('userRole', data.user.role);
    return true;
  }
  showToast(data.error || 'Login failed', 'error');
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
    if (res.ok) {
      currentUser = await res.json();
      return currentUser;
    }
  } catch (e) {}
  return null;
}

// ---------- NAVBAR AUTH TOGGLE ----------
function updateNavbarAuth() {
  const loggedOutNav = document.getElementById('loggedOutNav');
  const loggedInNav = document.getElementById('loggedInNav');
  if (!loggedOutNav || !loggedInNav) return;

  if (currentUser) {
    loggedOutNav.classList.add('hidden');
    loggedInNav.classList.remove('hidden');
  } else {
    loggedOutNav.classList.remove('hidden');
    loggedInNav.classList.add('hidden');
  }
}

// ---------- THEME TOGGLE ----------
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    html.classList.remove('dark');
  } else {
    html.classList.add('dark');
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
    });
  }
}

// ---------- NAVBAR SCROLL ----------
function initNavbarScroll() {
  const header = document.querySelector('header');
  if (!header) return;
  let ticking = false;
  function handleScroll() {
    if (window.scrollY > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(handleScroll);
      ticking = true;
    }
  });
  handleScroll();
}

// ---------- Helper: Open Now ----------
function isOpenNow(hours) {
  const now = new Date();
  const day = now.getDay();
  const current = now.getHours() * 60 + now.getMinutes();
  const today = hours.find(h => h.day_of_week === day);
  if (!today || today.is_closed) return false;
  const [openH, openM] = today.open_time.split(':').map(Number);
  const [closeH, closeM] = today.close_time.split(':').map(Number);
  const open = openH * 60 + openM;
  const close = closeH * 60 + closeM;
  return current >= open && current <= close;
}

// ---------- Distance ----------
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ========== LOADING STATES ==========
function showLoading(container, message = 'Loading...') {
  if (!container) return;
  container.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>${message}</p>
    </div>
  `;
}

function showSkeletonCards(container, count = 6) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-text w-75"></div>
        <div class="skeleton skeleton-text w-50"></div>
        <div class="skeleton skeleton-text w-25"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// ---------- STATUS BADGE COLOR ----------
function getStatusBadgeColor(status) {
  const colors = {
    pending: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
    confirmed: 'bg-green-500/20 text-green-600 dark:text-green-400',
    completed: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
    cancelled: 'bg-red-500/20 text-red-600 dark:text-red-400'
  };
  return colors[status] || 'bg-gray-500/20 text-gray-600 dark:text-gray-400';
}

// ---------- Image Upload Helpers ----------
async function uploadLogo(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload/logo', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) showToast('Logo uploaded!', 'success');
  else showToast('Upload failed', 'error');
}

async function uploadCover(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload/cover', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) showToast('Cover image uploaded!', 'success');
  else showToast('Upload failed', 'error');
}

async function uploadServiceImage(serviceId, file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/api/upload/service/${serviceId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) showToast('Service image added!', 'success');
  else showToast('Upload failed', 'error');
}

// ========== SEARCH PAGE ==========
async function initSearchPage() {
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const cityFilter = document.getElementById('cityFilter');
  const ratingFilter = document.getElementById('ratingFilter');
  const searchBtn = document.getElementById('searchBtn');
  const grid = document.getElementById('gridContainer');

  const urlParams = new URLSearchParams(window.location.search);
  const categoryParam = urlParams.get('category');
  if (categoryParam) {
    const optionExists = Array.from(categorySelect.options).some(opt => opt.value === categoryParam);
    if (optionExists) {
      categorySelect.value = categoryParam;
    } else {
      categorySelect.value = categoryParam;
    }
  }

  async function fetchAndRender() {
    if (grid) showSkeletonCards(grid, 6);
    
    const search = searchInput?.value || '';
    const category = categorySelect?.value || '';
    const city = cityFilter?.value || '';
    const rating = ratingFilter?.value || '';
    let url = `/api/businesses?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (rating) url += `&rating=${encodeURIComponent(rating)}`;
    
    try {
      const res = await fetch(url);
      const businesses = await res.json();
      
      if (grid) {
        if (businesses.length === 0) {
          grid.innerHTML = `
            <div class="col-span-3 text-center py-20">
              <p class="text-[var(--foreground-muted)] text-lg">No businesses found</p>
              <p class="text-sm mt-2 text-[var(--foreground-muted)]">Try adjusting your filters</p>
            </div>
          `;
          return;
        }
        grid.innerHTML = businesses.map(b => `
          <div class="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border)] hover:shadow-lg transition-shadow">
            <img src="${escapeHtml(b.logo_url || 'https://placehold.co/400x300')}" class="h-40 w-full object-cover rounded-xl mb-3" onerror="this.src='https://placehold.co/400x300'">
            <h3 class="text-xl font-black text-[var(--foreground)]">${escapeHtml(b.name)}</h3>
            <p class="text-[var(--foreground-muted)] text-sm mt-2">${escapeHtml(b.description?.substring(0, 100))}</p>
            <div class="mt-4 flex justify-between items-center">
              <span>
                ${b.subscription_tier === 'premium' ? '<span class="badge-premium">⭐ Featured</span>' : ''}
                ${b.subscription_tier === 'verified' ? '<span class="badge-verified">✅ Verified</span>' : ''}
                ${b.subscription_tier === 'basic' ? '<span class="text-xs text-[var(--foreground-muted)]">Basic</span>' : ''}
              </span>
              <a href="business.html?id=${b.id}" class="btn-primary text-sm">View</a>
            </div>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Search error:', err);
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-3 text-center py-20">
            <p class="text-red-500">Failed to load results</p>
            <p class="text-sm mt-2 text-[var(--foreground-muted)]">Please try again</p>
          </div>
        `;
      }
    }
  }

  searchBtn?.addEventListener('click', fetchAndRender);
  searchInput?.addEventListener('keyup', (e) => { if (e.key === 'Enter') fetchAndRender(); });
  cityFilter?.addEventListener('change', fetchAndRender);
  ratingFilter?.addEventListener('change', fetchAndRender);
  categorySelect?.addEventListener('change', fetchAndRender);

  await fetchAndRender();
}

// ========== BUSINESS PAGE ==========
async function initBusinessPage() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return;
  const res = await fetch(`/api/businesses/${id}`);
  const b = await res.json();
  const container = document.getElementById('businessContent');
  if (!container) return;

  let portfolioItems = [];
  try {
    const portRes = await fetch(`/api/dashboard/portfolio/public/${b.user_id}`);
    if (portRes.ok) portfolioItems = await portRes.json();
  } catch (e) { console.error('Portfolio fetch error:', e); }

  const open = isOpenNow(b.hours);

  let html = `
    <div class="relative mb-8">
      ${b.cover_image_url ? `<img src="${escapeHtml(b.cover_image_url)}" class="w-full h-64 object-cover rounded-2xl">` : ''}
      <div class="flex items-end gap-4 mt-4">
        ${b.logo_url ? `<img src="${escapeHtml(b.logo_url)}" class="w-24 h-24 rounded-full border-4 border-white shadow-lg -mt-12 bg-white">` : ''}
        <h1 class="text-5xl font-black text-[var(--foreground)]">${escapeHtml(b.business_name)}</h1>
      </div>
    </div>
    <div class="flex gap-4 mb-6 flex-wrap">
      ${b.is_verified ? '<span class="badge-verified">✓ Verified</span>' : ''}
      ${b.subscription_tier === 'premium' ? '<span class="badge-premium">⭐ Featured</span>' : ''}
      <span class="px-3 py-1 rounded-full text-xs ${open ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}">${open ? 'Open Now' : 'Closed Now'}</span>
    </div>
    <p class="text-[var(--foreground-secondary)] mb-6">${escapeHtml(b.description)}</p>
  `;

  if (b.lat && b.lng) {
    html += `
      <div class="mt-8">
        <h3 class="text-2xl font-bold mb-4">📍 Location</h3>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" 
           target="_blank" class="btn-secondary inline-flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-4-4m0 0l4-4m-4 4h14m-4-4l4 4-4 4"/>
          </svg>
          Get Directions
        </a>
      </div>
    `;
  } else if (b.address) {
    html += `
      <div class="mt-8">
        <h3 class="text-2xl font-bold mb-4">📍 Location</h3>
        <p class="text-[var(--foreground-muted)]">${escapeHtml(b.address)}</p>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}" target="_blank" class="btn-secondary inline-flex items-center gap-2">Get Directions</a>
      </div>
    `;
  }

  if (portfolioItems.length) {
    html += `
      <div class="mt-8">
        <h3 class="text-2xl font-bold mb-4">📸 Portfolio</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          ${portfolioItems.map(item => `
            <div class="relative group rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <img src="${escapeHtml(item.image_url)}" class="w-full h-48 object-cover" onerror="this.src='https://placehold.co/400x300?text=No+Image'">
              ${item.title ? `<div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2">${escapeHtml(item.title)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  html += `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
      <div>
        <h2 class="text-2xl font-bold mb-4">Services</h2>
        ${b.services.map(s => `
          <div class="mb-4 p-4 border rounded-xl">
            <h3 class="font-bold text-lg">${escapeHtml(s.name)}</h3>
            <p class="text-sm text-[var(--foreground-muted)]">N$${s.price} / ${s.duration_minutes} min</p>
            <p class="text-sm">${escapeHtml(s.description || '')}</p>
            ${s.image_urls && s.image_urls.length ? `
              <div class="flex gap-2 mt-2 flex-wrap">
                ${s.image_urls.map(url => `<img src="${escapeHtml(url)}" class="h-20 w-20 object-cover rounded-lg">`).join('')}
              </div>
            ` : ''}
            <button data-service-id="${s.id}" class="btn-primary text-sm mt-3 book-service-btn">Book this service</button>
            <div id="bookingForm-${s.id}" class="hidden mt-4 p-4 bg-[var(--bg-main)] border rounded-lg">
              <h4 class="font-bold">Book ${escapeHtml(s.name)}</h4>
              <input type="text" id="bookingTime-${s.id}" class="w-full p-2 my-2 border rounded-lg bg-[var(--bg-main)]" placeholder="Pick date & time" readonly>
              <textarea id="bookingNotes-${s.id}" placeholder="Any special requests?" class="w-full p-2 mb-2 border rounded-lg"></textarea>
              <button data-service-id="${s.id}" data-provider-id="${b.user_id}" class="btn-primary text-sm w-full confirm-booking-btn">Confirm Booking</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div>
        <h2 class="text-2xl font-bold mb-4">Reviews</h2>
        ${b.reviews.map(r => `
          <div class="mb-4">
            <strong>${escapeHtml(r.full_name)}</strong> ⭐${r.rating}<br/>
            ${escapeHtml(r.comment)}
            ${r.response ? `<div class="ml-4 text-sm text-[var(--foreground-muted)]">Owner reply: ${escapeHtml(r.response)}</div>` : ''}
          </div><hr/>
        `).join('')}
      </div>
    </div>
    
    <div class="mt-8">
      <h3 class="text-xl font-bold mb-4">Anonymous comments</h3>
      ${b.anonymousComments.map(c => `
        <div class="text-sm my-2">
          <em>${escapeHtml(c.alias)}</em>: ${escapeHtml(c.comment)} 
          <span class="text-xs text-[var(--foreground-muted)]">(${escapeHtml(c.sentiment)})</span>
        </div>
      `).join('')}
    </div>
    <form id="anonCommentForm" class="mt-6">
      <textarea placeholder="Leave anonymous feedback" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border)]"></textarea>
      <button type="submit" class="btn-primary mt-2">Post</button>
    </form>
    
    ${currentUser ? `
      <div class="mt-8 p-6 border rounded-2xl bg-[var(--card-bg)]">
        <h3 class="text-xl font-bold mb-4">Write a Review</h3>
        <form id="reviewForm">
          <div class="mb-3">
            <label class="block text-sm font-bold mb-1">Rating (1-5)</label>
            <select id="reviewRating" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]" required>
              <option value="">Select</option>
              <option value="5">5 ★ - Excellent</option>
              <option value="4">4 ★ - Good</option>
              <option value="3">3 ★ - Average</option>
              <option value="2">2 ★ - Poor</option>
              <option value="1">1 ★ - Terrible</option>
            </select>
          </div>
          <textarea id="reviewComment" rows="3" placeholder="Your feedback..." class="w-full p-2 mb-3 border rounded-lg bg-[var(--bg-main)]" required></textarea>
          <label class="flex items-center gap-2 mb-3">
            <input type="checkbox" id="reviewAnonymous"> Post anonymously
          </label>
          <button type="submit" class="btn-primary w-full">Submit Review</button>
        </form>
      </div>
    ` : '<p class="mt-4 text-center"><a href="login.html" class="text-[var(--orange)] hover:underline">Login to leave a review</a></p>'}
    
    <div class="mt-8 p-6 border rounded-2xl bg-[var(--card-bg)]">
      <h3 class="text-xl font-bold mb-4">Request a Quote</h3>
      <form id="quoteForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="text" id="quoteName" placeholder="Your Name" required class="w-full p-3 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20">
          <input type="email" id="quoteEmail" placeholder="Your Email" required class="w-full p-3 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20">
        </div>
        <input type="tel" id="quotePhone" placeholder="Phone (optional)" class="w-full p-3 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20">
        <textarea id="quoteMessage" rows="4" placeholder="Describe what you need..." required class="w-full p-3 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20"></textarea>
        <button type="submit" class="btn-primary w-full">Send Quote Request</button>
      </form>
      <div id="quoteSuccessMessage" class="hidden mt-4 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg border border-green-200 dark:border-green-800">
        ✅ Your quote request has been sent! The provider will contact you shortly.
      </div>
    </div>
    
    ${b.whatsapp_number ? `<a href="https://wa.me/${b.whatsapp_number.replace(/\D/g, '')}" target="_blank" class="btn-primary mt-6 inline-block flex items-center gap-2"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Contact on WhatsApp</a>` : ''}
    
    ${currentUser ? `<button id="reportBtn" class="btn-secondary mt-4">Report this business</button>` : ''}
  `;

  container.innerHTML = html;

  if (typeof flatpickr !== 'undefined') {
    document.querySelectorAll('[id^="bookingTime-"]').forEach(input => {
      flatpickr(input, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        minDate: "today",
        time_24hr: true,
        locale: { firstDayOfWeek: 1 },
      });
    });
  }

  document.querySelectorAll('.book-service-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const serviceId = this.dataset.serviceId;
      showBookingForm(serviceId);
    });
  });

  document.querySelectorAll('.confirm-booking-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const serviceId = this.dataset.serviceId;
      const providerId = this.dataset.providerId;
      submitBooking(serviceId, providerId);
    });
  });

  document.getElementById('anonCommentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = e.target.querySelector('textarea').value;
    await fetch(`/api/businesses/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
    showToast('Comment added', 'success');
    location.reload();
  });

  document.getElementById('reportBtn')?.addEventListener('click', async () => {
    const reason = prompt('Reason for report?');
    if (reason) await fetch(`/api/businesses/${id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ reason }) });
    showToast('Report sent', 'success');
  });

  document.getElementById('quoteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('quoteName').value.trim();
    const email = document.getElementById('quoteEmail').value.trim();
    const phone = document.getElementById('quotePhone').value.trim();
    const message = document.getElementById('quoteMessage').value.trim();
    if (!name || !email || !message) {
      showToast('Please fill in all required fields.', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id, name, email, phone, message })
      });
      if (res.ok) {
        document.getElementById('quoteForm').reset();
        document.getElementById('quoteSuccessMessage').classList.remove('hidden');
        setTimeout(() => {
          document.getElementById('quoteSuccessMessage').classList.add('hidden');
        }, 5000);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to send. Please try again.', 'error');
      }
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    }
  });

  document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value;
    const isAnonymous = document.getElementById('reviewAnonymous')?.checked || false;
    if (!rating) {
      showToast('Please select a rating.', 'warning');
      return;
    }
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ providerId: id, rating: parseInt(rating), comment, isAnonymous })
    });
    if (res.ok) {
      showToast('Review submitted!', 'success');
      location.reload();
    } else {
      showToast('Failed to submit review.', 'error');
    }
  });
}

// Booking helpers
window.showBookingForm = (serviceId) => {
  const formDiv = document.getElementById(`bookingForm-${serviceId}`);
  if (formDiv) {
    formDiv.classList.toggle('hidden');
  }
};

window.submitBooking = async (serviceId, providerId) => {
  const token = localStorage.getItem('token');
  if (!token) {
    showToast('Please login to book.', 'warning');
    window.location.href = 'login.html';
    return;
  }
  const startTime = document.getElementById(`bookingTime-${serviceId}`).value;
  const notes = document.getElementById(`bookingNotes-${serviceId}`).value;
  if (!startTime) {
    showToast('Please select a date and time.', 'warning');
    return;
  }
  // Prevent past dates (extra client-side check)
  const selectedDate = new Date(startTime);
  const now = new Date();
  if (selectedDate < now) {
    showToast('Cannot book a past date or time.', 'warning');
    return;
  }
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ providerId, serviceId, startTime, notes })
  });
  if (res.ok) {
    showToast('Booking sent!', 'success');
    location.reload();
  } else {
    const data = await res.json();
    showToast(data.error || 'Booking failed', 'error');
  }
};

// ========== PROVIDER DASHBOARD ==========
async function initDashboard() {
  const content = document.getElementById('dashboardContent');

  if (!authToken) {
    content.innerHTML = '<div class="text-center py-20">Please <a href="login.html" class="text-[var(--orange)] hover:underline">login</a> as a provider.</div>';
    return;
  }

  if (!currentUser) await loadCurrentUser();

  if (!currentUser || currentUser.role !== 'provider') {
    content.innerHTML = '<div class="text-center py-20">Please <a href="login.html" class="text-[var(--orange)] hover:underline">login</a> as a provider.</div>';
    return;
  }

  content.innerHTML = '<div class="text-center py-20">Loading dashboard...</div>';

  try {
    let stats = { totalBookings: 0, totalReviews: 0, totalQuotes: 0, profileViews: 0 };
    let bookings = [];
    let services = [];
    let profile = {};
    let hours = [];
    let subInfo = { subscription_tier: 'basic', subscription_end: null };
    let viewData = [];
    let notifications = [];
    let portfolioItems = [];

    try {
      const statsRes = await apiFetch('/api/dashboard/stats');
      if (statsRes.ok) stats = await statsRes.json();
    } catch (e) { console.error('Stats error:', e); }

    try {
      const bookingsRes = await apiFetch('/api/dashboard/recent-bookings');
      if (bookingsRes.ok) bookings = await bookingsRes.json();
    } catch (e) { console.error('Bookings error:', e); }

    try {
      const servicesRes = await apiFetch('/api/dashboard/services');
      if (servicesRes.ok) services = await servicesRes.json();
    } catch (e) { console.error('Services error:', e); }

    try {
      const profileRes = await apiFetch('/api/dashboard/profile');
      if (profileRes.ok) profile = await profileRes.json();
    } catch (e) { console.error('Profile error:', e); }

    try {
      const hoursRes = await apiFetch('/api/dashboard/hours');
      if (hoursRes.ok) hours = await hoursRes.json();
    } catch (e) { console.error('Hours error:', e); }

    try {
      const subRes = await apiFetch('/api/subscriptions/me');
      if (subRes.ok) subInfo = await subRes.json();
    } catch (e) { console.error('Subscription error:', e); }

    if (subInfo.subscription_tier !== 'basic') {
      try {
        const viewsRes = await apiFetch('/api/dashboard/profile-views-chart');
        if (viewsRes.ok) viewData = await viewsRes.json();
      } catch (e) { console.error('Chart data error:', e); }
    }

    try {
      const notifRes = await apiFetch('/api/dashboard/notifications');
      if (notifRes.ok) notifications = await notifRes.json();
    } catch (e) { console.error('Notifications error:', e); }

    try {
      const portfolioRes = await apiFetch('/api/dashboard/portfolio');
      if (portfolioRes.ok) portfolioItems = await portfolioRes.json();
    } catch (e) { console.error('Portfolio error:', e); }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const servicesHtml = services.map(s => `
      <div class="flex justify-between items-center p-3 bg-[var(--card-bg)] rounded-xl border mb-2">
        <div><strong>${escapeHtml(s.name)}</strong> – N$${s.price} / ${s.duration_minutes}min</div>
        <div class="flex gap-2">
          <label class="btn-secondary text-xs py-1 px-2 cursor-pointer">Upload
            <input type="file" accept="image/*" class="hidden" onchange="uploadServiceImage('${s.id}', this.files[0])">
          </label>
          <button onclick="deleteService('${s.id}')" class="text-red-500">Delete</button>
        </div>
      </div>
    `).join('');

    const hoursHtml = days.map((dayName, day) => {
      const hour = hours.find(h => h.day_of_week === day) || {};
      return `
        <div class="p-3 border rounded-lg">
          <div class="font-bold mb-2">${escapeHtml(dayName)}</div>
          <div class="flex gap-2 items-center">
            <input type="time" name="open_${day}" value="${hour.open_time || ''}" class="p-2 border rounded-lg flex-1" ${hour.is_closed ? 'disabled' : ''}>
            <span>–</span>
            <input type="time" name="close_${day}" value="${hour.close_time || ''}" class="p-2 border rounded-lg flex-1" ${hour.is_closed ? 'disabled' : ''}>
          </div>
          <label class="flex items-center gap-2 mt-2 text-sm">
            <input type="checkbox" name="closed_${day}" ${hour.is_closed ? 'checked' : ''} onchange="toggleHoursDisabled(this, ${day})">
            Closed all day
          </label>
        </div>
      `;
    }).join('');

    let html = `
      <!-- Subscription Card -->
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border mb-12">
        <div class="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 class="text-2xl font-bold">Current Plan: <span class="text-accent">${escapeHtml(subInfo.subscription_tier || 'basic')}</span></h2>
            ${subInfo.subscription_end ? `<p class="text-sm text-gray-500">Renews on ${new Date(subInfo.subscription_end).toLocaleDateString()}</p>` : '<p class="text-sm text-gray-500">Free plan – upgrade for more visibility</p>'}
          </div>
          <a href="checkout.html" class="btn-primary">Upgrade Plan</a>
        </div>
      </div>
    `;

    if (notifications.length > 0) {
      html += `
        <div class="mb-6 p-4 bg-accent-light border-l-4 border-accent rounded-xl">
          <div class="flex justify-between items-center">
            <div>
              <h3 class="font-bold text-accent">🔔 New Notifications</h3>
              <ul class="mt-2 text-sm space-y-1">
                ${notifications.map(n => `
                  <li>• ${escapeHtml(n.message)} <span class="text-xs text-gray-500">(${new Date(n.created_at).toLocaleString()})</span></li>
                `).join('')}
              </ul>
            </div>
            <button id="markNotificationsReadBtn" class="btn-secondary text-xs py-1 px-3">Mark as read</button>
          </div>
        </div>
      `;
    }

    html += `
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalBookings || 0}</div><div>Bookings</div></div>
        <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalReviews || 0}</div><div>Reviews</div></div>
        <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalQuotes || 0}</div><div>Quotes</div></div>
        <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.profileViews || 0}</div><div>Profile Views</div></div>
      </div>

      ${subInfo.subscription_tier !== 'basic' && viewData.length ? `
        <div class="mb-12">
          <h2 class="text-2xl font-bold mb-4">Profile Views (Last 30 days)</h2>
          <canvas id="viewsChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas>
        </div>
      ` : ''}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <!-- LEFT COLUMN: BOOKINGS HISTORY + SERVICES -->
        <div>
          <!-- BOOKINGS HISTORY WITH FILTERS -->
          <h2 class="text-2xl font-bold mb-4">Bookings History</h2>
          <div class="mb-4 flex flex-wrap gap-2">
            <button onclick="filterBookings('all')" class="btn-secondary text-xs py-1 px-3 booking-filter active" data-filter="all">All</button>
            <button onclick="filterBookings('pending')" class="btn-secondary text-xs py-1 px-3 booking-filter" data-filter="pending">Pending</button>
            <button onclick="filterBookings('confirmed')" class="btn-secondary text-xs py-1 px-3 booking-filter" data-filter="confirmed">Confirmed</button>
            <button onclick="filterBookings('completed')" class="btn-secondary text-xs py-1 px-3 booking-filter" data-filter="completed">Completed</button>
            <button onclick="filterBookings('cancelled')" class="btn-secondary text-xs py-1 px-3 booking-filter" data-filter="cancelled">Cancelled</button>
          </div>
          <div id="bookingsList" class="space-y-3 max-h-96 overflow-y-auto">
            ${bookings.length ? bookings.map(b => `
              <div class="bg-[var(--card-bg)] p-4 rounded-xl border flex justify-between flex-wrap gap-2">
                <div>
                  <strong>${escapeHtml(b.client_name)}</strong><br>
                  ${escapeHtml(b.service_name || 'Service')} – ${new Date(b.start_time).toLocaleString()}
                  <br><span class="text-xs px-2 py-0.5 rounded-full ${getStatusBadgeColor(b.status)}">${b.status}</span>
                </div>
                <select onchange="updateBookingStatus('${b.id}', this.value)" class="p-2 border rounded-lg">
                  <option ${b.status==='pending'?'selected':''}>pending</option>
                  <option ${b.status==='confirmed'?'selected':''}>confirmed</option>
                  <option ${b.status==='completed'?'selected':''}>completed</option>
                  <option ${b.status==='cancelled'?'selected':''}>cancelled</option>
                </select>
              </div>
            `).join('') : '<div class="text-gray-500 text-center py-4">No bookings yet.</div>'}
          </div>

          <!-- SERVICES SECTION -->
          <h2 class="text-2xl font-bold mt-8 mb-4">Services</h2>
          <div id="servicesList" class="space-y-2 mb-4">${servicesHtml || '<div class="text-gray-500">No services added yet.</div>'}</div>
          <form id="addServiceForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
            <input name="name" placeholder="Service name" required class="w-full p-2 border rounded-lg">
            <input name="price" placeholder="Price (N$)" required class="w-full p-2 border rounded-lg">
            <input name="duration_minutes" placeholder="Duration (minutes)" required class="w-full p-2 border rounded-lg">
            <button type="submit" class="btn-primary w-full">Add Service</button>
          </form>
        </div>

        <!-- RIGHT COLUMN: PROFILE + HOURS -->
        <div>
          <h2 class="text-2xl font-bold mb-4">Business Profile</h2>
          <form id="profileForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
            <input name="business_name" value="${escapeHtml(profile.business_name || '')}" placeholder="Business Name" class="w-full p-2 border rounded-lg">
            <textarea name="description" placeholder="Description" rows="3" class="w-full p-2 border rounded-lg">${escapeHtml(profile.description || '')}</textarea>
            <select name="category" class="w-full p-2 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] text-[var(--foreground)]">
              <option value="">Select Category</option>
              ${['Hair Salon','Barbershop','Car Rental','Plumbing','Cleaning Services','Electrician','Catering','Accommodation','Home Repairs','Photographer','Events','Other'].map(cat => `<option value="${cat}" ${profile.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
            <input name="address" id="businessAddress" value="${escapeHtml(profile.address || '')}" placeholder="Address" class="w-full p-2 border rounded-lg">
            <input type="hidden" id="businessLat" name="lat" value="${profile.lat || ''}">
            <input type="hidden" id="businessLng" name="lng" value="${profile.lng || ''}">
            <input name="whatsapp_number" value="${escapeHtml(profile.whatsapp_number || '')}" placeholder="WhatsApp Number" class="w-full p-2 border rounded-lg">

            <div class="border-t pt-3">
              <label class="font-bold block mb-2">📍 Click on map to set exact location</label>
              <div id="locationPickerMap" style="height: 300px; width: 100%; border-radius: 0.75rem; overflow: hidden; z-index: 1;"></div>
              <p class="text-xs text-gray-500 mt-2">Click anywhere on the map – a marker will appear.</p>
            </div>

            <div class="border-t pt-3">
              <label class="font-bold">Logo</label>
              ${profile.logo_url ? `<img src="${escapeHtml(profile.logo_url)}" class="h-20 w-20 object-cover rounded mb-2">` : ''}
              <input type="file" id="logoUpload" accept="image/*" class="w-full">
              <button type="button" id="uploadLogoBtn" class="btn-secondary mt-2">Upload Logo</button>
            </div>
            <div class="border-t pt-3">
              <label class="font-bold">Cover Image</label>
              ${profile.cover_image_url ? `<img src="${escapeHtml(profile.cover_image_url)}" class="h-32 w-full object-cover rounded mb-2">` : ''}
              <input type="file" id="coverUpload" accept="image/*" class="w-full">
              <button type="button" id="uploadCoverBtn" class="btn-secondary mt-2">Upload Cover</button>
            </div>
            <button type="submit" class="btn-primary w-full">Update Profile</button>
          </form>

          <h2 class="text-2xl font-bold mt-8 mb-4">Business Hours</h2>
          <form id="hoursForm" class="bg-[var(--card-bg)] p-4 rounded-xl border">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${hoursHtml}
            </div>
            <button type="submit" class="btn-primary w-full mt-4">Save Hours</button>
          </form>
        </div>
      </div>
    `;

    // Portfolio section
    html += `
      <div class="mt-12 border-t pt-8">
        <h2 class="text-2xl font-bold mb-4">📸 Portfolio</h2>
        <p class="text-sm text-[var(--foreground-muted)] mb-4">Showcase your work to potential clients.</p>
        <div id="portfolioGrid" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          ${portfolioItems.length ? portfolioItems.map(item => `
            <div class="relative group border rounded-lg overflow-hidden bg-[var(--card-bg)]">
              <img src="${escapeHtml(item.image_url)}" class="w-full h-40 object-cover" onerror="this.src='https://placehold.co/400x300?text=No+Image'">
              ${item.title ? `<p class="text-xs font-semibold p-2">${escapeHtml(item.title)}</p>` : ''}
              <button onclick="deletePortfolioItem('${item.id}')" class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          `).join('') : '<div class="col-span-full text-center text-[var(--foreground-muted)] py-4">No portfolio images yet.</div>'}
        </div>
        <form id="addPortfolioForm" class="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div class="flex-1">
            <label class="block text-sm font-medium">Upload Image</label>
            <input type="file" id="portfolioImageInput" accept="image/*" class="w-full p-2 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] text-[var(--foreground)]">
          </div>
          <div>
            <label class="block text-sm font-medium">Title (optional)</label>
            <input type="text" id="portfolioTitle" placeholder="e.g., Wedding Decor" class="w-full p-2 border rounded-lg bg-[var(--bg-main)] border-[var(--border)] text-[var(--foreground)]">
          </div>
          <button type="submit" class="btn-primary whitespace-nowrap">Add to Portfolio</button>
        </form>
      </div>
    `;

    content.innerHTML = html;

    // ---------- BOOKING FILTER LOGIC ----------
    const allBookings = [...bookings]; // capture all bookings

    window.filterBookings = (filter) => {
      document.querySelectorAll('.booking-filter').forEach(btn => {
        btn.classList.remove('active');
      });
      const activeBtn = document.querySelector(`.booking-filter[data-filter="${filter}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      let filtered = allBookings;
      if (filter !== 'all') {
        filtered = allBookings.filter(b => b.status === filter);
      }

      const list = document.getElementById('bookingsList');
      if (!list) return;

      if (filtered.length === 0) {
        list.innerHTML = '<div class="text-gray-500 text-center py-4">No bookings match this filter.</div>';
        return;
      }

      list.innerHTML = filtered.map(b => `
        <div class="bg-[var(--card-bg)] p-4 rounded-xl border flex justify-between flex-wrap gap-2">
          <div>
            <strong>${escapeHtml(b.client_name)}</strong><br>
            ${escapeHtml(b.service_name || 'Service')} – ${new Date(b.start_time).toLocaleString()}
            <br><span class="text-xs px-2 py-0.5 rounded-full ${getStatusBadgeColor(b.status)}">${b.status}</span>
          </div>
          <select onchange="updateBookingStatus('${b.id}', this.value)" class="p-2 border rounded-lg">
            <option ${b.status==='pending'?'selected':''}>pending</option>
            <option ${b.status==='confirmed'?'selected':''}>confirmed</option>
            <option ${b.status==='completed'?'selected':''}>completed</option>
            <option ${b.status==='cancelled'?'selected':''}>cancelled</option>
          </select>
        </div>
      `).join('');
    };

    // Mark notifications as read
    document.getElementById('markNotificationsReadBtn')?.addEventListener('click', async () => {
      await apiFetch('/api/dashboard/notifications/read', { method: 'PUT' });
      showToast('Notifications marked as read', 'success');
      location.reload();
    });

    // Leaflet map picker
    if (typeof L !== 'undefined' && document.getElementById('locationPickerMap')) {
      initLocationPicker(profile.lat, profile.lng);
    }

    // Chart
    if (subInfo.subscription_tier !== 'basic' && viewData.length && document.getElementById('viewsChart') && typeof Chart !== 'undefined') {
      new Chart(document.getElementById('viewsChart'), {
        type: 'line',
        data: {
          labels: viewData.map(v => v.date),
          datasets: [{ label: 'Views', data: viewData.map(v => parseInt(v.count)) }]
        }
      });
    }

    // Portfolio upload
    document.getElementById('addPortfolioForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('portfolioImageInput');
      const title = document.getElementById('portfolioTitle').value.trim();
      if (!fileInput.files.length) {
        showToast('Please select an image.', 'warning');
        return;
      }
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      try {
        const uploadRes = await fetch('/api/upload/portfolio', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${authToken}` },
          body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed');
        const portfolioRes = await apiFetch('/api/dashboard/portfolio', {
          method: 'POST',
          body: JSON.stringify({ image_url: uploadData.url, title })
        });
        if (portfolioRes.ok) {
          showToast('Portfolio image added!', 'success');
          location.reload();
        } else {
          const err = await portfolioRes.json();
          showToast(err.error || 'Failed to add portfolio item.', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });

    // Event listeners
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      await apiFetch('/api/dashboard/profile', { method: 'PUT', body: JSON.stringify(data) });
      showToast('Profile updated', 'success');
      location.reload();
    });

    document.getElementById('addServiceForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      const res = await apiFetch('/api/dashboard/services', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) { showToast('Service added', 'success'); location.reload(); }
      else showToast('Failed to add service', 'error');
    });

    document.getElementById('hoursForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      for (let day = 0; day <= 6; day++) {
        const openInput = document.querySelector(`[name="open_${day}"]`);
        const closeInput = document.querySelector(`[name="close_${day}"]`);
        const closedCheck = document.querySelector(`[name="closed_${day}"]`);
        let open_time = openInput?.value || '';
        let close_time = closeInput?.value || '';
        const is_closed = closedCheck?.checked || false;
        if (is_closed) { open_time = ''; close_time = ''; }
        await apiFetch('/api/dashboard/hours', { method: 'POST', body: JSON.stringify({ day_of_week: day, open_time: open_time || null, close_time: close_time || null, is_closed }) });
      }
      showToast('Hours saved', 'success');
      location.reload();
    });

    document.getElementById('uploadLogoBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('logoUpload');
      if (input.files.length) await uploadLogo(input.files[0]);
      location.reload();
    });

    document.getElementById('uploadCoverBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('coverUpload');
      if (input.files.length) await uploadCover(input.files[0]);
      location.reload();
    });

  } catch (err) {
    console.error('Dashboard error:', err);
    content.innerHTML = `<div class="text-center py-20 text-red-500">Failed to load dashboard. Please <a href="login.html">login again</a>.</div>`;
  }
}

// Map picker for dashboard
let locationMap, locationMarker;
function initLocationPicker(initialLat, initialLng) {
  const mapContainer = document.getElementById('locationPickerMap');
  if (!mapContainer) return;
  const defaultLat = -22.5609;
  const defaultLng = 17.0658;
  const lat = initialLat ? parseFloat(initialLat) : defaultLat;
  const lng = initialLng ? parseFloat(initialLng) : defaultLng;

  locationMap = L.map(mapContainer).setView([lat, lng], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
  }).addTo(locationMap);

  if (initialLat && initialLng) {
    locationMarker = L.marker([lat, lng]).addTo(locationMap);
  }

  locationMap.on('click', function(e) {
    const newLat = e.latlng.lat;
    const newLng = e.latlng.lng;
    if (locationMarker) {
      locationMarker.setLatLng([newLat, newLng]);
    } else {
      locationMarker = L.marker([newLat, newLng]).addTo(locationMap);
    }
    document.getElementById('businessLat').value = newLat;
    document.getElementById('businessLng').value = newLng;
  });
}

// ========== GLOBAL ADMIN HELPER FUNCTIONS ==========
window.updateBookingStatus = async (id, status) => {
  await apiFetch(`/api/dashboard/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  location.reload();
};

window.deleteService = async (id) => {
  if (!confirm('Delete this service?')) return;
  const res = await apiFetch(`/api/dashboard/services/${id}`, { method: 'DELETE' });
  if (res.ok) { showToast('Deleted', 'success'); location.reload(); }
  else showToast('Delete failed', 'error');
};

window.uploadServiceImage = async (serviceId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/api/upload/service/${serviceId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) { showToast('Image uploaded', 'success'); location.reload(); }
  else showToast('Upload failed', 'error');
};

window.toggleHoursDisabled = (checkbox, day) => {
  const openInput = document.querySelector(`[name="open_${day}"]`);
  const closeInput = document.querySelector(`[name="close_${day}"]`);
  if (checkbox.checked) {
    openInput.disabled = true;
    closeInput.disabled = true;
    openInput.value = '';
    closeInput.value = '';
  } else {
    openInput.disabled = false;
    closeInput.disabled = false;
  }
};

// ========== ADMIN DASHBOARD ==========
async function initAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    window.location.href = 'login.html';
    return;
  }
  const logoutBtn = document.getElementById('logoutAdminBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const stats = await (await apiFetch('/api/admin/stats')).json();
  const chartData = await (await apiFetch('/api/admin/chart-data')).json();
  const pending = await (await apiFetch('/api/admin/pending-verifications')).json();
  const users = await (await apiFetch('/api/admin/users')).json();
  const feed = await (await apiFetch('/api/admin/activity-feed')).json();
  const bookings = await (await apiFetch('/api/admin/bookings')).json();
  const analytics = await (await apiFetch('/api/admin/advanced-analytics')).json();
  const invoices = await (await apiFetch('/api/admin/invoices')).json(); // <-- ADDED THIS LINE

  // ---------- PERMANENTLY DELETE USER ----------
  window.deleteUser = async (id) => {
    if (!confirm('⚠️ WARNING: This will permanently delete this user and ALL their data (services, bookings, reviews, etc.). This cannot be undone! Are you sure?')) {
      return;
    }
    
    if (!confirm('Final confirmation: Are you ABSOLUTELY sure you want to delete this user?')) {
      return;
    }
    
    try {
      const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('User permanently deleted.', 'success');
        location.reload();
      } else {
        const data = await res.json();
        showToast(data.error || 'Delete failed.', 'error');
      }
    } catch (err) {
      showToast('Network error. Please try again.', 'error');
    }
  };

  // ---- HTML with fixed chart containers ----
  let html = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      ${Object.entries(stats).map(([k, v]) => {
        const label = k
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .replace(/([a-z])([A-Z])/g, '$1 $2');
        return `
          <div class="p-4 bg-[var(--card-bg)] rounded-2xl border overflow-hidden">
            <div class="text-2xl font-black text-accent">${v}</div>
            <div class="text-xs text-[var(--foreground-muted)] break-words">${label}</div>
          </div>
        `;
      }).join('')}
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border overflow-hidden">
        <div class="text-2xl font-black text-accent">${analytics.activeProviders || 0}</div>
        <div class="text-xs text-[var(--foreground-muted)] break-words">Active Providers (30d)</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-8 mb-8">
      <div style="height: 200px; max-width: 100%;"><canvas id="regChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div style="height: 200px; max-width: 100%;"><canvas id="catChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-2 gap-8 mb-8">
      <div style="height: 200px; max-width: 100%;"><canvas id="tierChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div style="height: 200px; max-width: 100%;"><canvas id="cityChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-2 gap-8 mb-8">
      <div style="height: 200px; max-width: 100%;"><canvas id="revenueChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div style="height: 200px; max-width: 100%;"><canvas id="bookingsByCategoryChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-1 gap-8 mb-8">
      <div style="height: 200px; max-width: 100%;"><canvas id="regionChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>

    <div class="mb-8">
      <h2 class="text-2xl font-bold mb-4">All Bookings</h2>
      <div class="overflow-x-auto bg-[var(--card-bg)] rounded-2xl border p-4">
        <table class="w-full text-sm">
          <thead><tr><th>Client</th><th>Provider</th><th>Service</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            ${bookings.map(b => `
              <tr class="border-b">
                <td>${escapeHtml(b.client_name)}</td>
                <td>${escapeHtml(b.business_name)}</td>
                <td>${escapeHtml(b.service_name || 'N/A')}</td>
                <td>${new Date(b.start_time).toLocaleString()}</td>
                <td><span class="px-2 py-1 rounded-full text-xs ${b.status === 'confirmed' ? 'bg-green-500/20 text-green-500' : b.status === 'pending' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-red-500/20 text-red-500'}">${b.status}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mb-8">
      <h2 class="text-2xl font-bold mb-4">Pending Verifications</h2>
      ${pending.map(p => `
        <div class="p-4 border rounded mb-2 flex justify-between items-center">
          <span>${escapeHtml(p.business_name)} (${escapeHtml(p.email)})</span>
          <div>
            <button onclick="approveProvider('${p.user_id}')" class="btn-primary text-sm mr-2">Approve</button>
            <button onclick="rejectProvider('${p.user_id}')" class="btn-secondary text-sm">Reject</button>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="mb-8">
      <h2 class="text-2xl font-bold mb-4">All Users</h2>
      <div class="overflow-x-auto bg-[var(--card-bg)] rounded-2xl border p-4">
        <table class="w-full text-sm">
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr class="border-b">
                <td class="p-2">${escapeHtml(u.email)}</td>
                <td class="p-2">${escapeHtml(u.role)}</td>
                <td class="p-2">${u.is_active ? 'Active' : 'Inactive'}</td>
                <td class="p-2">
                  ${u.role === 'provider' ? `<button onclick="viewProvider('${u.id}')" class="btn-primary text-xs py-1 px-2 mr-1">View</button>` : ''}
                  ${u.role === 'client' ? `<button onclick="viewClient('${u.id}')" class="btn-secondary text-xs py-1 px-2 mr-1">View</button>` : ''}
                  <button onclick="deactivateUser('${u.id}')" class="text-yellow-600 dark:text-yellow-400 text-xs mr-1 hover:underline">Deactivate</button>
                  ${u.email !== 'admin@localink.com' ? `<button onclick="deleteUser('${u.id}')" class="text-red-600 dark:text-red-400 text-xs font-bold hover:underline">Delete</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- ========== PAYMENT VERIFICATION SECTION ========== -->
    <div class="mb-8">
      <h2 class="text-2xl font-bold mb-4">📄 Payment Verification</h2>
      ${invoices.length === 0 ? '<p class="text-[var(--foreground-muted)]">No payment requests.</p>' : `
      <div class="overflow-x-auto bg-[var(--card-bg)] rounded-2xl border p-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="text-left p-2">Invoice</th>
              <th class="text-left p-2">User</th>
              <th class="text-left p-2">Tier</th>
              <th class="text-left p-2">Amount</th>
              <th class="text-left p-2">Status</th>
              <th class="text-left p-2">Proof</th>
              <th class="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr class="border-b">
                <td class="p-2 font-mono text-xs">${escapeHtml(inv.invoice_number)}</td>
                <td class="p-2">${escapeHtml(inv.full_name || inv.email)}</td>
                <td class="p-2 capitalize">${inv.tier}</td>
                <td class="p-2">N$${inv.amount}</td>
                <td class="p-2">
                  <span class="px-2 py-1 rounded-full text-xs ${inv.status === 'approved' ? 'bg-green-500/20 text-green-500' : inv.status === 'rejected' ? 'bg-red-500/20 text-red-500' : inv.status === 'submitted' ? 'bg-blue-500/20 text-blue-500' : 'bg-yellow-500/20 text-yellow-500'}">${inv.status}</span>
                </td>
                <td class="p-2">
                  ${inv.proof_image_url ? `<a href="${inv.proof_image_url}" target="_blank" class="text-[var(--orange)] hover:underline">View</a>` : '—'}
                </td>
                <td class="p-2">
                  ${inv.status === 'submitted' ? `
                    <button onclick="approveInvoice('${inv.id}')" class="btn-primary text-xs py-1 px-2 mr-1">Approve</button>
                    <button onclick="rejectInvoice('${inv.id}')" class="btn-secondary text-xs py-1 px-2">Reject</button>
                  ` : (inv.status === 'pending' ? '<span class="text-[var(--foreground-muted)]">Awaiting proof</span>' : '<span class="text-[var(--foreground-muted)]">Done</span>')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`}
    </div>

    <div>
      <h2 class="text-2xl font-bold mb-4">Activity Feed</h2>
      ${feed.map(f => `
        <div class="p-2 border-b">${escapeHtml(f.type)}: ${escapeHtml(f.name || f.comment || f.id)} – ${new Date(f.created_at).toLocaleString()}</div>
      `).join('')}
    </div>
  `;

  document.getElementById('adminContent').innerHTML = html;

  // ---- Chart initialization with maintainAspectRatio: false ----
  if (typeof Chart !== 'undefined') {
    const chartOptions = { responsive: true, maintainAspectRatio: false };

    new Chart(document.getElementById('regChart'), {
      type: 'line',
      data: {
        labels: chartData.registrations.map(r => r.date),
        datasets: [{ label: 'Registrations', data: chartData.registrations.map(r => parseInt(r.count)) }]
      },
      options: chartOptions
    });
    new Chart(document.getElementById('catChart'), {
      type: 'bar',
      data: {
        labels: chartData.categories.map(c => c.category),
        datasets: [{ label: 'Providers', data: chartData.categories.map(c => parseInt(c.count)) }]
      },
      options: chartOptions
    });
    new Chart(document.getElementById('tierChart'), {
      type: 'pie',
      data: {
        labels: chartData.tiers.map(t => t.subscription_tier),
        datasets: [{ data: chartData.tiers.map(t => parseInt(t.count)) }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
    new Chart(document.getElementById('cityChart'), {
      type: 'bar',
      data: {
        labels: chartData.cities.map(c => c.city),
        datasets: [{ label: 'Listings', data: chartData.cities.map(c => parseInt(c.count)) }]
      },
      options: chartOptions
    });
    if (analytics.revenueOverTime.length) {
      new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: {
          labels: analytics.revenueOverTime.map(r => r.month),
          datasets: [{ label: 'Monthly Revenue (N$)', data: analytics.revenueOverTime.map(r => parseInt(r.revenue || 0)) }]
        },
        options: chartOptions
      });
    }
    if (analytics.bookingsByCategory.length) {
      new Chart(document.getElementById('bookingsByCategoryChart'), {
        type: 'bar',
        data: {
          labels: analytics.bookingsByCategory.map(c => c.category),
          datasets: [{ label: 'Bookings', data: analytics.bookingsByCategory.map(c => parseInt(c.booking_count)) }]
        },
        options: chartOptions
      });
    }
    if (analytics.registrationsByRegion.length) {
      new Chart(document.getElementById('regionChart'), {
        type: 'bar',
        data: {
          labels: analytics.registrationsByRegion.map(r => r.region),
          datasets: [{ label: 'Providers', data: analytics.registrationsByRegion.map(r => parseInt(r.count)) }]
        },
        options: chartOptions
      });
    }
  }
}
// ---------- ADMIN: Provider Details Modal ----------
async function viewProvider(userId) {
  const modal = document.getElementById('providerModal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = 'Loading...';

  try {
    const res = await apiFetch(`/api/admin/provider/${userId}`);
    if (!res.ok) {
      const errText = await res.text();
      console.error('Provider fetch error:', res.status, errText);
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();

    if (!data.profile) {
      content.innerHTML = `
        <div class="text-red-500">No provider profile found for this user.</div>
        <div class="mt-4 flex justify-end">
          <button id="modalCancelBtn3" class="btn-secondary">Close</button>
        </div>
      `;
      document.getElementById('modalCancelBtn3')?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
      return;
    }

    content.innerHTML = `
      <form id="adminEditProviderForm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-bold">Business Name</label>
            <input name="business_name" value="${escapeHtml(data.profile.business_name || '')}" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
          </div>
          <div>
            <label class="block text-sm font-bold">Category</label>
            <input name="category" value="${escapeHtml(data.profile.category || '')}" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-bold">Description</label>
            <textarea name="description" rows="2" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">${escapeHtml(data.profile.description || '')}</textarea>
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-bold">Address</label>
            <input name="address" value="${escapeHtml(data.profile.address || '')}" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
          </div>
          <div>
            <label class="block text-sm font-bold">WhatsApp Number</label>
            <input name="whatsapp_number" value="${escapeHtml(data.profile.whatsapp_number || '')}" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
          </div>
          <div>
            <label class="block text-sm font-bold">Verified</label>
            <select name="is_verified" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
              <option value="true" ${data.profile.is_verified ? 'selected' : ''}>Yes</option>
              <option value="false" ${!data.profile.is_verified ? 'selected' : ''}>No</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-bold">Subscription Tier</label>
            <select name="subscription_tier" class="w-full p-2 border rounded-lg bg-[var(--bg-main)]">
              <option value="basic" ${data.profile.subscription_tier === 'basic' ? 'selected' : ''}>Basic</option>
              <option value="verified" ${data.profile.subscription_tier === 'verified' ? 'selected' : ''}>Verified</option>
              <option value="premium" ${data.profile.subscription_tier === 'premium' ? 'selected' : ''}>Premium</option>
            </select>
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" id="modalCancelBtn" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Save Changes</button>
        </div>
      </form>

      <hr class="my-4 border-[var(--border-main)]">

      <h3 class="text-lg font-bold mb-2">Services</h3>
      ${data.services && data.services.length ? data.services.map(s => `
        <div class="text-sm border-b py-1">${escapeHtml(s.name)} – N$${s.price} / ${s.duration_minutes}min</div>
      `).join('') : '<p class="text-gray-500">No services</p>'}

      <h3 class="text-lg font-bold mt-4 mb-2">Reviews (${data.reviews ? data.reviews.length : 0})</h3>
      ${data.reviews && data.reviews.slice(0, 5).map(r => `
        <div class="text-sm border-b py-1">${escapeHtml(r.full_name)}: ⭐${r.rating} – ${escapeHtml(r.comment || '')}</div>
      `).join('')}
      ${data.reviews && data.reviews.length > 5 ? `<p class="text-xs text-gray-500">... and ${data.reviews.length - 5} more</p>` : ''}

      <h3 class="text-lg font-bold mt-4 mb-2">Bookings: ${data.bookingsCount || 0}</h3>
    `;

    document.getElementById('adminEditProviderForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const dataObj = Object.fromEntries(formData);
      dataObj.is_verified = dataObj.is_verified === 'true';
      try {
        const res = await apiFetch(`/api/admin/provider/${userId}`, {
          method: 'PUT',
          body: JSON.stringify(dataObj)
        });
        if (res.ok) {
          showToast('Provider updated successfully!', 'success');
          modal.classList.add('hidden');
          initAdmin();
        } else {
          const err = await res.json();
          showToast(err.error || 'Update failed', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      }
    });

    document.getElementById('modalCancelBtn').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

  } catch (err) {
    console.error('View provider error:', err);
    content.innerHTML = `<div class="text-red-500">Failed to load provider details: ${err.message}</div>`;
  }
}

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('providerModal');
  if (modal && e.target === modal) {
    modal.classList.add('hidden');
  }
});

document.getElementById('closeModalBtn')?.addEventListener('click', function() {
  document.getElementById('providerModal').classList.add('hidden');
});

window.approveProvider = async (id) => {
  await apiFetch(`/api/admin/verify-provider/${id}`, { method: 'PUT' });
  showToast('Provider approved', 'success');
  location.reload();
};

window.rejectProvider = async (id) => {
  await apiFetch(`/api/admin/reject-provider/${id}`, { method: 'DELETE' });
  showToast('Provider rejected', 'info');
  location.reload();
};

window.deactivateUser = async (id) => {
  await apiFetch(`/api/admin/users/${id}/deactivate`, { method: 'PUT' });
  showToast('User deactivated', 'info');
  location.reload();
};

// ---------- ADMIN: Client Details Modal ----------
async function viewClient(userId) {
  const modal = document.getElementById('providerModal');
  const content = document.getElementById('modalContent');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.innerHTML = 'Loading...';

  try {
    const res = await apiFetch(`/api/admin/client/${userId}`);
    if (!res.ok) {
      const errText = await res.text();
      console.error('Client fetch error:', res.status, errText);
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();

    content.innerHTML = `
      <div class="space-y-4">
        <div><strong>Name:</strong> ${escapeHtml(data.full_name || 'N/A')}</div>
        <div><strong>Email:</strong> ${escapeHtml(data.email)}</div>
        <div><strong>Phone:</strong> ${escapeHtml(data.phone || 'N/A')}</div>
        <div><strong>Role:</strong> ${escapeHtml(data.role)}</div>
        <div><strong>Status:</strong> ${data.is_active ? 'Active' : 'Inactive'}</div>
        <div><strong>Joined:</strong> ${new Date(data.created_at).toLocaleString()}</div>
      </div>
      <div class="mt-4 flex justify-end">
        <button id="modalCancelBtn2" class="btn-secondary">Close</button>
      </div>
    `;

    document.getElementById('modalCancelBtn2').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

  } catch (err) {
    console.error('View client error:', err);
    content.innerHTML = `<div class="text-red-500">Failed to load client details: ${err.message}</div>`;
  }
}

// ========== PORTFOLIO DELETE HELPER ==========
window.deletePortfolioItem = async (id) => {
  if (!confirm('Delete this portfolio image?')) return;
  const res = await apiFetch(`/api/dashboard/portfolio/${id}`, { method: 'DELETE' });
  if (res.ok) {
    showToast('Deleted', 'success');
    location.reload();
  } else {
    showToast('Delete failed', 'error');
  }
};

// ========== TESTIMONIALS ==========
async function loadTestimonials() {
  const container = document.getElementById('testimonialsGrid');
  if (!container) return;
  try {
    const res = await fetch('/api/reviews/top');
    if (!res.ok) throw new Error();
    const reviews = await res.json();
    if (reviews.length === 0) {
      container.innerHTML = '<div class="col-span-3 text-center text-[var(--foreground-muted)]">No reviews yet.</div>';
      return;
    }
    container.innerHTML = reviews.map(r => `
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border border-[var(--border)] shadow-sm">
        <div class="flex items-center gap-1 text-[var(--orange)] mb-2">
          ${'★'.repeat(Math.round(r.rating))}${'☆'.repeat(5 - Math.round(r.rating))}
        </div>
        <p class="text-sm text-[var(--foreground-secondary)] italic">“${escapeHtml(r.comment || '')}”</p>
        <p class="mt-3 text-sm font-bold text-[var(--foreground)]">— ${escapeHtml(r.full_name)}</p>
        <p class="text-xs text-[var(--foreground-muted)]">${escapeHtml(r.business_name)}</p>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="col-span-3 text-center text-red-500">Could not load testimonials.</div>';
  }
}

// ========== PAGE ROUTER ==========
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initNavbarScroll();
  await loadCurrentUser();
  updateNavbarAuth();
  const path = location.pathname;

  if (path.includes('admin.html')) {
    if (!currentUser || currentUser.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }
    initAdmin();
    return;
  }

  if (path.includes('search.html')) initSearchPage();
  else if (path.includes('business.html')) initBusinessPage();
  else if (path.includes('dashboard.html')) initDashboard();
  else if (path === '/' || path.includes('index.html')) {
    loadTestimonials();
  }
});
// ---------- ADMIN INVOICE ACTIONS ----------
window.approveInvoice = async (id) => {
  if (!confirm('Approve this invoice and activate subscription?')) return;
  try {
    const res = await apiFetch(`/api/admin/invoices/${id}/approve`, { 
      method: 'PUT',
      body: JSON.stringify({ adminNotes: null })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('✅ Invoice approved. Subscription activated.', 'success');
      location.reload();
    } else {
      showToast(data.error || 'Approval failed', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
};

window.rejectInvoice = async (id) => {
  const reason = prompt('Reason for rejection (optional):');
  try {
    const res = await apiFetch(`/api/admin/invoices/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ adminNotes: reason || null }),
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Invoice rejected', 'info');
      location.reload();
    } else {
      showToast(data.error || 'Rejection failed', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
};
// ---------- TOGGLE USER MENU DROPDOWN ----------
window.toggleUserMenu = (userId) => {
  const dropdown = document.getElementById(`userMenuDropdown_${userId}`);
  if (!dropdown) return;
  
  // Close all other dropdowns
  document.querySelectorAll('[id^="userMenuDropdown_"]').forEach(el => {
    if (el.id !== `userMenuDropdown_${userId}`) {
      el.classList.add('hidden');
    }
  });
  
  dropdown.classList.toggle('hidden');
};

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('[id^="userMenu_"]')) {
    document.querySelectorAll('[id^="userMenuDropdown_"]').forEach(el => {
      el.classList.add('hidden');
    });
  }
});