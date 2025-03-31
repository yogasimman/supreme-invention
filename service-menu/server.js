// menu server.js

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Configure the PostgreSQL connection.
// Use the same (or appropriate) connection string for your database.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fooddeladmin:FoodDeliveryPassword@fooddeliverydb.cb86squ28rpi.eu-north-1.rds.amazonaws.com:5432/postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

// Route: GET /:restaurantId
// This service fetches all menu items for the given restaurant_id.
app.get('/:restaurantId', async (req, res) => {
  const restaurantId = req.params.restaurantId;
  try {
    const result = await pool.query(
      'SELECT item_id, name, price, image_url FROM item WHERE restaurant_id = $1',
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching menu items', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the menu service server
//app.listen(port, () => {
  //console.log(`Menu service is running on port ${port}`);
//});
//lambda
const awsServerlessExpress = require('aws-serverless-express');
const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context);

