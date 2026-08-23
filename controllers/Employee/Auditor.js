const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");
const isAdmin = require("../../middleware/isAdmin");

const { sendMail } = require("../../config/mailer");
const { auditUpdateEmailHtml } = require("../../services/emailTemplates");
const { generateAuditPdfBuffer } = require("../../services/auditPdf");

const ROLES = {
  ADMIN: 1,
  OPS_MANAGER: 2,
  STORE_MANAGER: 3,
  AUDITOR: 4,
  AUDIT_MANAGER: 5,
};

// Reads whatever shape verify-token attaches the decoded JWT to
const getAuthUser = (req) => req.user || req.userData || req.decoded || {};

const RISK_THRESHOLDS = {
  LOW: 90,      // >= 90  => SATISFACTORY
  MODERATE: 70, // > 70 and < 90 => NEEDS IMPROVEMENT
};

const getRiskLevel = (finalPercentage) => {
  if (finalPercentage === null) return null;

  if (finalPercentage >= RISK_THRESHOLDS.LOW) {
    return "Low"; // SATISFACTORY
  }

  if (finalPercentage > RISK_THRESHOLDS.MODERATE) {
    return "Moderate"; // NEEDS IMPROVEMENT
  }

  return "High"; // <= 70 => UNSATISFACTORY
};

const computeAggregates = (auditPoints) => {
  const rated = auditPoints.filter(
    (p) => p.score !== null && p.score !== undefined,
  );

  const totalScore = rated.reduce((sum, p) => sum + Number(p.score), 0);

  const weightTotal = rated.reduce(
    (sum, p) => sum + Number(p.percentageWeightage ?? p.weightage ?? 0),
    0,
  );

  const weightedSum = rated.reduce(
    (sum, p) =>
      sum +
      Number(p.percentage) * Number(p.percentageWeightage ?? p.weightage ?? 0),
    0,
  );

  const finalPercentage =
    weightTotal > 0 ? Number((weightedSum / weightTotal).toFixed(2)) : null;

  return {
    totalScore: Number(totalScore.toFixed(2)),
    finalPercentage,
    riskLevel: getRiskLevel(finalPercentage),
  };
};

const createNotification = async (
  client,
  { userId = null, roleId = null, message, type = "info", assignmentId = null },
) => {
  await client.query(
    `
      INSERT INTO Notifications
        (UserID, RoleID, Message, Type, RelatedAssignmentID)
      VALUES ($1, $2, $3, $4, $5)
    `,
    [userId, roleId, message, type, assignmentId],
  );
};

// ======================================================
// EMAIL NOTIFICATIONS
// ======================================================

// Resolves the email(s) of whoever should be notified next —
// either one specific user (userId) or everyone active in a role (roleId).
const getEmailRecipients = async (client, { userId = null, roleId = null }) => {
  if (userId) {
    const r = await client.query(
      `
        SELECT UserName, Email
        FROM Users
        WHERE UserID = $1
          AND IsActive = TRUE
          AND Email IS NOT NULL
          AND Email <> ''
      `,
      [userId],
    );
    return r.rows;
  }

  if (roleId) {
    const r = await client.query(
      `
        SELECT UserName, Email
        FROM Users
        WHERE RoleID = $1
          AND IsActive = TRUE
          AND Email IS NOT NULL
          AND Email <> ''
      `,
      [roleId],
    );
    return r.rows;
  }

  return [];
};

// Re-fetches the full audit (with evaluations) so we can build the PDF.
const getFullAuditById = async (client, assignmentId) => {
  const result = await client.query(
    `
      ${AUDIT_SELECT_BASE}
      WHERE aa.AssignmentID = $1
      ${AUDIT_GROUP_BY}
    `,
    [assignmentId],
  );

  return result.rows[0] || null;
};

