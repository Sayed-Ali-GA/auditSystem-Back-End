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





router.delete("/audit-points/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM AuditPoints WHERE auditpointid = $1 RETURNING *",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Audit Point not found" });
    }

    res.status(200).json({
      message: "Audit Point deleted successfully",
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



router.put("/audit-points/:id", async (req, res) => {

  const { id } = req.params;

  const {
    MajorCriteriaID,
    auditComment,
    subPointCriteria,
    weightage,
    riskMatrix
  } = req.body;


  try {

    const update = await pool.query(
      `
      UPDATE AuditPoints

      SET
        MajorCriteriaID = $1,
        auditComment = $2,
        subPointCriteria = $3,
        weightage = $4,
        riskMatrix = $5

      WHERE AuditPointID = $6

      RETURNING AuditPointID;
      `,
      [
        MajorCriteriaID,
        auditComment,
        subPointCriteria,
        weightage,
        riskMatrix,
        id
      ]
    );


    if(update.rowCount === 0){
      return res.status(404).json({
        error:"Audit Point not found"
      });
    }



    const result = await pool.query(
      `
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


      WHERE ap.AuditPointID = $1

      `,
      [
        id
      ]
    );


    res.status(200).json(result.rows[0]);


  } catch(err){

    console.error(err);

    res.status(500).json({
      error:err.message
    });

  }

});


module.exports = router;    