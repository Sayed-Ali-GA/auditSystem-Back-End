// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./config/db'); 

const brand = require('./controllers/admin/Brands');
const criteria = require('./controllers/admin/Criteria');
const location = require('./controllers/admin/Location');
const opsManagers = require('./controllers/admin/OpsManager');
const storeManagers = require('./controllers/admin/StoreManager');



const app = express();


app.use(cors());
app.use(express.json());


// console.log("brand:", brand);
// console.log("criteria:", criteria);
// console.log("opsManagers:", opsManagers);


app.use('/api', brand);
app.use('/api', criteria);
app.use('/api', location);
app.use('/api', opsManagers);
app.use('/api', storeManagers);


app.get('/', (req, res) => {
    res.send('Audit System API is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} ✅`);
});