const express = require("express");

const router = express.Router();
const pool = require("../../config/db");



router.get("/StoreManagers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM StoreManagers");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
}); 





router.post("/Add-StoreManager", async (req, res) => {
  const { StoreManagerName, OracleID, BrandID, LocationID } = req.body;
  try {
    const result = await pool.query(` INSERT INTO StoreManagers
      (
        StoreManagerName,
        oracleid,
        BrandID,
        LocationID
      )
      VALUES ($1,$2,$3,$4) RETURNING *`,
      [
        StoreManagerName,
        OracleID,
        BrandID,
        LocationID
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });

  }
});





module.exports = router;