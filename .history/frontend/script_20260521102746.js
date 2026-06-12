// script.js – Phase 1 Complete with Dark/Light Theme & Fixed Hours Handler

let authToken = localStorage.getItem('token');
let currentUser = null;

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

async function logout() { setAuthToken(null); location.href = 'index.html'; }

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
          <h3 class="text-xl font-black text-[var(--text-main)]">${b.name}</h3>
          <p class="text-gray-500 text-sm mt-2">${b.description?.substring(0,100)}</p>
          <div class="mt-4 flex justify-between items-center">
            <span class="text-xs font-bold uppercase">${b.subscription_tier || 'basic'}</span>
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
    <h1 class="text-5xl font-black mb-4 text-[var(--text-main)]">${b.business_name}</h1>
    <div class="flex gap-4 mb-6">
      <span class="badge-verified">${b.is_verified ? '✓ Verified' : 'Unverified'}</span>
      <span class="px-3 py-1 rounded-full text-xs ${open ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}">${open ? 'Open Now' : 'Closed Now'}</span>
    </div>
    <p class="text-gray-500 mb-6">${b.description}</p>
    ${b.lat && b.lng ? `<button id="distanceBtn" class="btn-secondary mb-6">Show distance from me</button><div id="distanceDisplay"></div>` : ''}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div><h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Services</h2>${b.services.map(s => `<div class="mb-2"><strong>${s.name}</strong> – N$${s.price} / ${s.duration_minutes}min</div>`).join('')}</div>
      <div><h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Reviews</h2>${b.reviews.map(r => `<div class="mb-4"><strong>${r.full_name}</strong> ⭐${r.rating}<br/>${r.comment}${r.response ? `<div class="ml-4 text-sm text-gray-400">Owner reply: ${r.response}</div>` : ''}</div><hr/>`).join('')}</div>
    </div>
    <div class="mt-8"><h3 class="text-xl font-bold text-[var(--text-main)]">Anonymous comments</h3>${b.anonymousComments.map(c => `<div class="text-sm my-2"><em>${c.alias}</em>: ${c.comment} <span class="text-xs text-gray-500">(${c.sentiment})</span></div>`).join('')}</div>
    <form id="anonCommentForm" class="mt-6"><textarea placeholder="Leave anonymous feedback" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"></textarea><button type="submit" class="btn-primary mt-2">Post</button></form>
    ${currentUser ? `<button id="reportBtn" class="btn-secondary mt-4">Report this business</button>` : ''}
    <a href="https://wa.me/${b.whatsapp_number}" class="btn-primary mt-6 inline-block">Contact on WhatsApp</a>
  `;
  container.innerHTML = html;

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
  document.getElementById('distanceBtn')?.addEventListener('click', () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const dist = getDistance(pos.coords.latitude, pos.coords.longitude, b.lat, b.lng);
        document.getElementById('distanceDisplay').innerHTML = `${dist.toFixed(1)} km away (~${Math.round(dist/5*60)} min drive)`;
      });
    }
  });
}

// ---------- Provider Dashboard ----------
async function initDashboard() {
  if (!currentUser || currentUser.role !== 'provider') return window.location.href = 'login.html';
  const stats = await (await apiFetch('/api/dashboard/stats')).json();
  const bookings = await (await apiFetch('/api/dashboard/recent-bookings')).json();
  const services = await (await apiFetch('/api/dashboard/services')).json();
  const profile = await (await apiFetch('/api/dashboard/profile')).json();
  const hours = await (await apiFetch('/api/dashboard/hours')).json();

  const html = `
    <div class="grid grid-cols-4 gap-4 mb-8">
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)]">Bookings: ${stats.totalBookings}</div>
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)]">Reviews: ${stats.totalReviews}</div>
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)]">Quotes: ${stats.totalQuotes}</div>
      <div class="p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)]">Profile views: ${stats.profileViews}</div>
    </div>
    <div class="grid grid-cols-2 gap-8">
      <div><h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Recent Bookings</h2>${bookings.map(b => `<div class="mb-2 p-2 border rounded">${b.client_name} – ${b.service_name || 'Service'} on ${new Date(b.start_time).toLocaleString()} <select onchange="updateBookingStatus('${b.id}', this.value)" class="ml-2 p-1 border rounded"><option ${b.status==='pending'?'selected':''}>pending</option><option ${b.status==='confirmed'?'selected':''}>confirmed</option><option ${b.status==='completed'?'selected':''}>completed</option><option ${b.status==='cancelled'?'selected':''}>cancelled</option></select></div>`).join('')}</div>
      <div><h2 class="text-2xl font-bold mb-4 text-[var(--text-main)]">Edit Profile</h2><form id="profileForm" class="space-y-3"><input name="business_name" value="${profile.business_name || ''}" placeholder="Business name" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><textarea name="description" placeholder="Description" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]">${profile.description || ''}</textarea><input name="category" value="${profile.category || ''}" placeholder="Category" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><input name="address" value="${profile.address || ''}" placeholder="Address" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><input name="whatsapp_number" value="${profile.whatsapp_number || ''}" placeholder="WhatsApp number" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><button type="submit" class="btn-primary">Update</button></form>
      <h2 class="text-2xl font-bold mt-8 mb-4 text-[var(--text-main)]">Services</h2><div id="servicesList">${services.map(s => `<div class="flex justify-between p-2 border rounded mb-2">${s.name} – N$${s.price} <button onclick="deleteService('${s.id}')" class="text-red-500">Delete</button></div>`).join('')}</div><form id="addServiceForm" class="mt-4 space-y-2"><input name="name" placeholder="Service name" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><input name="price" placeholder="Price" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><input name="duration_minutes" placeholder="Duration (minutes)" class="w-full p-2 border rounded-xl bg-[var(--bg-main)] border-[var(--border-main)]"/><button type="submit" class="btn-primary">Add Service</button></form>
      <h2 class="text-2xl font-bold mt-8 mb-4 text-[var(--text-main)]">Business Hours</h2><form id="hoursForm">${[0,1,2,3,4,5,6].map(day => `<div class="mb-2">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}: <input type="time" name="open_${day}" value="${hours.find(h=>h.day_of_week===day)?.open_time || ''}" class="p-1 border rounded"/> - <input type="time" name="close_${day}" value="${hours.find(h=>h.day_of_week===day)?.close_time || ''}" class="p-1 border rounded"/> <label>Closed <input type="checkbox" name="closed_${day}" ${hours.find(h=>h.day_of_week===day)?.is_closed ? 'checked' : ''}/></label></div>`).join('')}<button type="submit" class="btn-primary mt-4">Save Hours</button></form>
      </div>
    </div>
  `;
  document.getElementById('dashboardContent').innerHTML = html;

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    await apiFetch('/api/dashboard/profile', { method: 'PUT', body: JSON.stringify(data) });
    alert('Profile updated');
  });
  document.getElementById('addServiceForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    await apiFetch('/api/dashboard/services', { method: 'POST', body: JSON.stringify(data) });
    location.reload();
  });

  // FIXED HOURS HANDLER – converts empty strings to null and respects Closed checkbox
  document.getElementById('hoursForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (let day = 0; day <= 6; day++) {
      const openInput = document.querySelector(`[name="open_${day}"]`);
      const closeInput = document.querySelector(`[name="close_${day}"]`);
      const closedCheck = document.querySelector(`[name="closed_${day}"]`);
      let open_time = openInput?.value || '';
      let close_time = closeInput?.value || '';
      const is_closed = closedCheck?.checked || false;
      if (is_closed) {
        open_time = '';
        close_time = '';
      }
      await apiFetch('/api/dashboard/hours', {
        method: 'POST',
        body: JSON.stringify({
          day_of_week: day,
          open_time: open_time || null,
          close_time: close_time || null,
          is_closed
        })
      });
    }
    alert('Hours saved');
  });
}
window.updateBookingStatus = async (id, status) => {
  await apiFetch(`/api/dashboard/bookings/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  location.reload();
};
window.deleteService = async (id) => {
  await apiFetch(`/api/dashboard/services/${id}`, { method: 'DELETE' });
  location.reload();
};

