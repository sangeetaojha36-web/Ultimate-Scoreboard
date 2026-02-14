const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const IS_VERCEL = process.env.VERCEL || process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Interface
let dbOperations;

if (IS_VERCEL) {
    console.log('Running in Vercel/Production mode - Using In-Memory Database');

    // In-memory storage
    const users = [];
    const scores = [];
    let userIdCounter = 1;
    let scoreIdCounter = 1;

    // Initialize test user for demo purposes
    (async () => {
        const hashedPassword = await bcrypt.hash('password123', 10);
        users.push({
            id: userIdCounter++,
            username: 'demo',
            email: 'demo@example.com',
            password: hashedPassword,
            created_at: new Date().toISOString()
        });
        console.log('Demo user initialized (demo/password123)');
    })();

    dbOperations = {
        getUserByUsername: (username) => {
            return new Promise((resolve, reject) => {
                const user = users.find(u => u.username === username);
                resolve(user);
            });
        },
        createUser: async (username, email, password) => {
            if (users.find(u => u.username === username || u.email === email)) {
                throw new Error('Username or email already exists');
            }
            const id = userIdCounter++;
            const newUser = { id, username, email, password, created_at: new Date().toISOString() };
            users.push(newUser);
            return { id, lastID: id }; // harmonize return structure
        },
        getScores: (userId) => {
            return new Promise((resolve) => {
                const userScores = scores
                    .filter(s => s.user_id === userId)
                    .sort((a, b) => b.score - a.score);
                resolve(userScores);
            });
        },
        addScore: (userId, playerName, score) => {
            return new Promise((resolve) => {
                const id = scoreIdCounter++;
                scores.push({
                    id,
                    user_id: userId,
                    player_name: playerName,
                    score,
                    created_at: new Date().toISOString()
                });
                resolve({ lastID: id });
            });
        },
        updateScore: (id, userId, playerName, score) => {
            return new Promise((resolve) => {
                const index = scores.findIndex(s => s.id == id && s.user_id == userId);
                if (index === -1) resolve({ changes: 0 });
                else {
                    scores[index].player_name = playerName;
                    scores[index].score = score;
                    resolve({ changes: 1 });
                }
            });
        },
        deleteScore: (id, userId) => {
            return new Promise((resolve) => {
                const index = scores.findIndex(s => s.id == id && s.user_id == userId);
                if (index === -1) resolve({ changes: 0 });
                else {
                    scores.splice(index, 1);
                    resolve({ changes: 1 });
                }
            });
        }
    };

} else {
    console.log('Running in Local mode - Using SQLite Database');
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database('./scoreboard.db', (err) => {
        if (err) console.error('Error opening database:', err.message);
        else {
            console.log('Connected to SQLite database.');

            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                player_name TEXT NOT NULL,
                score INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )`);
        }
    });

    dbOperations = {
        getUserByUsername: (username) => {
            return new Promise((resolve, reject) => {
                db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        },
        createUser: (username, email, password) => {
            return new Promise((resolve, reject) => {
                db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                    [username, email, password],
                    function (err) {
                        if (err) {
                            if (err.message.includes('UNIQUE constraint failed')) reject(new Error('Username or email already exists'));
                            else reject(err);
                        } else {
                            resolve({ lastID: this.lastID });
                        }
                    }
                );
            });
        },
        getScores: (userId) => {
            return new Promise((resolve, reject) => {
                db.all('SELECT * FROM scores WHERE user_id = ? ORDER BY score DESC', [userId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        },
        addScore: (userId, playerName, score) => {
            return new Promise((resolve, reject) => {
                db.run('INSERT INTO scores (user_id, player_name, score) VALUES (?, ?, ?)',
                    [userId, playerName, score],
                    function (err) {
                        if (err) reject(err);
                        else resolve({ lastID: this.lastID });
                    }
                );
            });
        },
        updateScore: (id, userId, playerName, score) => {
            return new Promise((resolve, reject) => {
                db.run('UPDATE scores SET player_name = ?, score = ? WHERE id = ? AND user_id = ?',
                    [playerName, score, id, userId],
                    function (err) {
                        if (err) reject(err);
                        else resolve({ changes: this.changes });
                    }
                );
            });
        },
        deleteScore: (id, userId) => {
            return new Promise((resolve, reject) => {
                db.run('DELETE FROM scores WHERE id = ? AND user_id = ?', [id, userId], function (err) {
                    if (err) reject(err);
                    else resolve({ changes: this.changes });
                });
            });
        }
    };
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await dbOperations.createUser(username, email, hashedPassword);

        const token = jwt.sign({ id: result.lastID, username }, JWT_SECRET);
        res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: result.lastID, username, email }
        });
    } catch (error) {
        if (error.message === 'Username or email already exists') {
            return res.status(400).json({ error: error.message });
        }
        console.error('Register error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    try {
        const user = await dbOperations.getUserByUsername(username);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Score Routes
app.get('/api/scores', authenticateToken, async (req, res) => {
    try {
        const scores = await dbOperations.getScores(req.user.id);
        res.json(scores);
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/scores', authenticateToken, async (req, res) => {
    const { player_name, score } = req.body;
    if (!player_name || !score) return res.status(400).json({ error: 'Player name and score are required' });

    try {
        const result = await dbOperations.addScore(req.user.id, player_name, score);
        res.status(201).json({ message: 'Score added successfully', id: result.lastID });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/scores/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { player_name, score } = req.body;
    if (!player_name || !score) return res.status(400).json({ error: 'Player name and score are required' });

    try {
        const result = await dbOperations.updateScore(id, req.user.id, player_name, score);
        if (result.changes === 0) return res.status(404).json({ error: 'Score not found or unauthorized' });
        res.json({ message: 'Score updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/scores/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await dbOperations.deleteScore(id, req.user.id);
        if (result.changes === 0) return res.status(404).json({ error: 'Score not found or unauthorized' });
        res.json({ message: 'Score deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error' });
    }
});

// Catch-all route for static files support in SPAs (if we add client-side routing later)
// For now, it ensures that / returns index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Mode: ${IS_VERCEL ? 'Vercel/Production' : 'Local/Development'}`);
    });
}

// Export for Vercel
module.exports = app;
