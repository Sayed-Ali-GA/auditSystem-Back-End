const express = require("express");

const router = express.Router();
const pool = require("../../config/db");


router.get("/Location", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM Locations");                  
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }         
});     


router.post("/Add-Location", async (req, res) => {
  const { LocationName } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO Locations (LocationName) VALUES ($1) RETURNING *",
      [LocationName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong",error: err.message});
  }
}); 











module.exports = router;