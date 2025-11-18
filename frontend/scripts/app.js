// app.js - Unified JavaScript for GreenTrace (backend-synced, full rewrite while keeping original structure)

// ===== CONFIGURATION =====
const API_BASE = 'https://greentrace-t95w.onrender.com';
const APP_CONFIG = {
  CO2_PER_TREE: 21, // kg per year
  DEFAULT_MAP_VIEW: [-1.286389, 36.817223],
  DEFAULT_MAP_ZOOM: 10,
  MY_TREES_MAP_ZOOM: 7
};

// ===== GLOBAL VARIABLES =====
let map;
let markersLayer;
let myTreesMap;
let myTreesMarkersLayer = [];
let aiModel = null;
let kenyaLocations = [];
let LOCATIONS = [];
let _greentrace_map_initialized = false;

// ===== UTILITY FUNCTIONS =====
function getAuthToken() {
  return localStorage.getItem('token');
}

function setUserInfo(user, token) {
  // Accept both user.username and user.name
  localStorage.setItem('token', token);
  const name = user?.username || user?.name || user?.displayName || '';
  localStorage.setItem('userName', name);
  // store user object and id
  localStorage.setItem('greentrace_user', JSON.stringify(user || {}));
  if (user && (user.id || user._id)) {
    localStorage.setItem('userId', (user.id || user._id).toString());
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// ===== API FUNCTIONS =====
async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getAuthToken();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // set content-type for JSON bodies
  if (!headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers
    });

    // Try to parse JSON when possible
    const text = await res.text();
    if (!res.ok) {
      // Try to parse error body
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
      const message = parsed?.error || parsed?.message || `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }

    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      // If not JSON, return raw text
      return text;
    }
  } catch (err) {
    console.error('API fetch error:', err);
    throw err;
  }
}

// ===== UI FUNCTIONS =====
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) {
    // fallback
    try { alert(message); } catch (e) { console.log(message); }
    return;
  }

  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function updateNavAuthArea() {
  const area = document.getElementById('nav-auth-area');
  if (!area) return;

  const userName = localStorage.getItem('userName');
  const token = getAuthToken();

  if (token && userName) {
    area.innerHTML = `
      <span class="muted">Hello, <strong>${escapeHtml(userName)}</strong></span>
      <button class="btn" onclick="logout()">Logout</button>
    `;
  } else {
    area.innerHTML = `
      <a href="login.html">Login</a>
      <a href="signup.html" class="btn">Sign Up</a>
    `;
  }
}

// ===== THEME MANAGEMENT =====
function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;

  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.body.setAttribute('data-theme', 'dark');
    toggle.textContent = '☀️';
  } else {
    document.body.setAttribute('data-theme', 'light');
    toggle.textContent = '🌙';
  }

  toggle.addEventListener('click', () => {
    if (document.body.getAttribute('data-theme') === 'dark') {
      document.body.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
      toggle.textContent = '🌙';
    } else {
      document.body.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      toggle.textContent = '☀️';
    }
  });
}

// ===== AUTHENTICATION =====
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (result && result.token) {
      // backend returns user object in result.user
      setUserInfo(result.user || { name: email.split('@')[0] }, result.token);
      showToast('Welcome back!', 'success');
      window.location.href = 'dashboard.html';
    } else {
      showToast(result?.message || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showToast('Login failed. Please check your credentials.', 'error');
  }
}

async function handleSignup(event) {
  event.preventDefault();

  const username = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  try {
    const result = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });

    if (result && result.token) {
      setUserInfo(result.user || { name: username }, result.token);
      showToast('Account created successfully!', 'success');
      window.location.href = 'dashboard.html';
    } else {
      showToast(result?.message || 'Signup failed', 'error');
    }
  } catch (error) {
    console.error('Signup error:', error);
    showToast('Signup failed. Please try again.', 'error');
  }
}

function logout() {
  if (confirm('Are you sure you want to log out?')) {
    localStorage.removeItem('token');
    localStorage.removeItem('userName');
    localStorage.removeItem('greentrace_user');
    localStorage.removeItem('userId');
    updateNavAuthArea();
    showToast('Logged out successfully', 'success');
    window.location.href = 'index.html';
  }
}

// ===== DASHBOARD FUNCTIONS =====
async function updateDashboardStats() {
  let trees = [];
  try {
    const apiResp = await apiFetch('/api/trees');
    // backend may return array directly or object with trees
    if (Array.isArray(apiResp)) {
      trees = apiResp;
    } else if (apiResp && Array.isArray(apiResp.trees)) {
      trees = apiResp.trees;
    } else if (apiResp && apiResp.data && Array.isArray(apiResp.data)) {
      trees = apiResp.data;
    } else {
      // fallback to local
      trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    }
    // cache
    localStorage.setItem("greentrace_trees", JSON.stringify(trees));
  } catch (err) {
    // offline / API error -> use cached local copy
    console.warn('Could not load trees from API, falling back to localStorage.', err);
    trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  }

  const totalTrees = trees.length;
  const verifiedTrees = trees.filter(tree => tree.verified).length;
  const uniqueSpecies = new Set(
    trees.map(tree => (tree.species || tree.treeName || "Unknown")).filter(n => n && n !== "Unknown")
  ).size;
  const co2Offset = (verifiedTrees * APP_CONFIG.CO2_PER_TREE).toFixed(1);

  // Update stats in DOM (only if elements exist)
  const totalEl = document.getElementById("totalTrees");
  const verifiedEl = document.getElementById("verifiedTrees");
  const speciesEl = document.getElementById("speciesCount");
  const co2El = document.getElementById("co2Offset");

  if (totalEl) totalEl.textContent = totalTrees;
  if (verifiedEl) verifiedEl.textContent = verifiedTrees;
  if (speciesEl) speciesEl.textContent = uniqueSpecies;
  if (co2El) co2El.textContent = `${co2Offset} kg`;

  // Update welcome message
  const currentUser = JSON.parse(localStorage.getItem("greentrace_user")) || {};
  if (currentUser.name) {
    const welcomeEl = document.getElementById("welcomeMessage");
    if (welcomeEl) welcomeEl.textContent = `Welcome back, ${currentUser.name}!`;
  }
}

async function initDashboardMap() {
  // Ensure map container exists
  if (!document.getElementById('map')) return;

  let trees = [];
  try {
    const apiResp = await apiFetch('/api/trees');
    if (Array.isArray(apiResp)) trees = apiResp;
    else if (apiResp && Array.isArray(apiResp.trees)) trees = apiResp.trees;
    else trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    localStorage.setItem("greentrace_trees", JSON.stringify(trees));
  } catch (err) {
    trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  }

  // create or reuse map
  try {
    if (!map) {
      map = L.map('map').setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.DEFAULT_MAP_ZOOM);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
      }).addTo(map);
      _greentrace_map_initialized = true;
    } else {
      map.setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.DEFAULT_MAP_ZOOM);
    }
  } catch (err) {
    console.warn('Leaflet map init failed', err);
    return;
  }

  // Clean previous markers
  if (markersLayer && map && markersLayer.clearLayers) {
    markersLayer.clearLayers();
  }

  const markers = [];

  trees.forEach(tree => {
    const lat = parseFloat(tree.lat ?? tree.latitude ?? tree.latitudes);
    const lng = parseFloat(tree.lon ?? tree.longitude ?? tree.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      const iconColor = tree.verified ? 'green' : 'orange';
      const customIcon = L.divIcon({
        html: `<div style="background-color: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
        className: 'custom-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      const statusBadge = tree.verified
        ? '<span style="color: green; font-weight: bold;">✓ Verified</span>'
        : '<span style="color: orange; font-weight: bold;">⏳ Pending Verification</span>';

      marker.bindPopup(`
        <div style="min-width: 200px;">
          <h4 style="margin: 0 0 8px 0; color: var(--primary);">${escapeHtml(tree.treeName || tree.species || 'Unnamed Tree')}</h4>
          <p style="margin: 4px 0;"><strong>Species:</strong> ${escapeHtml(tree.species || tree.treeName || 'Unknown')}</p>
          <p style="margin: 4px 0;"><strong>Planted by:</strong> ${escapeHtml(tree.planterName || tree.uploadedBy || 'Unknown')}</p>
          <p style="margin: 4px 0;"><strong>Location:</strong> ${escapeHtml(tree.location || tree.place || 'Unknown')}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${statusBadge}</p>
          ${tree.plantedAt ? `<p style="margin: 4px 0;"><strong>Planted:</strong> ${new Date(tree.plantedAt).toLocaleDateString()}</p>` : ''}
        </div>
      `);
      markers.push(marker);
    }
  });

  if (markers.length > 0) {
    const group = new L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  } else {
    // no markers - show default popup
    L.marker(APP_CONFIG.DEFAULT_MAP_VIEW)
      .addTo(map)
      .bindPopup('<div style="text-align: center;"><strong>No trees yet</strong><br>Add your first tree to see it here!</div>')
      .openPopup();
  }

  setTimeout(() => {
    try { map.invalidateSize(); } catch (e) { /* ignore */ }
  }, 200);
}

