const PDFDocument = require("pdfkit");

const safe = (value, fallback = "-") =>
  value === null || value === undefined || value === "" ? fallback : value;

const RISK_COLORS = {
  Low: "#1f7a4d",
  Moderate: "#b45309",
  High: "#b91c1c",
};

const RATING_LABELS = {
  Low: "SATISFACTORY",
  Moderate: "NEEDS IMPROVEMENT",
  High: "UNSATISFACTORY",
};

const num = (v) =>
  v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);

const buildReportSections = (evaluations) => {
  const majorMap = new Map();

  evaluations.forEach((ev) => {
    const majorName = ev.MajorCriteriaName || "General";
    const subName = ev.SubPointCriteria || "General";

    if (!majorMap.has(majorName)) majorMap.set(majorName, new Map());
    const subMap = majorMap.get(majorName);

    if (!subMap.has(subName)) subMap.set(subName, []);
    subMap.get(subName).push(ev);
  });

  const sections = [];
  let majorIndex = 0;

  majorMap.forEach((subMap, majorName) => {
    majorIndex += 1;
    let subIndex = 0;
    const subsections = [];

    subMap.forEach((items, subName) => {
      subIndex += 1;
      subsections.push({
        number: `${majorIndex}.${subIndex}`,
        name: subName,
        items: items.map((it, i) => ({
          ...it,
          number: `${majorIndex}.${subIndex}.${i + 1}`,
        })),
      });
    });

    sections.push({ number: majorIndex, name: majorName, subsections });
  });

  return sections;
};

const measureRowHeight = (doc, colWidths, cells, fontSize, padding) => {
  doc.fontSize(fontSize);
  let h = fontSize + padding * 2 + 4;
  cells.forEach((cell, i) => {
    const cellH = doc.heightOfString(String(cell ?? ""), {
      width: colWidths[i] - padding * 2,
    });
    h = Math.max(h, cellH + padding * 2);
  });
  return h;
};

const drawRow = (
  doc,
  x,
  y,
  colWidths,
  cells,
  height,
  {
    fontSize = 8,
    bold = false,
    fill = null,
    textColor = "#111827",
    padding = 4,
  } = {},
) => {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  if (fill) {
    doc.rect(x, y, totalWidth, height).fill(fill);
  }

  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);

  let cx = x;
  cells.forEach((cell, i) => {
    doc
      .fillColor(textColor)
      .text(String(cell ?? ""), cx + padding, y + padding, {
        width: colWidths[i] - padding * 2,
      });
    cx += colWidths[i];
  });

  doc.strokeColor("#d1d5db").lineWidth(0.5);
  cx = x;
  colWidths.forEach((w) => {
    doc.rect(cx, y, w, height).stroke();
    cx += w;
  });
};

const ensureSpace = (doc, y, needed, marginTop = 40) => {
  if (y + needed > doc.page.height - 40) {
    doc.addPage();
    return marginTop;
  }
  return y;
};

