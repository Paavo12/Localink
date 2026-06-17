// script.js – Final version with all fixes
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
  const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await res.json();
  if (res.ok) {
    setAuthToken(data.token);
    currentUser = data.user;
    return true;
  }
  alert(data.error || 'Login failed');
  return false;
}

async function logout() { setAuthToken(null); window.location.href = 'index.html'; }

async function loadCurrentUser() {
  if (!authToken) return null;
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      currentUser = await res.json();
      return currentUser;
    }
  } catch(e) {}
  return null;
}

// ---------- THEME TOGGLE ----------
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'dark'; // default to dark
  if (savedTheme === 'light') {
    html.classList.add('light');
  } else {
    html.classList.remove('light');
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      html.classList.toggle('light');
      localStorage.setItem('theme', html.classList.contains('light') ? 'light' : 'dark');
    });
  }
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
  const open = openH*60 + openM;
  const close = closeH*60 + closeM;
  return current >= open && current <= close;
}

// ---------- Distance ----------
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ---------- Image Upload Helpers ----------
async function uploadLogo(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload/logo', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) alert('Logo uploaded!');
  else alert('Upload failed');
}

async function uploadCover(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/upload/cover', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) alert('Cover image uploaded!');
  else alert('Upload failed');
}

async function uploadServiceImage(serviceId, file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/api/upload/service/${serviceId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) alert('Service image added!');
  else alert('Upload failed');
}

