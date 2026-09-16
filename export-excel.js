const CATEGORY_ORDER = [
  "Payroll", "Employment taxes and CCSS", "Contractors and professional services",
  "Utilities", "Cleaning and housekeeping", "Guest and breakfast supplies",
  "Pool and garden maintenance", "Maintenance and repairs", "Waste and sanitation",
  "Parking and transportation", "Accounting and legal", "Insurance",
  "Taxes, permits and municipal fees", "Software and subscriptions",
  "Marketing and advertising", "OTA commissions", "Bank and card fees",
  "Travel expenses", "Furniture, equipment and capital purchases", "Other expenses",
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function styleHeader(row, color = "4D333E") {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${color}` } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 24;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { year = "2026", rate = 520 } = req.body || {};

  try {
    const supaUrl = process.env.VITE_SUPABASE_URL;
    const supaKey = process.env.VITE_SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey) throw new Error("Supabase environment variables are missing");

    const supaRes = await fetch(
      `${supaUrl}/rest/v1/expenses?status=eq.approved&date=gte.${year}-01-01&date=lte.${year}-12-31&select=*&order=date.asc`,
      { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
    );
    if (!supaRes.ok) throw new Error(`Supabase fetch failed: ${supaRes.status}`);
    const expenses = await supaRes.json();

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Hotel Yuli Expense Tracker";
    wb.created = new Date();

    const details = wb.addWorksheet("Expense Register", { views: [{ state: "frozen", ySplit: 1 }] });
    details.columns = [
      { header: "Date", key: "date", width: 13 }, { header: "Category", key: "category", width: 38 },
      { header: "Vendor / Payee", key: "vendor", width: 28 }, { header: "Invoice Number", key: "invoice_number", width: 22 },
      { header: "Description", key: "description", width: 35 }, { header: "Currency", key: "currency", width: 11 },
      { header: "Amount", key: "amount", width: 15 }, { header: "Amount USD", key: "amount_usd", width: 15 },
      { header: "Subtotal", key: "subtotal", width: 14 }, { header: "Tax / IVA", key: "tax_amount", width: 14 },
      { header: "Payment Method", key: "payment_method", width: 18 }, { header: "Bank Account", key: "bank_account", width: 17 },
      { header: "Submitted By", key: "submitted_by", width: 17 }, { header: "Invoice Attached", key: "invoice_attached", width: 17 },
      { header: "Reconciled", key: "matched", width: 13 }, { header: "Status", key: "status", width: 13 },
    ];
    styleHeader(details.getRow(1));

    const ordered = [...expenses].sort((a, b) => {
      const aIndex = CATEGORY_ORDER.indexOf(a.category);
      const bIndex = CATEGORY_ORDER.indexOf(b.category);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || String(a.date).localeCompare(String(b.date));
    });
    for (const expense of ordered) {
      details.addRow({ ...expense, date: new Date(`${expense.date}T00:00:00`), amount_usd: expense.currency === "USD" ? Number(expense.amount) : Number(expense.amount) / Number(rate), invoice_attached: expense.invoice_attached ? "Yes" : "No", matched: expense.matched ? "Yes" : "No" });
    }
    details.getColumn("amount").numFmt = "#,##0.00";
    details.getColumn("date").numFmt = "yyyy-mm-dd";
    details.getColumn("amount_usd").numFmt = '"$"#,##0.00';
    details.getColumn("subtotal").numFmt = "#,##0.00";
    details.getColumn("tax_amount").numFmt = "#,##0.00";
    details.autoFilter = { from: "A1", to: "P1" };

    const summary = wb.addWorksheet("Category Summary", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    summary.columns = [{ header: "Category", key: "category", width: 40 }, ...MONTH_NAMES.map((month) => ({ header: month, key: month, width: 14 })), { header: "Total USD", key: "total", width: 16 }];
    styleHeader(summary.getRow(1));
    CATEGORY_ORDER.forEach((category, categoryIndex) => {
      const rowNumber = categoryIndex + 2;
      const row = summary.addRow({ category });
      MONTH_NAMES.forEach((_, monthIndex) => {
        row.getCell(monthIndex + 2).value = { formula: `SUMIFS('Expense Register'!$H:$H,'Expense Register'!$B:$B,$A${rowNumber},'Expense Register'!$A:$A,">="&DATE(${year},${monthIndex + 1},1),'Expense Register'!$A:$A,"<"&EDATE(DATE(${year},${monthIndex + 1},1),1))` };
      });
      row.getCell(14).value = { formula: `SUM(B${rowNumber}:M${rowNumber})` };
    });
    const totalRow = summary.addRow({ category: "TOTAL" });
    totalRow.font = { bold: true };
    for (let column = 2; column <= 14; column += 1) {
      const letter = summary.getColumn(column).letter;
      totalRow.getCell(column).value = { formula: `SUM(${letter}2:${letter}${totalRow.number - 1})` };
      summary.getColumn(column).numFmt = '"$"#,##0.00';
    }

    const missing = wb.addWorksheet("Missing Documents");
    missing.columns = details.columns.map((column) => ({ header: column.header, key: column.key, width: column.width }));
    styleHeader(missing.getRow(1), "C97B77");
    ordered.filter((expense) => !expense.invoice_attached).forEach((expense) => missing.addRow({ ...expense, date: new Date(`${expense.date}T00:00:00`), amount_usd: expense.currency === "USD" ? Number(expense.amount) : Number(expense.amount) / Number(rate), invoice_attached: "No", matched: expense.matched ? "Yes" : "No" }));

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="HotelYuli_Expenses_${year}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error("Export error:", error);
    return res.status(500).json({ error: error.message });
  }
}
