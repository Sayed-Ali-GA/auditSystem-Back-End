const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

const { sendMail } = require("../../config/mailer");
const { welcomeEmailHtml } = require("../../services/emailTemplates");


// CREATE USER
router.post("/createUser",verifyToken,isAdmin,async(req,res)=>{
    const {OracleID,UserName,Password,LocationID,RoleID,Email}=req.body;
    try{
        if(!OracleID || !UserName || !Password || !LocationID || !RoleID){
            return res.status(400).json({
                message:"Missing required fields."
            });
        }

        const existingUser=await pool.query(
            "SELECT * FROM Users WHERE OracleID=$1",
            [OracleID]
        );

        if(existingUser.rows.length>0){
            return res.status(400).json({
                message:"Oracle ID already exists."
            });
        }

        if(Number(RoleID)===1){
            return res.status(403).json({
                message:"Cannot create another Admin account."
            });
        }

        const hashedPassword=await bcrypt.hash(String(Password),10);

        const result=await pool.query(`
            INSERT INTO Users(
                OracleID,
                UserName,
                Password,
                LocationID,
                RoleID,
                Email
            )
            VALUES($1,$2,$3,$4,$5,$6)
            RETURNING UserID,OracleID,UserName,LocationID,RoleID,Email;
        `,
        [
            OracleID,
            UserName,
            hashedPassword,
            LocationID,
            RoleID,
            Email || null
        ]);

        const newUser = result.rows[0];

        // Fire-and-forget welcome email — never blocks the API response.
        if (Email) {
            sendMail({
                to: Email,
                subject: "Your Audit System account has been created",
                html: welcomeEmailHtml({
                    userName: UserName,
                    oracleId: OracleID,
                    password: Password, // plain text, shown once before hashing
                    roleId: RoleID,
                    loginUrl: process.env.APP_LOGIN_URL || null,
                }),
            }).catch((err) => console.log("Welcome email failed:", err.message));
        }

        res.status(201).json(newUser);
    }catch(error){
        console.error(error);
        res.status(500).json({
            message:"Server error."
        });
    }
});



// LOGIN (personal account — Oracle ID + Password)
router.post("/login",async(req,res)=>{
    const {OracleID,Password}=req.body;
    try{

        if(!OracleID || !Password){
            return res.status(400).json({
                message:"OracleID and Password are required."
            });
        }

        const result=await pool.query(`
            SELECT 
                UserID,
                OracleID,
                UserName,
                Password,
                LocationID,
                RoleID,
                IsActive
            FROM Users
            WHERE OracleID=$1
        `,
        [OracleID]);

        if(result.rows.length===0){
            return res.status(401).json({
                message:"Invalid credentials."
            });
        }
        const user=result.rows[0];

        if(!user.isactive){
            return res.status(403).json({
                message:"Account disabled."
            });
        }

        const passwordMatch=await bcrypt.compare(
            String(Password),
            user.password
        );

        if(!passwordMatch){
            return res.status(401).json({
                message:"Invalid credentials."
            });
        }

        const token=jwt.sign(
        {
            UserID:user.userid,
            OracleID:user.oracleid,
            RoleID:user.roleid,
            UserName: user.username,
            LocationID:user.locationid
        },
        process.env.JWT_SECRET,
        {
            expiresIn:"8h"
        });


        res.json({
            token,
            user:{
                UserID:user.userid,
                UserName:user.username,
                RoleID:user.roleid
            }
        });
    }catch(error){
        console.error(error);
        res.status(500).json({
            message:"Server error."
        });
    }
});



router.post("/store-login", async (req, res) => {
    const { StoreCode, Password } = req.body;

    try {
        if (!StoreCode || !Password) {
            return res.status(400).json({
                message: "Store code and password are required."
            });
        }

        const result = await pool.query(
            `
            SELECT
                StoreSerial,
                StoreCode,
                LoginPassword,
                IsActive
            FROM Stores
            WHERE StoreCode = $1
            `,
            [StoreCode]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid credentials."
            });
        }

        const store = result.rows[0];

        if (!store.isactive) {
            return res.status(403).json({
                message: "This store account is disabled."
            });
        }

        if (!store.loginpassword) {
            return res.status(403).json({
                message: "This store has no login set up yet. Please contact your Admin."
            });
        }

        const passwordMatch = await bcrypt.compare(
            String(Password),
            store.loginpassword
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid credentials."
            });
        }


        const token = jwt.sign(
            {
                RoleID: 3, // Store Manager
                StoreSerial: store.storeserial,
                StoreCode: store.storecode,
                UserName: store.storecode,
                IsStoreAccount: true,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "8h"
            }
        );

        res.json({
            token,
            user: {
                UserName: store.storecode,
                RoleID: 3,
                StoreSerial: store.storeserial,
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error."
        });
    }
});



