const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

 router.get("/OpsManagers", verifyToken, async (req, res) => {
   try {
     const includeInactive = req.query.includeInactive === "true";
     const query = includeInactive
       ? "SELECT * FROM OpsManagers ORDER BY OpsManagerID"
       : "SELECT * FROM OpsManagers WHERE IsActive = TRUE ORDER BY OpsManagerID";
     const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});


router.post("/OpsManagers", verifyToken, isAdmin, async (req, res) => {
  const { OracleID, OpsManagerName } = req.body;
  try {
    const result = await pool.query(
     `INSERT INTO OpsManagers (OracleID, OpsManagerName, IsActive) VALUES ($1, $2, TRUE) RETURNING *`,
      [OracleID, OpsManagerName]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

router.delete("/OpsManagers/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
       "UPDATE OpsManagers SET IsActive = FALSE WHERE opsmanagerid = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ops Manager not found" });
    }
    res.status(200).json({
      message: "Ops Manager archived successfully",
      OpsManagers: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

router.put("/OpsManagers/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { OracleID, OpsManagerName } = req.body;
  try {
    const result = await pool.query(
      `UPDATE OpsManagers SET OracleID = $1, OpsManagerName = $2 WHERE opsmanagerid = $3 RETURNING *`,
      [OracleID, OpsManagerName, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ops Manager not found" });
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


router.patch("/OpsManagers/:id/restore", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "UPDATE OpsManagers SET IsActive = TRUE WHERE opsmanagerid = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ops Manager not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;