const express = require("express");
const router = express.Router();
const pool = require("../../config/db");

const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

// =====================================================
// GET ALL STORES
// =====================================================
// Default:
//      GET /Stores
//      -> Active stores only
//
// Archived:
//      GET /Stores?includeInactive=true
//      -> Active + Archived
// =====================================================
router.get("/Stores", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const result = await pool.query(
      `
      SELECT
        s.StoreSerial,
        s.StoreCode,
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
  const { StoreCode, BrandID, LocationID, OpsManagerID, StoreManagerID } =
    req.body;

  try {
    const result = await pool.query(
      `
        INSERT INTO Stores (
          StoreCode,
          BrandID,
          LocationID,
          OpsManagerID,
          StoreManagerID,
          IsActive
        )
        VALUES ($1, $2, $3, $4, $5, TRUE)

        RETURNING StoreSerial
        `,
      [StoreCode, BrandID, LocationID, OpsManagerID, StoreManagerID],
    );

    const storeSerial = result.rows[0].storeserial;

    const newStore = await pool.query(
      `
        SELECT
          s.StoreSerial,
          s.StoreCode,
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

        WHERE s.StoreSerial = $1
        `,
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

// =====================================================
// ARCHIVE STORE
// =====================================================
// This DOES NOT delete the store.
// It only sets IsActive = FALSE.
//
// This is important because Audits may reference this
// store and must remain for historical records.
// =====================================================
router.delete("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        UPDATE Stores

        SET IsActive = FALSE

        WHERE StoreSerial = $1

        RETURNING StoreSerial, StoreCode, IsActive
        `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Store not found",
      });
    }

    res.status(200).json({
      message: "Store archived successfully",
      store: result.rows[0],
    });
  } catch (err) {
    console.error("DELETE /Stores/:id error:", err);

    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

// =====================================================
// UPDATE STORE
// =====================================================
router.put("/Stores/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  const { StoreCode, BrandID, LocationID, OpsManagerID, StoreManagerID } =
    req.body;

  try {
    const updateResult = await pool.query(
      `
        UPDATE Stores

        SET
          StoreCode = $1,
          BrandID = $2,
          LocationID = $3,
          OpsManagerID = $4,
          StoreManagerID = $5

        WHERE StoreSerial = $6

        RETURNING StoreSerial
        `,
      [StoreCode, BrandID, LocationID, OpsManagerID, StoreManagerID, id],
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        error: "Store not found",
      });
    }

    const updatedStore = await pool.query(
      `
          SELECT
            s.StoreSerial,
            s.StoreCode,
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

          WHERE s.StoreSerial = $1
          `,
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

// =====================================================
// RESTORE STORE
// =====================================================
// Sets IsActive = TRUE
// =====================================================
router.patch("/Stores/:id/restore", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const updateResult = await pool.query(
      `
        UPDATE Stores

        SET IsActive = TRUE

        WHERE StoreSerial = $1

        RETURNING StoreSerial
        `,
      [id],
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        error: "Store not found",
      });
    }

    // Return the same complete structure
    // used by GET /Stores
    const restoredStore = await pool.query(
      `
          SELECT
            s.StoreSerial,
            s.StoreCode,
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

          WHERE s.StoreSerial = $1
          `,
      [id],
    );

    res.status(200).json(restoredStore.rows[0]);
  } catch (err) {
    console.error("PATCH /Stores/:id/restore error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
