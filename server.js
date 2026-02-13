const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database('./scoreboard.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    // Create users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create scores table
    db.run(`CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        player_name TEXT NOT NULL,
        score INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    console.log('Database tables initialized.');
    
    // Debug: Check existing users
    db.all('SELECT id, username, email FROM users', (err, users) => {
        if (err) {
            console.error('Error checking users:', err);
        } else {
            console.log('Existing users in database:', users);
        }
    });
}

// Middleware to verify JWT token
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

// Auth Routes
// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', 
            [username, email, hashedPassword], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Database error' });
                }

                const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET);
                res.status(201).json({ 
                    message: 'User created successfully', 
                    token,
                    user: { id: this.lastID, username, email }
                });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    console.log('Login attempt received:', { 
        username: username, 
        passwordLength: password ? password.length : 0,
        body: req.body 
    });

    if (!username || !password) {
        console.log('Login failed: Missing username or password');
        return res.status(400).json({ error: 'Username and password are required' });
    }

    console.log('Searching for user:', username);
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Database error during login:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        console.log('Database query result:', user ? 'User found' : 'User not found');
        if (!user) {
            console.log('Login failed: User not found for username:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('User found:', { 
        id: user.id, 
        username: user.username, 
        email: user.email,
        passwordHash: user.password ? 'Hash exists' : 'No hash'
    });
    console.log('Comparing passwords...');
    
    try {
        const isMatch = await bcrypt.compare(password, user.password);
        console.log('Password comparison result:', isMatch);
        
        if (!isMatch) {
            console.log('Login failed: Password mismatch');
            // Debug: Let's try to understand what went wrong
            console.log('Debug info:', {
                inputPasswordLength: password.length,
                storedHashLength: user.password ? user.password.length : 0,
                storedHashStart: user.password ? user.password.substring(0, 10) : 'N/A'
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }

            console.log('Login successful for user:', user.username);
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
            res.json({ 
                message: 'Login successful', 
                token,
                user: { id: user.id, username: user.username, email: user.email }
            });
        } catch (bcryptError) {
            console.error('Error during password comparison:', bcryptError);
            return res.status(500).json({ error: 'Server error during authentication' });
        }
    });
});

// Score Routes
// Get user scores
app.get('/api/scores', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    db.all('SELECT * FROM scores WHERE user_id = ? ORDER BY score DESC', [userId], (err, scores) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(scores);
    });
});

// Add score
app.post('/api/scores', authenticateToken, (req, res) => {
    const { player_name, score } = req.body;
    const userId = req.user.id;

    if (!player_name || !score) {
        return res.status(400).json({ error: 'Player name and score are required' });
    }

    db.run('INSERT INTO scores (user_id, player_name, score) VALUES (?, ?, ?)', 
        [userId, player_name, score], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.status(201).json({ 
                message: 'Score added successfully', 
                id: this.lastID 
            });
        }
    );
});

// Update score
app.put('/api/scores/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { player_name, score } = req.body;
    const userId = req.user.id;

    if (!player_name || !score) {
        return res.status(400).json({ error: 'Player name and score are required' });
    }

    db.run('UPDATE scores SET player_name = ?, score = ? WHERE id = ? AND user_id = ?', 
        [player_name, score, id, userId], 
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Score not found or unauthorized' });
            }
            res.json({ message: 'Score updated successfully' });
        }
    );
});

// Delete score
app.delete('/api/scores/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    db.run('DELETE FROM scores WHERE id = ? AND user_id = ?', [id, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Score not found or unauthorized' });
        }
        res.json({ message: 'Score deleted successfully' });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
