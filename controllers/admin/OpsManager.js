const express = require("express");

const router = express.Router();
const pool = require("../../config/db");


router.get("/OpsManagers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM OpsManagers");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
}); 



router.post("/OpsManagers", async (req, res) => {
    const { OracleID, OpsManagerName } = req.body;
    try {
        const result = await pool.query(` INSERT INTO OpsManagers
            (
                OracleID,
                OpsManagerName
            )
            VALUES ($1, $2) RETURNING *`,
            [
                OracleID,
                OpsManagerName
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: error.message
        });
    }
}); 


module.exports = router;