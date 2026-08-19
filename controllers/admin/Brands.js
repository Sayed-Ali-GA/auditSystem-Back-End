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





// HARD DELETE — permanently removes the brand.
// Blocked if it's still referenced by a Store Manager or a Store.
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
      message: "Brand deleted permanently",
      brand: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23503") {
      return res.status(409).json({
        error:
          "Cannot delete this brand — it's still linked to one or more stores or store managers. Reassign or remove those first.",
      });
    }

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