// ---------- Admin Dashboard with Charts ----------
async function initAdmin() {
  if (!currentUser || currentUser.role !== 'admin') return window.location.href = 'login.html';
  const stats = await (await apiFetch('/api/admin/stats')).json();
  const chartData = await (await apiFetch('/api/admin/chart-data')).json();
  const pending = await (await apiFetch('/api/admin/pending-verifications')).json();
  const users = await (await apiFetch('/api/admin/users')).json();
  const feed = await (await apiFetch('/api/admin/activity-feed')).json();

  let html = `<div class="grid grid-cols-4 gap-4 mb-8">${Object.entries(stats).map(([k,v])=>`<div class="p-4 bg-[var(--card-bg)] rounded-2xl border border-[var(--border-main)]">${k}: ${v}</div>`).join('')}</div>
  <div class="grid grid-cols-2 gap-8 mb-8">
    <div><canvas id="regChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas><canvas id="catChart" class="mt-8 bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
    <div><canvas id="tierChart" class="bg-[var(--card-bg)] p-4 rounded-2xl"></canvas><canvas id="cityChart" class="mt-8 bg-[var(--card-bg)] p-4 rounded-2xl"></canvas></div>
  </div>
  <div class="mb-8"><h2 class="text-2xl font-bold mb-4">Pending Verifications</h2>${pending.map(p => `<div class="p-4 border rounded mb-2 flex justify-between items-center">${p.business_name} (${p.email}) <div><button onclick="approveProvider('${p.user_id}')" class="btn-primary text-sm mr-2">Approve</button> <button onclick="rejectProvider('${p.user_id}')" class="btn-secondary text-sm">Reject</button></div></div>`).join('')}</div>
  <div class="mb-8"><h2 class="text-2xl font-bold mb-4">All Users</h2><div class="overflow-x-auto"><table class="w-full text-left border-collapse"> <thead class="bg-[var(--bg-main)] border-b"> <tr><th class="p-2">Email</th><th>Role</th><th>Status</th><th>Action</th> </tr> </thead> <tbody>${users.map(u => `<tr class="border-b"><td class="p-2">${u.email}</td><td>${u.role}</td><td>${u.is_active ? 'Active' : 'Inactive'}</td><td><button onclick="deactivateUser('${u.id}')" class="text-red-500 text-sm">Deactivate</button></td></tr>`).join('')} </tbody> </table></div></div>
  <div><h2 class="text-2xl font-bold mb-4">Activity Feed</h2>${feed.map(f => `<div class="p-2 border-b text-sm">${f.type}: ${f.name || f.comment || f.id} – ${new Date(f.created_at).toLocaleString()}</div>`).join('')}</div>`;
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

// ---------- Page router ----------
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();  // MUST be first
  await loadCurrentUser();
  const path = location.pathname;
  if (path.includes('search.html')) initSearchPage();
  else if (path.includes('business.html')) initBusinessPage();
  else if (path.includes('dashboard.html')) initDashboard();
  else if (path.includes('admin.html')) initAdmin();
});