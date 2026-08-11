const express = require("express");
const router = express.Router();
const pool = require("../../config/db");

const ROLES = {
    ADMIN: 1,
    OPS_MANAGER: 2,
    STORE_MANAGER: 3,
    AUDITOR: 4,
    AUDIT_MANAGER: 5
};

const RISK_THRESHOLDS = {
    LOW: 90,
    MODERATE: 75
};

const getRiskLevel = (finalPercentage) => {
    if (finalPercentage === null) return null;
    if (finalPercentage >= RISK_THRESHOLDS.LOW) return "Low";
    if (finalPercentage >= RISK_THRESHOLDS.MODERATE) return "Moderate";
    return "High";
};

const computeAggregates = (auditPoints) => {
    const rated = auditPoints.filter(
        (p) => p.score !== null && p.score !== undefined
    );

    const totalScore = rated.reduce((sum, p) => sum + Number(p.score), 0);

    const weightTotal = rated.reduce(
        (sum, p) => sum + Number(p.percentageWeightage ?? p.weightage ?? 0),
        0
    );

    const weightedSum = rated.reduce(
        (sum, p) =>
            sum +
            Number(p.percentage) *
                Number(p.percentageWeightage ?? p.weightage ?? 0),
        0
    );

    const finalPercentage =
        weightTotal > 0
            ? Number((weightedSum / weightTotal).toFixed(2))
            : null;

    return {
        totalScore: Number(totalScore.toFixed(2)),
        finalPercentage,
        riskLevel: getRiskLevel(finalPercentage)
    };
};

// Creates a notification for a specific user (userId) or broadcast to a role (roleId)
const createNotification = async (
    client,
    { userId = null, roleId = null, message, type = "info", assignmentId = null }
) => {
    await client.query(
        `
        INSERT INTO Notifications (UserID, RoleID, Message, Type, RelatedAssignmentID)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [userId, roleId, message, type, assignmentId]
    );
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
        aa.RevisionReason,
        aa.RejectionReason,

        s.StoreSerial,
        s.StoreCode,
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
                ORDER BY mcrit.MajorCriteriaID, apoint.AuditPointID
            ) FILTER (WHERE ae.EvaluationID IS NOT NULL),
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

// GET ALL AUDITS (every role sees every status — filtering happens in the UI)
router.get("/Audits", async (req, res) => {
    try {
        const { storeSerial } = req.query;

        const whereClause = storeSerial ? `WHERE aa.StoreSerial = $1` : "";
        const params = storeSerial ? [storeSerial] : [];

        const result = await pool.query(
            `${AUDIT_SELECT_BASE} ${whereClause} ${AUDIT_GROUP_BY} ORDER BY aa.AuditDate DESC`,
            params
        );

        res.json(result.rows);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error getting audits" });
    }
});


router.get("/Audits/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `${AUDIT_SELECT_BASE} WHERE aa.AssignmentID = $1 ${AUDIT_GROUP_BY}`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Audit not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Error getting audit" });
    }
});

const ALLOWED_STATUSES = [
    "Draft",
    "Submitted",
    "Needs Revision",
    "Rejected",
    "Forwarded",
    "Completed"
];

// CREATE AUDIT — status can be 'Draft' (auditor saving progress) or 'Submitted' (final)
router.post("/Audits", async (req, res) => {
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
            status
        } = req.body;

        if (!storeSerial || !opsManagerID || !auditorID) {
            throw new Error(
                "storeSerial, opsManagerID and auditorID are required"
            );
        }

        if (!Array.isArray(auditPoints) || auditPoints.length === 0) {
            throw new Error("auditPoints must be a non-empty array");
        }

        const finalStatus = ALLOWED_STATUSES.includes(status) ? status : "Submitted";

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
            RiskLevel
        )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9)

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
                riskLevel
            ]
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
                VALUES
                ($1,$2,$3,$4,$5,$6,$7)
            `,
                [
                    assignmentID,
                    point.id,
                    point.rating || null,
                    point.score,
                    point.percentage,
                    point.observation,
                    auditOverstation
                ]
            );
        }

        // Notify Audit Managers only on a real submission, not on drafts
        if (finalStatus === "Submitted") {
            const storeInfo = await client.query(
                `SELECT StoreCode FROM Stores WHERE StoreSerial = $1`,
                [storeSerial]
            );
            const storeCode = storeInfo.rows[0]?.storecode || `#${storeSerial}`;

            await createNotification(client, {
                roleId: ROLES.AUDIT_MANAGER,
                message: `New audit submitted for ${storeCode} — awaiting review.`,
                type: "info",
                assignmentId: assignmentID
            });
        }

        await client.query("COMMIT");
        res.json({
            message: "Audit created",
            assignmentID,
            totalScore,
            finalPercentage,
            riskLevel,
            status: finalStatus
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.log(error);
        res.status(500).json({
            message: "Create audit failed",
            error: error.message
        });
    } finally {
        client.release();
    }
});


