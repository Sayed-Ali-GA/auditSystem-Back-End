const PDFDocument = require("pdfkit");

// ============================================================================
// Constants
// ============================================================================

const safe = (value, fallback = "-") =>
  value === null || value === undefined || value === "" ? fallback : value;

const num = (v) =>
  v === null || v === undefined || isNaN(Number(v)) ? null : Number(v);

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

const BHD_DENOMINATIONS = [
  { key: "20", label: "20.000", value: 20 },
  { key: "10", label: "10.000", value: 10 },
  { key: "5", label: "5.000", value: 5 },
  { key: "1", label: "1.000", value: 1 },
  { key: "0.500", label: "0.500", value: 0.5 },
  { key: "0.100", label: "0.100", value: 0.1 },
  { key: "0.050", label: "0.050", value: 0.05 },
  { key: "0.025", label: "0.025", value: 0.025 },
  { key: "0.010", label: "0.010", value: 0.01 },
];

// ============================================================================
// Data shaping
// ============================================================================

const buildReportSections = (evaluations) => {
  const majorMap = new Map();

  evaluations.forEach((ev) => {
    const majorName = ev.MajorCriteriaName || "General";
    const subName = ev.SubPointCriteria || "General";

    if (!majorMap.has(majorName)) {
      majorMap.set(majorName, new Map());
    }

    const subMap = majorMap.get(majorName);

    if (!subMap.has(subName)) {
      subMap.set(subName, []);
    }

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

    sections.push({
      number: majorIndex,
      name: majorName,
      subsections,
    });
  });

  return sections;
};

// ============================================================================
// Table helpers
// ============================================================================

const measureRowHeight = (
  doc,
  colWidths,
  cells,
  fontSize,
  padding,
  bold = false,
) => {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);

  let height = fontSize + padding * 2 + 4;

  cells.forEach((cell, i) => {
    const width = Math.max(10, colWidths[i] - padding * 2);

    const cellHeight = doc.heightOfString(String(cell ?? ""), {
      width,
      lineGap: 1,
    });

    height = Math.max(height, cellHeight + padding * 2);
  });

  return height;
};

// ============================================================================

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
    align = null,
  } = {},
) => {
  const totalWidth = colWidths.reduce((sum, width) => sum + width, 0);

  if (fill) {
    doc.save().rect(x, y, totalWidth, height).fill(fill).restore();
  }

  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);

  let currentX = x;

  cells.forEach((cell, i) => {
    const cellWidth = colWidths[i];

    doc
      .fillColor(textColor)
      .text(String(cell ?? ""), currentX + padding, y + padding, {
        width: Math.max(10, cellWidth - padding * 2),
        align: align && align[i] ? align[i] : "left",
        lineGap: 1,
      });

    currentX += cellWidth;
  });

  doc.strokeColor("#d1d5db").lineWidth(0.5);

  currentX = x;

  colWidths.forEach((width) => {
    doc.rect(currentX, y, width, height).stroke();

    currentX += width;
  });
};

// ============================================================================
// Page space helper
// ============================================================================

const ensureSpace = (doc, y, needed, marginTop = 40, bottomMargin = 48) => {
  const pageBottom = doc.page.height - bottomMargin;

  if (y + needed > pageBottom) {
    doc.addPage();

    return marginTop;
  }

  return y;
};

// ============================================================================
// Cash table
// ============================================================================