router.patch(
    "/stores/:storeSerial/set-login",
    verifyToken,
    isAdmin,
    async (req, res) => {
        const { storeSerial } = req.params;
        const { Password } = req.body;

        try {
            if (!Password || String(Password).length < 4) {
                return res.status(400).json({
                    message: "Password is required (minimum 4 characters)."
                });
            }

            const hashedPassword = await bcrypt.hash(String(Password), 10);

            const result = await pool.query(
                `
                UPDATE Stores
                SET LoginPassword = $1
                WHERE StoreSerial = $2
                RETURNING StoreSerial, StoreCode
                `,
                [hashedPassword, storeSerial]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Store not found."
                });
            }

            res.json({
                message: "Store login password set successfully.",
                store: result.rows[0],
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Server error."
            });
        }
    }
);



router.patch(
    "/stores/:storeSerial/clear-login",
    verifyToken,
    isAdmin,
    async (req, res) => {
        const { storeSerial } = req.params;

        try {
            const result = await pool.query(
                `
                UPDATE Stores
                SET LoginPassword = NULL
                WHERE StoreSerial = $1
                RETURNING StoreSerial, StoreCode
                `,
                [storeSerial]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    message: "Store not found."
                });
            }

            res.json({
                message: "Store login removed.",
                store: result.rows[0],
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Server error."
            });
        }
    }
);



// GET ALL USERS
router.get("/",verifyToken,isAdmin,async(req,res)=>{

    try{

        const result=await pool.query(`
            SELECT
            u.UserID,
            u.OracleID,
            u.UserName,
            u.Email,
            u.LocationID,
            l.LocationName,
            u.RoleID,
            u.IsActive,
            u.CreatedAt
        FROM Users u
        LEFT JOIN Locations l
        ON u.LocationID = l.LocationID
        ORDER BY u.UserID;
        `);

        res.json(result.rows);


    }catch(error){

        console.error(error);

        res.status(500).json({
            message:"Server error."
        });

    }

});



// UPDATE USER
router.put("/:id",verifyToken,isAdmin,async(req,res)=>{
    const {id}=req.params;
    const {UserName,LocationID,RoleID,Email}=req.body;
try{
        // Prevent promoting any user to Admin via update
        if(Number(RoleID)===1){
            return res.status(403).json({
                message:"Cannot assign Admin role."
            });
        }
        // Prevent modifying an existing Admin account through this endpoint
        const targetUser=await pool.query(
            "SELECT RoleID FROM Users WHERE UserID=$1",
            [id]
        );

        if(targetUser.rows.length===0){
            return res.status(404).json({
                message:"User not found."
            });
        }

        if(Number(targetUser.rows[0].roleid)===1){
            return res.status(403).json({
                message:"Cannot modify an Admin account."
            });
        }

        const result=await pool.query(`
            UPDATE Users
            SET
                UserName=COALESCE($1,UserName),
                LocationID=COALESCE($2,LocationID),
                RoleID=COALESCE($3,RoleID),
                Email=COALESCE($4,Email)
            WHERE UserID=$5
            RETURNING UserID,UserName,LocationID,RoleID,Email;
        `,
        [
            UserName,
            LocationID,
            RoleID,
            Email,
            id
        ]);
        res.json(result.rows[0]);
    }catch(error){
        console.error(error);
        res.status(500).json({
            message:"Server error."
        });
    }
});



// DISABLE USER
router.patch("/:id/disable",verifyToken,isAdmin,async(req,res)=>{
    const {id}=req.params;
    try{
        const targetUser=await pool.query(
            "SELECT RoleID FROM Users WHERE UserID=$1",
            [id]
        );

        if(targetUser.rows.length===0){
            return res.status(404).json({
                message:"User not found."
            });
        }

        if(Number(targetUser.rows[0].roleid)===1){
            return res.status(403).json({
                message:"Cannot disable an Admin account."
            });
        }

        const result=await pool.query(`
            UPDATE Users
            SET IsActive=false
            WHERE UserID=$1
            RETURNING UserID,UserName,IsActive;
        `,
        [id]);
        res.json(result.rows[0]);
    }catch(error){
        console.error(error);
        res.status(500).json({
            message:"Server error."
        });
    }
});



