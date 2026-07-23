const express = require("express");

const router = express.Router();
const pool = require("../../config/db");






router.get("/audit-points", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ap.AuditPointID,
        ap.AuditComment,
        ap.SubPointCriteria,
        ap.Weightage,
        ap.RiskMatrix,

        mc.MajorCriteriaID,
        mc.MajorCriteriaName

      FROM AuditPoints ap

      LEFT JOIN MajorCriteria mc
        ON ap.MajorCriteriaID = mc.MajorCriteriaID

      ORDER BY ap.AuditPointID;
    `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal server error"
    });
  }
});





router.post("/audit-point", async (req, res) => {

    const {
        MajorCriteriaID,
        auditComment,
        subPointCriteria,
        weightage,
        riskMatrix
    } = req.body;
    try {
        const result = await pool.query(` INSERT INTO AuditPoints
            (
                MajorCriteriaID,
                auditComment,
                subPointCriteria,
                weightage,
                riskMatrix
            )
            VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
                MajorCriteriaID,
                auditComment,
                subPointCriteria,
                weightage,
                riskMatrix
            ]
        );

        res.status(201).json(result.rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: error.message
        });
    }
});


module.exports = router;    