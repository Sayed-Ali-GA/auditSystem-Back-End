const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

router.get("/brands", verifyToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Brands");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

router.post("/brands", verifyToken, isAdmin, async (req, res) => {
  const { BrandName } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO Brands (BrandName) VALUES ($1) RETURNING *",
      [BrandName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/brands/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM Brands WHERE BrandID = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Brand not found" });
    }
    res.status(200).json({
      message: "Brand deleted successfully",
      brand: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

router.put("/brands/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { BrandName } = req.body;
  try {
    const result = await pool.query(
      "UPDATE Brands SET BrandName = $1 WHERE BrandID = $2 RETURNING *",
      [BrandName, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Brand not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

module.exports = router;