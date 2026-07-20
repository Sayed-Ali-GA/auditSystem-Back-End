const express = require("express");

const router = express.Router();
const pool = require("../../config/db");



router.get("/Stores", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Stores");        
    res.status(200).json(result.rows);
    } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
}); 






router.post("/Add-Store", async (req, res) => {
  const {
    StoreCode,
    BrandID,
    LocationID,
    OpsManagerID
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO Stores
      (
        StoreCode,
        BrandID,
        LocationID,
        OpsManagerID
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        StoreCode,
        BrandID,
        LocationID,
        OpsManagerID
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