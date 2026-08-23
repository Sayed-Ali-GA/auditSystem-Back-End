// controllers/admin/Stores.js
const express = require("express");
const bcrypt = require("bcrypt");
const router = express.Router();
const pool = require("../../config/db");

const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

const STORE_SELECT = `
      SELECT
        s.StoreSerial, s.StoreCode, s.Email, s.IsActive AS IsActive,
        (s.LoginPassword IS NOT NULL) AS HasLogin,
        b.BrandID, b.BrandName,
        l.LocationID, l.LocationName,
        o.OpsManagerID, o.OpsManagerName,
        sm.StoreManagerID, sm.StoreManagerName
      FROM Stores s
      LEFT JOIN Brands b ON s.BrandID = b.BrandID
      LEFT JOIN Locations l ON s.LocationID = l.LocationID
      LEFT JOIN OpsManagers o ON s.OpsManagerID = o.OpsManagerID
      LEFT JOIN StoreManagers sm ON s.StoreManagerID = sm.StoreManagerID
`;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseStorePayload(body) {
  const errors = [];

  const StoreCode = (body.StoreCode || "").trim();
  const Email = (body.Email || "").trim();
  const BrandID = body.BrandID || null;
  const LocationID = body.LocationID || null;
  const OpsManagerID = body.OpsManagerID || null;
  const StoreManagerID = body.StoreManagerID || null;
  const LoginPassword = body.LoginPassword ? String(body.LoginPassword) : "";

  if (!StoreCode) {
    errors.push("Store code is required.");
  }

  if (Email && !EMAIL_RE.test(Email)) {
    errors.push("Please provide a valid email address.");
  }

  if (LoginPassword && LoginPassword.length < 4) {
    errors.push("Login password must be at least 4 characters.");
  }

  return {
    errors,
    values: {
      StoreCode,
      Email: Email || null,
      BrandID,
      LocationID,
      OpsManagerID,
      StoreManagerID,
      LoginPassword,
    },
  };
}

router.get("/Stores", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const result = await pool.query(`
      ${STORE_SELECT}
      ${includeInactive ? "" : "WHERE s.IsActive = TRUE"}
      ORDER BY s.StoreSerial;
    `);

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("GET /Stores error:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

router.post("/Stores", verifyToken, isAdmin, async (req, res) => {
  const { errors, values } = parseStorePayload(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const { StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, LoginPassword } = values;

  try {
    const hashedLoginPassword = LoginPassword ? await bcrypt.hash(LoginPassword, 10) : null;

    const result = await pool.query(
      `INSERT INTO Stores (
         StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, LoginPassword, IsActive
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING StoreSerial`,
      [StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, hashedLoginPassword]
    );

    const storeSerial = result.rows[0].storeserial;

    const newStore = await pool.query(`${STORE_SELECT} WHERE s.StoreSerial = $1`, [storeSerial]);

    res.status(201).json(newStore.rows[0]);
  } catch (err) {
    console.error("POST /Stores error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "A store with this code already exists." });
    }

    res.status(500).json({ error: err.message });
  }
});

router.delete("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM Stores WHERE StoreSerial = $1 RETURNING StoreSerial, StoreCode`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    res.status(200).json({ message: "Store deleted permanently", store: result.rows[0] });
  } catch (err) {
    console.error("DELETE /Stores/:id error:", err);

    if (err.code === "23503") {
      return res.status(409).json({
        error: "Cannot delete this store — it still has audits on record. Delete those audits first if you really want to remove the store.",
      });
    }

    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

router.put("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { errors, values } = parseStorePayload(req.body);

  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  const { StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, LoginPassword } = values;

  try {
    const before = await pool.query(
      `SELECT BrandID FROM Stores WHERE StoreSerial = $1`,
      [id]
    );

    if (before.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const previousBrandID = before.rows[0].brandid;

    let updateResult;

    if (LoginPassword) {
      const hashedLoginPassword = await bcrypt.hash(LoginPassword, 10);

      updateResult = await pool.query(
        `UPDATE Stores
         SET StoreCode = $1, Email = $2, BrandID = $3, LocationID = $4,
             OpsManagerID = $5, StoreManagerID = $6, LoginPassword = $7
         WHERE StoreSerial = $8
         RETURNING StoreSerial`,
        [StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, hashedLoginPassword, id]
      );
    } else {
      updateResult = await pool.query(
        `UPDATE Stores
         SET StoreCode = $1, Email = $2, BrandID = $3, LocationID = $4,
             OpsManagerID = $5, StoreManagerID = $6
         WHERE StoreSerial = $7
         RETURNING StoreSerial`,
        [StoreCode, Email, BrandID, LocationID, OpsManagerID, StoreManagerID, id]
      );
    }

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const updatedStore = await pool.query(`${STORE_SELECT} WHERE s.StoreSerial = $1`, [id]);
    const store = updatedStore.rows[0];

    if (
      BrandID &&
      previousBrandID !== null &&
      previousBrandID !== undefined &&
      Number(BrandID) !== Number(previousBrandID)
    ) {
      await pool.query(
        `INSERT INTO Notifications (StoreSerial, Message, Type)
         VALUES ($1, $2, 'info')`,
        [id, `Your store's brand has been changed to "${store.brandname}".`]
      );
    }

    res.status(200).json(store);
  } catch (err) {
    console.error("PUT /Stores/:id error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "A store with this code already exists." });
    }

    res.status(500).json({ error: err.message });
  }
});

module.exports = router;