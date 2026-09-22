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
// CashCount shape resolution
// ============================================================================
// CashCount (JSONB) can be in one of three shapes, oldest to newest:
//
// 1) Legacy single-till object: { denominations, foreignCurrency, tillFloat,
//    saleCashPerReport, paidBills, reimbursements, remarks }
//
// 2) Older multi-cashier array: [{ name, denominations, ..., paidBills,
//    reimbursements, storePettyCash }, ...] — Petty Cash fields were
//    mistakenly duplicated per-cashier in this revision.
//
// 3) Current shape: { cashiers: [{ name, denominations, foreignCurrency,
//    tillFloat, saleCashPerReport, remarks }], pettyCash: { denominations,
//    foreignCurrency, paidBills, reimbursements, floatBD, remarks } } —
//    Petty Cash is ONE section per store audit, independent of cashiers.
//
// This resolves any of the three into { cashiers, pettyCash }.
const resolveCashCount = (rawCashCount, fallbackCashierName) => {
  if (!rawCashCount) {
    return { cashiers: [], pettyCash: null };
  }

  // Current shape
  if (
    !Array.isArray(rawCashCount) &&
    typeof rawCashCount === "object" &&
    Array.isArray(rawCashCount.cashiers)
  ) {
    return {
      cashiers: rawCashCount.cashiers,
      pettyCash: rawCashCount.pettyCash || null,
    };
  }

  // Older multi-cashier array — migrate any legacy per-cashier Petty Cash
  // data (paidBills / reimbursements / storePettyCash) into a single
  // Petty Cash object, taken from whichever cashier actually has data.
  if (Array.isArray(rawCashCount)) {
    const legacySource = rawCashCount.find(
      (c) =>
        (c.paidBills || []).some((b) => b.amount || b.particular) ||
        (c.reimbursements || []).some((r) => r.amount || r.particular) ||
        Number(c.storePettyCash) > 0,
    );

    return {
      cashiers: rawCashCount,
      pettyCash: legacySource
        ? {
            denominations: {},
            foreignCurrency: [],
            paidBills: legacySource.paidBills || [],
            reimbursements: legacySource.reimbursements || [],
            floatBD: legacySource.storePettyCash ?? 0,
            remarks: "",
          }
        : null,
    };
  }

  // Legacy single-till object
  if (typeof rawCashCount === "object") {
    return {
      cashiers: [
        {
          name: fallbackCashierName || "Cashier",
          ...rawCashCount,
        },
      ],
      pettyCash: null,
    };
  }

  return { cashiers: [], pettyCash: null };
};

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
// Shared card chrome — dark header bar with name + balance chip
// ============================================================================

const drawCardHeader = (doc, x, y, width, title, isBalanced, difference) => {
  const headerH = 26;

  y = ensureSpace(doc, y, headerH + 20);

  doc.rect(x, y, width, headerH).fill("#1f2328");

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#ffffff")
    .text(title, x + 10, y + 7, {
      width: width - 160,
      lineBreak: false,
    });

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

  return y + headerH + 10;
};

// ============================================================================
// Remarks block (shared)
// ============================================================================

const drawRemarksBlock = (doc, x, y, width, remarks) => {
  if (!remarks || !String(remarks).trim()) return y;

  y = ensureSpace(doc, y, 40);

  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#888888")
    .text("REMARKS", x, y, { lineBreak: false });

  y += 11;

  const remarksText = String(remarks);

  const remarksHeight = doc.heightOfString(remarksText, {
    width: width - 16,
    lineGap: 1,
  });

  doc
    .save()
    .rect(x, y, width, remarksHeight + 12)
    .strokeColor("#d9dcdf")
    .lineWidth(0.6)
    .dash(2, { space: 2 })
    .stroke()
    .restore();

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#444444")
    .text(remarksText, x + 8, y + 6, {
      width: width - 16,
      lineGap: 1,
    });

  return y + remarksHeight + 12 + 10;
};

// ============================================================================
// Summary panel (shared) — a bordered box of label/value lines, with an
// optional bold divider line before the final "Difference" row.
// ============================================================================

