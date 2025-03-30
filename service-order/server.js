// server.js for Cart and Order Service

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const session = require('express-session');

const app = express();
const port = process.env.PORT || 3002; // Use a port different from your coordinator

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
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper function to get or create a cart for the logged-in user
async function getOrCreateCart(user_id) {
  const cartResult = await pool.query('SELECT cart_id FROM cart WHERE user_id = $1', [user_id]);
  if (cartResult.rows.length > 0) {
    return cartResult.rows[0].cart_id;
  } else {
    const newCart = await pool.query('INSERT INTO cart (user_id) VALUES ($1) RETURNING cart_id', [user_id]);
    return newCart.rows[0].cart_id;
  }
}

// -----------------------------------
// Endpoint: POST /cart/add
// Description: Add an array of item IDs to the user's cart.
// -----------------------------------
app.post('/cart/add', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'User not logged in' });
  }
  const user_id = req.session.user.user_id;
  const { itemIds } = req.body;
  
  if (!itemIds || !Array.isArray(itemIds)) {
    return res.status(400).json({ error: 'itemIds must be provided as an array' });
  }

  try {
    const cart_id = await getOrCreateCart(user_id);
    for (const itemId of itemIds) {
      // Check if the item already exists in the cart
      const existResult = await pool.query(
        'SELECT cart_item_id, quantity FROM cart_item WHERE cart_id = $1 AND item_id = $2',
        [cart_id, itemId]
      );
      if (existResult.rows.length > 0) {
        // Update quantity if already exists
        const currentQty = existResult.rows[0].quantity;
        await pool.query(
          'UPDATE cart_item SET quantity = $1 WHERE cart_item_id = $2',
          [currentQty + 1, existResult.rows[0].cart_item_id]
        );
      } else {
        // Insert new cart item with quantity 1
        await pool.query(
          'INSERT INTO cart_item (cart_id, item_id, quantity) VALUES ($1, $2, $3)',
          [cart_id, itemId, 1]
        );
      }
    }
    res.json({ message: 'Items added to cart successfully' });
  } catch (err) {
    console.error('Error adding items to cart:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------------
// Endpoint: GET /cart
// Description: Retrieve cart items with details for the logged-in user.
// -----------------------------------
app.get('/cart', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'User not logged in' });
  }
  const user_id = req.session.user.user_id;
  try {
    const cartResult = await pool.query('SELECT cart_id FROM cart WHERE user_id = $1', [user_id]);
    if (cartResult.rows.length === 0) {
      return res.json({ cartItems: [] });
    }
    const cart_id = cartResult.rows[0].cart_id;
    // Join cart_item with item table to get details
    const query = `
      SELECT ci.cart_item_id, ci.item_id, ci.quantity, i.name, i.price, i.image_url
      FROM cart_item ci
      JOIN item i ON ci.item_id = i.item_id
      WHERE ci.cart_id = $1
    `;
    const detailsResult = await pool.query(query, [cart_id]);
    res.json({ cartItems: detailsResult.rows });
  } catch (err) {
    console.error('Error fetching cart items:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -----------------------------------
// Endpoint: POST /order
// Description: Place an order based on the current cart items for the logged-in user.
// -----------------------------------
app.post('/order', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'User not logged in' });
  }
  const user_id = req.session.user.user_id;
  try {
    // Retrieve the user's cart
    const cartResult = await pool.query('SELECT cart_id FROM cart WHERE user_id = $1', [user_id]);
    if (cartResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    const cart_id = cartResult.rows[0].cart_id;
    
    // Retrieve cart items along with price and restaurant_id
    const query = `
      SELECT ci.item_id, ci.quantity, i.price, i.restaurant_id
      FROM cart_item ci
      JOIN item i ON ci.item_id = i.item_id
      WHERE ci.cart_id = $1
    `;
    const cartItemsResult = await pool.query(query, [cart_id]);
    if (cartItemsResult.rows.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    // Calculate total price and determine restaurant (assuming all items belong to one restaurant)
    let totalPrice = 0;
    let restaurant_id = null;
    cartItemsResult.rows.forEach(item => {
      totalPrice += parseFloat(item.price) * item.quantity;
      if (!restaurant_id) {
        restaurant_id = item.restaurant_id;
      }
    });
    
    // Create a new order record
    const orderResult = await pool.query(
      'INSERT INTO "order" (user_id, restaurant_id, total_price, status) VALUES ($1, $2, $3, $4) RETURNING order_id',
      [user_id, restaurant_id, totalPrice, 'Pending']
    );
    const order_id = orderResult.rows[0].order_id;
    
    // Insert each cart item into order_item table
    for (const item of cartItemsResult.rows) {
      await pool.query(
        'INSERT INTO order_item (order_id, item_id, quantity) VALUES ($1, $2, $3)',
        [order_id, item.item_id, item.quantity]
      );
    }
    
    // Clear the cart items
    await pool.query('DELETE FROM cart_item WHERE cart_id = $1', [cart_id]);
    
    res.json({ message: 'Order placed successfully', order_id });
  } catch (err) {
    console.error('Error placing order:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the Cart and Order service server
app.listen(port, () => {
  console.log(`Cart and Order service is running on port ${port}`);
});
