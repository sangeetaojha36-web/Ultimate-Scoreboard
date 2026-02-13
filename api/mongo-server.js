const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scoreboard';
let db;

async function connectToDatabase() {
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db();
        console.log('Connected to MongoDB');
        
        // Create indexes for better performance
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        await db.collection('scores').createIndex({ user_id: 1 });
        
        return db;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

// Environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

// Initialize database connection
connectToDatabase().catch(console.error);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Ultimate Scoreboard API',
        database: db ? 'Connected' : 'Disconnected'
    });
});

// Auth Routes
// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Check if user already exists
        const existingUser = await db.collection('users').findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const result = await db.collection('users').insertOne({
            username,
            email,
            password: hashedPassword,
            created_at: new Date()
        });

        const token = jwt.sign({ 
            id: result.insertedId.toString(), 
            username 
        }, JWT_SECRET);

        res.status(201).json({ 
            message: 'User created successfully', 
            token,
            user: { 
                id: result.insertedId.toString(), 
                username, 
                email 
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const { username, password } = req.body;
        
        console.log('Login attempt:', { username, passwordLength: password?.length || 0 });

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const user = await db.collection('users').findOne({ username });

        if (!user) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            console.log('Password mismatch for:', username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('Login successful:', username);
        
        const token = jwt.sign({ 
            id: user._id.toString(), 
            username: user.username 
        }, JWT_SECRET);

        res.json({ 
            message: 'Login successful', 
            token,
            user: { 
                id: user._id.toString(), 
                username: user.username, 
                email: user.email 
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Score Routes
// Get user scores
app.get('/api/scores', authenticateToken, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const userId = req.user.id;
        const scores = await db.collection('scores')
            .find({ user_id: userId })
            .sort({ score: -1, created_at: -1 })
            .toArray();

        res.json(scores);
    } catch (error) {
        console.error('Get scores error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add score
app.post('/api/scores', authenticateToken, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const userId = req.user.id;
        const { player_name, score } = req.body;

        if (!player_name || !score) {
            return res.status(400).json({ error: 'Player name and score are required' });
        }

        const result = await db.collection('scores').insertOne({
            user_id: userId,
            player_name,
            score: parseInt(score),
            created_at: new Date()
        });

        res.status(201).json({ 
            id: result.insertedId.toString(),
            user_id: userId,
            player_name,
            score: parseInt(score)
        });
    } catch (error) {
        console.error('Add score error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update score
app.put('/api/scores/:id', authenticateToken, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const userId = req.user.id;
        const scoreId = req.params.id;
        const { player_name, score } = req.body;

        if (!player_name || !score) {
            return res.status(400).json({ error: 'Player name and score are required' });
        }

        const result = await db.collection('scores').updateOne(
            { _id: new ObjectId(scoreId), user_id: userId },
            { 
                $set: { 
                    player_name, 
                    score: parseInt(score),
                    updated_at: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Score not found or unauthorized' });
        }

        res.json({ 
            id: scoreId, 
            player_name, 
            score: parseInt(score) 
        });
    } catch (error) {
        console.error('Update score error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete score
app.delete('/api/scores/:id', authenticateToken, async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }

        const userId = req.user.id;
        const scoreId = req.params.id;

        const result = await db.collection('scores').deleteOne({
            _id: new ObjectId(scoreId),
            user_id: userId
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Score not found or unauthorized' });
        }

        res.json({ message: 'Score deleted successfully' });
    } catch (error) {
        console.error('Delete score error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Serve static files (for production)
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname)));
    
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`MongoDB URI: ${mongoUri}`);
});
