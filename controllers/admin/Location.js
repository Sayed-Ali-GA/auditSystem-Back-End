const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");



 router.get("/Location", verifyToken, async (req, res) => {
   try {
     const includeInactive = req.query.includeInactive === "true";
     const query = includeInactive
       ? "SELECT * FROM Locations ORDER BY LocationID"
       : "SELECT * FROM Locations WHERE IsActive = TRUE ORDER BY LocationID";
     const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});



router.post("/Location", verifyToken, isAdmin, async (req, res) => {
  const { LocationName } = req.body;
  try {
    const result = await pool.query(
       "INSERT INTO Locations (LocationName, IsActive) VALUES ($1, TRUE) RETURNING *",
      [LocationName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// HARD DELETE — blocked if a store, store manager, or user still uses it.
router.delete("/Location/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM Locations WHERE locationid = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.status(200).json({
      message: "Location deleted permanently",
      LocationName: result.rows[0],
    });
  } catch (err) {
    console.error(err);

    if (err.code === "23503") {
      return res.status(409).json({
        error:
          "Cannot delete this location — it's still linked to a store, store manager, or user. Reassign or remove those first.",
      });
    }

    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});




router.put("/Location/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { LocationName } = req.body;
  try {
    const result = await pool.query(
      "UPDATE Locations SET LocationName = $1 WHERE locationid = $2 RETURNING *",
      [LocationName, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Location not found" });
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