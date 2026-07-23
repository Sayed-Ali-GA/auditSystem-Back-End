const express = require("express");

const router = express.Router();
const pool = require("../../config/db");



router.get("/Stores", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.StoreSerial,
        s.StoreCode,

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

      ORDER BY s.StoreSerial;
    `);

    res.status(200).json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});





router.post("/Stores", async (req, res) => {

  const {
    StoreCode,
    BrandID,
    LocationID,
    OpsManagerID,
    StoreManagerID
  } = req.body;


  try {

    const result = await pool.query(
      `
      INSERT INTO Stores
      (
        StoreCode,
        BrandID,
        LocationID,
        OpsManagerID,
        StoreManagerID
      )

      VALUES ($1, $2, $3, $4, $5)

      RETURNING StoreSerial
      `,
      [
        StoreCode,
        BrandID,
        LocationID,
        OpsManagerID,
        StoreManagerID
      ]
    );


    const newStore = await pool.query(
      `
      SELECT
        s.StoreSerial,
        s.StoreCode,

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
      [
        result.rows[0].storeserial
      ]
    );


    res.status(201).json(newStore.rows[0]);


  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});






module.exports = router;