const sendAuditStatusEmail = async (
  client,
  { assignmentId, userId = null, roleId = null, statusLabel, extraMessage = "" },
) => {
  try {
    const audit = await getFullAuditById(client, assignmentId);

    if (!audit) {
      return;
    }

    const roleRecipients = await getEmailRecipients(client, { userId, roleId });

    const recipients = [...roleRecipients];

    if (audit.storeemail) {
      const alreadyIncluded = recipients.some(
        (r) => (r.email || "").toLowerCase() === audit.storeemail.toLowerCase(),
      );

      if (!alreadyIncluded) {
        recipients.push({
          username: audit.storecode || "Store",
          email: audit.storeemail,
        });
      }
    }

    if (recipients.length === 0) {
      return;
    }

    let pdfBuffer = null;

    try {
      pdfBuffer = await generateAuditPdfBuffer(audit);
    } catch (pdfError) {
      console.log("Audit PDF generation failed:", pdfError.message);
    }

    // ==============================
    // PDF FILE NAME
    // Store Code + Brand
    // ==============================

    const safeStoreCode = String(audit.storecode || "Unknown-Store")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const safeBrandName = String(audit.brandname || "Unknown-Brand")
      .replace(/[^a-zA-Z0-9_-]/g, "_");

    const pdfFileName = `${safeStoreCode}_${safeBrandName}.pdf`;

    const actionUrl = process.env.APP_BASE_URL
      ? `${process.env.APP_BASE_URL}/Audits/${assignmentId}`
      : null;

    await Promise.all(
      recipients.map((recipient) =>
        sendMail({
          to: recipient.email,

          subject: `Audit update — ${audit.storecode} (${statusLabel})`,

          html: auditUpdateEmailHtml({
            recipientName: recipient.username,
            storeCode: audit.storecode,
            brandName: audit.brandname,
            locationName: audit.locationname,
            statusLabel,
            extraMessage,
            finalPercentage: audit.finalpercentage,
            riskLevel: audit.risklevel,
            actionUrl,
          }),

          attachments: pdfBuffer
            ? [
                {
                  filename: pdfFileName,
                  content: pdfBuffer,
                },
              ]
            : [],
        }),
      ),
    );
  } catch (error) {
    console.log("sendAuditStatusEmail error:", error.message);
  }
};

// Resolves the User account tied to the Ops Manager
const getOpsManagerUserId = async (client, storeSerial) => {
  const result = await client.query(
    `
      SELECT u.UserID
      FROM Stores s
      JOIN OpsManagers om
        ON s.OpsManagerID = om.OpsManagerID
      JOIN Users u
        ON u.OracleID = om.OracleID
      WHERE s.StoreSerial = $1
    `,
    [storeSerial],
  );

  return result.rows[0]?.userid || null;
};

// Resolves the User account tied to the Store Manager
const getStoreManagerUserId = async (client, storeSerial) => {
  const result = await client.query(
    `
      SELECT u.UserID
      FROM Stores s
      JOIN StoreManagers sm
        ON s.StoreManagerID = sm.StoreManagerID
      JOIN Users u
        ON u.OracleID = sm.OracleID
      WHERE s.StoreSerial = $1
    `,
    [storeSerial],
  );

  return result.rows[0]?.userid || null;
};

