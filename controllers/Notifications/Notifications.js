const express = require("express");
const router = express.Router();
const pool = require("../../config/db");
const verifyToken = require("../../middleware/verify-token");

// Support common req.user shapes depending on how verify-token sets it
const getAuthUser = (req) => req.user || req.userData || req.decoded || {};

// GET current user's notifications (direct + broadcast to their role)
router.get("/notifications", verifyToken, async (req, res) => {
    try {
        const { UserID, RoleID } = getAuthUser(req);

        const result = await pool.query(
            `
            SELECT
                NotificationID,
                UserID,
                RoleID,
                Message,
                Type,
                RelatedAssignmentID,
                IsRead,
                CreatedAt
            FROM Notifications
            WHERE UserID = $1 OR RoleID = $2
            ORDER BY CreatedAt DESC
            LIMIT 50
            `,
            [UserID, RoleID]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching notifications" });
    }
});

// Mark one notification as read
router.patch("/notifications/:id/read", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE Notifications SET IsRead = true WHERE NotificationID = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Notification not found" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating notification" });
    }
});

// Mark all as read for the current user
router.patch("/notifications/read-all", verifyToken, async (req, res) => {
    try {
        const { UserID, RoleID } = getAuthUser(req);

        await pool.query(
            `UPDATE Notifications SET IsRead = true WHERE (UserID = $1 OR RoleID = $2) AND IsRead = false`,
            [UserID, RoleID]
        );

        res.json({ message: "All notifications marked as read" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating notifications" });
    }
});

module.exports = router;