router.put("/Audits/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { id } = req.params;
        const {
            status,
            evaluations,
            actionNote,
            revisionReason,
            rejectionReason,
            cashierName,
            auditDate,
            auditOverstation
        } = req.body;

        if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}`
            });
        }

        const existing = await client.query(
            `SELECT AssignmentID, AuditorID, StoreSerial, Status FROM AuditAssignments WHERE AssignmentID = $1`,
            [id]
        );

        if (existing.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Audit not found" });
        }

        const previousStatus = existing.rows[0].status;
        const auditorId = existing.rows[0].auditorid;

        // 1. Draft header fields (Auditor editing cashier/date while saving progress)
        if (cashierName !== undefined || auditDate !== undefined) {
            await client.query(
                `
                UPDATE AuditAssignments
                SET
                    CashierName = COALESCE($1, CashierName),
                    AuditDate = COALESCE($2, AuditDate)
                WHERE AssignmentID = $3
                `,
                [cashierName || null, auditDate || null, id]
            );
        }

        if (auditOverstation !== undefined) {
            await client.query(
                `UPDATE AuditEvaluations SET AuditOverstation = $1 WHERE AssignmentID = $2`,
                [auditOverstation, id]
            );
        }

        // 2. Evaluations upsert — matched by (AssignmentID, AuditPointID), so it works
        //    whether the row already exists or is being created for the first time
        //    (e.g. a new audit point added after the draft was started).
        if (Array.isArray(evaluations) && evaluations.length > 0) {
            for (const ev of evaluations) {
                if (!ev.AuditPointID) continue;

                await client.query(
                    `
                    INSERT INTO AuditEvaluations (
                        AssignmentID, AuditPointID, Rating, Score,
                        WeightPercentage, AuditObservation, ActionPlan, TargetDate
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT (AssignmentID, AuditPointID)
                    DO UPDATE SET
                        Rating = EXCLUDED.Rating,
                        Score = EXCLUDED.Score,
                        WeightPercentage = EXCLUDED.WeightPercentage,
                        AuditObservation = EXCLUDED.AuditObservation,
                        ActionPlan = EXCLUDED.ActionPlan,
                        TargetDate = EXCLUDED.TargetDate
                    `,
                    [
                        id,
                        ev.AuditPointID,
                        ev.Rating ?? null,
                        ev.Score ?? null,
                        ev.Percentage ?? null,
                        ev.Observation ?? null,
                        ev.ActionPlan ?? null,
                        ev.TargetDate || null
                    ]
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
                    ON ae.AuditPointID = ap.AuditPointID
                WHERE ae.AssignmentID = $1
                `,
                [id]
            );

            const { totalScore, finalPercentage, riskLevel } = computeAggregates(
                pointsResult.rows.map((r) => ({
                    score: r.score,
                    percentage: r.percentage,
                    percentageWeightage: r.weightage
                }))
            );

            await client.query(
                `
                UPDATE AuditAssignments
                SET TotalScore = $1, FinalPercentage = $2, RiskLevel = $3
                WHERE AssignmentID = $4
                `,
                [totalScore, finalPercentage, riskLevel, id]
            );
        }

        // 3. Ops Manager general note
        if (actionNote !== undefined) {
            await client.query(
                `UPDATE AuditAssignments SET ActionNote = $1 WHERE AssignmentID = $2`,
                [actionNote, id]
            );
        }

       // 4. Revision reason
        if (revisionReason !== undefined) {
            await client.query(
                `
                UPDATE AuditAssignments
                SET
                    RevisionReason = $1,
                    RejectionReason = NULL
                WHERE AssignmentID = $2
                `,
                [revisionReason, id]
            );
        }

        // 5. Rejection reason
        if (rejectionReason !== undefined) {
            await client.query(
                `UPDATE AuditAssignments SET RejectionReason = $1 WHERE AssignmentID = $2`,
                [rejectionReason, id]
            );
        }

        // 6. Status transition
        if (status !== undefined) {
            await client.query(
                `UPDATE AuditAssignments SET Status = $1 WHERE AssignmentID = $2`,
                [status, id]
            );
        }

        // 7. Notifications — fire only on a real status change
        if (status !== undefined && status !== previousStatus) {
            if (status === "Needs Revision") {
                await createNotification(client, {
                    userId: auditorId,
                    message: `Your audit needs revision: ${revisionReason || "See audit manager comments."}`,
                    type: "warning",
                    assignmentId: id
                });
            } else if (status === "Rejected") {
                await createNotification(client, {
                    userId: auditorId,
                    message: `Your audit was rejected: ${rejectionReason || "See audit manager comments."}`,
                    type: "error",
                    assignmentId: id
                });
            } else if (status === "Forwarded") {
                await createNotification(client, {
                    roleId: ROLES.OPS_MANAGER,
                    message: `An audit has been approved and forwarded for action.`,
                    type: "info",
                    assignmentId: id
                });
            } else if (status === "Submitted" && previousStatus === "Needs Revision") {
                await createNotification(client, {
                    roleId: ROLES.AUDIT_MANAGER,
                    message: `An audit has been resubmitted for review.`,
                    type: "info",
                    assignmentId: id
                });
            } else if (status === "Completed") {
                await createNotification(client, {
                    userId: auditorId,
                    message: `Your audit has been completed.`,
                    type: "success",
                    assignmentId: id
                });
            }
        }

        await client.query("COMMIT");

        const result = await client.query(
            `SELECT * FROM AuditAssignments WHERE AssignmentID = $1`,
            [id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK");
        console.log(error);
        res.status(500).json({
            message: "Update failed",
            error: error.message
        });
    } finally {
        client.release();
    }
});

// DELETE AUDIT
router.delete("/Audits/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { id } = req.params;

        await client.query(`DELETE FROM AuditEvaluations WHERE AssignmentID=$1`, [id]);
        await client.query(`DELETE FROM AuditAssignments WHERE AssignmentID=$1`, [id]);
        await client.query(`DELETE FROM Notifications WHERE RelatedAssignmentID=$1`, [id]);

        await client.query("COMMIT");
        res.json({ message: "Audit deleted successfully" });
    } catch (error) {
        await client.query("ROLLBACK");
        console.log(error);
        res.status(500).json({ message: "Delete failed" });
    } finally {
        client.release();
    }
});

module.exports = router;