// ===== LANDING PAGE FUNCTIONS =====
function initLandingPage() {
  const navbar = document.querySelector('.nav');
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  const animatedElements = document.querySelectorAll('.slide-up');

  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) navbar.classList.add('nav-scrolled');
    else navbar.classList.remove('nav-scrolled');
  });

  // Mobile menu
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('active');
    });
  }

  // Scroll animations
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.2 });

  animatedElements.forEach(el => observer.observe(el));
}

// ===== MY TREES PAGE FUNCTIONS =====
function initMyTreesPage() {
  // Initialize map for My Trees page
  if (document.getElementById('map')) {
    if (!myTreesMap) {
      myTreesMap = L.map("map").setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.MY_TREES_MAP_ZOOM);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(myTreesMap);
      setTimeout(() => myTreesMap.invalidateSize(), 500);
    }
  }

  // Load Kenya locations
  loadKenyaLocations();

  // Autofill planter name with user's signup name
  autofillPlanterName();

  // Load AI model
  loadAIModel();

  // Load existing trees (from backend mine endpoint)
  loadMyTrees();

  // Set up event listeners
  setupMyTreesEventListeners();
}

async function loadKenyaLocations() {
  const locationSelect = document.getElementById("locationSelect");
  if (!locationSelect) return;

  try {
    const res = await fetch("./location.json");
    kenyaLocations = await res.json();
    locationSelect.innerHTML = kenyaLocations.map(l => `<option value="${escapeHtml(l.name)}">${escapeHtml(l.name)}</option>`).join("");
  } catch {
    locationSelect.innerHTML = `<option value="Nairobi">Nairobi</option>`;
  }
}

function autofillPlanterName() {
  const planterNameInput = document.getElementById("planterName");
  if (!planterNameInput) return;

  const userName = localStorage.getItem('userName');
  if (userName) {
    planterNameInput.value = userName;
  }
}

async function loadAIModel() {
  try {
    showToast("Loading AI model...", "info");
    aiModel = await tf.loadLayersModel("../frontend/models/tree-model/model.json");
    showToast("AI model ready ✅", "success");
  } catch {
    aiModel = null;
    showToast("Using fallback AI verification", "warning");
  }
}

async function loadMyTrees() {
  const gallery = document.getElementById("treeGallery");
  if (!gallery) return;

  let trees = [];
  try {
    // Prefer backend "mine" endpoint
    const resp = await apiFetch('/api/trees/mine');
    if (resp && Array.isArray(resp.trees)) trees = resp.trees;
    else if (Array.isArray(resp)) trees = resp;
    else {
      // try GET /api/trees and filter by userId if necessary
      const all = await apiFetch('/api/trees');
      trees = Array.isArray(all) ? all : (all?.trees || []);
      const userId = localStorage.getItem('userId');
      if (userId) {
        trees = trees.filter(t => t.user_id?.toString() === userId || t.userId?.toString() === userId || (t.uploadedBy && t.uploadedBy.toString() === localStorage.getItem('userName')));
      }
    }
    // Cache
    localStorage.setItem("greentrace_trees_mine", JSON.stringify(trees));
  } catch (err) {
    console.warn('Could not fetch my trees, falling back to cache', err);
    trees = JSON.parse(localStorage.getItem("greentrace_trees_mine")) || JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  }

  // Clear gallery
  gallery.innerHTML = "";

  // Render trees (most recent first)
  trees.slice().reverse().forEach(renderTree);

  // Update map
  updateMyTreesMap();
}

function renderTree(tree) {
  const gallery = document.getElementById("treeGallery");
  if (!gallery) return;

  const currentUser = localStorage.getItem('userName') || 'Unknown';
  const uploader = tree.uploadedBy || tree.uploader || tree.planterName || '';
  const isOwner = (tree.user_id && localStorage.getItem('userId') && tree.user_id.toString() === localStorage.getItem('userId')) || (uploader && uploader === currentUser);

  const deleteButtonHtml = isOwner
    ? `<button class="tree-delete-btn" data-id="${escapeHtml(tree.id || tree._id || tree.tree_id || tree.treeId)}"><i class="fas fa-trash"></i> Delete</button>`
    : `<button class="tree-delete-btn" disabled title="Only the uploader can delete this tree"><i class="fas fa-trash"></i> Delete</button>`;

  const card = document.createElement("div");
  card.className = "tree-card";
  card.innerHTML = `
    <img src="${escapeHtml(tree.image || tree.photo_url || tree.photo || '')}" alt="${escapeHtml(tree.treeName || tree.species || '')}">
    <h3>${escapeHtml(tree.treeName || tree.species || 'Unnamed Tree')}</h3>
    <p><b>Planter:</b> ${escapeHtml(tree.planterName || tree.uploadedBy || tree.uploader || 'Unknown')}</p>
    <p>${escapeHtml(tree.location || tree.place || '')}</p>
    <p class="${tree.verified ? "tree-verified" : "tree-not-verified"}">${tree.verified ? "✅ AI Verified" : "❌ Unverified"}</p>
    <div class="tree-confidence">${typeof tree.confidence === 'number' ? (tree.confidence * 100).toFixed(1) : (tree.confidence ? (tree.confidence * 100).toFixed(1) : '0.0')}% confidence</div>
    ${deleteButtonHtml}
  `;
  gallery.appendChild(card);

  // Add delete event listener only if owner
  if (isOwner) {
    const btn = card.querySelector(".tree-delete-btn");
    if (btn) {
      btn.addEventListener("click", () => deleteTree(tree.id || tree._id || tree.tree_id || tree.treeId));
    }
  }
}

function updateMyTreesMap() {
  if (!myTreesMap) return;

  // Clear existing markers
  myTreesMarkersLayer.forEach(marker => myTreesMap.removeLayer(marker));
  myTreesMarkersLayer = [];

  let trees = [];
  try {
    trees = JSON.parse(localStorage.getItem("greentrace_trees_mine")) || JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  } catch (e) {
    trees = [];
  }

  const verifiedTrees = trees.filter(tree => tree.verified);

  // Add markers for verified trees
  verifiedTrees.forEach(tree => {
    const lat = parseFloat(tree.lat ?? tree.latitude);
    const lng = parseFloat(tree.lon ?? tree.longitude);

    if (!isNaN(lat) && !isNaN(lng)) {
      const marker = L.marker([lat, lng])
        .addTo(myTreesMap)
        .bindPopup(`<b>${escapeHtml(tree.treeName || tree.species)}</b><br>${escapeHtml(tree.planterName || tree.uploadedBy || '')}<br>${escapeHtml(tree.location || '')}`);
      myTreesMarkersLayer.push(marker);
    }
  });
}

function setupMyTreesEventListeners() {
  const form = document.getElementById("treeForm");
  const centerButton = document.getElementById("center-my-trees");

  if (form) {
    form.addEventListener("submit", handleTreeSubmission);
  }

  if (centerButton) {
    centerButton.addEventListener("click", centerOnMyTrees);
  }
}

async function handleTreeSubmission(event) {
  event.preventDefault();

  const treeName = document.getElementById("treeName").value.trim();
  const planterName = document.getElementById("planterName").value.trim();
  const location = document.getElementById("locationSelect").value;
  const description = document.getElementById("description").value.trim();
  const imageFile = document.getElementById("treeImage").files[0];

  if (!imageFile) {
    showToast("Please upload a tree image!", "error");
    return;
  }

  const submitBtn = document.getElementById("submitTreeBtn");
  const verificationProgress = document.getElementById("verificationProgress");
  const progressFill = document.getElementById("progressFill");
  const verificationStatus = document.getElementById("verificationStatus");

  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying...";
  if (verificationProgress) verificationProgress.classList.remove("hidden");

  try {
    updateProgress(30, "Reading image...", progressFill, verificationStatus);
    const imageBase64 = await toBase64(imageFile);
    updateProgress(60, "Analyzing...", progressFill, verificationStatus);

    const result = aiModel ? await verifyWithTensorFlow(imageBase64) : await basicImageAnalysis(imageBase64);

    if (result.verified) {
      const locationData = kenyaLocations.find(l => l.name === location);
      const lat = locationData?.lat || -1.29 + Math.random() * 0.2;
      const lon = locationData?.lng || 36.82 + Math.random() * 0.2;

      // Prepare a normalized payload for backend
      const payload = {
        species: treeName || planterName || 'Unknown',
        photo_url: imageBase64,
        latitude: lat,
        longitude: lon,
        description: description || '',
        confidence: result.confidence,
        verified: true
      };

      // Push to backend
      let backendOk = false;
      try {
        const resp = await apiFetch('/api/trees', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        // resp may contain confirmation; we'll attempt to refresh caches
        backendOk = true;
      } catch (err) {
        console.warn('Failed to upload tree to backend, caching locally', err);
        backendOk = false;
      }

      // Construct local newTree for immediate UI (use id placeholder if backend didn't return one)
      const newTreeLocal = {
        id: Date.now(),
        treeName,
        planterName,
        location,
        description,
        lat,
        lon,
        image: imageBase64,
        verified: true,
        confidence: result.confidence,
        plantedAt: new Date().toISOString(),
        uploadedBy: localStorage.getItem('userName') || 'Unknown'
      };

      // Save to localStorage cache
      try {
        const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
        trees.push(newTreeLocal);
        localStorage.setItem("greentrace_trees", JSON.stringify(trees));
      } catch (e) {
        console.warn('Failed to update local cache of trees', e);
      }

      // Refresh user-specific cache if backend sync succeeded
      if (backendOk) {
        try { await loadMyTrees(); } catch (e) { /* ignore */ }
        try { await updateDashboardStats(); } catch (e) { /* ignore */ }
        try { await initDashboardMap(); } catch (e) { /* ignore */ }
      } else {
        // local UI update
        renderTree(newTreeLocal);
        updateMyTreesMap();
      }

      document.getElementById("treeForm").reset();
      showToast(`✅ ${result.message}`, "success");
    } else {
      showToast(`❌ ${result.message}`, "error");
    }
  } catch (error) {
    console.error(error);
    showToast("Verification failed", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Add Tree 🌳";
    if (verificationProgress) verificationProgress.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
  }
}

async function deleteTree(id) {
  // Try backend delete first (requires auth)
  const resolvedId = id;
  let deleted = false;

  try {
    await apiFetch(`/api/trees/${encodeURIComponent(resolvedId)}`, { method: 'DELETE' });
    deleted = true;
  } catch (err) {
    // if backend delete fails due to auth or not found, fallback to local deletion if allowed
    console.warn('Backend delete failed, attempting local deletion', err);
    // continue to local fallback
  }

  // Local fallback deletion (use loose equality)
  const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  const tree = trees.find(t => (t.id == resolvedId || t._id == resolvedId || t.tree_id == resolvedId));

  const currentUserId = localStorage.getItem('userId');
  const currentUser = localStorage.getItem('userName') || 'Unknown';

  // ownership check: if backend delete occurred we assume server enforced ownership
  if (!deleted) {
    if (tree) {
      const isOwner = (tree.user_id && currentUserId && tree.user_id.toString() === currentUserId) || (tree.uploadedBy && tree.uploadedBy === currentUser);
      if (!isOwner) {
        showToast("❌ You can only delete trees you uploaded", "error");
        return;
      }
      if (!confirm("Are you sure you want to delete this tree?")) return;
      const updated = trees.filter(t => !(t.id == resolvedId || t._id == resolvedId || t.tree_id == resolvedId));
      localStorage.setItem("greentrace_trees", JSON.stringify(updated));
      // update UI
      const gallery = document.getElementById("treeGallery");
      if (gallery) {
        gallery.innerHTML = "";
        updated.forEach(renderTree);
      }
      updateMyTreesMap();
      showToast("🌳 Tree deleted locally", "success");
      return;
    } else {
      showToast("Could not delete tree (not found)", "error");
      return;
    }
  } else {
    // If backend delete succeeded, refresh caches and UI
    try {
      await loadMyTrees();
      await updateDashboardStats();
      await initDashboardMap();
    } catch (e) { /* ignore */ }
    showToast("🌳 Tree deleted successfully", "success");
  }
}

// ===== IMAGE / AI HELPERS =====
async function verifyWithTensorFlow(base64) {
  const img = await createImage(base64);
  const tensor = tf.browser.fromPixels(img).resizeBilinear([224, 224]).div(255).expandDims(0);
  const preds = aiModel.predict(tensor);
  const data = await preds.data();
  const confidence = Math.max(...data);
  const verified = confidence > 0.6;
  tf.dispose([tensor, preds]);
  return {
    verified,
    confidence,
    message: verified
      ? `Tree detected (${(confidence * 100).toFixed(1)}%)`
      : `No tree detected (${(confidence * 100).toFixed(1)}%)`
  };
}

function createImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function basicImageAnalysis(base64) {
  return new Promise(resolve => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let greenPixels = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];

        if (g > r + 20 && g > b + 20 && g > 60) {
          greenPixels++;
        }
      }

      const confidence = Math.min((greenPixels / (imageData.length / 4)) / 0.3, 0.95);
      const verified = confidence > 0.4;

      resolve({
        verified,
        confidence,
        message: verified
          ? `Tree-like features detected (${(confidence * 100).toFixed(1)}%)`
          : `Low confidence (${(confidence * 100).toFixed(1)}%)`
      });
    };
  });
}

function updateProgress(percent, text, progressFill, verificationStatus) {
  if (progressFill) progressFill.style.width = percent + "%";
  if (verificationStatus) verificationStatus.textContent = text;
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function centerOnMyTrees() {
  if (!myTreesMap) return;

  const trees = JSON.parse(localStorage.getItem("greentrace_trees_mine")) || JSON.parse(localStorage.getItem("greentrace_trees")) || [];
  const verifiedTrees = trees.filter(tree => tree.verified);

  if (verifiedTrees.length > 0) {
    const group = L.featureGroup(
      verifiedTrees.map(tree => L.marker([tree.lat || tree.latitude, tree.lon || tree.longitude]))
    );
    myTreesMap.fitBounds(group.getBounds());
  } else {
    showToast("No trees to center", "warning");
  }
}

// ===== LEADERBOARD PAGE FUNCTIONS =====
function initLeaderboardPage() {
  loadLeaderboardData();
}

function loadLeaderboardData() {
  apiFetch('/api/leaderboard')
    .then(data => {
      // backend returns { leaderboard: rows } in your backend
      let rows = [];
      if (Array.isArray(data)) rows = data;
      else if (data && Array.isArray(data.leaderboard)) rows = data.leaderboard;
      else if (data && Array.isArray(data.data)) rows = data.data;
      else {
        // fallback local
        loadLeaderboardDataLocal();
        return;
      }

      const sorted = rows.map(user => ({
        name: user.name || user.username || user.displayName || 'Anonymous',
        count: user.trees_planted || user.count || 0,
        verified: user.verified || user.verified_trees || 0,
        speciesCount: user.species_count || 0
      }));

      updateLeaderboardStats(sorted.length, sorted.reduce((sum, u) => sum + u.count, 0), sorted.reduce((sum, u) => sum + u.speciesCount, 0));
      renderLeaderboard(sorted);
    })
    .catch(err => {
      console.error("Leaderboard API error:", err);
      loadLeaderboardDataLocal();
    });
}

function loadLeaderboardDataLocal() {
  const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];

  const userStats = {};
  const allSpecies = new Set();

  trees.forEach(tree => {
    const name = (tree.uploadedBy || tree.planterName || tree.user_name || 'Anonymous Planter').toString().trim();
    if (!userStats[name]) {
      userStats[name] = { count: 0, species: new Set(), verified: 0 };
    }
    userStats[name].count++;
    if (tree.verified) userStats[name].verified++;
    const speciesName = (tree.treeName || tree.species || '').toString().trim();
    if (speciesName) {
      userStats[name].species.add(speciesName);
      allSpecies.add(speciesName);
    }
  });

  const sorted = Object.entries(userStats)
    .map(([name, data]) => ({
      name,
      count: data.count,
      verified: data.verified,
      speciesCount: data.species.size
    }))
    .sort((a, b) => b.count - a.count);

  updateLeaderboardStats(sorted.length, trees.length, allSpecies.size);
  renderLeaderboard(sorted);
}

