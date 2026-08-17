const nodemailer = require("nodemailer");

let transporter = null;

const getTransporter = () => {
    if (transporter) return transporter;

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.warn(
            "⚠️  SMTP is not configured (missing SMTP_HOST / SMTP_USER in .env). Emails will be skipped."
        );
        return null;
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return transporter;
};

/**
 *
 * @param {Object} options
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 * @param {Array}  [options.attachments]
 */
const sendMail = async ({ to, subject, html, attachments = [] }) => {
    if (!to) {
        console.log("sendMail skipped: no recipient email provided.");
        return { sent: false, reason: "no-recipient" };
    }

    const client = getTransporter();

    if (!client) {
        return { sent: false, reason: "smtp-not-configured" };
    }

    try {
        await client.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject,
            html,
            attachments,
        });

        return { sent: true };
    } catch (error) {
        console.error(`Failed to send email to ${to}:`, error.message);
        return { sent: false, reason: error.message };
    }
};

module.exports = { sendMail };