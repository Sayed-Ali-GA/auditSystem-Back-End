const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

// GET — active by default; ?includeInactive=true shows archived too
router.get("/brands", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const query = includeInactive
      ? "SELECT * FROM Brands ORDER BY BrandID"
      : "SELECT * FROM Brands WHERE IsActive = TRUE ORDER BY BrandID";

    const result = await pool.query(query);
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
      "INSERT INTO Brands (BrandName, IsActive) VALUES ($1, TRUE) RETURNING *",
      [BrandName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SOFT DELETE — archives instead of physically removing
router.delete("/brands/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE Brands SET IsActive = FALSE WHERE BrandID = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Brand not found" });
    }

    res.status(200).json({
      message: "Brand archived successfully",
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

// RESTORE — bring an archived brand back
router.patch("/brands/:id/restore", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE Brands SET IsActive = TRUE WHERE BrandID = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Brand not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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