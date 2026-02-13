// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Loaded! Starting initialization...');

    // Initialize GSAP
    gsap.registerPlugin(ScrollTrigger);

    // API Base URL
    const API_BASE = 'http://localhost:3001/api';

    // Authentication State
    let currentUser = null;
    let authToken = null;

    // Check for existing session
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');
    
    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showMainApp();
    }

    // Scoreboard Data - Will be fetched from backend
    let scores = [];

    // Auth Functions
    window.showRegister = function() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
        
        gsap.from('#registerForm', {
            duration: 0.5,
            opacity: 0,
            y: 20,
            ease: 'power2.out'
        });
    }

    window.showLogin = function() {
        document.getElementById('registerForm').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
        
        gsap.from('#loginForm', {
            duration: 0.5,
            opacity: 0,
            y: 20,
            ease: 'power2.out'
        });
    }

    function showMainApp() {
        document.getElementById('authSection').classList.add('hide');
        document.getElementById('mainContainer').classList.add('show');
        document.getElementById('currentUser').textContent = currentUser.username;
        
        // Load user scores
        loadScores();
        
        // Initialize animations
        initializeAnimations();
    }

    function showAuthScreen() {
        document.getElementById('mainContainer').classList.remove('show');
        document.getElementById('authSection').classList.remove('hide');
    }

    function logout() {
        console.log('Logging out user:', currentUser);
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        authToken = null;
        currentUser = null;
        scores = [];
        showAuthScreen();
    }

    // API Functions
    async function apiRequest(endpoint, options = {}) {
        const url = `${API_BASE}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (authToken) {
            config.headers.Authorization = `Bearer ${authToken}`;
        }

        console.log('API Request:', { 
            url: url, 
            method: config.method || 'GET',
            hasAuth: !!authToken,
            body: config.body ? JSON.parse(config.body) : null
        });

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            console.log('API Response:', {
                status: response.status,
                ok: response.ok,
                data: data
            });
            
            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async function login(username, password) {
        try {
            console.log('Attempting login with:', { username, password: '***' });
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            console.log('Login successful:', data);
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showMainApp();
            
            return data;
        } catch (error) {
            console.error('Login error:', error);
            alert(error.message || 'Login failed');
        }
    }

    async function register(username, email, password) {
        try {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ username, email, password })
            });
            
            authToken = data.token;
            currentUser = data.user;
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            showMainApp();
            
            return data;
        } catch (error) {
            alert(error.message || 'Registration failed');
        }
    }

    async function loadScores() {
        try {
            const data = await apiRequest('/scores');
            scores = data.map(score => ({
                id: score.id,
                name: score.player_name,
                score: score.score,
                timestamp: new Date(score.created_at)
            }));
            renderScoreboard();
        } catch (error) {
            console.error('Failed to load scores:', error);
            scores = [];
            renderScoreboard();
        }
    }

    async function addScore(playerName, playerScore) {
        try {
            await apiRequest('/scores', {
                method: 'POST',
                body: JSON.stringify({ player_name: playerName, score: playerScore })
            });
            
            await loadScores();
        } catch (error) {
            alert(error.message || 'Failed to add score');
        }
    }

    async function updateScoreRequest(scoreId, playerName, playerScore) {
        try {
            await apiRequest(`/scores/${scoreId}`, {
                method: 'PUT',
                body: JSON.stringify({ player_name: playerName, score: playerScore })
            });
            
            await loadScores();
        } catch (error) {
            alert(error.message || 'Failed to update score');
        }
    }

    async function deleteScoreRequest(scoreId) {
        try {
            await apiRequest(`/scores/${scoreId}`, {
                method: 'DELETE'
            });
            
            await loadScores();
        } catch (error) {
            alert(error.message || 'Failed to delete score');
        }
    }

    // Initialize animations (moved from main init)
    function initializeAnimations() {
        // Custom Cursor
        const cursor = document.querySelector('.cursor');
        const cursorFollower = document.querySelector('.cursor-follower');

        if (cursor && cursorFollower) {
            document.addEventListener('mousemove', (e) => {
                gsap.to(cursor, {
                    duration: 0.1,
                    x: e.clientX,
                    y: e.clientY
                });

                gsap.to(cursorFollower, {
                    duration: 0.3,
                    x: e.clientX,
                    y: e.clientY
                });
            });
        }

        // Create Particles
        const particlesContainer = document.getElementById('particles');
        if (particlesContainer) {
            for (let i = 0; i < 50; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                particle.style.left = Math.random() * 100 + '%';
                particle.style.top = Math.random() * 100 + '%';
                particle.style.animationDelay = Math.random() * 15 + 's';
                particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
                particlesContainer.appendChild(particle);
            }
        }

        // Hero Section Animations
        gsap.from('.title-word', {
            duration: 1.2,
            y: 100,
            opacity: 0,
            rotationX: -90,
            stagger: 0.2,
            ease: 'power4.out'
        });

        gsap.from('.subtitle', {
            duration: 1,
            y: 50,
            opacity: 0,
            delay: 0.8,
            ease: 'power3.out'
        });

        gsap.from('.trophy-icon', {
            duration: 1.5,
            scale: 0,
            rotation: 360,
            opacity: 0,
            delay: 1.2,
            ease: 'elastic.out(1, 0.5)'
        });

        // Form Animation
        gsap.from('.form-container', {
            scrollTrigger: {
                trigger: '.add-score-section',
                start: 'top 80%',
                toggleActions: 'play none none reverse'
            },
            duration: 1,
            y: 100,
            opacity: 0,
            rotationX: -20,
            ease: 'power3.out'
        });

        // Stats Section Animation
        gsap.from('.stat-card', {
            scrollTrigger: {
                trigger: '.stats-section',
                start: 'top 80%',
                toggleActions: 'play none none reverse'
            },
            duration: 1,
            y: 100,
            opacity: 0,
            stagger: 0.2,
            ease: 'power3.out'
        });

        // Parallax Effect on Scroll
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const particles = document.querySelectorAll('.particle');

            particles.forEach((particle, index) => {
                const speed = (index % 3 + 1) * 0.5;
                particle.style.transform = `translateY(${scrolled * speed}px)`;
            });
        });
    }

    // Format Date Function
    function formatDate(date) {
        const options = { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleDateString('en-US', options);
    }

    // Delete Score Function
    window.deleteScore = function(index) {
        console.log('Deleting score at index:', index);
        const score = scores[index];
        
        if (score && score.id) {
            const scoreCards = document.querySelectorAll('.score-card');
            const scoreCard = scoreCards[index];

            if (scoreCard) {
                gsap.to(scoreCard, {
                    duration: 0.5,
                    x: 200,
                    opacity: 0,
                    rotationY: 90,
                    ease: 'power3.in',
                    onComplete: () => {
                        deleteScoreRequest(score.id);
                    }
                });
            }
        }
    }

    // Update Score Function
    window.updateScore = function(index) {
        console.log('Updating score at index:', index);
        const score = scores[index];
        
        if (score) {
            // Populate modal with current data
            document.getElementById('updatePlayerName').value = score.name;
            document.getElementById('updatePlayerScore').value = score.score;
            
            // Store the index being updated
            window.currentUpdateIndex = index;
            
            // Show modal
            const modal = document.getElementById('updateModal');
            modal.style.display = 'flex';
            
            // Animate modal appearance
            gsap.fromTo(modal, 
                { opacity: 0 },
                { opacity: 1, duration: 0.3 }
            );
            
            gsap.fromTo('.modal-content', 
                { scale: 0.8, opacity: 0 },
                { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' }
            );
        }
    }

    // Close Modal Function
    window.closeUpdateModal = function() {
        const modal = document.getElementById('updateModal');
        
        gsap.to(modal, {
            opacity: 0,
            duration: 0.2,
            onComplete: () => {
                modal.style.display = 'none';
            }
        });
        
        window.currentUpdateIndex = null;
    }

    // Confirm Update Function
    window.confirmUpdate = function() {
        const name = document.getElementById('updatePlayerName').value.trim();
        const score = parseInt(document.getElementById('updatePlayerScore').value);
        
        if (name && !isNaN(score) && score > 0 && window.currentUpdateIndex !== null) {
            const currentScore = scores[window.currentUpdateIndex];
            
            if (currentScore && currentScore.id) {
                // Success animation
                const confirmBtn = document.getElementById('confirmUpdateBtn');
                gsap.to(confirmBtn, {
                    scale: 1.2,
                    duration: 0.2,
                    yoyo: true,
                    repeat: 1
                });
                
                // Close modal and update via API
                closeUpdateModal();
                updateScoreRequest(currentScore.id, name, score);
            }
        } else {
            // Error shake animation
            gsap.to('.modal-content', {
                x: -10,
                duration: 0.1,
                yoyo: true,
                repeat: 5
            });
            
            alert('Please enter a valid name and score greater than 0!');
        }
    }

    // Update Stats Function
    function updateStats() {
        const totalPlayers = scores.length;
        const highestScore = scores.length > 0 ? Math.max(...scores.map(s => s.score)) : 0;
        const averageScore = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length) : 0;

        console.log('Updating stats:', { totalPlayers, highestScore, averageScore });

        animateNumber('totalPlayers', totalPlayers);
        animateNumber('highestScore', highestScore);
        animateNumber('averageScore', averageScore);
    }

    // Animate Numbers Function
    function animateNumber(id, target) {
        const element = document.getElementById(id);
        if (!element) return;

        const current = parseInt(element.textContent) || 0;

        gsap.to({ value: current }, {
            value: target,
            duration: 1,
            ease: 'power2.out',
            onUpdate: function() {
                element.textContent = Math.round(this.targets()[0].value).toLocaleString();
            }
        });
    }

    // Render Scoreboard Function
    function renderScoreboard() {
        console.log('Rendering scoreboard with scores:', scores);

        const scoreboard = document.getElementById('scoreboard');
        if (!scoreboard) {
            console.error('Scoreboard element not found!');
            return;
        }

        scoreboard.innerHTML = '';

        // Sort scores (highest first)
        scores.sort((a, b) => b.score - a.score);

        if (scores.length === 0) {
            scoreboard.innerHTML = '<p style="text-align: center; color: #a0a0a0; font-size: 1.2rem; padding: 40px;">No scores yet. Add your first score above!</p>';
            updateStats();
            return;
        }

        scores.forEach((score, index) => {
            const scoreCard = document.createElement('div');
            scoreCard.className = 'score-card';
            scoreCard.style.opacity = '1'; // Force visibility

            const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';

            scoreCard.innerHTML = `
                <div class="rank ${rankClass}">#${index + 1} ${medal}</div>
                <div class="player-info">
                    <div class="player-name">${score.name}</div>
                    <div class="player-timestamp">${formatDate(score.timestamp)}</div>
                </div>
                <div class="player-score">${score.score.toLocaleString()}</div>
                <div class="card-buttons">
                    <button class="update-btn" onclick="updateScore(${index})">Update</button>
                    <button class="delete-btn" onclick="deleteScore(${index})">Delete</button>
                </div>
            `;

            scoreboard.appendChild(scoreCard);

            // GSAP Animation for each card
            gsap.from(scoreCard, {
                duration: 0.8,
                x: -100,
                opacity: 0,
                rotationY: -45,
                delay: index * 0.1,
                ease: 'power3.out'
            });

            // 3D Tilt Effect
            scoreCard.addEventListener('mousemove', (e) => {
                const rect = scoreCard.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 25;
                const rotateY = (centerX - x) / 25;

                gsap.to(scoreCard, {
                    duration: 0.3,
                    rotationX: rotateX,
                    rotationY: rotateY,
                    transformPerspective: 1000,
                    ease: 'power2.out'
                });
            });

            scoreCard.addEventListener('mouseleave', () => {
                gsap.to(scoreCard, {
                    duration: 0.5,
                    rotationX: 0,
                    rotationY: 0,
                    ease: 'power2.out'
                });
            });
        });

        // Update cursor hover effects for new cards
        setTimeout(() => {
            document.querySelectorAll('.score-card').forEach(el => {
                el.addEventListener('mouseenter', () => {
                    if (cursor && cursorFollower) {
                        gsap.to(cursor, { scale: 2, duration: 0.3 });
                        gsap.to(cursorFollower, { scale: 1.5, duration: 0.3 });
                    }
                });

                el.addEventListener('mouseleave', () => {
                    if (cursor && cursorFollower) {
                        gsap.to(cursor, { scale: 1, duration: 0.3 });
                        gsap.to(cursorFollower, { scale: 1, duration: 0.3 });
                    }
                });
            });
        }, 100);

        updateStats();
        console.log('Scoreboard rendered successfully!');
    }

    // Modal Event Listeners
    const cancelUpdateBtn = document.getElementById('cancelUpdateBtn');
    const confirmUpdateBtn = document.getElementById('confirmUpdateBtn');
    const modalOverlay = document.getElementById('updateModal');

    if (cancelUpdateBtn) {
        cancelUpdateBtn.addEventListener('click', closeUpdateModal);
    }

    if (confirmUpdateBtn) {
        confirmUpdateBtn.addEventListener('click', confirmUpdate);
    }

    // Close modal when clicking overlay
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                closeUpdateModal();
            }
        });
    }

    // Enter key support for modal inputs
    const updatePlayerName = document.getElementById('updatePlayerName');
    const updatePlayerScore = document.getElementById('updatePlayerScore');

    if (updatePlayerName) {
        updatePlayerName.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmUpdate();
            }
        });
    }

    if (updatePlayerScore) {
        updatePlayerScore.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmUpdate();
            }
        });
    }

    // Cursor hover effects for buttons and inputs
    document.querySelectorAll('button, input').forEach(el => {
        el.addEventListener('mouseenter', () => {
            if (cursor && cursorFollower) {
                gsap.to(cursor, { scale: 2, duration: 0.3 });
                gsap.to(cursorFollower, { scale: 1.5, duration: 0.3 });
            }
        });

        el.addEventListener('mouseleave', () => {
            if (cursor && cursorFollower) {
                gsap.to(cursor, { scale: 1, duration: 0.3 });
                gsap.to(cursorFollower, { scale: 1, duration: 0.3 });
            }
        });
    });

    // Add New Score Event Listener
    const addScoreBtn = document.getElementById('addScoreBtn');
    const playerNameInput = document.getElementById('playerName');
    const playerScoreInput = document.getElementById('playerScore');

    if (addScoreBtn && playerNameInput && playerScoreInput) {
        console.log('Add score button found and event listener attached!');

        addScoreBtn.addEventListener('click', function(e) {
            e.preventDefault();
            console.log('Add Score button clicked!');

            const name = playerNameInput.value.trim();
            const score = parseInt(playerScoreInput.value);

            console.log('Name:', name, 'Score:', score);

            if (name && !isNaN(score) && score > 0) {
                // Success Animation
                gsap.to(addScoreBtn, {
                    scale: 1.2,
                    duration: 0.2,
                    yoyo: true,
                    repeat: 1
                });

                addScore(name, score);
                playerNameInput.value = '';
                playerScoreInput.value = '';

                // Scroll to scoreboard
                document.querySelector('.scoreboard-section').scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest' 
                });
            } else {
                console.log('Invalid input!');
                // Error shake animation
                gsap.to('.form-container', {
                    x: -10,
                    duration: 0.1,
                    yoyo: true,
                    repeat: 5
                });

                alert('Please enter a valid name and score greater than 0!');
            }
        });

        // Enter key support
        playerNameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addScoreBtn.click();
            }
        });

        playerScoreInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addScoreBtn.click();
            }
        });
    } else {
        console.error('Could not find add score button or input fields!');
    }

    // Auth Event Listeners
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            console.log('Login button clicked:', { 
                username: username, 
                passwordLength: password ? password.length : 0,
                hasPassword: !!password 
            });
            
            if (username && password) {
                login(username, password);
            } else {
                alert('Please enter username and password');
            }
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', function() {
            const username = document.getElementById('registerUsername').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;
            
            if (username && email && password) {
                register(username, email, password);
            } else {
                alert('Please fill all fields');
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Enter key support for auth forms
    document.getElementById('loginPassword')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginBtn?.click();
        }
    });

    document.getElementById('registerPassword')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            registerBtn?.click();
        }
    });

    // Initialize auth animations if on auth screen
    if (!currentUser) {
        gsap.from('.auth-container', {
            duration: 1,
            y: 50,
            opacity: 0,
            ease: 'power3.out'
        });

        // Animate floating icons
        gsap.from('.floating-icon', {
            duration: 1.5,
            scale: 0,
            opacity: 0,
            stagger: 0.2,
            ease: 'elastic.out(1, 0.5)'
        });
    }

    // Password Toggle Functionality
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            const eyeIcon = this.querySelector('.eye-icon');
            const eyeSlashIcon = this.querySelector('.eye-slash-icon');
            
            if (input.type === 'password') {
                input.type = 'text';
                eyeIcon.style.display = 'none';
                eyeSlashIcon.style.display = 'block';
            } else {
                input.type = 'password';
                eyeIcon.style.display = 'block';
                eyeSlashIcon.style.display = 'none';
            }
            
            // Add a small animation
            gsap.to(this, {
                scale: 1.2,
                duration: 0.1,
                yoyo: true,
                repeat: 1
            });
        });
    });

    // Cursor hover effects for buttons and inputs
    document.querySelectorAll('button, input').forEach(el => {
        el.addEventListener('mouseenter', () => {
            if (cursor && cursorFollower) {
                gsap.to(cursor, { scale: 2, duration: 0.3 });
                gsap.to(cursorFollower, { scale: 1.5, duration: 0.3 });
            }
        });

        el.addEventListener('mouseleave', () => {
            if (cursor && cursorFollower) {
                gsap.to(cursor, { scale: 1, duration: 0.3 });
                gsap.to(cursorFollower, { scale: 1, duration: 0.3 });
            }
        });
    });

    console.log('Initialization complete!');
});