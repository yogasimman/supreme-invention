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
// Description: Add or remove an array of item IDs to/from the user's cart.
// If "remove" is true, each item is decremented (or removed if quantity becomes 0).
// Otherwise, each item is added (or quantity incremented).
// -----------------------------------
// Assuming you have a "cart" table that stores cart items for each user

app.post('/add', async (req, res) => {
  const { itemIds, remove } = req.body;
  const userId = 2; // Assuming user is logged in and we have access to their user_id
  try {
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    for (const itemId of itemIds) {
      // Check if the item already exists in the user's cart
      const cartItem = await pool.query(
        'SELECT * FROM cart_item A JOIN cart B ON B.cart_id = A.cart_id WHERE B.user_id = $1 AND A.item_id = $2',
        [userId, itemId]
      );

      if (remove) {
        if (cartItem.rows.length > 0) {
          // Decrement or remove item from cart
          const newQuantity = cartItem.rows[0].quantity - 1;
          if (newQuantity <= 0) {
            // Remove item from cart entirely if quantity reaches zero
            await pool.query(
              'DELETE FROM cart_item WHERE cart_id = $1 AND item_id = $2',
              [cartItem.rows[0].cart_id, itemId]
            );
          } else {
            // Update the quantity in the cart
            await pool.query(
              'UPDATE cart_item SET quantity = $1 WHERE cart_id = $2 AND item_id = $3',
              [newQuantity, cartItem.rows[0].cart_id, itemId]
            );
          }
        }
      } else {
        if (cartItem.rows.length > 0) {
          // Item exists in cart, so increment the quantity
          const newQuantity = cartItem.rows[0].quantity + 1;
          await pool.query(
            'UPDATE cart_item SET quantity = $1 WHERE cart_id = $2 AND item_id = $3',
            [newQuantity, cartItem.rows[0].cart_id, itemId]
          );
        } else {
          // Item doesn't exist in the cart, so add it
          await pool.query(
            'INSERT INTO cart_item (cart_id, item_id, quantity) VALUES ((SELECT cart_id FROM cart WHERE user_id = $1), $2, $3)',
            [userId, itemId, 1] // Initially adding 1 item
          );
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /cart/add:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// -----------------------------------
// Endpoint: GET /cart
// Description: Retrieve cart items with details for the logged-in user.
// -----------------------------------
app.get('/:rest_id', async (req, res) => {
  //if (!req.session.user) {
    //return res.status(401).json({ error: 'User not logged in' });
  //}
  const user_id = 2;
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
  //if (!req.session.user) {
    //return res.status(401).json({ error: 'User not logged in' });
  //}
  const user_id = 2;
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
//app.listen(port, () => {
  //console.log(`Cart and Order service is running on port ${port}`);
//});

//Lambda
const awsServerlessExpress = require('aws-serverless-express');
const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context);

