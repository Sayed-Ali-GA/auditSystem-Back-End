const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

router.get("/MajorCriteria", verifyToken, async (req, res) => {
  try {
     const includeInactive = req.query.includeInactive === "true";
     const query = includeInactive
     ? "SELECT * FROM MajorCriteria ORDER BY MajorCriteriaID"
     : "SELECT * FROM MajorCriteria WHERE IsActive = TRUE ORDER BY MajorCriteriaID";
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});



router.post("/MajorCriteria", verifyToken, isAdmin, async (req, res) => {
  const { majorcriterianame } = req.body;
  try {
    const result = await pool.query(
     `INSERT INTO MajorCriteria (MajorCriteriaName, IsActive) VALUES ($1, TRUE) RETURNING *`,
      [majorcriterianame]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/MajorCriteria/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
     "UPDATE MajorCriteria SET IsActive = FALSE WHERE MajorCriteriaID = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Criteria not found" });
    }
    res.status(200).json({
      message: "Criteria archived successfully",
      criteria: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

router.put("/MajorCriteria/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { majorcriterianame } = req.body;
  try {
    const result = await pool.query(
      `UPDATE MajorCriteria SET MajorCriteriaName = $1 WHERE MajorCriteriaID = $2 RETURNING *`,
      [majorcriterianame, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Criteria not found" });
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



router.patch("/MajorCriteria/:id/restore", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE MajorCriteria SET IsActive = TRUE WHERE MajorCriteriaID = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Criteria not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;