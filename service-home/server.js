// coordinator server.js

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for development (adjust as needed in production)
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Configure session middleware
app.use(session({
  secret: 'your_secret_key', // change this to a strong secret in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set secure to true if using HTTPS
}));

// Configure the PostgreSQL connection.
// Replace the connection string with your AWS RDS details.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fooddeladmin:FoodDeliveryPassword@fooddeliverydb.cb86squ28rpi.eu-north-1.rds.amazonaws.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

// --------------------
// Public Routes
// --------------------

// Route: GET /restaurants
// This service fetches all restaurants with their id, name, and logo URL.
app.get('/restaurants', async (req, res) => {
  try {
    const result = await pool.query('SELECT restaurant_id, name, logo_url FROM restaurant');
    res.json(result.rows);
  } catch (err) {
    console.error('Error executing query', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy /menu requests to the separate menu service running on port 3001
app.use('/menu', createProxyMiddleware({
  target: 'http://localhost:3001',
  changeOrigin: true,
  pathRewrite: {
    '^/menu': '' // Remove '/menu' prefix before forwarding the request.
  }
}));



// Proxy /cart requests to the Cart/Order service running on port 3002
app.use('/view', createProxyMiddleware({
  target: 'http://localhost:3002',
  changeOrigin: true,
  pathRewrite: {
    '^/view': '' // Remove '/menu' prefix before forwarding the request.
  }
}));

// Proxy /orders requests to the Order Tracking service running on port 3003
app.use('/vieworders', createProxyMiddleware({
  target: 'http://localhost:3003',
  changeOrigin: true,
  pathRewrite: {
    '^/vieworders': '' // Remove '/orders' prefix before forwarding the request.
  }
}));

// Proxy /order requests to the Order Tracking service running on port 3003
app.use('/vieworder', createProxyMiddleware({
  target: 'http://localhost:3003',
  changeOrigin: true,
  pathRewrite: {
    '^/vieworder': '' // Remove '/order' prefix before forwarding the request.
  }
}));

// --------------------
// Authentication Routes
// --------------------

// POST /register - Create a new user
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Check if the user already exists
    const userCheck = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    // Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);
    // Insert new user and return the newly created user info
    const newUser = await pool.query(
      'INSERT INTO "user" (email, password_hash) VALUES ($1, $2) RETURNING user_id, email',
      [email, hashedPassword]
    );
    // Set the session for the new user
    req.session.user = newUser.rows[0];
    res.json({ message: 'User registered successfully', user: newUser.rows[0] });
  } catch (error) {
    console.error('Error in /register:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /login - Authenticate an existing user
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Retrieve the user from the database
    const userResult = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const user = userResult.rows[0];
    // Compare the provided password with the stored hash
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    // Save the user info in session
    req.session.user = { user_id: user.user_id, email: user.email };
    res.json({ message: 'Logged in successfully', user: req.session.user });
  } catch (error) {
    console.error('Error in /login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /check_login - Check if the user is logged in
app.get('/check_login', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// POST /logout - Log the user out by destroying the session
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

// Start the coordinator server
app.listen(port, () => {
  console.log(`Coordinator server is running on port ${port}`);
});
