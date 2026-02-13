const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'ultimate-scoreboard-jwt-secret-2024';

// In-memory storage
let users = [];
let scores = [];
let userIdCounter = 1;
let scoreIdCounter = 1;

// Initialize with test user
async function init() {
    if (users.length === 0) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        users.push({
            id: userIdCounter++,
            username: 'sangeeta',
            email: 'sangeetaojha36@gmail.com',
            password: hashedPassword,
            created_at: new Date().toISOString()
        });
        console.log('Test user created: sangeeta/password123');
    }
}

init();

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', users: users.length, scores: scores.length });
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            id: userIdCounter++,
            username,
            email,
            password: hashedPassword,
            created_at: new Date().toISOString()
        };

        users.push(newUser);

        const token = jwt.sign({ id: newUser.id.toString(), username }, JWT_SECRET);

        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: newUser.id.toString(), username, email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id.toString(), username: user.username }, JWT_SECRET);

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id.toString(), username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get scores
app.get('/api/scores', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const userScores = scores.filter(s => s.user_id === userId).sort((a, b) => b.score - a.score);
    res.json(userScores);
});

// Add score
app.post('/api/scores', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const { player_name, score } = req.body;

    if (!player_name || !score) {
        return res.status(400).json({ error: 'Player name and score are required' });
    }

    const newScore = {
        id: scoreIdCounter++,
        user_id: userId,
        player_name,
        score: parseInt(score),
        created_at: new Date().toISOString()
    };

    scores.push(newScore);
    res.status(201).json(newScore);
});

// Update score
app.put('/api/scores/:id', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const scoreId = parseInt(req.params.id);
    const { player_name, score } = req.body;

    if (!player_name || !score) {
        return res.status(400).json({ error: 'Player name and score are required' });
    }

    const scoreIndex = scores.findIndex(s => s.id === scoreId && s.user_id === userId);

    if (scoreIndex === -1) {
        return res.status(404).json({ error: 'Score not found or unauthorized' });
    }

    scores[scoreIndex] = {
        ...scores[scoreIndex],
        player_name,
        score: parseInt(score),
        updated_at: new Date().toISOString()
    };

    res.json(scores[scoreIndex]);
});

// Delete score
app.delete('/api/scores/:id', authenticateToken, (req, res) => {
    const userId = req.user.id;
    const scoreId = parseInt(req.params.id);

    const scoreIndex = scores.findIndex(s => s.id === scoreId && s.user_id === userId);

    if (scoreIndex === -1) {
        return res.status(404).json({ error: 'Score not found or unauthorized' });
    }

    scores.splice(scoreIndex, 1);
    res.json({ message: 'Score deleted successfully' });
});

module.exports = app;