// Checks whether user can access audit
const userCanAccessAudit = async (client, authUser, audit) => {
  const roleId = Number(authUser.RoleID);

  if (roleId === ROLES.ADMIN || roleId === ROLES.AUDIT_MANAGER) {
    return true;
  }

  if (roleId === ROLES.AUDITOR) {
    return Number(audit.auditorid) === Number(authUser.UserID);
  }

  if (roleId === ROLES.OPS_MANAGER) {
    const r = await client.query(
      `
        SELECT 1
        FROM Stores s
        JOIN OpsManagers om
          ON s.OpsManagerID = om.OpsManagerID
        WHERE
          s.StoreSerial = $1
          AND om.OracleID = $2

        UNION

        SELECT 1
        FROM AuditAssignments aa2
        JOIN OpsManagers om2
          ON aa2.OpsManagerID = om2.OpsManagerID
        WHERE
          aa2.AssignmentID = $3
          AND om2.OracleID = $2
      `,
      [audit.storeserial, authUser.OracleID, audit.assignmentid || null],
    );

    return r.rows.length > 0;
  }

  if (roleId === ROLES.STORE_MANAGER) {

    if (authUser.IsStoreAccount && authUser.StoreSerial) {
      return Number(audit.storeserial) === Number(authUser.StoreSerial);
    }

    // Brand-scoped: the store manager must be linked to this store's
    // StoreManagerID AND their StoreManagers row's BrandID must match
    // the store's BrandID. Kept as a single correlated subquery (rather
    // than two separate `WHERE OracleID = $N` lookups) so a manager
    // tied to multiple StoreManagers rows across different brands can't
    // match on brand alone — the same row must satisfy both conditions.
    const r = await client.query(
      `
        SELECT 1
        FROM Stores s
        JOIN StoreManagers sm
          ON s.StoreManagerID = sm.StoreManagerID
        WHERE
          s.StoreSerial = $1
          AND sm.OracleID = $2
          AND s.BrandID = sm.BrandID
      `,
      [audit.storeserial, authUser.OracleID],
    );

    return r.rows.length > 0;
  }

  return false;
};

const AUDIT_SELECT_BASE = `
  SELECT
    aa.AssignmentID,
    aa.AuditorID,
    aa.CashierName,
    aa.AuditDate,
    aa.Status,
    aa.TotalScore,
    aa.FinalPercentage,
    aa.RiskLevel,

    aa.ActionNote,
    aa.RejectionReason,
    aa.RevisionReason,
    aa.AuditManagerNote,
    aa.CashCount,

    aa.IsActive,

    s.StoreSerial,
    s.StoreCode,
    s.Email AS StoreEmail,

    b.BrandName,
    l.LocationName,

    om.OpsManagerName,
    smgr.StoreManagerName,

    u.UserName AS AuditorName,

    COALESCE(
      json_agg(
        json_build_object(
          'EvaluationID', ae.EvaluationID,
          'AuditPointID', ae.AuditPointID,
          'MajorCriteriaName', mcrit.MajorCriteriaName,
          'SubPointCriteria', apoint.SubPointCriteria,
          'AuditComment', apoint.AuditComment,
          'Weightage', apoint.Weightage,
          'Rating', ae.Rating,
          'Score', ae.Score,
          'Percentage', ae.WeightPercentage,
          'Observation', ae.AuditObservation,
          'ActionPlan', ae.ActionPlan,
          'TargetDate', ae.TargetDate,
          'Photos', ae.Photos
        )
        ORDER BY
          mcrit.MajorCriteriaID,
          apoint.AuditPointID
      )
      FILTER (
        WHERE ae.EvaluationID IS NOT NULL
      ),
      '[]'
    ) AS Evaluations

  FROM AuditAssignments aa

  JOIN Stores s
    ON aa.StoreSerial = s.StoreSerial

  JOIN Brands b
    ON s.BrandID = b.BrandID

  JOIN Locations l
    ON s.LocationID = l.LocationID

  JOIN OpsManagers om
    ON aa.OpsManagerID = om.OpsManagerID

  JOIN Users u
    ON aa.AuditorID = u.UserID

  LEFT JOIN StoreManagers smgr
    ON s.StoreManagerID = smgr.StoreManagerID

  LEFT JOIN AuditEvaluations ae
    ON aa.AssignmentID = ae.AssignmentID

  LEFT JOIN AuditPoints apoint
    ON ae.AuditPointID = apoint.AuditPointID

  LEFT JOIN MajorCriteria mcrit
    ON apoint.MajorCriteriaID = mcrit.MajorCriteriaID
`;

const AUDIT_GROUP_BY = `
  GROUP BY
    aa.AssignmentID,
    s.StoreSerial,
    s.StoreCode,
    b.BrandName,
    l.LocationName,
    om.OpsManagerName,
    smgr.StoreManagerName,
    u.UserName
`;

// ======================================================
// GET ALL AUDITS
// ======================================================