const generateAuditPdfBuffer = (audit) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageLeft = doc.page.margins.left;
      const pageWidth = doc.page.width - pageLeft - doc.page.margins.right;

      // ---------------- LETTERHEAD ----------------
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#1f2328")
        .text("Apparel Group", pageLeft, 30);

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#6b7280")
        .text("Store Operations Audit Report", pageLeft, 50);

      const risk = audit.risklevel;
      const riskColor = RISK_COLORS[risk] || "#6b7280";
      const ratingLabel = RATING_LABELS[risk] || "-";
      const scoreText =
        audit.finalpercentage !== null && audit.finalpercentage !== undefined
          ? `${Number(audit.finalpercentage).toFixed(2)}%`
          : "-";

      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#1f2328")
        .text(scoreText, pageLeft, 28, { width: pageWidth, align: "right" });

      doc
        .roundedRect(pageLeft + pageWidth - 170, 54, 170, 18, 9)
        .fill(riskColor);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#ffffff")
        .text(ratingLabel, pageLeft + pageWidth - 170, 59, {
          width: 170,
          align: "center",
        });

      doc
        .moveTo(pageLeft, 78)
        .lineTo(pageLeft + pageWidth, 78)
        .strokeColor("#1f2328")
        .lineWidth(1.5)
        .stroke();

      // ---------------- META TABLE ----------------
      let y = 90;
      const metaRows = [
        [
          ["Store", `${safe(audit.storecode)} — ${safe(audit.brandname)}`],
          ["Audited By", safe(audit.auditorname)],
        ],
        [
          ["Location", safe(audit.locationname)],
          ["Store Manager", safe(audit.storemanagername)],
        ],
        [
          ["Store Code", safe(audit.storecode)],
          ["Ops Manager", safe(audit.opsmanagername)],
        ],
        [
          [
            "Audit Date",
            audit.auditdate
              ? new Date(audit.auditdate).toLocaleDateString("en-GB")
              : "-",
          ],
          ["Cashier", safe(audit.cashiername)],
        ],
      ];

      const metaColWidth = pageWidth / 2;

      metaRows.forEach((row) => {
        row.forEach(([label, value], i) => {
          const cx = pageLeft + i * metaColWidth;
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#6b7280")
            .text(label.toUpperCase(), cx + 4, y + 4);
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#111827")
            .text(value, cx + 4, y + 16, { width: metaColWidth - 8 });
        });
        doc
          .strokeColor("#e5e7eb")
          .lineWidth(0.5)
          .rect(pageLeft, y, pageWidth, 30)
          .stroke();
        doc
          .moveTo(pageLeft + metaColWidth, y)
          .lineTo(pageLeft + metaColWidth, y + 30)
          .stroke();
        y += 30;
      });

      y += 12;

      // ---------------- FINDINGS TABLE ----------------
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#1f2328")
        .text("Audit Findings", pageLeft, y);
      y += 18;

      const colWidths = [26, 210, 50, 55, 55, 55, 150, 100, 46];
      const headers = [
        "S.No",
        "Main Process",
        "Rating",
        "Weight Applied",
        "Weight Score",
        "%age Scored",
        "Observation",
        "Action Plan",
        "Target Date",
      ];

      y = ensureSpace(doc, y, 40);
      let h = measureRowHeight(doc, colWidths, headers, 8, 4);
      drawRow(doc, pageLeft, y, colWidths, headers, h, {
        bold: true,
        fill: "#f0f0f0",
        fontSize: 8,
      });
      y += h;

      const sections = buildReportSections(
        Array.isArray(audit.evaluations) ? audit.evaluations : [],
      );

      sections.forEach((section) => {
        y = ensureSpace(doc, y, 20);
        const majorCells = [
          section.number,
          section.name,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ];
        h = measureRowHeight(doc, colWidths, majorCells, 8.5, 4);
        drawRow(doc, pageLeft, y, colWidths, majorCells, h, {
          bold: true,
          fill: "#1f2328",
          textColor: "#ffffff",
        });
        y += h;

        section.subsections.forEach((sub) => {
          y = ensureSpace(doc, y, 20);
          const subCells = [sub.number, sub.name, "", "", "", "", "", "", ""];
          h = measureRowHeight(doc, colWidths, subCells, 8, 4);
          drawRow(doc, pageLeft, y, colWidths, subCells, h, {
            bold: true,
            fill: "#e4e7e6",
          });
          y += h;

          sub.items.forEach((item) => {
            const weightApplied = num(item.Weightage);
            const percentage = num(item.Percentage);
            const weightScore =
              weightApplied !== null && percentage !== null
                ? ((weightApplied * percentage) / 100).toFixed(2)
                : "-";

            const cells = [
              item.number,
              safe(item.AuditComment),
              safe(item.Rating),
              weightApplied !== null ? weightApplied.toFixed(2) : "-",
              weightScore,
              percentage !== null ? `${percentage}%` : "-",
              safe(item.Observation, ""),
              safe(item.ActionPlan, ""),
              item.TargetDate
                ? new Date(item.TargetDate).toLocaleDateString("en-GB")
                : "-",
            ];

            h = measureRowHeight(doc, colWidths, cells, 7.5, 4);
            y = ensureSpace(doc, y, h);
            drawRow(doc, pageLeft, y, colWidths, cells, h, { fontSize: 7.5 });
            y += h;
          });
        });
      });

      // ---------------- CASH COUNT ----------------
      const cc = audit.cashcount;
      if (cc) {
        y += 16;
        y = ensureSpace(doc, y, 120);

        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#1f2328")
          .text("Cash Reconciliation (BHD)", pageLeft, y);
        y += 18;

        const denomWidths = [70, 40, 70];
        const denomHeaders = ["Denomination", "Qty", "Amount"];
        h = measureRowHeight(doc, denomWidths, denomHeaders, 8, 4);
        drawRow(doc, pageLeft, y, denomWidths, denomHeaders, h, {
          bold: true,
          fill: "#f0f0f0",
        });

        const denomStartY = y + h;
        let dy = denomStartY;

        const denomList = Object.entries(cc.denominations || {});
        let denomTotal = 0;

        denomList.forEach(([key, qty]) => {
          const value = Number(key);
          const amount = (Number(qty) || 0) * value;
          denomTotal += amount;

          const cells = [key, String(qty || 0), amount.toFixed(3)];
          const rh = measureRowHeight(doc, denomWidths, cells, 8, 4);
          drawRow(doc, pageLeft, dy, denomWidths, cells, rh, { fontSize: 8 });
          dy += rh;
        });

        (cc.foreignCurrency || []).forEach((fc) => {
          if (!fc.label && !fc.qty) return;
          const amount = (Number(fc.qty) || 0) * (Number(fc.value) || 0);
          denomTotal += amount;
          const cells = [fc.label || "FC", String(fc.qty || 0), amount.toFixed(3)];
          const rh = measureRowHeight(doc, denomWidths, cells, 8, 4);
          drawRow(doc, pageLeft, dy, denomWidths, cells, rh, { fontSize: 8 });
          dy += rh;
        });

        const rightX = pageLeft + 260;
        const rightWidths = [110, 90];
        let ry = y + h;

        const rightRows = [
          ["Tills Float", Number(cc.tillFloat || 0).toFixed(3)],
          ["Sale Cash (report)", Number(cc.saleCashPerReport || 0).toFixed(3)],
        ];

        rightRows.forEach((cells) => {
          const rh = measureRowHeight(doc, rightWidths, cells, 8, 4);
          drawRow(doc, rightX, ry, rightWidths, cells, rh, { fontSize: 8 });
          ry += rh;
        });

        const totalAsPerReport =
          (Number(cc.tillFloat) || 0) + (Number(cc.saleCashPerReport) || 0);
        const difference = denomTotal - totalAsPerReport;
        const diffColor = Math.abs(difference) < 0.001 ? "#1f7a4d" : "#c94f4f";

        const summaryRows = [
          ["Total Cash with Cashier", denomTotal.toFixed(3)],
          ["Total Cash as per Report", totalAsPerReport.toFixed(3)],
        ];

        summaryRows.forEach((cells) => {
          const rh = measureRowHeight(doc, rightWidths, cells, 8.5, 4);
          drawRow(doc, rightX, ry, rightWidths, cells, rh, {
            fontSize: 8.5,
            bold: true,
          });
          ry += rh;
        });

        const diffH = measureRowHeight(
          doc,
          rightWidths,
          ["Difference (Excess/Shortage)", `${difference.toFixed(3)}`],
          8.5,
          4,
        );
        drawRow(
          doc,
          rightX,
          ry,
          rightWidths,
          ["Difference (Excess/Shortage)", `${difference.toFixed(3)}`],
          diffH,
          { fontSize: 8.5, bold: true, textColor: diffColor },
        );
        ry += diffH;

        y = Math.max(dy, ry) + 10;

        if (cc.remarks) {
          doc
            .font("Helvetica")
            .fontSize(8)
            .fillColor("#374151")
            .text(`Remarks: ${cc.remarks}`, pageLeft, y, { width: pageWidth });
          y += 20;
        }
      }

      // ---------------- SIGN-OFF ----------------
      y += 20;
      y = ensureSpace(doc, y, 60);

      const signoffLabels = [
        "Auditor",
        "Audit Manager",
        "Ops Manager",
        "Store Manager",
      ];
      const signoffValues = [
        safe(audit.auditorname),
        "",
        safe(audit.opsmanagername),
        safe(audit.storemanagername, ""),
      ];
      const signW = pageWidth / 4;

      signoffLabels.forEach((label, i) => {
        const sx = pageLeft + i * signW;
        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#6b7280")
          .text(label.toUpperCase(), sx, y);
        doc
          .moveTo(sx, y + 34)
          .lineTo(sx + signW - 20, y + 34)
          .strokeColor("#333333")
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#333333")
          .text(signoffValues[i], sx, y + 38);
      });

      // ---------------- FOOTER ----------------
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#9ca3af")
        .text(
          `Apparel Group — Internal Audit & Compliance Division · Generated ${new Date().toLocaleString(
            "en-GB",
          )}`,
          pageLeft,
          doc.page.height - 30,
          { width: pageWidth, align: "center" },
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateAuditPdfBuffer };