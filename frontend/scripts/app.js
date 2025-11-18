// app.js - Unified JavaScript for GreenTrace

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

// ===== UTILITY FUNCTIONS =====
function getAuthToken() {
    return localStorage.getItem('token');
}

function setUserInfo(user, token) {
    localStorage.setItem('token', token);
    localStorage.setItem('userName', user.name || '');
    localStorage.setItem('greentrace_user', JSON.stringify(user));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== API FUNCTIONS =====
async function apiFetch(path, options = {}) {
    const headers = options.headers || {};
    const token = getAuthToken();
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (!headers['Content-Type'] && (options.method === 'POST' || options.method === 'PUT')) {
        headers['Content-Type'] = 'application/json';
    }
    
    try {
        const response = await fetch(API_BASE + path, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        if (!text) return null;
        
        return JSON.parse(text);
    } catch (error) {
        console.error('API fetch error:', error);
        throw error;
    }
}

// ===== UI FUNCTIONS =====
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        alert(message);
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
        updateNavAuthArea();
        showToast('Logged out successfully', 'success');
        window.location.href = 'index.html';
    }
}

// ===== DASHBOARD FUNCTIONS =====
function updateDashboardStats() {
    const storedTrees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    
    const totalTrees = storedTrees.length;
    const verifiedTrees = storedTrees.filter(tree => tree.verified).length;
    const uniqueSpecies = new Set(storedTrees.map(tree => tree.species || tree.treeName || "Unknown").filter(name => name !== "Unknown")).size;
    const co2Offset = (verifiedTrees * APP_CONFIG.CO2_PER_TREE).toFixed(1);

    // Update stats
    document.getElementById("totalTrees").textContent = totalTrees;
    document.getElementById("verifiedTrees").textContent = verifiedTrees;
    document.getElementById("speciesCount").textContent = uniqueSpecies;
    document.getElementById("co2Offset").textContent = `${co2Offset} kg`;
    
    // Update welcome message
    const currentUser = JSON.parse(localStorage.getItem("greentrace_user")) || {};
    if (currentUser.name) {
        document.getElementById("welcomeMessage").textContent = `Welcome back, ${currentUser.name}!`;
    }
}

function initDashboardMap() {
    const storedTrees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    const verifiedTrees = storedTrees.filter(tree => tree.verified).length;
    
    // Create map
    const map = L.map('map').setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.DEFAULT_MAP_ZOOM);
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // Add markers
    if (storedTrees.length > 0) {
        const markers = [];
        
        storedTrees.forEach(tree => {
            const lat = parseFloat(tree.lat);
            const lng = parseFloat(tree.lon);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const iconColor = tree.verified ? 'green' : 'orange';
                const customIcon = L.divIcon({
                    html: `<div style="background-color: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
                    className: 'custom-marker',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });
                
                const marker = L.marker([lat, lng], {icon: customIcon}).addTo(map);
                
                const statusBadge = tree.verified 
                    ? '<span style="color: green; font-weight: bold;">✓ Verified</span>' 
                    : '<span style="color: orange; font-weight: bold;">⏳ Pending Verification</span>';
                
                marker.bindPopup(`
                    <div style="min-width: 200px;">
                        <h4 style="margin: 0 0 8px 0; color: var(--primary);">${tree.treeName || 'Unnamed Tree'}</h4>
                        <p style="margin: 4px 0;"><strong>Species:</strong> ${tree.species || tree.treeName || 'Unknown'}</p>
                        <p style="margin: 4px 0;"><strong>Planted by:</strong> ${tree.planterName || 'Unknown'}</p>
                        <p style="margin: 4px 0;"><strong>Location:</strong> ${tree.location || 'Unknown'}</p>
                        <p style="margin: 4px 0;"><strong>Status:</strong> ${statusBadge}</p>
                        ${tree.plantedDate ? `<p style="margin: 4px 0;"><strong>Planted:</strong> ${new Date(tree.plantedDate).toLocaleDateString()}</p>` : ''}
                    </div>
                `);
                markers.push(marker);
            }
        });
        
        document.getElementById("mapInfo").textContent = 
            `Showing ${storedTrees.length} trees (${verifiedTrees} verified) on the map.`;
        
        if (markers.length > 0) {
            const group = new L.featureGroup(markers);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    } else {
        document.getElementById("mapInfo").textContent = 
            "No trees yet — add your first tree to get started!";
            
        L.marker(APP_CONFIG.DEFAULT_MAP_VIEW)
            .addTo(map)
            .bindPopup('<div style="text-align: center;"><strong>No trees yet</strong><br>Add your first tree to see it here!</div>')
            .openPopup();
    }
    
    setTimeout(() => {
        map.invalidateSize();
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
    myTreesMap = L.map("map").setView(APP_CONFIG.DEFAULT_MAP_VIEW, APP_CONFIG.MY_TREES_MAP_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(myTreesMap);
    setTimeout(() => myTreesMap.invalidateSize(), 500);

    // Load Kenya locations
    loadKenyaLocations();
    
    // Autofill planter name with user's signup name
    autofillPlanterName();
    
    // Load AI model
    loadAIModel();
    
    // Load existing trees
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
        locationSelect.innerHTML = kenyaLocations.map(l => `<option value="${l.name}">${l.name}</option>`).join("");
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

function loadMyTrees() {
    const gallery = document.getElementById("treeGallery");
    if (!gallery) return;
    
    const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    
    // Clear gallery
    gallery.innerHTML = "";
    
    // Render trees
    trees.forEach(renderTree);
    
    // Update map
    updateMyTreesMap();
}

function renderTree(tree) {
    const gallery = document.getElementById("treeGallery");
    if (!gallery) return;
    
    const currentUser = localStorage.getItem('userName') || 'Unknown';
    const isOwner = tree.uploadedBy === currentUser;
    const deleteButtonHtml = isOwner 
        ? `<button class="tree-delete-btn" data-id="${tree.id}"><i class="fas fa-trash"></i> Delete</button>`
        : `<button class="tree-delete-btn" disabled title="Only the uploader can delete this tree"><i class="fas fa-trash"></i> Delete</button>`;
    
    const card = document.createElement("div");
    card.className = "tree-card";
    card.innerHTML = `
        <img src="${tree.image}" alt="${tree.treeName}">
        <h3>${escapeHtml(tree.treeName)}</h3>
        <p><b>Planter:</b> ${escapeHtml(tree.planterName)}</p>
        <p>${escapeHtml(tree.location)}</p>
        <p class="${tree.verified ? "tree-verified" : "tree-not-verified"}">${tree.verified ? "✅ AI Verified" : "❌ Unverified"}</p>
        <div class="tree-confidence">${(tree.confidence * 100).toFixed(1)}% confidence</div>
        ${deleteButtonHtml}
    `;
    gallery.appendChild(card);
    
    // Add delete event listener only if owner
    if (isOwner) {
        card.querySelector(".tree-delete-btn").addEventListener("click", () => deleteTree(tree.id));
    }
}

function updateMyTreesMap() {
    if (!myTreesMap) return;
    
    // Clear existing markers
    myTreesMarkersLayer.forEach(marker => myTreesMap.removeLayer(marker));
    myTreesMarkersLayer = [];
    
    const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    const verifiedTrees = trees.filter(tree => tree.verified);
    
    // Add markers for verified trees
    verifiedTrees.forEach(tree => {
        const lat = parseFloat(tree.lat);
        const lng = parseFloat(tree.lon);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            const marker = L.marker([lat, lng])
                .addTo(myTreesMap)
                .bindPopup(`<b>${escapeHtml(tree.treeName)}</b><br>${escapeHtml(tree.planterName)}<br>${escapeHtml(tree.location)}`);
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
    verificationProgress.classList.remove("hidden");

    try {
        updateProgress(30, "Reading image...", progressFill, verificationStatus);
        const imageBase64 = await toBase64(imageFile);
        updateProgress(60, "Analyzing...", progressFill, verificationStatus);

        const result = aiModel ? await verifyWithTensorFlow(imageBase64) : await basicImageAnalysis(imageBase64);

        if (result.verified) {
            const locationData = kenyaLocations.find(l => l.name === location);
            const lat = locationData?.lat || -1.29 + Math.random() * 0.2;
            const lon = locationData?.lng || 36.82 + Math.random() * 0.2;

            const newTree = {
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
                plantedAt: new Date(),
                uploadedBy: localStorage.getItem('userName') || 'Unknown'
            };
            
            // Save to localStorage
            const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
            trees.push(newTree);
            localStorage.setItem("greentrace_trees", JSON.stringify(trees));
            
            // Update UI
            renderTree(newTree);
            updateMyTreesMap();
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
        verificationProgress.classList.add("hidden");
        progressFill.style.width = "0%";
    }
}

function deleteTree(id) {
    const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    const tree = trees.find(t => t.id === id);
    const currentUser = localStorage.getItem('userName') || 'Unknown';
    
    // Check if current user is the uploader
    if (tree && tree.uploadedBy !== currentUser) {
        showToast("❌ You can only delete trees you uploaded", "error");
        return;
    }
    
    if (!confirm("Are you sure you want to delete this tree?")) return;
    
    const updatedTrees = trees.filter(t => t.id !== id);
    localStorage.setItem("greentrace_trees", JSON.stringify(updatedTrees));
    
    // Update UI
    document.getElementById("treeGallery").innerHTML = "";
    updatedTrees.forEach(renderTree);
    updateMyTreesMap();
    showToast("🌳 Tree deleted successfully", "success");
}

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
        message: verified ?
            `Tree detected (${(confidence * 100).toFixed(1)}%)` :
            `No tree detected (${(confidence * 100).toFixed(1)}%)`
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
                message: verified ?
                    `Tree-like features detected (${(confidence * 100).toFixed(1)}%)` :
                    `Low confidence (${(confidence * 100).toFixed(1)}%)`
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
    
    const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];
    const verifiedTrees = trees.filter(tree => tree.verified);
    
    if (verifiedTrees.length > 0) {
        const group = L.featureGroup(
            verifiedTrees.map(tree => L.marker([tree.lat, tree.lon]))
        );
        myTreesMap.fitBounds(group.getBounds());
    } else {
        showToast("No trees to center", "warning");
    }
}

// ===== LEADERBOARD PAGE FUNCTIONS =====
function initLeaderboardPage() {
    // Load and display leaderboard data
    loadLeaderboardData();
}

function loadLeaderboardData() {
    // Try to fetch leaderboard from API first
    apiFetch('/leaderboard')
        .then(data => {
            if (data && data.leaderboard) {
                // Use API data
                const sorted = data.leaderboard.map(user => ({
                    name: user.name,
                    count: user.trees_planted,
                    verified: user.trees_planted,
                    speciesCount: 0
                }));
                
                updateLeaderboardStats(sorted.length, sorted.reduce((sum, u) => sum + u.count, 0), 0);
                renderLeaderboard(sorted);
            } else {
                // Fallback to localStorage if API returns no data
                loadLeaderboardDataLocal();
            }
        })
        .catch(() => {
            // Fallback to localStorage on API error
            loadLeaderboardDataLocal();
        });
}

function loadLeaderboardDataLocal() {
    // Get trees data from localStorage
    const trees = JSON.parse(localStorage.getItem("greentrace_trees")) || [];

    // Group trees by planter
    const userStats = {};
    const allSpecies = new Set();
    
    trees.forEach(tree => {
        const name = tree.planterName || "Anonymous Planter";
        if (!userStats[name]) {
            userStats[name] = { 
                count: 0, 
                species: new Set(),
                verified: 0
            };
        }
        userStats[name].count++;
        if (tree.verified) userStats[name].verified++;
        if (tree.treeName) {
            userStats[name].species.add(tree.treeName);
            allSpecies.add(tree.treeName);
        }
    });

    // Convert to array & sort by count
    const sorted = Object.entries(userStats)
        .map(([name, data]) => ({
            name,
            count: data.count,
            verified: data.verified,
            speciesCount: data.species.size
        }))
        .sort((a, b) => b.count - a.count);

    // Update stats summary
    updateLeaderboardStats(sorted.length, trees.length, allSpecies.size);

    // Render leaderboard
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

    // If no data
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

    // Clear existing content
    leaderboard.innerHTML = "";
    
    // Render leaderboard entries
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
    // Set up subscribe button tracking
    setupSubscribeButtonTracking();
}

function setupSubscribeButtonTracking() {
    // Subscribe button tracking
    document.querySelectorAll('a.subscribe-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            try {
                const url = new URL(this.href, location.origin);
                const plan = url.searchParams.get('plan') || '';
                const price = url.searchParams.get('price') || '';
                sessionStorage.setItem('greentrace.selectedPlan', JSON.stringify({plan, price}));
            } catch (err) {
                console.log('Subscribe button tracking error:', err);
            }
        });
    });
}

// Function to get selected plan (can be used in signup page)
function getSelectedPlan() {
    try {
        const planData = sessionStorage.getItem('greentrace.selectedPlan');
        if (planData) {
            return JSON.parse(planData);
        }
    } catch (err) {
        console.log('Error getting selected plan:', err);
    }
    return null;
}

// Function to clear selected plan (after signup)
function clearSelectedPlan() {
    sessionStorage.removeItem('greentrace.selectedPlan');
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    // Initialize dark mode for all pages
    initDarkMode();
    
    // Update navigation based on login status
    updateNavAuthArea();
    
    // Page-specific initializations
    if (document.querySelector('.hero')) {
        // Landing page
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
        // Subscription page
        initSubscriptionPage();
    }
    
    if (document.getElementById('loginForm')) {
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
    }
    
    if (document.getElementById('signupForm')) {
        document.getElementById('signupForm').addEventListener('submit', handleSignup);
    }
    
    // Add more page-specific initializations as needed
});

// ===== GLOBAL EXPORTS =====
window.logout = logout;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.centerOnMyTrees = centerOnMyTrees;
window.getSelectedPlan = getSelectedPlan;
window.clearSelectedPlan = clearSelectedPlan;

document.addEventListener("DOMContentLoaded", () => {
  // Initialize map
  const map = L.map('map').setView([-1.286389, 36.817223], 10); // Nairobi coords

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Example marker
  L.marker([-1.286389, 36.817223])
    .addTo(map)
    .bindPopup('Welcome to GreenTrace 🌱')
    .openPopup();

  // Optional: Refresh map after small delay to avoid rendering glitch
  setTimeout(() => {
    map.invalidateSize();
  }, 200);
});
