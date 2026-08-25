// DataBase/seedInitial.js
// Run once after initDB.js on a fresh database.
// Creates the system roles and the first administrator account.
const pool = require("../config/db");
const bcrypt = require("bcrypt");

const DEFAULT_ADMIN_ORACLE_ID = 1;
const DEFAULT_ADMIN_PASSWORD = "admin123"; // change immediately after first login

const seed = async () => {
    try {
        await pool.query(`
            INSERT INTO Roles (RoleID, RoleName) VALUES
                (1, 'Admin'),
                (2, 'Ops Manager'),
                (3, 'Store Manager'),
                (4, 'Auditor'),
                (5, 'Audit Manager')
            ON CONFLICT (RoleID) DO NOTHING;
        `);

        // Keep the Roles sequence in sync since IDs were inserted explicitly above
        await pool.query(`
            SELECT setval(
                pg_get_serial_sequence('Roles', 'roleid'),
                (SELECT MAX(RoleID) FROM Roles)
            );
        `);

        const existingAdmin = await pool.query(
            "SELECT UserID FROM Users WHERE OracleID = $1",
            [DEFAULT_ADMIN_ORACLE_ID]
        );

        if (existingAdmin.rows.length === 0) {
            const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

            await pool.query(
                `
                    INSERT INTO Users (OracleID, UserName, Password, RoleID, IsActive)
                    VALUES ($1, $2, $3, 1, TRUE)
                `,
                [DEFAULT_ADMIN_ORACLE_ID, "admin", hashedPassword]
            );

            console.log("✅ Default admin created — OracleID: 1 / Password: admin123 (change this immediately)");
        } else {
            console.log("ℹ️ Admin account already exists — skipped.");
        }

        console.log("✅ Seed completed successfully.");
    } catch (err) {
        console.error("Error seeding initial data:", err);
    }
};

seed().then(() => {
    pool.end();
});