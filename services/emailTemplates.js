const ROLE_NAMES = {
    1: "Admin",
    2: "Ops Manager",
    3: "Store Manager",
    4: "Auditor",
    5: "Audit Manager",
};

const baseWrapper = (title, bodyHtml) => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
            <tr>
              <td style="background:#1f2328;padding:22px 28px;">
                <h1 style="margin:0;color:#ffffff;font-size:18px;">Apparel Group — Audit System</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h2 style="margin:0 0 16px;font-size:16px;color:#1f2328;">${title}</h2>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f9fafb;color:#9ca3af;font-size:11px;text-align:center;">
                This is an automated message from the Audit System — please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

/**
 * Welcome email sent to a newly created user (by the Admin).
 */
const welcomeEmailHtml = ({ userName, oracleId, password, roleId, loginUrl }) => {
    const roleName = ROLE_NAMES[roleId] || "User";

    const body = `
        <p style="color:#374151;font-size:14px;line-height:1.6;">
            Hi <strong>${userName}</strong>,<br/>
            An account has been created for you on the Apparel Group Audit System.
        </p>

        <table cellpadding="6" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;">
            <tr>
                <td style="color:#6b7280;font-size:12px;width:140px;">Oracle ID</td>
                <td style="color:#111827;font-size:14px;font-weight:700;">${oracleId}</td>
            </tr>
            <tr>
                <td style="color:#6b7280;font-size:12px;">Password</td>
                <td style="color:#111827;font-size:14px;font-weight:700;">${password}</td>
            </tr>
            <tr>
                <td style="color:#6b7280;font-size:12px;">Role</td>
                <td style="color:#111827;font-size:14px;font-weight:700;">${roleName}</td>
            </tr>
        </table>

        <p style="color:#374151;font-size:13px;line-height:1.6;">
            Use these credentials to log in to the Audit System.
        </p>

        ${
            loginUrl
                ? `<p style="text-align:center;margin:22px 0;">
                    <a href="${loginUrl}" style="background:#1f2328;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                        Go to login
                    </a>
                   </p>`
                : ""
        }
    `;

    return baseWrapper("Welcome to the Audit System", body);
};

/**
 * Status-update email sent to whoever is responsible for the next step
 * of an audit (Audit Manager, Ops Manager, Store Manager, Auditor...).
 */
const auditUpdateEmailHtml = ({
    recipientName,
    storeCode,
    brandName,
    locationName,
    statusLabel,
    extraMessage,
    finalPercentage,
    riskLevel,
    actionUrl,
}) => {
    const body = `
        <p style="color:#374151;font-size:14px;line-height:1.6;">
            Hi <strong>${recipientName || ""}</strong>,<br/>
            There is an update on an audit that needs your attention.
        </p>

        <table cellpadding="6" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;">
            <tr>
                <td style="color:#6b7280;font-size:12px;width:140px;">Store</td>
                <td style="color:#111827;font-size:14px;font-weight:700;">${storeCode || "-"} — ${brandName || "-"}</td>
            </tr>
            <tr>
                <td style="color:#6b7280;font-size:12px;">Location</td>
                <td style="color:#111827;font-size:14px;">${locationName || "-"}</td>
            </tr>
            <tr>
                <td style="color:#6b7280;font-size:12px;">New Status</td>
                <td style="color:#111827;font-size:14px;font-weight:700;">${statusLabel}</td>
            </tr>
            ${
                finalPercentage !== undefined && finalPercentage !== null
                    ? `<tr>
                        <td style="color:#6b7280;font-size:12px;">Score</td>
                        <td style="color:#111827;font-size:14px;">${Number(finalPercentage).toFixed(2)}%</td>
                       </tr>`
                    : ""
            }
            ${
                riskLevel
                    ? `<tr>
                        <td style="color:#6b7280;font-size:12px;">Risk Level</td>
                        <td style="color:#111827;font-size:14px;">${riskLevel}</td>
                       </tr>`
                    : ""
            }
        </table>

        ${
            extraMessage
                ? `<p style="color:#374151;font-size:13px;line-height:1.6;background:#f9fafb;border-radius:8px;padding:10px 14px;">
                    ${extraMessage}
                   </p>`
                : ""
        }

        <p style="color:#374151;font-size:13px;line-height:1.6;">
            A PDF snapshot of the audit is attached to this email.
        </p>

        ${
            actionUrl
                ? `<p style="text-align:center;margin:22px 0;">
                    <a href="${actionUrl}" style="background:#1f2328;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;">
                        Open audit
                    </a>
                   </p>`
                : ""
        }
    `;

    return baseWrapper(`Audit update — ${statusLabel}`, body);
};

module.exports = {
    welcomeEmailHtml,
    auditUpdateEmailHtml,
    ROLE_NAMES,
};