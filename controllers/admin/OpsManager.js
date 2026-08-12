const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

router.get("/OpsManagers", verifyToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM OpsManagers");
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
      `INSERT INTO OpsManagers (OracleID, OpsManagerName) VALUES ($1, $2) RETURNING *`,
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
      "DELETE FROM OpsManagers WHERE opsmanagerid = $1 RETURNING *",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Ops Manager not found" });
    }
    res.status(200).json({
      message: "Ops Manager deleted successfully",
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

module.exports = router;