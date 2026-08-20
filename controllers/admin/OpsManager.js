const express = require("express");
const bcrypt = require("bcrypt");
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

// =====================================================
// CREATE OPS MANAGER — with optional login account
// =====================================================
router.post("/OpsManagers", verifyToken, isAdmin, async (req, res) => {
  const {
    OracleID,
    OpsManagerName,
    CreateLogin,   // boolean
    Email,
    Password,
    LocationID,
  } = req.body;

  if (!OracleID || !OpsManagerName) {
    return res.status(400).json({ message: "Oracle ID and name are required." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const opsManagerResult = await client.query(
      `INSERT INTO OpsManagers (OracleID, OpsManagerName, IsActive)
       VALUES ($1, $2, TRUE) RETURNING *`,
      [OracleID, OpsManagerName]
    );

    let loginAccount = null;

    if (CreateLogin) {
      if (!Password || !LocationID) {
        throw Object.assign(
          new Error("Password and Location are required to create a login account."),
          { status: 400 }
        );
      }

      const existing = await client.query(
        "SELECT UserID FROM Users WHERE OracleID = $1",
        [OracleID]
      );

      if (existing.rows.length > 0) {
        throw Object.assign(
          new Error("A login account already exists for this Oracle ID."),
          { status: 409 }
        );
      }

      const hashedPassword = await bcrypt.hash(String(Password), 10);

      const userResult = await client.query(
        `INSERT INTO Users (OracleID, UserName, Password, LocationID, RoleID, Email)
         VALUES ($1, $2, $3, $4, 2, $5)
         RETURNING UserID, OracleID, UserName, LocationID, RoleID, Email`,
        [OracleID, OpsManagerName, hashedPassword, LocationID, Email || null]
      );

      loginAccount = userResult.rows[0];
    }

    await client.query("COMMIT");

    res.status(201).json({
      ...opsManagerResult.rows[0],
      loginAccount,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res
      .status(error.status || 500)
      .json({ message: error.message || "Server error." });
  } finally {
    client.release();
  }
});

// HARD DELETE — blocked if still linked to a store or an audit.
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
      message: "Ops Manager deleted permanently",
      OpsManagers: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    if (err.code === "23503") {
      return res.status(409).json({
        error:
          "Cannot delete this Ops Manager — they're still linked to one or more stores or audits. Reassign those first.",
      });
    }
    res.status(500).json({ error: "Something went wrong", details: err.message });
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
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

module.exports = router;