const drawCashTable = (
  doc,
  x,
  y,
  width,
  { title, headers, colRatios, rows, totalRow, emptyLabel },
) => {
  const colWidths = colRatios.map((ratio) => width * ratio);

  // --------------------------------------------------------------------------
  // Title
  // --------------------------------------------------------------------------

  y = ensureSpace(doc, y, 24);

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#1f2328")
    .text(title.toUpperCase(), x, y, {
      width,
      lineBreak: false,
    });

  y += 14;

  // --------------------------------------------------------------------------
  // Header
  // --------------------------------------------------------------------------

  let height = measureRowHeight(doc, colWidths, headers, 7.5, 4, true);

  y = ensureSpace(doc, y, height);

  drawRow(doc, x, y, colWidths, headers, height, {
    bold: true,
    fill: "#eceff1",
    fontSize: 7.5,
    align: headers.map((_, i) => (i === 0 ? "left" : "right")),
  });

  y += height;

  // --------------------------------------------------------------------------
  // Empty table
  // --------------------------------------------------------------------------

  if (rows.length === 0) {
    if (emptyLabel) {
      const cells = [emptyLabel, ...Array(headers.length - 1).fill("")];

      height = measureRowHeight(doc, colWidths, cells, 7.5, 4);

      y = ensureSpace(doc, y, height);

      drawRow(doc, x, y, colWidths, cells, height, {
        fontSize: 7.5,
        textColor: "#9ca3af",
      });

      y += height;
    }
  } else {
    // ------------------------------------------------------------------------
    // Data rows
    // ------------------------------------------------------------------------

    rows.forEach((cells) => {
      height = measureRowHeight(doc, colWidths, cells, 7.5, 4);

      y = ensureSpace(doc, y, height);

      drawRow(doc, x, y, colWidths, cells, height, {
        fontSize: 7.5,
        align: cells.map((_, i) => (i === 0 ? "left" : "right")),
      });

      y += height;
    });
  }

  // --------------------------------------------------------------------------
  // Total
  // --------------------------------------------------------------------------

  if (totalRow) {
    height = measureRowHeight(doc, colWidths, totalRow, 8, 4, true);

    y = ensureSpace(doc, y, height);

    drawRow(doc, x, y, colWidths, totalRow, height, {
      bold: true,
      fill: "#f0f0f0",
      fontSize: 8,
      align: totalRow.map((_, i) => (i === 0 ? "left" : "right")),
    });

    y += height;
  }

  return y + 10;
};

// ============================================================================
// Cashier card
// ============================================================================

