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



// LOGIN
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



// DELETE USER
router.delete("/:id",verifyToken,isAdmin,async(req,res)=>{

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
                message:"Cannot delete an Admin account."
            });
        }
        await pool.query(
            "DELETE FROM Users WHERE UserID=$1",
            [id]
        );
        res.json({
            message:"User deleted successfully."
        });
    }catch(error){
        console.error(error);
        res.status(500).json({
            message:"Server error."
        });
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