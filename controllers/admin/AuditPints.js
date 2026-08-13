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

// =====================================================
// ARCHIVE AUDIT POINT
// Soft delete
// IsActive = FALSE
// =====================================================
router.delete("/audit-points/:id", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        UPDATE AuditPoints
        SET IsActive = FALSE
        WHERE AuditPointID = $1
        RETURNING
          AuditPointID,
          IsActive
        `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Audit Point not found",
      });
    }

    res.status(200).json({
      message: "Audit Point archived successfully",
      auditPoint: result.rows[0],
    });
  } catch (error) {
    console.error("ARCHIVE AUDIT POINT ERROR:", error);

    res.status(500).json({
      error: "Something went wrong",
      details: error.message,
    });
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

// =====================================================
// RESTORE AUDIT POINT
// IsActive = TRUE
// =====================================================
router.patch("/audit-points/:id/restore", verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `
        UPDATE AuditPoints

        SET IsActive = TRUE

        WHERE AuditPointID = $1

        RETURNING
          AuditPointID,
          IsActive
        `,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Audit Point not found",
      });
    }

    // Return complete audit point
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
      [id],
    );

    res.status(200).json(auditPoint.rows[0]);
  } catch (error) {
    console.error("RESTORE AUDIT POINT ERROR:", error);

    res.status(500).json({
      error: error.message,
    });
  }
});

module.exports = router;
