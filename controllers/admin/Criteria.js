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



router.post("/MajorCriteria", async (req, res) => {

  const { majorcriterianame } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO MajorCriteria (MajorCriteriaName)
      VALUES ($1)
      RETURNING *
      `,
      [majorcriterianame]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message
    });
  }
});



router.delete("/MajorCriteria/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM MajorCriteria WHERE MajorCriteriaID = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Criteria not found" });
    }

    res.status(200).json({
      message: "Criteria deleted successfully",
      criteria: result.rows[0],
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
