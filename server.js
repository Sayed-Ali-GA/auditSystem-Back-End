// server.js

require('dotenv').config();
const pool = require('./config/db'); 
const express = require('express');
const cors = require('cors');
const chalk = require("chalk");

const authRoutes = require('./controllers/auth/auth')


const brand = require('./controllers/admin/Brands');
const criteria = require('./controllers/admin/Criteria');
const location = require('./controllers/admin/Location');
const opsManagers = require('./controllers/admin/OpsManager');
const storeManagers = require('./controllers/admin/StoreManager');
const stores = require('./controllers/admin/Stores');
const auditPoints = require('./controllers/admin/AuditPints');
const auditorRoutes = require('./controllers/Employee/Auditor')



const app = express();

app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const time = Date.now() - start;
        let color = res.statusCode >= 500 
            ? chalk.red 
            : res.statusCode >= 400 
            ? chalk.yellow 
            : chalk.green;
        console.log(
            `${chalk.gray(new Date().toLocaleTimeString())} | ` +
            `${chalk.magenta(req.method)} ` +
            `${chalk.white(req.originalUrl)} | ` +
            `${color(res.statusCode)} | ` +
            `${chalk.cyan(time + "ms")}`
        );
    });
    next();
});

app.use(cors());
app.use(express.json());


// console.log("brand:", brand);
// console.log("criteria:", criteria);
// console.log("opsManagers:", opsManagers);
// console.log('User: ',auth)


app.use('/api', brand);
app.use('/api', criteria);
app.use('/api', location);
app.use('/api', opsManagers);
app.use('/api', storeManagers);
app.use('/api', stores);
app.use('/api', auditPoints);
app.use("/api/users", authRoutes);
app.use("/api", auditorRoutes);




app.get('/', (req, res) => {
    res.send('Audit System API is running!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} ✅`);
});