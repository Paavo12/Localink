// script.js – Phase 1 Complete with Image Uploads & XSS Protection
// ALL FRONTEND FIXES (2,3,4,8,9) INCLUDED

let authToken = localStorage.getItem('token');
let currentUser = null;

// XSS protection: escape HTML special characters
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
    if (res.ok) currentUser = await res.json();
  } catch(e) {}
  return currentUser;
}

// ---------- THEME TOGGLE ----------
function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') html.classList.add('dark');
  else html.classList.remove('dark');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      html.classList.toggle('dark');
      localStorage.setItem('theme', html.classList.contains('dark') ? 'dark' : 'light');
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

// ---------- Business Page (with all forms: quote, booking, review) ----------
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
   
    ${b.address ? `
  <div class="mt-8">
    <h3 class="text-2xl font-bold mb-4 text-[var(--text-main)]">📍 Location</h3>
    <div class="rounded-xl overflow-hidden shadow-lg border border-[var(--border-main)]">
      <iframe
        width="100%"
        height="300"
        style="border:0; display:block;"
        loading="lazy"
        allowfullscreen
        referrerpolicy="no-referrer-when-downgrade"
        src="https://www.google.com/maps/embed/v1/place?key=&q=${encodeURIComponent(b.address)}&zoom=15">
      </iframe>
    </div>
    <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}" 
       target="_blank" 
       class="btn-secondary mt-4 inline-flex items-center gap-2">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-4-4m0 0l4-4m-4 4h14m-4-4l4 4-4 4"/>
      </svg>
      Get Directions
    </a>
  </div>
` : ''}
    ${b.lat && b.lng ? `<button id="distanceBtn" class="btn-secondary mb-6">Show distance from me</button><div id="distanceDisplay"></div>` : ''}
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
            <!-- FIX #3: Booking button -->
            <button onclick="showBookingForm('${s.id}', '${escapeHtml(s.name)}')" class="btn-primary text-sm mt-3">Book this service</button>
            <div id="bookingForm-${s.id}" class="hidden mt-4 p-4 bg-[var(--bg-main)] border rounded-lg">
              <h4 class="font-bold">Book ${escapeHtml(s.name)}</h4>
              <input type="datetime-local" id="bookingTime-${s.id}" class="w-full p-2 my-2 border rounded-lg" required>
              <textarea id="bookingNotes-${s.id}" placeholder="Any special requests?" class="w-full p-2 mb-2 border rounded-lg"></textarea>
              <button onclick="submitBooking('${s.id}', '${b.user_id}')" class="btn-primary text-sm w-full">Confirm Booking</button>
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

    <!-- Anonymous comments -->
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

    <!-- FIX #4: Review submission form (only for logged-in users) -->
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

    <!-- FIX #2: Quote Request Form -->
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
    <a href="https://wa.me/${b.whatsapp_number}" class="btn-primary mt-6 inline-block">Contact on WhatsApp</a>
  `;
  container.innerHTML = html;

  // Anonymous comment handler
  document.getElementById('anonCommentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const comment = e.target.querySelector('textarea').value;
    await fetch(`/api/businesses/${id}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment }) });
    alert('Comment added');
    location.reload();
  });

  // Report button handler
  document.getElementById('reportBtn')?.addEventListener('click', async () => {
    const reason = prompt('Reason for report?');
    if (reason) await fetch(`/api/businesses/${id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ reason }) });
    alert('Report sent');
  });

  // Distance calculator
  document.getElementById('distanceBtn')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, b.lat, b.lng);
        document.getElementById('distanceDisplay').innerHTML = `${dist.toFixed(1)} km away (~${Math.round(dist/5*60)} min drive)`;
      });
    }
  });

  // Quote form submission (Fix #2)
  document.getElementById('quoteForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('quoteName').value;
    const email = document.getElementById('quoteEmail').value;
    const phone = document.getElementById('quotePhone').value;
    const message = document.getElementById('quoteMessage').value;
    const providerId = id;

    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, name, email, phone, message })
      });
      if (res.ok) {
        alert('Quote request sent! The provider will contact you soon.');
        e.target.reset();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to send. Please try again.');
      }
    } catch (err) {
      alert('Network error. Please check your connection.');
    }
  });

  // Review submission handler (Fix #4)
  document.getElementById('reviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value;
    const isAnonymous = document.getElementById('reviewAnonymous')?.checked || false;
    if (!rating) {
      alert('Please select a rating');
      return;
    }
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ providerId: id, rating: parseInt(rating), comment, isAnonymous })
      });
      if (res.ok) {
        alert('Thank you for your review!');
        location.reload();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit review');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    }
  });
}

// ---------- Helper functions for Booking (Fix #3) ----------
window.showBookingForm = (serviceId, serviceName) => {
  const formDiv = document.getElementById(`bookingForm-${serviceId}`);
  if (formDiv) formDiv.classList.toggle('hidden');
};

window.submitBooking = async (serviceId, providerId) => {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please login to book a service.');
    window.location.href = 'login.html';
    return;
  }
  const startTime = document.getElementById(`bookingTime-${serviceId}`).value;
  const notes = document.getElementById(`bookingNotes-${serviceId}`).value;
  if (!startTime) {
    alert('Please select a date and time.');
    return;
  }
  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ providerId, serviceId, startTime, notes })
    });
    if (res.ok) {
      alert('Booking request sent! The provider will confirm soon.');
      location.reload();
    } else {
      const data = await res.json();
      alert(data.error || 'Booking failed');
    }
  } catch (err) {
    alert('Network error. Please try again.');
  }
};

// ---------- Provider Dashboard (with Fix #8 and #9) ----------
async function initDashboard() {
  if (!currentUser || currentUser.role !== 'provider') {
    document.getElementById('dashboardContent').innerHTML = '<div class="text-center py-20">Please <a href="login.html" class="text-accent">login</a> as a provider to access this dashboard.</div>';
    return;
  }
  
  const logoutBtn = document.getElementById('logoutDashboardBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  
  const stats = await (await apiFetch('/api/dashboard/stats')).json();
  const bookings = await (await apiFetch('/api/dashboard/recent-bookings')).json();
  let services = await (await apiFetch('/api/dashboard/services')).json();
  const profile = await (await apiFetch('/api/dashboard/profile')).json();
  const hours = await (await apiFetch('/api/dashboard/hours')).json();
  
  // FIX #8: Get subscription info
  const subInfo = await (await apiFetch('/api/subscriptions/me')).json();
  
  // FIX #9: Get profile views chart data (only for Verified/Premium)
  let viewData = [];
  if (subInfo.subscription_tier !== 'basic') {
    try {
      const viewsRes = await apiFetch('/api/dashboard/profile-views-chart');
      if (viewsRes.ok) viewData = await viewsRes.json();
    } catch(e) { console.error('Could not load chart data', e); }
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  let servicesHtml = services.map(s => `
    <div class="flex justify-between items-center p-3 bg-[var(--card-bg)] rounded-xl border border-[var(--border-main)] mb-2">
      <div>
        <strong>${escapeHtml(s.name)}</strong> – N$${s.price} / ${s.duration_minutes}min
        <div class="text-xs text-gray-500 mt-1">Images: ${s.image_urls ? s.image_urls.length : 0}</div>
      </div>
      <div class="flex gap-2">
        <label class="btn-secondary text-xs py-1 px-2 cursor-pointer">Upload
          <input type="file" accept="image/*" class="hidden" onchange="uploadServiceImage('${s.id}', this.files[0])">
        </label>
        <button onclick="deleteService('${s.id}')" class="text-red-500 text-sm">Delete</button>
      </div>
    </div>
  `).join('');
  
  const html = `
    <!-- FIX #8: Subscription info card -->
    <div class="bg-[var(--card-bg)] p-6 rounded-2xl border mb-12">
      <div class="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 class="text-2xl font-bold">Current Plan: <span class="text-accent">${escapeHtml(subInfo.subscription_tier || 'basic')}</span></h2>
          ${subInfo.subscription_end ? `<p class="text-sm text-gray-500">Renews on ${new Date(subInfo.subscription_end).toLocaleDateString()}</p>` : '<p class="text-sm text-gray-500">Free plan – upgrade to get more visibility</p>'}
        </div>
        <a href="checkout.html" class="btn-primary">Upgrade Plan</a>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalBookings}</div><div class="text-sm text-gray-500">Total Bookings</div></div>
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalReviews}</div><div class="text-sm text-gray-500">Reviews</div></div>
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.totalQuotes}</div><div class="text-sm text-gray-500">Quote Requests</div></div>
      <div class="bg-[var(--card-bg)] p-6 rounded-2xl border"><div class="text-3xl font-black text-accent">${stats.profileViews}</div><div class="text-sm text-gray-500">Profile Views</div></div>
    </div>

    <!-- FIX #9: Profile views chart (tier-gated) -->
    ${subInfo.subscription_tier !== 'basic' ? `
      <div class="mb-12">
        <h2 class="text-2xl font-bold mb-4">Profile Views (Last 30 days)</h2>
        <canvas id="viewsChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas>
      </div>
    ` : ''}

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
      <!-- Left: Bookings & Services -->
      <div>
        <h2 class="text-2xl font-bold mb-4">Recent Bookings</h2>
        <div class="space-y-3">
          ${bookings.map(b => `
            <div class="bg-[var(--card-bg)] p-4 rounded-xl border flex justify-between items-center flex-wrap gap-2">
              <div><div class="font-bold">${escapeHtml(b.client_name)}</div><div class="text-sm text-gray-500">${escapeHtml(b.service_name || 'Service')} – ${new Date(b.start_time).toLocaleString()}</div></div>
              <select onchange="updateBookingStatus('${b.id}', this.value)" class="p-2 border rounded-lg">
                <option ${b.status==='pending'?'selected':''}>pending</option><option ${b.status==='confirmed'?'selected':''}>confirmed</option>
                <option ${b.status==='completed'?'selected':''}>completed</option><option ${b.status==='cancelled'?'selected':''}>cancelled</option>
              </select>
            </div>
          `).join('')}
          ${bookings.length === 0 ? '<div class="text-gray-500 text-center py-4">No bookings yet.</div>' : ''}
        </div>

        <h2 class="text-2xl font-bold mt-8 mb-4">Services</h2>
        <div id="servicesList" class="space-y-2 mb-4">${servicesHtml}</div>
        <form id="addServiceForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
          <input name="name" placeholder="Service name" required class="w-full p-2 border rounded-lg">
          <input name="price" placeholder="Price (N$)" required class="w-full p-2 border rounded-lg">
          <input name="duration_minutes" placeholder="Duration (minutes)" required class="w-full p-2 border rounded-lg">
          <button type="submit" class="btn-primary w-full">Add Service</button>
        </form>
      </div>

      <!-- Right: Profile & Hours -->
      <div>
        <h2 class="text-2xl font-bold mb-4">Business Profile</h2>
        <form id="profileForm" class="bg-[var(--card-bg)] p-4 rounded-xl border space-y-3">
          <input name="business_name" value="${escapeHtml(profile.business_name || '')}" placeholder="Business Name" class="w-full p-2 border rounded-lg">
          <textarea name="description" placeholder="Description" rows="3" class="w-full p-2 border rounded-lg">${escapeHtml(profile.description || '')}</textarea>
          <input name="category" value="${escapeHtml(profile.category || '')}" placeholder="Category" class="w-full p-2 border rounded-lg">
          <input name="address" value="${escapeHtml(profile.address || '')}" placeholder="Address" class="w-full p-2 border rounded-lg">
          <input name="whatsapp_number" value="${escapeHtml(profile.whatsapp_number || '')}" placeholder="WhatsApp Number" class="w-full p-2 border rounded-lg">
          <!-- Hidden fields for coordinates -->
