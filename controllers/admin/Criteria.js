const express = require("express");

const router = express.Router();
const pool = require("../../config/db");




router.get("/MajorCriteria", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM MajorCriteria");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});     



router.post("/Add-MajorCriteria", async (req, res) => {
  const {  MajorCriteriaName } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO MajorCriteria (MajorCriteriaName) VALUES ($1) RETURNING *",
      [ MajorCriteriaName]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong",error: err.message});
  }
}); 


module.exports = router;
