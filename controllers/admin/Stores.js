const express = require("express");
const router = express.Router();
const pool = require("../../config/db");

const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

const STORE_SELECT = `
      SELECT
        s.StoreSerial,
        s.StoreCode,
        s.Email,
        s.IsActive AS IsActive,

        b.BrandID,
        b.BrandName,

        l.LocationID,
        l.LocationName,

        o.OpsManagerID,
        o.OpsManagerName,

        sm.StoreManagerID,
        sm.StoreManagerName

      FROM Stores s

      LEFT JOIN Brands b
        ON s.BrandID = b.BrandID

      LEFT JOIN Locations l
        ON s.LocationID = l.LocationID

      LEFT JOIN OpsManagers o
        ON s.OpsManagerID = o.OpsManagerID

      LEFT JOIN StoreManagers sm
        ON s.StoreManagerID = sm.StoreManagerID
`;

// =====================================================
// GET ALL STORES
// =====================================================
router.get("/Stores", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const result = await pool.query(
      `
      ${STORE_SELECT}
      ${includeInactive ? "" : "WHERE s.IsActive = TRUE"}
      ORDER BY s.StoreSerial;
      `,
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("GET /Stores error:", err);

    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

// =====================================================
// CREATE STORE
// =====================================================
router.post("/Stores", verifyToken, isAdmin, async (req, res) => {
  const {
    StoreCode,
    Email,
    BrandID,
    LocationID,
    OpsManagerID,
    StoreManagerID,
  } = req.body;

  try {
    const result = await pool.query(
      `
        INSERT INTO Stores (
          StoreCode,
          Email,
          BrandID,
          LocationID,
          OpsManagerID,
          StoreManagerID,
          IsActive
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)

        RETURNING StoreSerial
        `,
      [
        StoreCode,
        Email || null,
        BrandID,
        LocationID,
        OpsManagerID,
        StoreManagerID,
      ],
    );

    const storeSerial = result.rows[0].storeserial;

    const newStore = await pool.query(
      `${STORE_SELECT} WHERE s.StoreSerial = $1`,
      [storeSerial],
    );

    res.status(201).json(newStore.rows[0]);
  } catch (err) {
    console.error("POST /Stores error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});



// HARD DELETE — blocked if the store has any audits (draft or otherwise).
router.delete("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM Stores WHERE StoreSerial = $1
       RETURNING StoreSerial, StoreCode`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    res.status(200).json({
      message: "Store deleted permanently",
      store: result.rows[0],
    });
  } catch (err) {
    console.error("DELETE /Stores/:id error:", err);

    if (err.code === "23503") {
      return res.status(409).json({
        error:
          "Cannot delete this store — it still has audits on record. Delete those audits first if you really want to remove the store.",
      });
    }

    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});
// =====================================================
// UPDATE STORE
// =====================================================
router.put("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  const {
    StoreCode,
    Email,
    BrandID,
    LocationID,
    OpsManagerID,
    StoreManagerID,
  } = req.body;

  try {
    const updateResult = await pool.query(
      `
        UPDATE Stores
        SET
          StoreCode = $1,
          Email = $2,
          BrandID = $3,
          LocationID = $4,
          OpsManagerID = $5,
          StoreManagerID = $6
        WHERE StoreSerial = $7
        RETURNING StoreSerial
        `,
      [
        StoreCode,
        Email || null,
        BrandID,
        LocationID,
        OpsManagerID,
        StoreManagerID,
        id,
      ],
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        error: "Store not found",
      });
    }

    const updatedStore = await pool.query(
      `${STORE_SELECT} WHERE s.StoreSerial = $1`,
      [id],
    );

    res.status(200).json(updatedStore.rows[0]);
  } catch (err) {
    console.error("PUT /Stores/:id error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});



module.exports = router;