<input type="hidden" id="businessLat" name="lat" value="${profile.lat || ''}">
<input type="hidden" id="businessLng" name="lng" value="${profile.lng || ''}">

<!-- Map picker -->
<div class="border-t pt-3 mt-3">
  <label class="font-bold block mb-2">📍 Click on the map to set your exact location</label>
  <div id="locationPickerMap" style="height: 300px; width: 100%; border-radius: 0.75rem; overflow: hidden; z-index: 1;"></div>
  <p class="text-xs text-gray-500 mt-2">Click anywhere on the map – a marker will appear. This location will be shown to customers.</p>
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
            ${days.map((dayName, day) => {
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
            }).join('')}
          </div>
          <button type="submit" class="btn-primary w-full mt-4">Save Hours</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById('dashboardContent').innerHTML = html;
  // Initialize location picker map (if profile exists)
if (document.getElementById('locationPickerMap')) {
  initLocationPicker(profile.lat, profile.lng);
}

  // Render chart if applicable (Fix #9)
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
}

window.updateBookingStatus = async (id, status) => {
  await apiFetch(`/api/dashboard/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  location.reload();
};
window.deleteService = async (id) => {
  console.log('Deleting service with id:', id);
  if (confirm('Delete this service?')) {
    try {
      const response = await apiFetch(`/api/dashboard/services/${id}`, { method: 'DELETE' });
      const data = await response.json();
      console.log('Delete response:', data);
      if (response.ok) {
        alert('Service deleted');
        location.reload();
      } else {
        alert('Delete failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  }
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

// ---------- Admin Dashboard (unchanged) ----------
async function initAdmin() {
  if (!currentUser || currentUser.role !== 'admin') { window.location.href = 'login.html'; return; }
  const logoutBtn = document.getElementById('logoutAdminBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);
  const stats = await (await apiFetch('/api/admin/stats')).json();
  const chartData = await (await apiFetch('/api/admin/chart-data')).json();
  const pending = await (await apiFetch('/api/admin/pending-verifications')).json();
  const users = await (await apiFetch('/api/admin/users')).json();
  const feed = await (await apiFetch('/api/admin/activity-feed')).json();
  let html = `<div class="grid grid-cols-4 gap-4 mb-8">${Object.entries(stats).map(([k,v])=>`<div class="p-4 bg-[var(--card-bg)] rounded-2xl border">${k}: ${v}</div>`).join('')}</div>
  <div class="grid grid-cols-2 gap-8 mb-8">
    <div><canvas id="regChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas><canvas id="catChart" class="mt-8 bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    <div><canvas id="tierChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas><canvas id="cityChart" class="mt-8 bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
  </div>
  <div class="mb-8"><h2 class="text-2xl font-bold mb-4">Pending Verifications</h2>${pending.map(p => `<div class="p-4 border rounded mb-2 flex justify-between">${escapeHtml(p.business_name)} (${escapeHtml(p.email)}) <div><button onclick="approveProvider('${p.user_id}')" class="btn-primary text-sm mr-2">Approve</button> <button onclick="rejectProvider('${p.user_id}')" class="btn-secondary text-sm">Reject</button></div></div>`).join('')}</div>
  <div class="mb-8"><h2 class="text-2xl font-bold mb-4">All Users</h2><div class="overflow-x-auto"><table class="w-full"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.map(u => `<tr><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.is_active ? 'Active' : 'Inactive'}</td><td><button onclick="deactivateUser('${u.id}')" class="text-red-500">Deactivate</button></td></tr>`).join('')}</tbody></table></div></div>
  <div><h2 class="text-2xl font-bold mb-4">Activity Feed</h2>${feed.map(f => `<div class="p-2 border-b">${escapeHtml(f.type)}: ${escapeHtml(f.name || f.comment || f.id)} – ${new Date(f.created_at).toLocaleString()}</div>`).join('')}</div>`;
  document.getElementById('adminContent').innerHTML = html;
  if (typeof Chart !== 'undefined') {
    new Chart(document.getElementById('regChart'), { type: 'line', data: { labels: chartData.registrations.map(r=>r.date), datasets: [{ label: 'Registrations', data: chartData.registrations.map(r=>parseInt(r.count)) }] } });
    new Chart(document.getElementById('catChart'), { type: 'bar', data: { labels: chartData.categories.map(c=>c.category), datasets: [{ label: 'Providers', data: chartData.categories.map(c=>parseInt(c.count)) }] } });
    new Chart(document.getElementById('tierChart'), { type: 'pie', data: { labels: chartData.tiers.map(t=>t.subscription_tier), datasets: [{ data: chartData.tiers.map(t=>parseInt(t.count)) }] } });
    new Chart(document.getElementById('cityChart'), { type: 'bar', data: { labels: chartData.cities.map(c=>c.city), datasets: [{ label: 'Listings', data: chartData.cities.map(c=>parseInt(c.count)) }] } });
  }
}
window.approveProvider = async (id) => { await apiFetch(`/api/admin/verify-provider/${id}`, { method: 'PUT' }); location.reload(); };
window.rejectProvider = async (id) => { await apiFetch(`/api/admin/reject-provider/${id}`, { method: 'DELETE' }); location.reload(); };
window.deactivateUser = async (id) => { await apiFetch(`/api/admin/users/${id}/deactivate`, { method: 'PUT' }); location.reload(); };

// ---------- Page Router ----------
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadCurrentUser();
  const path = location.pathname;
  if (path.includes('search.html')) initSearchPage();
  else if (path.includes('business.html')) initBusinessPage();
  else if (path.includes('dashboard.html')) initDashboard();
  else if (path.includes('admin.html')) initAdmin();
});
// Map picker for provider dashboard
let locationMap;
let locationMarker;

function initLocationPicker(initialLat, initialLng) {
  const mapContainer = document.getElementById('locationPickerMap');
  if (!mapContainer) return;
  
  // Default to Windhoek if no coordinates saved
  const defaultLat = -22.5609;
  const defaultLng = 17.0658;
  const lat = initialLat ? parseFloat(initialLat) : defaultLat;
  const lng = initialLng ? parseFloat(initialLng) : defaultLng;
  
  locationMap = L.map(mapContainer).setView([lat, lng], 15);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CartoDB'
  }).addTo(locationMap);
  
  // Add marker if coordinates exist
  if (initialLat && initialLng) {
    locationMarker = L.marker([lat, lng]).addTo(locationMap);
  }
  
  // On map click, update marker and hidden fields
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