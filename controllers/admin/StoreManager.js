const express = require("express");

const router = express.Router();
const pool = require("../../config/db");



router.get("/StoreManagers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        sm.StoreManagerID,
        sm.StoreManagerName,
        sm.OracleID,
        b.BrandID,
        b.BrandName,
        l.LocationID,
        l.LocationName
      FROM StoreManagers sm
      LEFT JOIN Brands b
        ON sm.BrandID = b.BrandID
      LEFT JOIN Locations l
        ON sm.LocationID = l.LocationID
      ORDER BY sm.StoreManagerID;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});





router.post("/StoreManagers", async (req, res) => {
  const { StoreManagerName, OracleID, BrandID, LocationID } = req.body;

  try {

    const insert = await pool.query(
      `
      INSERT INTO StoreManagers
      (
        StoreManagerName,
        oracleid,
        BrandID,
        LocationID
      )
      VALUES ($1,$2,$3,$4)
      RETURNING StoreManagerID
      `,
      [
        StoreManagerName,
        OracleID,
        BrandID,
        LocationID
      ]
    );


    const result = await pool.query(
      `
      SELECT
        sm.StoreManagerID,
        sm.StoreManagerName,
        sm.OracleID,
        b.BrandID,
        b.BrandName,
        l.LocationID,
        l.LocationName

      FROM StoreManagers sm

      LEFT JOIN Brands b
      ON sm.BrandID = b.BrandID

      LEFT JOIN Locations l
      ON sm.LocationID = l.LocationID

      WHERE sm.StoreManagerID = $1
      `,
      [
        insert.rows[0].storemanagerid
      ]
    );


    res.status(201).json(result.rows[0]);


  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }
});



router.delete("/StoreManagers/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM StoreManagers WHERE storemanagerid = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Store Manager not found" });
    }

    res.status(200).json({
      message: "Store Manager deleted successfully",
      LocationName: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Something went wrong",
      details: err.message,
    });
  }
});



module.exports = router;