const drawCashierCard = (doc, x, y, width, cashier, index) => {
  // ==========================================================================
  // A. NOTES & COINS
  // ==========================================================================

  const denomRows = BHD_DENOMINATIONS.filter(
    (d) => Number(cashier.denominations?.[d.key] || 0) > 0,
  );

  const denomTotal = BHD_DENOMINATIONS.reduce(
    (sum, d) => sum + Number(cashier.denominations?.[d.key] || 0) * d.value,
    0,
  );

  // ==========================================================================
  // FOREIGN CURRENCY
  // ==========================================================================

  const fcRows = (cashier.foreignCurrency || []).filter(
    (fc) => fc.label || fc.qty || fc.value,
  );

  const fcTotal = fcRows.reduce(
    (sum, fc) => sum + (Number(fc.qty) || 0) * (Number(fc.value) || 0),
    0,
  );

  // ==========================================================================
  // A. TOTAL CASH
  // ==========================================================================

  const countedTotal = denomTotal + fcTotal;

  // ==========================================================================
  // B. PAID BILLS / IOUs
  // ==========================================================================

  const paidBillsRows = (cashier.paidBills || []).filter(
    (bill) => bill.particular || bill.amount,
  );

  const paidBillsTotal = paidBillsRows.reduce(
    (sum, bill) => sum + (Number(bill.amount) || 0),
    0,
  );

  // ==========================================================================
  // C. REIMBURSEMENTS
  // ==========================================================================

  const reimbursementRows = (cashier.reimbursements || []).filter(
    (item) => item.particular || item.amount,
  );

  const reimbursementsTotal = reimbursementRows.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  );

  // ==========================================================================
  // GRAND TOTAL = A + B + C
  // ==========================================================================

  const grandTotal = countedTotal + paidBillsTotal + reimbursementsTotal;

  // ==========================================================================
  // REPORT TOTAL
  // ==========================================================================

  const reportTotal =
    (Number(cashier.tillFloat) || 0) + (Number(cashier.saleCashPerReport) || 0);

  // ==========================================================================
  // DIFFERENCE
  // ==========================================================================

  const difference = grandTotal - reportTotal;

  const isBalanced = Math.abs(difference) < 0.001;

  const diffColor = isBalanced ? "#1f7a4d" : "#b91c1c";

  const cardTop = y;

  // ==========================================================================
  // CASHIER HEADER
  // ==========================================================================

  const headerH = 26;

  y = ensureSpace(doc, y, headerH + 20);

  doc.rect(x, y, width, headerH).fill("#1f2328");

  // Cashier name

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#ffffff")
    .text(cashier.name || `Cashier ${index + 1}`, x + 10, y + 7, {
      width: width - 160,
      lineBreak: false,
    });

  // ==========================================================================
  // BALANCE CHIP
  // ==========================================================================

  const chipLabel = isBalanced
    ? "BALANCED"
    : `${difference > 0 ? "+" : ""}${difference.toFixed(3)} BHD`;

  const chipWidth = 120;

  doc
    .roundedRect(x + width - chipWidth - 10, y + 5, chipWidth, 16, 8)
    .fill(isBalanced ? "#2f6f4f" : "#ffffff");

  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(isBalanced ? "#ffffff" : "#b91c1c")
    .text(chipLabel, x + width - chipWidth - 10, y + 8, {
      width: chipWidth,
      align: "center",
      lineBreak: false,
    });

  y += headerH + 10;

  // ==========================================================================
  // TWO COLUMNS
  // ==========================================================================

  const gap = 16;

  const colWidth = (width - gap) / 2;

  const leftX = x;

  const rightX = x + colWidth + gap;

  let leftY = y;
  let rightY = y;

  // ==========================================================================
  // LEFT COLUMN
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Notes & Coins
  // --------------------------------------------------------------------------

  leftY = drawCashTable(doc, leftX, leftY, colWidth, {
    title: "Notes & Coins",

    headers: ["Denomination", "Qty", "Amount (BHD)"],

    colRatios: [0.5, 0.2, 0.3],

    rows: denomRows.map((d) => [
      d.label,

      String(Number(cashier.denominations?.[d.key] || 0)),

      (Number(cashier.denominations?.[d.key] || 0) * d.value).toFixed(3),
    ]),

    totalRow: ["Total", "", denomTotal.toFixed(3)],

    emptyLabel: "No notes or coins counted.",
  });

  // --------------------------------------------------------------------------
  // Foreign Currency
  // --------------------------------------------------------------------------

  if (fcRows.length > 0) {
    leftY = drawCashTable(doc, leftX, leftY, colWidth, {
      title: "Foreign Currency",

      headers: ["Currency", "Qty", "Amount (BHD)"],

      colRatios: [0.5, 0.2, 0.3],

      rows: fcRows.map((fc) => [
        fc.label || "FC",

        String(fc.qty || 0),

        ((Number(fc.qty) || 0) * (Number(fc.value) || 0)).toFixed(3),
      ]),

      totalRow: ["Total", "", fcTotal.toFixed(3)],

      emptyLabel: "",
    });
  }

  // --------------------------------------------------------------------------
  // B. Paid Bills / IOUs
  // --------------------------------------------------------------------------

  if (paidBillsRows.length > 0) {
    leftY = drawCashTable(doc, leftX, leftY, colWidth, {
      title: "B. Paid Bills / IOUs",

      headers: ["Particulars", "Amount (BHD)"],

      colRatios: [0.68, 0.32],

      rows: paidBillsRows.map((bill) => [
        bill.particular || "-",

        (Number(bill.amount) || 0).toFixed(3),
      ]),

      totalRow: ["Total (B)", paidBillsTotal.toFixed(3)],

      emptyLabel: "",
    });
  }

  // --------------------------------------------------------------------------
  // C. Reimbursements
  // --------------------------------------------------------------------------

  if (reimbursementRows.length > 0) {
    leftY = drawCashTable(doc, leftX, leftY, colWidth, {
      title: "C. Statements for Reimbursement",

      headers: ["Particulars", "Amount (BHD)"],

      colRatios: [0.68, 0.32],

      rows: reimbursementRows.map((item) => [
        item.particular || "-",

        (Number(item.amount) || 0).toFixed(3),
      ]),

      totalRow: ["Total (C)", reimbursementsTotal.toFixed(3)],

      emptyLabel: "",
    });
  }

  // ==========================================================================
  // RIGHT COLUMN
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Report Figures
  // --------------------------------------------------------------------------

  rightY = drawCashTable(doc, rightX, rightY, colWidth, {
    title: "Report Figures",

    headers: ["Figure", "", "Amount (BHD)"],

    colRatios: [0.5, 0.2, 0.3],

    rows: [
      ["Tills Float", "", Number(cashier.tillFloat || 0).toFixed(3)],

      [
        "Sale Cash (per report)",
        "",
        Number(cashier.saleCashPerReport || 0).toFixed(3),
      ],
    ],

    totalRow: ["Total as per Report", "", reportTotal.toFixed(3)],

    emptyLabel: "",
  });

  // ==========================================================================
  // CASH SUMMARY TABLE (Tills Float / Sale Cash / Total Cash with Cashier /
  // Total Cash as per Report / Difference)
  // ==========================================================================

  rightY = drawCashTable(doc, rightX, rightY, colWidth, {
    title: "Cash Summary",

    headers: ["Particulars", "", "Amount (BHD)"],

    colRatios: [0.5, 0.2, 0.3],

    rows: [
      ["Tills Float", "", Number(cashier.tillFloat || 0).toFixed(3)],

      [
        "Sale Cash (report)",
        "",
        Number(cashier.saleCashPerReport || 0).toFixed(3),
      ],

      ["Total Cash with Cashier", "", grandTotal.toFixed(3)],

      ["Total Cash as per Report", "", reportTotal.toFixed(3)],

      [
        "Difference (Excess/Shortage)",
        "",
        `${difference > 0 ? "+" : ""}${difference.toFixed(3)}`,
      ],
    ],

    totalRow: null,

    emptyLabel: "",
  });

  // ==========================================================================
  // A / B / C / GRAND TOTAL / REPORT / DIFFERENCE SUMMARY
  // ==========================================================================

  const summaryHeight = 120;

  rightY = ensureSpace(doc, rightY, summaryHeight + 10);

  doc
    .rect(rightX, rightY, colWidth, summaryHeight)
    .fillAndStroke("#f7f8f9", "#d9dcdf");

  const summaryLines = [
    {
      label: "Total Cash (A)",
      value: `${countedTotal.toFixed(3)} BHD`,
    },

    {
      label: "Paid Bills / IOUs (B)",
      value: `${paidBillsTotal.toFixed(3)} BHD`,
    },

    {
      label: "Statements for Reimbursement (C)",
      value: `${reimbursementsTotal.toFixed(3)} BHD`,
    },

    {
      label: "Grand Total (A+B+C)",
      value: `${grandTotal.toFixed(3)} BHD`,
      bold: true,
      divider: true,
    },

    {
      label: "As per Report",
      value: `${reportTotal.toFixed(3)} BHD`,
    },
  ];

  let sy = rightY + 8;

  summaryLines.forEach((line) => {
    if (line.divider) {
      doc
        .moveTo(rightX + 10, sy - 2)
        .lineTo(rightX + colWidth - 10, sy - 2)
        .strokeColor("#d9dcdf")
        .lineWidth(0.5)
        .stroke();

      sy += 4;
    }

    doc
      .font(line.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(line.bold ? 8.5 : 8)
      .fillColor(line.bold ? "#1f2328" : "#555555")
      .text(line.label, rightX + 10, sy, {
        width: colWidth * 0.6,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(line.bold ? 9 : 8.5)
      .fillColor(line.bold ? "#1f2328" : "#111827")
      .text(line.value, rightX + 10, sy, {
        width: colWidth - 20,
        align: "right",
        lineBreak: false,
      });

    sy += 14;
  });

  // Difference divider

  doc
    .moveTo(rightX + 10, sy + 2)
    .lineTo(rightX + colWidth - 10, sy + 2)
    .strokeColor("#d9dcdf")
    .lineWidth(0.5)
    .stroke();

  sy += 8;

  // Difference label

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#1f2328")
    .text("Difference Excess/Shortage", rightX + 10, sy, {
      width: colWidth * 0.6,
      lineBreak: false,
    });

  // Difference value

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(diffColor)
    .text(
      `${difference > 0 ? "+" : ""}${difference.toFixed(3)} BHD`,
      rightX + 10,
      sy,
      {
        width: colWidth - 20,
        align: "right",
        lineBreak: false,
      },
    );

  rightY += summaryHeight + 10;

  // ==========================================================================
  // REMARKS
  // ==========================================================================

  if (cashier.remarks && String(cashier.remarks).trim()) {
    rightY = ensureSpace(doc, rightY, 40);

    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor("#888888")
      .text("REMARKS", rightX, rightY, {
        lineBreak: false,
      });

    rightY += 11;

    const remarksText = String(cashier.remarks);

    const remarksHeight = doc.heightOfString(remarksText, {
      width: colWidth - 16,
      lineGap: 1,
    });

    doc
      .save()
      .rect(rightX, rightY, colWidth, remarksHeight + 12)
      .strokeColor("#d9dcdf")
      .lineWidth(0.6)
      .dash(2, {
        space: 2,
      })
      .stroke()
      .restore();

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#444444")
      .text(remarksText, rightX + 8, rightY + 6, {
        width: colWidth - 16,
        lineGap: 1,
      });

    rightY += remarksHeight + 12 + 10;
  }

  // ==========================================================================
  // CARD BORDER
  // ==========================================================================

  const cardBottom = Math.max(leftY, rightY);

  if (Math.ceil(cardBottom) < doc.page.height - 40) {
    doc
      .save()
      .rect(x - 6, cardTop - 6, width + 12, cardBottom - cardTop + 6)
      .strokeColor("#e5e7eb")
      .lineWidth(0.8)
      .stroke()
      .restore();
  }

  return cardBottom + 16;
};

// ============================================================================
// Main PDF generator
// ============================================================================

const generateAuditPdfBuffer = (audit) => {
  return new Promise((resolve, reject) => {
    try {
      // ====================================================================
      // Document
      // ====================================================================

      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 30,

        // Required for Page X of Y
        bufferPages: true,
      });

      const chunks = [];

      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);

      // ====================================================================
      // Page dimensions
      // ====================================================================

      const pageLeft = doc.page.margins.left;

      const pageRight = doc.page.margins.right;

      const pageWidth = doc.page.width - pageLeft - pageRight;

      // ====================================================================
      // LETTERHEAD
      // ====================================================================

      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .fillColor("#1f2328")
        .text("Apparel Group", pageLeft, 30, {
          lineBreak: false,
        });

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#6b7280")
        .text("Store Operations Audit Report", pageLeft, 50, {
          lineBreak: false,
        });

      // ====================================================================
      // RISK
      // ====================================================================

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
        .text(scoreText, pageLeft, 28, {
          width: pageWidth,
          align: "right",
          lineBreak: false,
        });

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
          lineBreak: false,
        });

      // Divider

      doc
        .moveTo(pageLeft, 78)
        .lineTo(pageLeft + pageWidth, 78)
        .strokeColor("#1f2328")
        .lineWidth(1.5)
        .stroke();

      // ====================================================================
      // META TABLE
      // ====================================================================

      let y = 90;

      const cashierNamesForMeta = (() => {
        if (Array.isArray(audit.cashcount) && audit.cashcount.length) {
          const names = audit.cashcount.map((c) => c.name).filter(Boolean);

          if (names.length) {
            return names.join(", ");
          }
        }

        return audit.cashiername || "-";
      })();

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

          ["Cashier(s)", safe(cashierNamesForMeta)],
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
            .text(label.toUpperCase(), cx + 4, y + 4, {
              lineBreak: false,
            });

          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .fillColor("#111827")
            .text(value, cx + 4, y + 16, {
              width: metaColWidth - 8,
              lineBreak: false,
            });
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

      // ====================================================================
      // FINDINGS TITLE
      // ====================================================================

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#1f2328")
        .text("Audit Findings", pageLeft, y, {
          lineBreak: false,
        });

      y += 18;

      // ====================================================================
      // FINDINGS TABLE
      // ====================================================================

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

      let h = measureRowHeight(doc, colWidths, headers, 8, 4, true);

      drawRow(doc, pageLeft, y, colWidths, headers, h, {
        bold: true,
        fill: "#f0f0f0",
        fontSize: 8,
      });

      y += h;

      // ====================================================================
      // Sections
      // ====================================================================

      const sections = buildReportSections(
        Array.isArray(audit.evaluations) ? audit.evaluations : [],
      );

      sections.forEach((section) => {
        // ---------------------------------------------------------------
        // Major
        // ---------------------------------------------------------------

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

        h = measureRowHeight(doc, colWidths, majorCells, 8.5, 4, true);

        drawRow(doc, pageLeft, y, colWidths, majorCells, h, {
          bold: true,
          fill: "#1f2328",
          textColor: "#ffffff",
        });

        y += h;

        // ---------------------------------------------------------------
        // Subsections
        // ---------------------------------------------------------------

        section.subsections.forEach((sub) => {
          y = ensureSpace(doc, y, 20);

          const subCells = [sub.number, sub.name, "", "", "", "", "", "", ""];

          h = measureRowHeight(doc, colWidths, subCells, 8, 4, true);

          drawRow(doc, pageLeft, y, colWidths, subCells, h, {
            bold: true,
            fill: "#e4e7e6",
          });

          y += h;

          // -----------------------------------------------------------
          // Items
          // -----------------------------------------------------------

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

            drawRow(doc, pageLeft, y, colWidths, cells, h, {
              fontSize: 7.5,
            });

            y += h;
          });
        });
      });

      // ====================================================================
      // SIGN-OFF
      // ====================================================================

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
          .text(label.toUpperCase(), sx, y, {
            lineBreak: false,
          });

        doc
          .moveTo(sx, y + 34)
          .lineTo(sx + signW - 20, y + 34)
          .strokeColor("#333333")
          .lineWidth(0.5)
          .stroke();

        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#333333")
          .text(signoffValues[i], sx, y + 38, {
            width: signW - 20,
            lineBreak: false,
          });
      });

      // ====================================================================
      // CASH RECONCILIATION DATA
      // ====================================================================

      let cashiersCashCount = [];

      if (audit.cashcount) {
        if (Array.isArray(audit.cashcount)) {
          cashiersCashCount = audit.cashcount;
        } else {
          // Legacy single till
          cashiersCashCount = [
            {
              name: audit.cashiername || "Cashier",

              ...audit.cashcount,
            },
          ];
        }
      }

      // ====================================================================
      // CASH RECONCILIATION
      // One complete page per cashier
      // ====================================================================

      if (cashiersCashCount.length > 0) {
        cashiersCashCount.forEach((cashier, index) => {
          // -------------------------------------------------------------
          // Every cashier starts on a new page
          // -------------------------------------------------------------

          doc.addPage();

          let cy = 40;

          // -------------------------------------------------------------
          // Header
          // -------------------------------------------------------------

          doc
            .font("Helvetica-Bold")
            .fontSize(16)
            .fillColor("#1f2328")
            .text("Cash Reconciliation", pageLeft, cy, {
              lineBreak: false,
            });

          doc
            .font("Helvetica")
            .fontSize(9)
            .fillColor("#6b7280")
            .text(
              `${safe(audit.storecode)} — ${safe(audit.brandname)} · ${
                audit.auditdate
                  ? new Date(audit.auditdate).toLocaleDateString("en-GB")
                  : "-"
              }`,
              pageLeft,
              cy + 20,
              {
                lineBreak: false,
              },
            );

          // Header divider

          doc
            .moveTo(pageLeft, cy + 38)
            .lineTo(pageLeft + pageWidth, cy + 38)
            .strokeColor("#1f2328")
            .lineWidth(1.2)
            .stroke();

          cy += 52;

          // -------------------------------------------------------------
          // Cashier card
          // -------------------------------------------------------------

          drawCashierCard(doc, pageLeft, cy, pageWidth, cashier, index);
        });
      }

      // ====================================================================
      // FOOTER / PAGE NUMBERS
      // ====================================================================

      const generatedAt = new Date().toLocaleString("en-GB");

      const range = doc.bufferedPageRange();

      const totalPages = range.count;

      for (let i = 0; i < totalPages; i++) {
        const pageIndex = range.start + i;

        doc.switchToPage(pageIndex);

        const footerText =
          `Apparel Group — Internal Audit & Compliance Division · ` +
          `Generated ${generatedAt} · ` +
          `Page ${i + 1} of ${totalPages}`;

        doc
          .font("Helvetica")
          .fontSize(8)
          .fillColor("#9ca3af")
          .text(footerText, pageLeft, doc.page.height - 24, {
            width: pageWidth,
            height: 10,
            align: "center",

            // Prevent footer from
            // generating another page
            lineBreak: false,
          });
      }

      // ====================================================================
      // END
      // ====================================================================

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// ============================================================================
// Export
// ============================================================================

module.exports = {
  generateAuditPdfBuffer,
};