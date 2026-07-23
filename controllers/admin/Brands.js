const express = require("express");

const router = express.Router();
const pool = require("../../config/db");
// const verifyToken = require("../../middleware/verify-token");


router.get("/brands", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Brands");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});



router.post("/brands", async (req, res) => {
  const { BrandName } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO Brands (BrandName) VALUES ($1) RETURNING *",
      [BrandName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong",error: err.message});
  }
});




module.exports = router;