const drawSummaryPanel = (doc, x, y, width, lines, diffLabel, diffValue, diffColor) => {
  const lineHeight = 14;
  const panelHeight = lines.length * lineHeight + 8 + 24;

  y = ensureSpace(doc, y, panelHeight + 10);

  doc.rect(x, y, width, panelHeight).fillAndStroke("#f7f8f9", "#d9dcdf");

  let sy = y + 8;

  lines.forEach((line) => {
    if (line.divider) {
      doc
        .moveTo(x + 10, sy - 2)
        .lineTo(x + width - 10, sy - 2)
        .strokeColor("#d9dcdf")
        .lineWidth(0.5)
        .stroke();

      sy += 4;
    }

    doc
      .font(line.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(line.bold ? 8.5 : 8)
      .fillColor(line.bold ? "#1f2328" : "#555555")
      .text(line.label, x + 10, sy, {
        width: width * 0.6,
        lineBreak: false,
      });

    doc
      .font("Helvetica-Bold")
      .fontSize(line.bold ? 9 : 8.5)
      .fillColor(line.bold ? "#1f2328" : "#111827")
      .text(line.value, x + 10, sy, {
        width: width - 20,
        align: "right",
        lineBreak: false,
      });

    sy += lineHeight;
  });

  doc
    .moveTo(x + 10, sy + 2)
    .lineTo(x + width - 10, sy + 2)
    .strokeColor("#d9dcdf")
    .lineWidth(0.5)
    .stroke();

  sy += 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor("#1f2328")
    .text(diffLabel, x + 10, sy, {
      width: width * 0.6,
      lineBreak: false,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(diffColor)
    .text(diffValue, x + 10, sy, {
      width: width - 20,
      align: "right",
      lineBreak: false,
    });

  return y + panelHeight + 10;
};

// ============================================================================
// Till Float card — ONE per cashier. Compares physical cash counted in the
// cashier's till (denominations + FC) against Tills Float + Sale Cash.
// Independent of Petty Cash (Paid Bills / Reimbursements / Float BD),
// which is a single, store-wide check — see drawPettyCashCard below.
// ============================================================================

const drawTillFloatCard = (doc, x, y, width, cashier, index) => {
  const denomRows = BHD_DENOMINATIONS.filter(
    (d) => Number(cashier.denominations?.[d.key] || 0) > 0,
  );

  const denomTotal = BHD_DENOMINATIONS.reduce(
    (sum, d) => sum + Number(cashier.denominations?.[d.key] || 0) * d.value,
    0,
  );

  const fcRows = (cashier.foreignCurrency || []).filter(
    (fc) => fc.label || fc.qty || fc.value,
  );

  const fcTotal = fcRows.reduce(
    (sum, fc) => sum + (Number(fc.qty) || 0) * (Number(fc.value) || 0),
    0,
  );

  const countedTotal = denomTotal + fcTotal; // A

  const reportTotal =
    (Number(cashier.tillFloat) || 0) + (Number(cashier.saleCashPerReport) || 0);

  const difference = countedTotal - reportTotal;

  const isBalanced = Math.abs(difference) < 0.001;

  const diffColor = isBalanced ? "#1f7a4d" : "#b91c1c";

  const cardTop = y;

  y = drawCardHeader(
    doc,
    x,
    y,
    width,
    `${cashier.name || `Cashier ${index + 1}`} — Till Float Check`,
    isBalanced,
    difference,
  );

  const gap = 16;
  const colWidth = (width - gap) / 2;
  const leftX = x;
  const rightX = x + colWidth + gap;

  let leftY = y;
  let rightY = y;

  // Left column — Notes & Coins, Foreign Currency
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

  // Right column — Report Figures + Summary
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

  rightY = drawSummaryPanel(
    doc,
    rightX,
    rightY,
    colWidth,
    [
      { label: "Total Cash with the Cashier (A)", value: `${countedTotal.toFixed(3)} BHD` },
      { label: "Total Cash as per Report", value: `${reportTotal.toFixed(3)} BHD`, divider: true },
    ],
    "Difference Excess/Shortage BD",
    `${difference > 0 ? "+" : ""}${difference.toFixed(3)} BHD`,
    diffColor,
  );

  rightY = drawRemarksBlock(doc, rightX, rightY, colWidth, cashier.remarks);

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
// Petty Cash card — ONE per store audit (NOT per cashier). Compares A
// (physical cash) + B (paid bills/IOUs) + C (reimbursement statements)
// against a single "Float BD" figure for the whole store.
// ============================================================================

const drawPettyCashCard = (doc, x, y, width, pettyCash) => {
  const denomRows = BHD_DENOMINATIONS.filter(
    (d) => Number(pettyCash.denominations?.[d.key] || 0) > 0,
  );

  const denomTotal = BHD_DENOMINATIONS.reduce(
    (sum, d) => sum + Number(pettyCash.denominations?.[d.key] || 0) * d.value,
    0,
  );

  const fcRows = (pettyCash.foreignCurrency || []).filter(
    (fc) => fc.label || fc.qty || fc.value,
  );

  const fcTotal = fcRows.reduce(
    (sum, fc) => sum + (Number(fc.qty) || 0) * (Number(fc.value) || 0),
    0,
  );

  const totalCash = denomTotal + fcTotal; // A

  const paidBillsRows = (pettyCash.paidBills || []).filter(
    (bill) => bill.particular || bill.amount,
  );

  const paidBillsTotal = paidBillsRows.reduce(
    (sum, bill) => sum + (Number(bill.amount) || 0),
    0,
  ); // B

  const reimbursementRows = (pettyCash.reimbursements || []).filter(
    (item) => item.particular || item.amount,
  );

  const reimbursementsTotal = reimbursementRows.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0,
  ); // C

  const grandTotal = totalCash + paidBillsTotal + reimbursementsTotal; // A+B+C

  const floatBD = Number(pettyCash.floatBD) || 0;

  const difference = floatBD - grandTotal;

  const isBalanced = Math.abs(difference) < 0.001;

  const diffColor = isBalanced ? "#1f7a4d" : "#b91c1c";

  const cardTop = y;

  y = drawCardHeader(
    doc,
    x,
    y,
    width,
    "Store Petty Cash Verification (one per store)",
    isBalanced,
    difference,
  );

  const gap = 16;
  const colWidth = (width - gap) / 2;
  const leftX = x;
  const rightX = x + colWidth + gap;

  let leftY = y;
  let rightY = y;

  // Left column — Notes & Coins, Foreign Currency, B, C
  leftY = drawCashTable(doc, leftX, leftY, colWidth, {
    title: "A. Notes & Coins",
    headers: ["Denomination", "Qty", "Amount (BHD)"],
    colRatios: [0.5, 0.2, 0.3],
    rows: denomRows.map((d) => [
      d.label,
      String(Number(pettyCash.denominations?.[d.key] || 0)),
      (Number(pettyCash.denominations?.[d.key] || 0) * d.value).toFixed(3),
    ]),
    totalRow: ["Total", "", denomTotal.toFixed(3)],
    emptyLabel: "No notes or coins counted.",
  });

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

  leftY = drawCashTable(doc, leftX, leftY, colWidth, {
    title: "B. Paid Bills / IOUs",
    headers: ["Particulars", "Amount (BHD)"],
    colRatios: [0.68, 0.32],
    rows: paidBillsRows.map((bill) => [
      bill.particular || "-",
      (Number(bill.amount) || 0).toFixed(3),
    ]),
    totalRow: ["Total (B)", paidBillsTotal.toFixed(3)],
    emptyLabel: "No paid bills / IOUs recorded.",
  });

  leftY = drawCashTable(doc, leftX, leftY, colWidth, {
    title: "C. Statements for Reimbursement",
    headers: ["Particulars", "Amount (BHD)"],
    colRatios: [0.68, 0.32],
    rows: reimbursementRows.map((item) => [
      item.particular || "-",
      (Number(item.amount) || 0).toFixed(3),
    ]),
    totalRow: ["Total (C)", reimbursementsTotal.toFixed(3)],
    emptyLabel: "No reimbursement statements recorded.",
  });

  // Right column — A+B+C+Float BD summary + remarks
  rightY = drawSummaryPanel(
    doc,
    rightX,
    rightY,
    colWidth,
    [
      { label: "Total Cash (A)", value: `${totalCash.toFixed(3)} BHD` },
      { label: "Paid Bills / IOUs (B)", value: `${paidBillsTotal.toFixed(3)} BHD` },
      { label: "Statements for Reimbursement (C)", value: `${reimbursementsTotal.toFixed(3)} BHD` },
      { label: "Grand Total (A+B+C)", value: `${grandTotal.toFixed(3)} BHD`, bold: true, divider: true },
      { label: "Float BD", value: `${floatBD.toFixed(3)} BHD` },
    ],
    "Difference Excess/Shortage BD",
    `${difference > 0 ? "+" : ""}${difference.toFixed(3)} BHD`,
    diffColor,
  );

  rightY = drawRemarksBlock(doc, rightX, rightY, colWidth, pettyCash.remarks);

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
      // CASH COUNT — resolve once up front, used both in the meta table
      // (cashier names) and in the Cash Reconciliation pages below.
      // ====================================================================

      const { cashiers: cashiersCashCount, pettyCash: pettyCashData } =
        resolveCashCount(audit.cashcount, audit.cashiername);

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
        const names = cashiersCashCount.map((c) => c.name).filter(Boolean);

        if (names.length) {
          return names.join(", ");
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
      // CASH RECONCILIATION
      // One page per cashier (Till Float check), then ONE final page for
      // the store-wide Petty Cash check, if present.
      // ====================================================================

      if (cashiersCashCount.length > 0 || pettyCashData) {
        cashiersCashCount.forEach((cashier, index) => {
          // Every cashier starts on a new page

          doc.addPage();

          let cy = 40;

          doc
            .font("Helvetica-Bold")
            .fontSize(16)
            .fillColor("#1f2328")
            .text("Cash Reconciliation — Till Float", pageLeft, cy, {
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

          doc
            .moveTo(pageLeft, cy + 38)
            .lineTo(pageLeft + pageWidth, cy + 38)
            .strokeColor("#1f2328")
            .lineWidth(1.2)
            .stroke();

          cy += 52;

          drawTillFloatCard(doc, pageLeft, cy, pageWidth, cashier, index);
        });

        // ------------------------------------------------------------
        // Store Petty Cash — ONE page, printed once regardless of how
        // many cashiers there are.
        // ------------------------------------------------------------

        if (pettyCashData) {
          doc.addPage();

          let cy = 40;

          doc
            .font("Helvetica-Bold")
            .fontSize(16)
            .fillColor("#1f2328")
            .text("Cash Reconciliation — Store Petty Cash", pageLeft, cy, {
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

          doc
            .moveTo(pageLeft, cy + 38)
            .lineTo(pageLeft + pageWidth, cy + 38)
            .strokeColor("#1f2328")
            .lineWidth(1.2)
            .stroke();

          cy += 52;

          drawPettyCashCard(doc, pageLeft, cy, pageWidth, pettyCashData);
        }
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