router.get("/Audits", verifyToken, async (req, res) => {
  try {
    const { storeSerial, includeInactive } = req.query;

    const authUser = getAuthUser(req);
    const roleId = Number(authUser.RoleID);

    const conditions = [];
    const params = [];

    // Active only by default
    if (includeInactive !== "true") {
      conditions.push(`aa.IsActive = TRUE`);
    }

    if (storeSerial) {
      params.push(storeSerial);

      conditions.push(`aa.StoreSerial = $${params.length}`);
    }

    if (roleId === ROLES.OPS_MANAGER) {
      params.push(authUser.OracleID);

      conditions.push(`
          s.OpsManagerID IN (
            SELECT OpsManagerID
            FROM OpsManagers
            WHERE OracleID = $${params.length}
          )
        `);
    } else if (roleId === ROLES.STORE_MANAGER) {

      if (authUser.IsStoreAccount && authUser.StoreSerial) {
        params.push(authUser.StoreSerial);

        conditions.push(`aa.StoreSerial = $${params.length}`);
      } else {

        params.push(authUser.OracleID);

        // Brand-scoped: only match a StoreManagers row that is BOTH
        // this OracleID's AND shares the store's BrandID (s.BrandID is
        // correlated from the outer query). This avoids the earlier
        // two-subquery approach, which broke (`= (...)` returning
        // multiple rows) whenever one OracleID is tied to more than
        // one StoreManagers row.
        conditions.push(`
            s.StoreManagerID IN (
              SELECT StoreManagerID
              FROM StoreManagers
              WHERE OracleID = $${params.length}
                AND BrandID = s.BrandID
            )
          `);
      }
    } else if (roleId === ROLES.AUDITOR) {
      params.push(authUser.UserID);

      conditions.push(`aa.AuditorID = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `
          ${AUDIT_SELECT_BASE}
          ${whereClause}
          ${AUDIT_GROUP_BY}
          ORDER BY aa.AuditDate DESC
        `,
      params,
    );

    res.json(result.rows);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Error getting audits",
    });
  }
});

// ======================================================
// GET SINGLE AUDIT
// ======================================================

router.get("/Audits/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const authUser = getAuthUser(req);

    const result = await pool.query(
      `
          ${AUDIT_SELECT_BASE}
          WHERE aa.AssignmentID = $1
          ${AUDIT_GROUP_BY}
        `,
      [id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Audit not found",
      });
    }

    const audit = result.rows[0];

    const hasAccess = await userCanAccessAudit(pool, authUser, audit);

    if (!hasAccess) {
      return res.status(403).json({
        message: "You do not have access to this audit",
      });
    }

    res.json(audit);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Error getting audit",
    });
  }
});

// ======================================================
// STATUSES
// ======================================================

const ALLOWED_STATUSES = [
  "Draft",
  "Submitted",
  "Needs Revision",
  "Rejected",
  "Forwarded",
  "Sent to Store",
  "Completed",
];

const STATUS_PERMISSIONS = {
  Draft: [ROLES.AUDITOR, ROLES.ADMIN],

  Submitted: [ROLES.AUDITOR, ROLES.ADMIN],

  "Needs Revision": [ROLES.AUDIT_MANAGER, ROLES.ADMIN],

  Rejected: [ROLES.AUDIT_MANAGER, ROLES.ADMIN],

  Forwarded: [ROLES.AUDIT_MANAGER, ROLES.ADMIN],

  "Sent to Store": [ROLES.OPS_MANAGER, ROLES.ADMIN],

  Completed: [ROLES.STORE_MANAGER, ROLES.ADMIN],
};

// ======================================================
// CREATE AUDIT
// ======================================================

router.post("/Audits", verifyToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      storeSerial,
      opsManagerID,
      auditorID,
      cashierName,
      auditDate,
      auditPoints,
      auditOverstation,
      status,
      cashCount,
    } = req.body;

    if (!storeSerial || !opsManagerID || !auditorID) {
      throw new Error("storeSerial, opsManagerID and auditorID are required");
    }

    const authUser = getAuthUser(req);

    if (
      Number(authUser.RoleID) !== ROLES.ADMIN &&
      Number(auditorID) !== Number(authUser.UserID)
    ) {
      throw new Error("You can only create audits under your own account.");
    }

    if (!Array.isArray(auditPoints) || auditPoints.length === 0) {
      throw new Error("auditPoints must be a non-empty array");
    }

    const finalStatus = ALLOWED_STATUSES.includes(status)
      ? status
      : "Submitted";

    const { totalScore, finalPercentage, riskLevel } =
      computeAggregates(auditPoints);

    const assignment = await client.query(
      `
            INSERT INTO AuditAssignments (
              StoreSerial,
              OpsManagerID,
              AuditorID,
              CashierName,
              AuditDate,
              Status,
              TotalScore,
              FinalPercentage,
              RiskLevel,
              CashCount,
              IsActive
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE
            )
            RETURNING AssignmentID
          `,
      [
        storeSerial,
        opsManagerID,
        auditorID,
        cashierName || null,
        auditDate || null,
        finalStatus,
        totalScore,
        finalPercentage,
        riskLevel,
        cashCount ? JSON.stringify(cashCount) : null,
      ],
    );

    const assignmentID = assignment.rows[0].assignmentid;

    for (const point of auditPoints) {
      await client.query(
        `
            INSERT INTO AuditEvaluations (
              AssignmentID,
              AuditPointID,
              Rating,
              Score,
              WeightPercentage,
              AuditObservation,
              AuditOverstation
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7
            )
          `,
        [
          assignmentID,
          point.id,
          point.rating || null,
          point.score,
          point.percentage,
          point.observation,
          auditOverstation,
        ],
      );
    }

    if (finalStatus === "Submitted") {
      const storeInfo = await client.query(
        `
              SELECT StoreCode
              FROM Stores
              WHERE StoreSerial = $1
            `,
        [storeSerial],
      );

      const storeCode = storeInfo.rows[0]?.storecode || `#${storeSerial}`;

      await createNotification(client, {
        roleId: ROLES.AUDIT_MANAGER,
        message: `New audit submitted for ${storeCode} — awaiting review.`,
        type: "info",
        assignmentId: assignmentID,
      });

      await sendAuditStatusEmail(client, {
        assignmentId: assignmentID,
        roleId: ROLES.AUDIT_MANAGER,
        statusLabel: "Submitted — awaiting review",
      });
    }

    await client.query("COMMIT");

    res.json({
      message: "Audit created",
      assignmentID,
      totalScore,
      finalPercentage,
      riskLevel,
      status: finalStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.log(error);

    res.status(500).json({
      message: "Create audit failed",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ======================================================
// UPDATE AUDIT
// ======================================================

router.put("/Audits/:id", verifyToken, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const authUser = getAuthUser(req);

    const {
      status,
      evaluations,
      actionNote,
      auditManagerNote,
      revisionReason,
      rejectionReason,
      cashierName,
      auditDate,
      auditOverstation,
      cashCount,
    } = req.body;

    if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}`,
      });
    }

    if (status !== undefined) {
      const allowedRoles = STATUS_PERMISSIONS[status] || [];

      if (!allowedRoles.includes(Number(authUser.RoleID))) {
        await client.query("ROLLBACK");

        return res.status(403).json({
          message: "You are not allowed to set this status.",
        });
      }
    }

    const existing = await client.query(
      `
            SELECT
              AssignmentID,
              AuditorID,
              StoreSerial,
              Status
            FROM AuditAssignments
            WHERE AssignmentID = $1
          `,
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Audit not found",
      });
    }

    const previousStatus = existing.rows[0].status;

    const auditorId = existing.rows[0].auditorid;

    const storeSerial = existing.rows[0].storeserial;

    const hasAccess = await userCanAccessAudit(client, authUser, {
      auditorid: auditorId,
      storeserial: storeSerial,
      assignmentid: id,
    });

    if (!hasAccess) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "You do not have access to this audit",
      });
    }

    if (cashierName !== undefined || auditDate !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET
              CashierName =
                COALESCE($1, CashierName),
              AuditDate =
                COALESCE($2, AuditDate)
            WHERE AssignmentID = $3
          `,
        [cashierName || null, auditDate || null, id],
      );
    }

    if (auditOverstation !== undefined) {
      await client.query(
        `
            UPDATE AuditEvaluations
            SET AuditOverstation = $1
            WHERE AssignmentID = $2
          `,
        [auditOverstation, id],
      );
    }

    if (cashCount !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET CashCount = $1
            WHERE AssignmentID = $2
          `,
        [cashCount ? JSON.stringify(cashCount) : null, id],
      );
    }

    if (Array.isArray(evaluations) && evaluations.length > 0) {
      for (const ev of evaluations) {
        if (!ev.AuditPointID) continue;

        await client.query(
          `
              INSERT INTO AuditEvaluations (
                AssignmentID,
                AuditPointID,
                Rating,
                Score,
                WeightPercentage,
                AuditObservation,
                ActionPlan,
                TargetDate
              )
              VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8
              )
              ON CONFLICT (
                AssignmentID,
                AuditPointID
              )
              DO UPDATE SET
                Rating = EXCLUDED.Rating,
                Score = EXCLUDED.Score,
                WeightPercentage =
                  EXCLUDED.WeightPercentage,
                AuditObservation =
                  EXCLUDED.AuditObservation,
                ActionPlan =
                  EXCLUDED.ActionPlan,
                TargetDate =
                  EXCLUDED.TargetDate
            `,
          [
            id,
            ev.AuditPointID,
            ev.Rating ?? null,
            ev.Score ?? null,
            ev.Percentage ?? null,
            ev.Observation ?? null,
            ev.ActionPlan ?? null,
            ev.TargetDate || null,
          ],
        );
      }

      const pointsResult = await client.query(
        `
              SELECT
                ae.Score AS score,
                ae.WeightPercentage AS percentage,
                ap.Weightage AS weightage
              FROM AuditEvaluations ae
              JOIN AuditPoints ap
                ON ae.AuditPointID =
                   ap.AuditPointID
              WHERE ae.AssignmentID = $1
            `,
        [id],
      );

      const { totalScore, finalPercentage, riskLevel } = computeAggregates(
        pointsResult.rows.map((r) => ({
          score: r.score,
          percentage: r.percentage,
          percentageWeightage: r.weightage,
        })),
      );

      await client.query(
        `
            UPDATE AuditAssignments
            SET
              TotalScore = $1,
              FinalPercentage = $2,
              RiskLevel = $3
            WHERE AssignmentID = $4
          `,
        [totalScore, finalPercentage, riskLevel, id],
      );
    }

    if (actionNote !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET ActionNote = $1
            WHERE AssignmentID = $2
          `,
        [actionNote, id],
      );
    }

    if (auditManagerNote !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET AuditManagerNote = $1
            WHERE AssignmentID = $2
          `,
        [auditManagerNote, id],
      );
    }

    if (revisionReason !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET
              RevisionReason = $1,
              RejectionReason = NULL
            WHERE AssignmentID = $2
          `,
        [revisionReason, id],
      );
    }

    if (rejectionReason !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET
              RejectionReason = $1,
              RevisionReason = NULL
            WHERE AssignmentID = $2
          `,
        [rejectionReason, id],
      );
    }

    if (status !== undefined) {
      await client.query(
        `
            UPDATE AuditAssignments
            SET Status = $1
            WHERE AssignmentID = $2
          `,
        [status, id],
      );
    }

    if (status !== undefined && status !== previousStatus) {
      if (status === "Needs Revision") {
        await createNotification(client, {
          userId: auditorId,
          message: `Your audit needs revision: ${
            revisionReason || "See audit manager comments."
          }`,
          type: "warning",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          userId: auditorId,
          statusLabel: "Needs Revision",
          extraMessage: revisionReason || "See audit manager comments.",
        });
      } else if (status === "Rejected") {
        await createNotification(client, {
          userId: auditorId,
          message: `Your audit was rejected: ${
            rejectionReason || "See audit manager comments."
          }`,
          type: "error",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          userId: auditorId,
          statusLabel: "Rejected",
          extraMessage: rejectionReason || "See audit manager comments.",
        });
      } else if (status === "Forwarded") {
        const opsUserId = await getOpsManagerUserId(client, storeSerial);

        await createNotification(client, {
          userId: opsUserId,
          roleId: opsUserId ? null : ROLES.OPS_MANAGER,
          message:
            "An audit has been approved and forwarded to you for review.",
          type: "info",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          userId: opsUserId,
          roleId: opsUserId ? null : ROLES.OPS_MANAGER,
          statusLabel: "Forwarded — awaiting Ops Manager review",
        });
      } else if (status === "Sent to Store") {
        const smUserId = await getStoreManagerUserId(client, storeSerial);

        await createNotification(client, {
          userId: smUserId,
          roleId: smUserId ? null : ROLES.STORE_MANAGER,
          message:
            "An audit has been sent to you — please add the action plan and target date.",
          type: "info",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          userId: smUserId,
          roleId: smUserId ? null : ROLES.STORE_MANAGER,
          statusLabel: "Sent to Store — action plan needed",
        });
      } else if (
        status === "Submitted" &&
        previousStatus === "Needs Revision"
      ) {
        await createNotification(client, {
          roleId: ROLES.AUDIT_MANAGER,
          message: "An audit has been resubmitted for review.",
          type: "info",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          roleId: ROLES.AUDIT_MANAGER,
          statusLabel: "Resubmitted — awaiting review",
        });
      } else if (status === "Completed") {
        await createNotification(client, {
          userId: auditorId,
          message: "Your audit has been completed.",
          type: "success",
          assignmentId: id,
        });

        await sendAuditStatusEmail(client, {
          assignmentId: id,
          userId: auditorId,
          statusLabel: "Completed",
        });
      }
    }

    await client.query("COMMIT");

    const result = await client.query(
      `
            SELECT *
            FROM AuditAssignments
            WHERE AssignmentID = $1
          `,
      [id],
    );

    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    console.log(error);

    res.status(500).json({
      message: "Update failed",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ======================================================
// DELETE AUDIT (PERMANENT — HARD DELETE)
// Removes the audit and everything tied to it:
//   1) Notifications referencing this audit
//   2) AuditEvaluations belonging to this audit
//   3) The AuditAssignments row itself
// All inside one transaction, so either everything is
// removed, or nothing is (no orphaned rows, no FK errors).
// ======================================================

router.delete("/Audits/:id", verifyToken, isAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    const existing = await client.query(
      `
        SELECT AssignmentID
        FROM AuditAssignments
        WHERE AssignmentID = $1
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        error: "Audit not found",
      });
    }

    // 1) Remove notifications that point to this audit —
    //    otherwise Notifications.RelatedAssignmentID FK blocks the delete.
    await client.query(
      `
        DELETE FROM Notifications
        WHERE RelatedAssignmentID = $1
      `,
      [id],
    );

    // 2) Remove every evaluation (rating, score, observation,
    //    action plan...) tied to this audit — otherwise
    //    AuditEvaluations.AssignmentID FK blocks the delete.
    await client.query(
      `
        DELETE FROM AuditEvaluations
        WHERE AssignmentID = $1
      `,
      [id],
    );

    // 3) Finally remove the audit itself.
    const deleted = await client.query(
      `
        DELETE FROM AuditAssignments
        WHERE AssignmentID = $1
        RETURNING AssignmentID
      `,
      [id],
    );

    await client.query("COMMIT");

    res.status(200).json({
      message: "Audit permanently deleted",
      assignmentID: deleted.rows[0].assignmentid,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE /Audits/:id error:", error);

    res.status(500).json({
      error: "Something went wrong",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;