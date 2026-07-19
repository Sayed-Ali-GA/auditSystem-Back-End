const express = require("express");

const router = express.Router();
const pool = require("../../config/db");


router.get("/OpsManagers", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM OpsManagers");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
}); 



router.post("/Add-OpsManager", async (req, res) => {
  const { OpsManagerName } = req.body;
  const { OracleID } = req.body;
  try {
    const result = await pool.query(
        `INSERT INTO OpsManagers (OpsManagerName, OracleID) VALUES ($1, $2) RETURNING *`,
      [OpsManagerName, OracleID]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong",error: err.message});
  }         
});


module.exports = router;