function updateLeaderboardStats(totalUsers, totalTrees, totalSpecies) {
  const totalUsersEl = document.getElementById("totalUsers");
  const totalTreesEl = document.getElementById("totalTrees");
  const totalSpeciesEl = document.getElementById("totalSpecies");

  if (totalUsersEl) totalUsersEl.textContent = totalUsers;
  if (totalTreesEl) totalTreesEl.textContent = totalTrees;
  if (totalSpeciesEl) totalSpeciesEl.textContent = totalSpecies;
}

function renderLeaderboard(sortedUsers) {
  const leaderboard = document.getElementById("leaderboard");
  if (!leaderboard) return;

  if (sortedUsers.length === 0) {
    leaderboard.innerHTML = `
      <div class="leaderboard-empty">
        <p>No tree planting data available yet.</p>
        <p style="margin-top:10px;">
          <a href="add-tree.html">Add your first tree</a> to appear on the leaderboard!
        </p>
      </div>
    `;
    return;
  }

  leaderboard.innerHTML = "";

  sortedUsers.forEach((user, index) => {
    let medal = "";
    if (index === 0) medal = "🥇";
    else if (index === 1) medal = "🥈";
    else if (index === 2) medal = "🥉";

    const entry = document.createElement("div");
    entry.className = "leaderboard-entry";
    entry.innerHTML = `
      <div class="leaderboard-rank">${index + 1}</div>
      <div class="leaderboard-user-info">
        <h3>${escapeHtml(user.name)} ${medal ? `<span class="leaderboard-medal">${medal}</span>` : ""}</h3>
        <p>${user.speciesCount} species • ${user.verified} verified</p>
      </div>
      <div class="leaderboard-score">${user.count} 🌳</div>
    `;
    leaderboard.appendChild(entry);
  });
}

