const express = require("express");
const router = express.Router();

const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

// =====================================================
// GET ALL STORE MANAGERS
// =====================================================
router.get("/StoreManagers", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const result = await pool.query(
      `
      SELECT
        sm.StoreManagerID AS storemanagerid,
        sm.StoreManagerName AS storemanagername,
        sm.OracleID AS oracleid,

        sm.IsActive AS isactive,

        b.BrandID AS brandid,
        b.BrandName AS brandname,

        l.LocationID AS locationid,
        l.LocationName AS locationname

      FROM StoreManagers sm

      LEFT JOIN Brands b
        ON sm.BrandID = b.BrandID

      LEFT JOIN Locations l
        ON sm.LocationID = l.LocationID

      ${includeInactive ? "" : "WHERE sm.IsActive = TRUE"}

      ORDER BY sm.StoreManagerID;
      `,
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("GET /StoreManagers error:", err);

    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

// =====================================================
// CREATE STORE MANAGER
// =====================================================
router.post("/StoreManagers", verifyToken, isAdmin, async (req, res) => {
  const { StoreManagerName, OracleID, BrandID, LocationID } = req.body;

  try {
    if (!StoreManagerName || !OracleID || !BrandID || !LocationID) {
      return res.status(400).json({
        error:
          "StoreManagerName, OracleID, BrandID and LocationID are required",
      });
    }

    const insert = await pool.query(
      `
        INSERT INTO StoreManagers
        (
          StoreManagerName,
          OracleID,
          BrandID,
          LocationID,
          IsActive
        )
        VALUES ($1, $2, $3, $4, TRUE)

        RETURNING StoreManagerID;
        `,
      [StoreManagerName, OracleID, BrandID, LocationID],
    );

    const storeManagerID = insert.rows[0].storemanagerid;

    const result = await pool.query(
      `
        SELECT
          sm.StoreManagerID AS storemanagerid,
          sm.StoreManagerName AS storemanagername,
          sm.OracleID AS oracleid,

          sm.IsActive AS isactive,

          b.BrandID AS brandid,
          b.BrandName AS brandname,

          l.LocationID AS locationid,
          l.LocationName AS locationname

        FROM StoreManagers sm

        LEFT JOIN Brands b
          ON sm.BrandID = b.BrandID

        LEFT JOIN Locations l
          ON sm.LocationID = l.LocationID

        WHERE sm.StoreManagerID = $1;
        `,
      [storeManagerID],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /StoreManagers error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// =====================================================
// ARCHIVE STORE MANAGER
// =====================================================
router.delete("/StoreManagers/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        UPDATE StoreManagers
        SET IsActive = FALSE
        WHERE StoreManagerID = $1

        RETURNING
          StoreManagerID AS storemanagerid,
          StoreManagerName AS storemanagername,
          OracleID AS oracleid,
          BrandID AS brandid,
          LocationID AS locationid,
          IsActive AS isactive;
        `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Store Manager not found",
      });
    }

    res.status(200).json({
      message: "Store Manager archived successfully",

      storeManager: result.rows[0],
    });
  } catch (err) {
    console.error("DELETE /StoreManagers/:id error:", err);

    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});

// =====================================================
// UPDATE STORE MANAGER
// =====================================================
router.put("/StoreManagers/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  const { StoreManagerName, OracleID, BrandID, LocationID } = req.body;

  try {
    const updateResult = await pool.query(
      `
        UPDATE StoreManagers

        SET
          StoreManagerName = $1,
          OracleID = $2,
          BrandID = $3,
          LocationID = $4

        WHERE StoreManagerID = $5

        RETURNING StoreManagerID;
        `,
      [StoreManagerName, OracleID, BrandID, LocationID, id],
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        error: "Store Manager not found",
      });
    }

    const result = await pool.query(
      `
        SELECT
          sm.StoreManagerID AS storemanagerid,
          sm.StoreManagerName AS storemanagername,
          sm.OracleID AS oracleid,

          sm.IsActive AS isactive,

          b.BrandID AS brandid,
          b.BrandName AS brandname,

          l.LocationID AS locationid,
          l.LocationName AS locationname

        FROM StoreManagers sm

        LEFT JOIN Brands b
          ON sm.BrandID = b.BrandID

        LEFT JOIN Locations l
          ON sm.LocationID = l.LocationID

        WHERE sm.StoreManagerID = $1;
        `,
      [id],
    );

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("PUT /StoreManagers/:id error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// =====================================================
// RESTORE STORE MANAGER
// =====================================================
router.patch(
  "/StoreManagers/:id/restore",
  verifyToken,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const updateResult = await pool.query(
        `
        UPDATE StoreManagers

        SET IsActive = TRUE

        WHERE StoreManagerID = $1

        RETURNING StoreManagerID;
        `,
        [id],
      );

      if (updateResult.rowCount === 0) {
        return res.status(404).json({
          error: "Store Manager not found",
        });
      }

      const result = await pool.query(
        `
        SELECT
          sm.StoreManagerID AS storemanagerid,
          sm.StoreManagerName AS storemanagername,
          sm.OracleID AS oracleid,

          sm.IsActive AS isactive,

          b.BrandID AS brandid,
          b.BrandName AS brandname,

          l.LocationID AS locationid,
          l.LocationName AS locationname

        FROM StoreManagers sm

        LEFT JOIN Brands b
          ON sm.BrandID = b.BrandID

        LEFT JOIN Locations l
          ON sm.LocationID = l.LocationID

        WHERE sm.StoreManagerID = $1;
        `,
        [id],
      );

      res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error("PATCH /StoreManagers/:id/restore error:", err);

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

module.exports = router;
