const express = require("express");
const router = express.Router();
const pool = require("../../config/db");


const RISK_THRESHOLDS = {
    LOW: 90,      // >= 90%  -> Low
    MODERATE: 75  // >= 75%  -> Moderate, otherwise High
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

// GET ALL AUDITS
router.get("/Audits", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                aa.AssignmentID,
                aa.CashierName,
                aa.AuditDate,
                aa.Status,
                aa.TotalScore,
                aa.FinalPercentage,
                aa.RiskLevel,

                s.StoreCode,
                b.BrandName,
                l.LocationName,

                om.OpsManagerName,
                u.UserName AS AuditorName,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'EvaluationID', ae.EvaluationID,
                            'AuditPointID', ae.AuditPointID,
                            'Rating', ae.Rating,
                            'Score', ae.Score,
                            'Percentage', ae.WeightPercentage,
                            'Observation', ae.AuditObservation,
                            'Photos', ae.Photos
                        )
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

            LEFT JOIN AuditEvaluations ae
            ON aa.AssignmentID = ae.AssignmentID

            GROUP BY
            aa.AssignmentID,
            s.StoreCode,
            b.BrandName,
            l.LocationName,
            om.OpsManagerName,
            u.UserName

            ORDER BY aa.AuditDate DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error getting audits"
        });
    }
});



router.get("/Audits/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                aa.AssignmentID,
                aa.CashierName,
                aa.AuditDate,
                aa.Status,
                aa.TotalScore,
                aa.FinalPercentage,
                aa.RiskLevel,

                s.StoreSerial,
                s.StoreCode,
                b.BrandName,
                l.LocationName,

                om.OpsManagerName,
                u.UserName AS AuditorName,

                COALESCE(
                    json_agg(
                        json_build_object(
                            'EvaluationID', ae.EvaluationID,
                            'AuditPointID', ae.AuditPointID,
                            'Rating', ae.Rating,
                            'Score', ae.Score,
                            'Percentage', ae.WeightPercentage,
                            'Observation', ae.AuditObservation,
                            'Photos', ae.Photos
                        )
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

            LEFT JOIN AuditEvaluations ae
            ON aa.AssignmentID = ae.AssignmentID

            WHERE aa.AssignmentID = $1

            GROUP BY
            aa.AssignmentID,
            s.StoreSerial,
            s.StoreCode,
            b.BrandName,
            l.LocationName,
            om.OpsManagerName,
            u.UserName
        `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Audit not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Error getting audit"
        });
    }
});

// CREATE AUDIT
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
            auditOverstation
        } = req.body;

        if (!storeSerial || !opsManagerID || !auditorID) {
            throw new Error(
                "storeSerial, opsManagerID and auditorID are required"
            );
        }

        if (!Array.isArray(auditPoints) || auditPoints.length === 0) {
            throw new Error("auditPoints must be a non-empty array");
        }

   
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
            ($1,$2,$3,$4,$5,'Completed',$6,$7,$8)

            RETURNING AssignmentID
        `,
            [
                storeSerial,
                opsManagerID,
                auditorID,
                cashierName,
                auditDate,
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
                    point.rating,
                    point.score,
                    point.percentage,
                    point.observation,
                    auditOverstation
                ]
            );
        }

        await client.query("COMMIT");
        res.json({
            message: "Audit created",
            assignmentID,
            totalScore,
            finalPercentage,
            riskLevel
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



const ALLOWED_STATUSES = [
    "Completed",
    "Reviewed",
    "Approved",
    "Needs Follow-up",
    "Rejected"
];


router.put("/Audits/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { status, totalScore, finalPercentage, riskLevel } = req.body;

        if (status !== undefined && !ALLOWED_STATUSES.includes(status)) {
            return res.status(400).json({
                message: `Status must be one of: ${ALLOWED_STATUSES.join(", ")}`
            });
        }

        const fields = [];
        const values = [];
        let i = 1;

        if (status !== undefined) {
            fields.push(`Status=$${i++}`);
            values.push(status);
        }
        if (totalScore !== undefined) {
            fields.push(`TotalScore=$${i++}`);
            values.push(totalScore);
        }
        if (finalPercentage !== undefined) {
            fields.push(`FinalPercentage=$${i++}`);
            values.push(finalPercentage);
        }
        if (riskLevel !== undefined) {
            fields.push(`RiskLevel=$${i++}`);
            values.push(riskLevel);
        }

        if (fields.length === 0) {
            return res.status(400).json({ message: "Nothing to update" });
        }

        values.push(id);

        const result = await pool.query(
            `
            UPDATE AuditAssignments
            SET ${fields.join(", ")}
            WHERE AssignmentID=$${i}
            RETURNING *
        `,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Audit not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Update failed"
        });
    }
});

// DELETE AUDIT
router.delete("/Audits/:id", async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const { id } = req.params;

        await client.query(
            `
            DELETE FROM AuditEvaluations
            WHERE AssignmentID=$1
        `,
            [id]
        );

        await client.query(
            `
            DELETE FROM AuditAssignments
            WHERE AssignmentID=$1
        `,
            [id]
        );

        await client.query("COMMIT");
        res.json({
            message: "Audit deleted successfully"
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.log(error);

        res.status(500).json({
            message: "Delete failed"
        });
    } finally {
        client.release();
    }
});

module.exports = router;