// ===== SUBSCRIPTION PAGE FUNCTIONS =====
function initSubscriptionPage() {
  setupSubscribeButtonTracking();
}

function setupSubscribeButtonTracking() {
  document.querySelectorAll('a.subscribe-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      try {
        const url = new URL(this.href, location.origin);
        const plan = url.searchParams.get('plan') || '';
        const price = url.searchParams.get('price') || '';
        sessionStorage.setItem('greentrace.selectedPlan', JSON.stringify({ plan, price }));
      } catch (err) {
        console.log('Subscribe button tracking error:', err);
      }
    });
  });
}

function getSelectedPlan() {
  try {
    const planData = sessionStorage.getItem('greentrace.selectedPlan');
    if (planData) return JSON.parse(planData);
  } catch (err) { console.log('Error getting selected plan:', err); }
  return null;
}

function clearSelectedPlan() {
  sessionStorage.removeItem('greentrace.selectedPlan');
}

// ===== STORAGE & FOCUS LISTENERS (keep UI in sync across tabs) =====
function attachStorageAndFocusListeners() {
  window.addEventListener('storage', (e) => {
    if (e.key === 'greentrace_trees' || e.key === 'greentrace_trees_mine') {
      if (document.getElementById('dashboard')) {
        updateDashboardStats();
        if (document.getElementById('map')) initDashboardMap();
      }
      if (document.getElementById('leaderboard')) {
        loadLeaderboardData();
      }
      if (document.getElementById('treeGallery')) {
        loadMyTrees();
      }
    }
  });

  window.addEventListener('focus', () => {
    if (document.getElementById('dashboard')) updateDashboardStats();
    if (document.getElementById('leaderboard')) loadLeaderboardData();
    if (document.getElementById('treeGallery')) loadMyTrees();
  });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function () {
  // Initialize dark mode for all pages
  initDarkMode();

  // Update navigation based on login status
  updateNavAuthArea();

  // Attach storage/focus listeners
  attachStorageAndFocusListeners();

  // Page-specific initializations
  if (document.querySelector('.hero')) {
    initLandingPage();
  }

  if (document.getElementById('dashboard')) {
    // Dashboard page
    updateDashboardStats();
    setTimeout(initDashboardMap, 100);
  }

  if (document.getElementById('treeForm')) {
    // My Trees page
    initMyTreesPage();
  }

  if (document.getElementById('leaderboard')) {
    // Leaderboard page
    initLeaderboardPage();
  }

  if (document.querySelector('.subscription-grid')) {
    initSubscriptionPage();
  }

  if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
  }

  if (document.getElementById('signupForm')) {
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
  }
});

// ===== GLOBAL EXPORTS =====
window.logout = logout;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.centerOnMyTrees = centerOnMyTrees;
window.getSelectedPlan = getSelectedPlan;
window.clearSelectedPlan = clearSelectedPlan;

// ===== Guarded fallback map initializer (keeps your original fallback but guarded) =====
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById('map')) return;
  if (_greentrace_map_initialized) return;

  try {
    const fallbackMap = L.map('map').setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.DEFAULT_MAP_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
    }).addTo(fallbackMap);

    L.marker(APP_CONFIG.DEFAULT_MAP_VIEW)
      .addTo(fallbackMap)
      .bindPopup('Welcome to GreenTrace 🌱')
      .openPopup();

    setTimeout(() => {
      try { fallbackMap.invalidateSize(); } catch (e) { /* ignore */ }
    }, 200);

    _greentrace_map_initialized = true;
    // set global map reference only if not set by page-specific init
    if (!map) map = fallbackMap;
    if (!myTreesMap && document.getElementById('treeForm')) myTreesMap = fallbackMap;
  } catch (err) {
    console.warn('Fallback map init failed', err);
  }
});