// ---------- Search Page ----------
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
        <div class="bg-[var(--card-bg)] p-6 rounded-3xl border border-[var(--border-main)]">
          <img src="${escapeHtml(b.logo_url || 'https://placehold.co/400x300')}" class="h-32 w-full object-cover rounded-xl mb-3" onerror="this.src='https://placehold.co/400x300'">
          <h3 class="text-xl font-black text-[var(--text-main)]">${escapeHtml(b.name)}</h3>
          <p class="text-gray-500 text-sm mt-2">${escapeHtml(b.description?.substring(0,100))}</p>
          <div class="mt-4 flex justify-between items-center">
            <span class="text-xs font-bold uppercase">${escapeHtml(b.subscription_tier || 'basic')}</span>
            <a href="business.html?id=${b.id}" class="btn-primary text-sm">View</a>
          </div>
        </div>
      `).join('');
    }
  }
  searchBtn?.addEventListener('click', fetchAndRender);
  searchInput?.addEventListener('keyup', fetchAndRender);
  await fetchAndRender();
}

// ---------- Business Page ----------
async function initBusinessPage() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return;
  const res = await fetch(`/api/businesses/${id}`);
  const b = await res.json();
  const container = document.getElementById('businessContent');
  if (!container) return;

  const open = isOpenNow(b.hours);
  
  let html = `
    <div class="relative mb-8">
      ${b.cover_image_url ? `<img src="${escapeHtml(b.cover_image_url)}" class="w-full h-64 object-cover rounded-2xl">` : ''}
      <div class="flex items-end gap-4 mt-4">
        ${b.logo_url ? `<img src="${escapeHtml(b.logo_url)}" class="w-24 h-24 rounded-full border-4 border-white shadow-lg -mt-12 bg-white">` : ''}
        <h1 class="text-5xl font-black text-[var(--text-main)]">${escapeHtml(b.business_name)}</h1>
      </div>
    </div>
    <div class="flex gap-4 mb-6">
      <span class="badge-verified">${b.is_verified ? '✓ Verified' : 'Unverified'}</span>
      <span class="px-3 py-1 rounded-full text-xs ${open ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}">${open ? 'Open Now' : 'Closed Now'}</span>
    </div>
    <p class="text-gray-500 mb-6">${escapeHtml(b.description)}</p>
  `;
  
  // Location map (Leaflet if coordinates exist)
  if (b.lat && b.lng) {
    html += `
      <div class="mt-8">
        <h3 class="text-2xl font-bold mb-4 text-[var(--text-main)]">📍 Location</h3>
        <div id="businessViewMap" style="height: 300px; width: 100%; border-radius: 0.75rem; overflow: hidden; z-index: 1;"></div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" 
           target="_blank" 
           class="btn-secondary mt-4 inline-flex items-center gap-2">
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
        <h3 class="text-2xl font-bold mb-4 text-[var(--text-main)]">📍 Location</h3>
        <p class="text-gray-500">${escapeHtml(b.address)}</p>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}" target="_blank" class="btn-secondary mt-4 inline-flex items-center gap-2">Get Directions</a>
      </div>
    `;
  }
  
  // Services & Reviews
  html += `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Services</h2>
       ${b.services.map(s => `
  <div class="mb-4 p-4 border rounded-xl">
    <h3 class="font-bold text-lg">${escapeHtml(s.name)}</h3>
    <p class="text-sm text-gray-500">N$${s.price} / ${s.duration_minutes} min</p>
    <p class="text-sm">${escapeHtml(s.description || '')}</p>
    ${s.image_urls && s.image_urls.length ? `
      <div class="flex gap-2 mt-2 flex-wrap">
        ${s.image_urls.map(url => `<img src="${escapeHtml(url)}" class="h-20 w-20 object-cover rounded-lg">`).join('')}
      </div>
    ` : ''}
    <button data-service-id="${s.id}" class="btn-primary text-sm mt-3 book-service-btn">Book this service</button>
    <div id="bookingForm-${s.id}" class="hidden mt-4 p-4 bg-[var(--bg-main)] border rounded-lg">
      <h4 class="font-bold">Book ${escapeHtml(s.name)}</h4>
      <input type="datetime-local" id="bookingTime-${s.id}" class="w-full p-2 my-2 border rounded-lg" required>
      <textarea id="bookingNotes-${s.id}" placeholder="Any special requests?" class="w-full p-2 mb-2 border rounded-lg"></textarea>
      <button data-service-id="${s.id}" data-provider-id="${b.user_id}" class="btn-primary text-sm w-full confirm-booking-btn">Confirm Booking</button>
    </div>
  </div>
`).join('')}
      </div>
      <div>
        <h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Reviews</h2>
        ${b.reviews.map(r => `
          <div class="mb-4">
            <strong>${escapeHtml(r.full_name)}</strong> ⭐${r.rating}<br/>
            ${escapeHtml(r.comment)}
            ${r.response ? `<div class="ml-4 text-sm text-gray-400">Owner reply: ${escapeHtml(r.response)}</div>` : ''}
          </div><hr/>
        `).join('')}
      </div>
    </div>
    
    <div class="mt-8">
      <h3 class="text-xl font-bold text-[var(--text-main)]">Anonymous comments</h3>
      ${b.anonymousComments.map(c => `
        <div class="text-sm my-2">
          <em>${escapeHtml(c.alias)}</em>: ${escapeHtml(c.comment)} 
          <span class="text-xs text-gray-500">(${escapeHtml(c.sentiment)})</span>
        </div>
      `).join('')}
    </div>
    <form id="anonCommentForm" class="mt-6">
      <textarea placeholder="Leave anonymous feedback" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"></textarea>
      <button type="submit" class="btn-primary mt-2">Post</button>
    </form>
    
    <!-- Review Form (logged in) -->
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
    ` : '<p class="mt-4 text-center"><a href="login.html" class="text-accent">Login to leave a review</a></p>'}
    
    <!-- Quote Form -->
    <div class="mt-8 p-6 border rounded-2xl bg-[var(--card-bg)]">
      <h3 class="text-xl font-bold mb-4">Request a Quote</h3>
      <form id="quoteForm">
        <input type="text" id="quoteName" placeholder="Your Name" required class="w-full p-2 mb-3 border rounded-lg bg-[var(--bg-main)]">
        <input type="email" id="quoteEmail" placeholder="Your Email" required class="w-full p-2 mb-3 border rounded-lg bg-[var(--bg-main)]">
        <input type="tel" id="quotePhone" placeholder="Phone (optional)" class="w-full p-2 mb-3 border rounded-lg bg-[var(--bg-main)]">
        <textarea id="quoteMessage" rows="3" placeholder="Describe what you need..." required class="w-full p-2 mb-3 border rounded-lg bg-[var(--bg-main)]"></textarea>
        <button type="submit" class="btn-primary w-full">Send Quote Request</button>
      </form>
    </div>
    
    ${currentUser ? `<button id="reportBtn" class="btn-secondary mt-4">Report this business</button>` : ''}
    ${b.whatsapp_number ? `<a href="https://wa.me/${b.whatsapp_number.replace(/\D/g, '')}" class="btn-primary mt-6 inline-block" target="_blank">Contact on WhatsApp</a>` : ''}
  `;
  
  container.innerHTML = html;
  
  // Initialize Leaflet map if coordinates exist
  if (b.lat && b.lng && document.getElementById('businessViewMap')) {
    if (typeof L !== 'undefined') {
      const map = L.map('businessViewMap').setView([parseFloat(b.lat), parseFloat(b.lng)], 15);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
      }).addTo(map);
      L.marker([parseFloat(b.lat), parseFloat(b.lng)]).addTo(map);
    }
  }
  
  // Event handlers
  document.getElementById('anonCommentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = e.target.querySelector('textarea').value;
    await fetch(`/api/businesses/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
    alert('Comment added');
    location.reload();
  });
  
  document.getElementById('reportBtn')?.addEventListener('click', async () => {
    const reason = prompt('Reason for report?');
    if (reason) await fetch(`/api/businesses/${id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ reason }) });
    alert('Report sent');
  });
  
  document.getElementById('quoteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('quoteName').value;
    const email = document.getElementById('quoteEmail').value;
    const phone = document.getElementById('quotePhone').value;
    const message = document.getElementById('quoteMessage').value;
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: id, name, email, phone, message })
      });
      if (res.ok) {
        alert('Quote request sent!');
        e.target.reset();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send.');
      }
    } catch (err) { alert('Network error'); }
  });
  
  document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value;
    const isAnonymous = document.getElementById('reviewAnonymous')?.checked || false;
    if (!rating) return alert('Select a rating');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ providerId: id, rating: parseInt(rating), comment, isAnonymous })
    });
    if (res.ok) {
      alert('Review submitted!');
      location.reload();
    } else alert('Failed');
  });
}

