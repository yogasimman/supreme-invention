// server.js for Order Tracking Service

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3003; // Use a port different from other services

// Enable CORS (adjust origins as needed)
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Configure session middleware
app.use(session({
  secret: 'your_secret_key', // Change to a secure secret in production
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // Set secure: true if using HTTPS
}));

// Configure PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fooddeladmin:FoodDeliveryPassword@fooddeliverydb.cb86squ28rpi.eu-north-1.rds.amazonaws.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

// GET /orders - Retrieve summary of orders for the logged-in user
app.get('/', async (req, res) => {
  //if (!req.session.user) {
  //  return res.status(401).json({ error: 'User not logged in' });
  //}
  const user_id = 2;
  try {
    const ordersQuery = `
      SELECT o.order_id, o.total_price, o.status,
             r.name AS restaurant_name, r.logo_url
      FROM "order" o
      LEFT JOIN restaurant r ON o.restaurant_id = r.restaurant_id
      WHERE o.user_id = $1
      ORDER BY o.order_id DESC
    `;
    const ordersResult = await pool.query(ordersQuery, [user_id]);
    res.json({ orders: ordersResult.rows });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /order/:orderId - Retrieve detailed information for a specific order
app.get('/:orderId', async (req, res) => {
 // if (!req.session.user) {
   // return res.status(401).json({ error: 'User not logged in' });
 // }
  const user_id = 2;
  const { orderId } = req.params;
  try {
    // Get order summary details and verify the order belongs to the user
    const orderQuery = `
      SELECT o.order_id, o.total_price, o.status,
             r.name AS restaurant_name, r.logo_url
      FROM "order" o
      LEFT JOIN restaurant r ON o.restaurant_id = r.restaurant_id
      WHERE o.order_id = $1 AND o.user_id = $2
    `;
    const orderResult = await pool.query(orderQuery, [orderId, user_id]);
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const orderInfo = orderResult.rows[0];

    // Get detailed order items
    const itemsQuery = `
      SELECT oi.item_id, oi.quantity, i.name, i.price, i.image_url
      FROM order_item oi
      LEFT JOIN item i ON oi.item_id = i.item_id
      WHERE oi.order_id = $1
    `;
    const itemsResult = await pool.query(itemsQuery, [orderId]);

    res.json({
      order: {
        ...orderInfo,
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//app.listen(port, () => {
  //console.log(`Order Tracking service is running on port ${port}`);
//});
//lambda
const awsServerlessExpress = require('aws-serverless-express');
const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context);