// =====================================================
// DELETE USER — HARD DELETE
// Keeps historical audits
// Detaches audit-related records
// Deletes user notifications
// =====================================================
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // =================================================
        // 1. CHECK USER
        // =================================================
        const targetUser = await client.query(
            `
            SELECT
                UserID,
                UserName,
                RoleID
            FROM Users
            WHERE UserID = $1
            `,
            [id]
        );

        if (targetUser.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "User not found."
            });
        }

        const user = targetUser.rows[0];

        // =================================================
        // 2. NEVER DELETE ADMIN
        // =================================================
        if (Number(user.roleid) === 1) {
            await client.query("ROLLBACK");

            return res.status(403).json({
                message: "Cannot delete an Admin account."
            });
        }

        // =================================================
        // 3. DELETE USER NOTIFICATIONS
        //
        // Notifications are not historical audit records.
        // They belong to the user and can safely be removed.
        // =================================================
        await client.query(
            `
            DELETE FROM Notifications
            WHERE UserID = $1
            `,
            [id]
        );

        console.log(
            `Deleted notifications for UserID ${id}`
        );

        // =================================================
        // 4. DETACH AUDIT ASSIGNMENTS
        //
        // Keep the audit history.
        // Only remove the user reference.
        // =================================================
        await client.query(
            `
            UPDATE AuditAssignments
            SET AuditorID = NULL
            WHERE AuditorID = $1
            `,
            [id]
        );

        console.log(
            `Detached AuditAssignments for UserID ${id}`
        );

        // =================================================
        // 5. DETACH OTHER USER FOREIGN KEYS
        //
        // Automatically finds nullable foreign keys
        // pointing to Users(UserID).
        //
        // Notifications are excluded because they
        // were already deleted above.
        // =================================================
        const foreignKeys = await client.query(
            `
            SELECT DISTINCT
                tc.table_schema,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS referenced_table,
                ccu.column_name AS referenced_column
            FROM information_schema.table_constraints AS tc

            INNER JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema

            INNER JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema

            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND LOWER(ccu.table_name) = 'users'
              AND LOWER(ccu.column_name) = 'userid'
              AND LOWER(tc.table_name) NOT IN (
                  'users',
                  'notifications',
                  'auditassignments'
              )
            `
        );

        for (const fk of foreignKeys.rows) {
            const schema = fk.table_schema;
            const table = fk.table_name;
            const column = fk.column_name;

            // Check if FK column allows NULL
            const nullableCheck = await client.query(
                `
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_schema = $1
                  AND table_name = $2
                  AND column_name = $3
                `,
                [schema, table, column]
            );

            if (
                nullableCheck.rows.length > 0 &&
                nullableCheck.rows[0].is_nullable === "YES"
            ) {
                await client.query(
                    `
                    UPDATE "${schema}"."${table}"
                    SET "${column}" = NULL
                    WHERE "${column}" = $1
                    `,
                    [id]
                );

                console.log(
                    `Detached UserID ${id} from ${schema}.${table}.${column}`
                );
            } else {
                throw new Error(
                    `Cannot delete user because ${schema}.${table}.${column} does not allow NULL.`
                );
            }
        }

        // =================================================
        // 6. HARD DELETE USER
        // =================================================
        const deletedUser = await client.query(
            `
            DELETE FROM Users
            WHERE UserID = $1
            RETURNING UserID, UserName, RoleID
            `,
            [id]
        );

        if (deletedUser.rows.length === 0) {
            throw new Error("User could not be deleted.");
        }

        // =================================================
        // 7. COMMIT
        // =================================================
        await client.query("COMMIT");

        console.log(
            `User ${id} permanently deleted successfully.`
        );

        return res.status(200).json({
            message: "User deleted permanently.",
            user: deletedUser.rows[0]
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "Failed to permanently delete user:",
            error
        );

        if (error.code === "23503") {
            return res.status(409).json({
                message:
                    "Cannot delete this user because some records are still linked to the user."
            });
        }

        return res.status(500).json({
            message: error.message || "Server error."
        });

    } finally {
        client.release();
    }
});


router.patch("/:id/enable", verifyToken, isAdmin, async (req, res) => {

    const { id } = req.params;

    try {

        const result = await pool.query(`
            UPDATE Users
            SET IsActive = true
            WHERE UserID = $1
            RETURNING UserID, UserName, IsActive;
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json(result.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error."
        });
    }

});


module.exports=router;