// Booking helpers
// In script.js, find and replace the showBookingForm function
window.showBookingForm = (serviceId) => {
  const formDiv = document.getElementById(`bookingForm-${serviceId}`);
  if (formDiv) {
    formDiv.classList.toggle('hidden');
  }
};

window.submitBooking = async (serviceId, providerId) => {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login to book.');
    window.location.href = 'login.html';
    return;
  }
  const startTime = document.getElementById(`bookingTime-${serviceId}`).value;
  const notes = document.getElementById(`bookingNotes-${serviceId}`).value;
  if (!startTime) return alert('Select date/time');
  const res = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ providerId, serviceId, startTime, notes })
  });
  if (res.ok) {
    alert('Booking sent!');
    location.reload();
  } else {
    const data = await res.json();
    alert(data.error || 'Booking failed');
  }
};

// ---------- PROVIDER DASHBOARD ----------
async function initDashboard() {
  const authBtn = document.getElementById('dashboardAuthBtn');
  const content = document.getElementById('dashboardContent');

  // Check if user is logged in
  if (!authToken) {
    content.innerHTML = '<div class="text-center py-20">Please <a href="login.html" class="text-accent">login</a> as a provider.</div>';
    if (authBtn) { authBtn.textContent = 'Login'; authBtn.onclick = () => { window.location.href = 'login.html'; }; }
    return;
  }

  // If currentUser is not loaded yet, try to load it
  if (!currentUser) {
    await loadCurrentUser();
  }

  // Check role
  if (!currentUser || currentUser.role !== 'provider') {
    content.innerHTML = '<div class="text-center py-20">Please <a href="login.html" class="text-accent">login</a> as a provider.</div>';
    if (authBtn) { authBtn.textContent = 'Login'; authBtn.onclick = () => { window.location.href = 'login.html'; }; }
    return;
  }

  // Set logout button
  if (authBtn) {
    authBtn.textContent = 'Logout';
    authBtn.onclick = () => { localStorage.removeItem('token'); window.location.href = 'index.html'; };
  }

  // Show loading state
  content.innerHTML = '<div class="text-center py-20">Loading dashboard...</div>';

  try {
    // Fetch all data with error handling
    let stats = { totalBookings: 0, totalReviews: 0, totalQuotes: 0, profileViews: 0 };
    let bookings = [];
    let services = [];
    let profile = {};
    let hours = [];
    let subInfo = { subscription_tier: 'basic', subscription_end: null };
    let viewData = [];

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

    const html = `
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

      <!-- Stats Cards -->
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
        <div>
          <h2 class="text-2xl font-bold mb-4">Recent Bookings</h2>
          <div class="space-y-3">
            ${bookings.length ? bookings.map(b => `
              <div class="bg-[var(--card-bg)] p-4 rounded-xl border flex justify-between flex-wrap gap-2">
                <div><strong>${escapeHtml(b.client_name)}</strong><br>${escapeHtml(b.service_name || 'Service')} – ${new Date(b.start_time).toLocaleString()}</div>
                <select onchange="updateBookingStatus('${b.id}', this.value)" class="p-2 border rounded-lg">
                  <option ${b.status==='pending'?'selected':''}>pending</option>
                  <option ${b.status==='confirmed'?'selected':''}>confirmed</option>
                  <option ${b.status==='completed'?'selected':''}>completed</option>
                  <option ${b.status==='cancelled'?'selected':''}>cancelled</option>
                </select>
              </div>
            `).join('') : '<div class="text-gray-500 text-center">No bookings yet.</div>'}
          </div>

          <h2 class="text-2xl font-bold mt-8 mb-4">Services</h2>
          <div id="servicesList" class="space-y-2 mb-4">${servicesHtml || '<div class="text-gray-500">No services added yet.</div>'}</div>
          <form id="addServiceForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
            <input name="name" placeholder="Service name" required class="w-full p-2 border rounded-lg">
            <input name="price" placeholder="Price (N$)" required class="w-full p-2 border rounded-lg">
            <input name="duration_minutes" placeholder="Duration (minutes)" required class="w-full p-2 border rounded-lg">
            <button type="submit" class="btn-primary w-full">Add Service</button>
          </form>
        </div>

        <div>
          <h2 class="text-2xl font-bold mb-4">Business Profile</h2>
          <form id="profileForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
            <input name="business_name" value="${escapeHtml(profile.business_name || '')}" placeholder="Business Name" class="w-full p-2 border rounded-lg">
            <textarea name="description" placeholder="Description" rows="3" class="w-full p-2 border rounded-lg">${escapeHtml(profile.description || '')}</textarea>
            <input name="category" value="${escapeHtml(profile.category || '')}" placeholder="Category" class="w-full p-2 border rounded-lg">
            <input name="address" id="businessAddress" value="${escapeHtml(profile.address || '')}" placeholder="Address" class="w-full p-2 border rounded-lg">
            <input type="hidden" id="businessLat" name="lat" value="${profile.lat || ''}">
            <input type="hidden" id="businessLng" name="lng" value="${profile.lng || ''}">
            <input name="whatsapp_number" value="${escapeHtml(profile.whatsapp_number || '')}" placeholder="WhatsApp Number" class="w-full p-2 border rounded-lg">

            <!-- Leaflet map picker -->
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

    content.innerHTML = html;

    // Initialize Leaflet map picker
    if (typeof L !== 'undefined' && document.getElementById('locationPickerMap')) {
      initLocationPicker(profile.lat, profile.lng);
    }

    // Render chart if applicable
    if (subInfo.subscription_tier !== 'basic' && viewData.length && document.getElementById('viewsChart') && typeof Chart !== 'undefined') {
      new Chart(document.getElementById('viewsChart'), {
        type: 'line',
        data: {
          labels: viewData.map(v => v.date),
          datasets: [{ label: 'Views', data: viewData.map(v => parseInt(v.count)) }]
        }
      });
    }

    // Event listeners
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      await apiFetch('/api/dashboard/profile', { method: 'PUT', body: JSON.stringify(data) });
      alert('Profile updated');
      location.reload();
    });

    document.getElementById('addServiceForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      const res = await apiFetch('/api/dashboard/services', { method: 'POST', body: JSON.stringify(data) });
      if (res.ok) { alert('Service added'); location.reload(); }
      else alert('Failed');
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
      alert('Hours saved');
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

window.updateBookingStatus = async (id, status) => {
  await apiFetch(`/api/dashboard/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  location.reload();
};
window.deleteService = async (id) => {
  if (!confirm('Delete this service?')) return;
  const res = await apiFetch(`/api/dashboard/services/${id}`, { method: 'DELETE' });
  if (res.ok) { alert('Deleted'); location.reload(); }
  else alert('Delete failed');
};
window.uploadServiceImage = async (serviceId, file) => {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch(`/api/upload/service/${serviceId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData });
  if (res.ok) { alert('Image uploaded'); location.reload(); }
  else alert('Upload failed');
};
window.toggleHoursDisabled = (checkbox, day) => {
  const openInput = document.querySelector(`[name="open_${day}"]`);
  const closeInput = document.querySelector(`[name="close_${day}"]`);
  if (checkbox.checked) {
    openInput.disabled = true; closeInput.disabled = true;
    openInput.value = ''; closeInput.value = '';
  } else {
    openInput.disabled = false; closeInput.disabled = false;
  }
};

// ---------- ADMIN DASHBOARD ----------
async function initAdmin() {
  if (!currentUser || currentUser.role !== 'admin') { window.location.href = 'login.html'; return; }
  const logoutBtn = document.getElementById('logoutAdminBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  const stats = await (await apiFetch('/api/admin/stats')).json();
  const chartData = await (await apiFetch('/api/admin/chart-data')).json();
  const pending = await (await apiFetch('/api/admin/pending-verifications')).json();
  const users = await (await apiFetch('/api/admin/users')).json();
  const feed = await (await apiFetch('/api/admin/activity-feed')).json();
  const bookings = await (await apiFetch('/api/admin/bookings')).json();
  const analytics = await (await apiFetch('/api/admin/advanced-analytics')).json();

  let html = `
    <div class="grid grid-cols-4 gap-4 mb-8">
      ${Object.entries(stats).map(([k,v])=>`<div class="p-4 bg-[var(--card-bg)] rounded-2xl border">${k}: ${v}</div>`).join('')}
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border">Active Providers (30d): ${analytics.activeProviders}</div>
    </div>
    <div class="grid grid-cols-2 gap-8 mb-8">
      <div><canvas id="regChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div><canvas id="catChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-2 gap-8 mb-8">
      <div><canvas id="tierChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div><canvas id="cityChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-2 gap-8 mb-8">
      <div><canvas id="revenueChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
      <div><canvas id="bookingsByCategoryChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    </div>
    <div class="grid grid-cols-1 gap-8 mb-8">
      <div><canvas id="regionChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
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
        <div class="p-4 border rounded mb-2 flex justify-between">
          ${escapeHtml(p.business_name)} (${escapeHtml(p.email)})
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
          <thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr class="border-b">
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.role)}</td>
                <td>${u.is_active ? 'Active' : 'Inactive'}</td>
                <td><button onclick="deactivateUser('${u.id}')" class="text-red-500">Deactivate</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div>
      <h2 class="text-2xl font-bold mb-4">Activity Feed</h2>
      ${feed.map(f => `
        <div class="p-2 border-b">${escapeHtml(f.type)}: ${escapeHtml(f.name || f.comment || f.id)} – ${new Date(f.created_at).toLocaleString()}</div>
      `).join('')}
    </div>
  `;
  document.getElementById('adminContent').innerHTML = html;

  if (typeof Chart !== 'undefined') {
    new Chart(document.getElementById('regChart'), {
      type: 'line',
      data: {
        labels: chartData.registrations.map(r => r.date),
        datasets: [{ label: 'Registrations', data: chartData.registrations.map(r => parseInt(r.count)) }]
      }
    });
    new Chart(document.getElementById('catChart'), {
      type: 'bar',
      data: {
        labels: chartData.categories.map(c => c.category),
        datasets: [{ label: 'Providers', data: chartData.categories.map(c => parseInt(c.count)) }]
      }
    });
    new Chart(document.getElementById('tierChart'), {
      type: 'pie',
      data: {
        labels: chartData.tiers.map(t => t.subscription_tier),
        datasets: [{ data: chartData.tiers.map(t => parseInt(t.count)) }]
      }
    });
    new Chart(document.getElementById('cityChart'), {
      type: 'bar',
      data: {
        labels: chartData.cities.map(c => c.city),
        datasets: [{ label: 'Listings', data: chartData.cities.map(c => parseInt(c.count)) }]
      }
    });
    if (analytics.revenueOverTime.length) {
      new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: {
          labels: analytics.revenueOverTime.map(r => r.month),
          datasets: [{ label: 'Monthly Revenue (N$)', data: analytics.revenueOverTime.map(r => parseInt(r.revenue || 0)) }]
        }
      });
    }
    if (analytics.bookingsByCategory.length) {
      new Chart(document.getElementById('bookingsByCategoryChart'), {
        type: 'bar',
        data: {
          labels: analytics.bookingsByCategory.map(c => c.category),
          datasets: [{ label: 'Bookings', data: analytics.bookingsByCategory.map(c => parseInt(c.booking_count)) }]
        }
      });
    }
    if (analytics.registrationsByRegion.length) {
      new Chart(document.getElementById('regionChart'), {
        type: 'bar',
        data: {
          labels: analytics.registrationsByRegion.map(r => r.region),
          datasets: [{ label: 'Providers', data: analytics.registrationsByRegion.map(r => parseInt(r.count)) }]
        }
      });
    }
  }
}

window.approveProvider = async (id) => { await apiFetch(`/api/admin/verify-provider/${id}`, { method: 'PUT' }); location.reload(); };
window.rejectProvider = async (id) => { await apiFetch(`/api/admin/reject-provider/${id}`, { method: 'DELETE' }); location.reload(); };
window.deactivateUser = async (id) => { await apiFetch(`/api/admin/users/${id}/deactivate`, { method: 'PUT' }); location.reload(); };

// ---------- PAGE ROUTER ----------
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadCurrentUser();
  console.log('Current user after load:', currentUser);
  const path = location.pathname;
  if (path.includes('search.html')) initSearchPage();
  else if (path.includes('business.html')) initBusinessPage();
  else if (path.includes('dashboard.html')) initDashboard();
  else if (path.includes('admin.html')) initAdmin();
});