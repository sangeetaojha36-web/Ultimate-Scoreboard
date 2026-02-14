const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
let db;
const mongoUri = process.env.MONGODB_URI;

if (mongoUri) {
    const client = new MongoClient(mongoUri);
    client.connect()
        .then(() => {
            db = client.db();
            console.log('Connected to MongoDB');
            // Create indexes
            db.collection('users').createIndex({ username: 1 }, { unique: true });
            db.collection('users').createIndex({ email: 1 }, { unique: true });
        })
        .catch(err => console.error('MongoDB connection error:', err));
} else {
    console.warn('MONGODB_URI not found. Data will not be saved permanently.');
}

// Database Operations
const dbOperations = {
    getUserByUsername: async (username) => {
        if (!db) return null;
        return await db.collection('users').findOne({ username });
    },
    createUser: async (username, email, password) => {
        if (!db) throw new Error('Database not connected');
        const existing = await db.collection('users').findOne({ $or: [{ username }, { email }] });
        if (existing) throw new Error('Username or email already exists');

        const result = await db.collection('users').insertOne({
            username, email, password, created_at: new Date()
        });
        return { lastID: result.insertedId.toString() };
    },
    getScores: async (userId) => {
        if (!db) return [];
        return await db.collection('scores')
            .find({ user_id: userId })
            .sort({ score: -1 })
            .toArray();
    },
    addScore: async (userId, playerName, score) => {
        if (!db) throw new Error('Database not connected');
        const result = await db.collection('scores').insertOne({
            user_id: userId,
            player_name: playerName,
            score: parseInt(score),
            created_at: new Date()
        });
        return { lastID: result.insertedId.toString() };
    },
    updateScore: async (id, userId, playerName, score) => {
        if (!db) throw new Error('Database not connected');
        const result = await db.collection('scores').updateOne(
            { _id: new ObjectId(id), user_id: userId },
            { $set: { player_name: playerName, score: parseInt(score) } }
        );
        return { changes: result.matchedCount };
    },
    deleteScore: async (id, userId) => {
        if (!db) throw new Error('Database not connected');
        const result = await db.collection('scores').deleteOne({
            _id: new ObjectId(id),
            user_id: userId
        });
        return { changes: result.deletedCount };
    }
};

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
        res.status(500).json({ error: 'Server error: ' + error.message });
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

        const token = jwt.sign({ id: user._id.toString(), username: user.username }, JWT_SECRET);
        res.json({
            message: 'Login successful',
            token,
            user: { id: user._id.toString(), username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Score Routes
app.get('/api/scores', authenticateToken, async (req, res) => {
    try {
        const scores = await dbOperations.getScores(req.user.id);

        // Map _id to id for frontend compatibility
        const mappedScores = scores.map(s => ({
            ...s,
            id: s._id.toString()
        }));

        res.json(mappedScores);
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

// Catch-all
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;
