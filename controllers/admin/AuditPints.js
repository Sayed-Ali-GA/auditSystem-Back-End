const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");

// =====================================================
// GET ALL AUDIT POINTS
// Default: Active only
// includeInactive=true: Active + Archived
// =====================================================
router.get("/audit-points", verifyToken, async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";

    const result = await pool.query(`
      SELECT
        ap.AuditPointID,
        ap.AuditComment,
        ap.SubPointCriteria,
        ap.Weightage,
        ap.RiskMatrix,
        ap.IsActive,

        mc.MajorCriteriaID,
        mc.MajorCriteriaName

      FROM AuditPoints ap

      LEFT JOIN MajorCriteria mc
        ON ap.MajorCriteriaID = mc.MajorCriteriaID

      ${includeInactive ? "" : "WHERE ap.IsActive = TRUE"}

      ORDER BY ap.AuditPointID;
    `);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("GET AUDIT POINTS ERROR:", error);

    res.status(500).json({
      message: "Internal server error",
    });
  }
});

// =====================================================
// CREATE AUDIT POINT
// New audit points are Active by default
// =====================================================
router.post("/audit-point", verifyToken, async (req, res) => {
  const {
    MajorCriteriaID,
    auditComment,
    subPointCriteria,
    weightage,
    riskMatrix,
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO AuditPoints
      (
        MajorCriteriaID,
        AuditComment,
        SubPointCriteria,
        Weightage,
        RiskMatrix,
        IsActive
      )
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING
        AuditPointID,
        AuditComment,
        SubPointCriteria,
        Weightage,
        RiskMatrix,
        IsActive,
        MajorCriteriaID
      `,
      [MajorCriteriaID, auditComment, subPointCriteria, weightage, riskMatrix],
    );

    // Fetch complete object including Criteria name
    const auditPoint = await pool.query(
      `
      SELECT
        ap.AuditPointID,
        ap.AuditComment,
        ap.SubPointCriteria,
        ap.Weightage,
        ap.RiskMatrix,
        ap.IsActive,

        mc.MajorCriteriaID,
        mc.MajorCriteriaName

      FROM AuditPoints ap

      LEFT JOIN MajorCriteria mc
        ON ap.MajorCriteriaID = mc.MajorCriteriaID

      WHERE ap.AuditPointID = $1
      `,
      [result.rows[0].auditpointid],
    );

    res.status(201).json(auditPoint.rows[0]);
  } catch (error) {
    console.error("CREATE AUDIT POINT ERROR:", error);

    res.status(500).json({
      message: error.message,
    });
  }
});

// HARD DELETE — blocked if any audit already scored this point.
router.delete("/audit-points/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM AuditPoints WHERE AuditPointID = $1 RETURNING AuditPointID",
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Audit Point not found" });
    }

    res.status(200).json({
      message: "Audit Point deleted permanently",
      auditPoint: result.rows[0],
    });
  } catch (error) {
    console.error("DELETE AUDIT POINT ERROR:", error);

    if (error.code === "23503") {
      return res.status(409).json({
        error:
          "Cannot delete this audit point — it has already been used in one or more submitted audits. Historical audits need it to stay intact.",
      });
    }

    res.status(500).json({ error: "Something went wrong", details: error.message });
  }
});

// =====================================================
// UPDATE AUDIT POINT
// =====================================================
router.put("/audit-points/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  const {
    MajorCriteriaID,
    auditComment,
    subPointCriteria,
    weightage,
    riskMatrix,
  } = req.body;

  try {
    const update = await pool.query(
      `
        UPDATE AuditPoints

        SET
          MajorCriteriaID = $1,
          AuditComment = $2,
          SubPointCriteria = $3,
          Weightage = $4,
          RiskMatrix = $5

        WHERE AuditPointID = $6

        RETURNING AuditPointID
        `,
      [
        MajorCriteriaID,
        auditComment,
        subPointCriteria,
        weightage,
        riskMatrix,
        id,
      ],
    );

    if (update.rowCount === 0) {
      return res.status(404).json({
        error: "Audit Point not found",
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
          ap.IsActive,

          mc.MajorCriteriaID,
          mc.MajorCriteriaName

        FROM AuditPoints ap

        LEFT JOIN MajorCriteria mc
          ON ap.MajorCriteriaID = mc.MajorCriteriaID

        WHERE ap.AuditPointID = $1
        `,
      [id],
    );

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("UPDATE AUDIT POINT ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});




module.exports = router;
