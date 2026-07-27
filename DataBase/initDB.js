const pool = require('../config/db');

 //  Tables creation queries
const createTables = async () => {
  try {

    // Table of Brands
        await pool.query(`
            CREATE TABLE Brands (
                BrandID SERIAL PRIMARY KEY,
                BrandName VARCHAR(255) NOT NULL
            );
        `);



    // Table of Locations
        await pool.query(`
            CREATE TABLE Locations (
                LocationID SERIAL PRIMARY KEY,
                LocationName VARCHAR(255) NOT NULL
            );
        `);

    // Table of OpsManagers(Areas Managers)
        await pool.query(`  
            CREATE TABLE OpsManagers (
                OpsManagerID SERIAL PRIMARY KEY,
                OracleID INTEGER,
                OpsManagerName VARCHAR(255) NOT NULL
            );
        `);
        
    // Table of StoreManagers
        await pool.query(`
          CREATE TABLE StoreManagers (
            StoreManagerID SERIAL PRIMARY KEY,
            StoreManagerName VARCHAR(255) NOT NULL,
            OracleID INTEGER UNIQUE,
            BrandID INTEGER REFERENCES Brands(BrandID),
            LocationID INTEGER REFERENCES Locations(LocationID)

            );
        `);


    // Table of Stores
        await pool.query(`
            CREATE TABLE Stores (
                StoreSerial SERIAL PRIMARY KEY,
                StoreCode VARCHAR(255) NOT NULL,
                BrandID INTEGER REFERENCES Brands(BrandID),
                LocationID INTEGER REFERENCES Locations(LocationID),
                opsManagerID INTEGER REFERENCES OpsManagers(OpsManagerID),
                StoreManagerID INTEGER REFERENCES StoreManagers(StoreManagerID)
            );
        `);

    // Table of MajorCriteria
        await pool.query(`
            CREATE TABLE MajorCriteria (
                MajorCriteriaID SERIAL PRIMARY KEY,
                MajorCriteriaName VARCHAR(255) NOT NULL
            );
        `);

    // Table of RiskLMatrix
        await pool.query(`
            CREATE TYPE RiskLevel AS ENUM (
                'Low',
                'Moderate',
                'High'
            );
        `)

    // Table of AuditPoints
        await pool.query(`
            CREATE TABLE AuditPoints (
                AuditPointID SERIAL PRIMARY KEY,
                MajorCriteriaID INTEGER REFERENCES MajorCriteria(MajorCriteriaID),
                auditComment TEXT NOT NULL,
                subPointCriteria VARCHAR(50) NOT NULL,
                weightage NUMERIC(5,2) NOT NULL,
                riskMatrix RiskLevel NOT NULL
            );
        `)



        await pool.query(`
            CREATE TABLE Users (
                UserID SERIAL PRIMARY KEY,
                OracleID INTEGER UNIQUE,
                UserName VARCHAR(255) NOT NULL,
                Password VARCHAR(255) NOT NULL,
                LocationID INTEGER REFERENCES Locations(LocationID),
            RoleID INTEGER REFERENCES Roles(RoleID),
            CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `); 


        await pool.query(`
            CREATE TABLE Roles (
                RoleID SERIAL PRIMARY KEY,
                RoleName VARCHAR(50) UNIQUE NOT NULL
            );
        `)



        console.log(`Tables checked/created successfully in database: ${process.env.DB_NAME} ✅✅`);
  } catch (err) {
    console.error('Error creating tables:', err);
  } finally {
    pool.end();
  }
};

createTables();



// 
// To Add Table use 
// node ./DataBase/initDB.js
// DROP TABLE Stores CASCADE;
