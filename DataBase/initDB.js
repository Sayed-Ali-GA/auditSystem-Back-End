const pool = require("../config/db");

const createTables = async () => {
    try {

        // Table of Brands
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Brands (
                BrandID SERIAL PRIMARY KEY,
                BrandName VARCHAR(255) NOT NULL
            );
        `);


        // Table of Locations
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Locations (
                LocationID SERIAL PRIMARY KEY,
                LocationName VARCHAR(255) NOT NULL
            );
        `);


        // Table of OpsManagers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS OpsManagers (
                OpsManagerID SERIAL PRIMARY KEY,
                OracleID INTEGER UNIQUE,
                OpsManagerName VARCHAR(255) NOT NULL
            );
        `);


        // Table of StoreManagers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS StoreManagers (
                StoreManagerID SERIAL PRIMARY KEY,
                StoreManagerName VARCHAR(255) NOT NULL,
                OracleID INTEGER UNIQUE,
                BrandID INTEGER REFERENCES Brands(BrandID),
                LocationID INTEGER REFERENCES Locations(LocationID)
            );
        `);


        // Table of Stores
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Stores (
                StoreSerial SERIAL PRIMARY KEY,
                StoreCode VARCHAR(255) NOT NULL,
                BrandID INTEGER REFERENCES Brands(BrandID),
                LocationID INTEGER REFERENCES Locations(LocationID),
                OpsManagerID INTEGER REFERENCES OpsManagers(OpsManagerID),
                StoreManagerID INTEGER REFERENCES StoreManagers(StoreManagerID)
            );
        `);


        // Table of MajorCriteria
        await pool.query(`
            CREATE TABLE IF NOT EXISTS MajorCriteria (
                MajorCriteriaID SERIAL PRIMARY KEY,
                MajorCriteriaName VARCHAR(255) NOT NULL
            );
        `);


        // Create ENUM Type RiskLevel
        await pool.query(`
            DO $$ BEGIN
                CREATE TYPE RiskLevel AS ENUM (
                    'Low',
                    'Moderate',
                    'High'
                );
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END $$;
        `);


        // Table of AuditPoints
        await pool.query(`
            CREATE TABLE IF NOT EXISTS AuditPoints (
                AuditPointID SERIAL PRIMARY KEY,
                MajorCriteriaID INTEGER REFERENCES MajorCriteria(MajorCriteriaID),
                AuditComment TEXT NOT NULL,
                SubPointCriteria VARCHAR(50) NOT NULL,
                Weightage NUMERIC(5,2) NOT NULL,
                RiskMatrix RiskLevel NOT NULL
            );
        `);


        // Table of Roles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Roles (
                RoleID SERIAL PRIMARY KEY,
                RoleName VARCHAR(50) UNIQUE NOT NULL
            );
        `);


        // Table of Users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS Users (
                UserID SERIAL PRIMARY KEY,
                OracleID INTEGER UNIQUE,
                UserName VARCHAR(255) NOT NULL,
                Password VARCHAR(255) NOT NULL,
                LocationID INTEGER REFERENCES Locations(LocationID),
                RoleID INTEGER REFERENCES Roles(RoleID),
                IsActive BOOLEAN DEFAULT TRUE,
                CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);


        console.log(
            `Tables checked/created successfully in database: ${process.env.DB_NAME} ✅✅`
        );


    } catch (err) {

        console.error("Error creating tables:", err);

    }
};


// Run
createTables()
    .then(() => {
        pool.end();
    });