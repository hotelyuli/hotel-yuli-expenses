import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Category → Excel row number mapping (1-indexed, Expenses 2026 sheet)
const CATEGORY_ROW = {
  // Payroll and Employee Costs
  "Planilla": 9,
  "CCSS": 10,
  "Henrry": 11,
  // Utilities
  "Accountant": 14,
  "Pool Maintenance": 15,
  "Gas": 16,
  "Electric": 17,
  "Water": 18,
  "Internet": 19,
  "Telephone": 20,
  "Strauss Water": 21,
  "Servicios Sanitarios JS": 22,
  "Google LLC": 23,
  "Google Ads": 24,
  "MNK Seguros": 25,
  "Hotel Competence LLC": 26,
  "Parqueo": 27,
  "OSA": 28,
  "Hacienda - Renta": 29,
  "Limpieza - Servicios Profesionales": 30,
  // Variable Operating — Supplies
  "HR Suplidora": 34,
  "Breakfast to go": 35,
  "Walmart / Varianza Pequeño": 36,
  // Variable Operating — Maintenance
  "Professional Services": 38,
  "AC Maintenance": 39,
  "NOVEX": 40,
  "Ferretería Palmares": 41,
  "Ferretería EPA S.A.": 42,
  "El Colono": 43,
  "Ferretería Iguana Verde": 44,
  "Maintenance and Repairs": 45,
  // Travel & Operations
  "Flights": 46,
  "Daily Expenses": 47,
  "Rental Car": 48,
  "Travel Expenses": 49,
  // OTA and Payment Commissions
  "Booking": 51,
  "Unique": 52,
  "Comision del Datafono": 54,
  "Comision por Transaccion": 55,
};

// Month → column index (0-indexed, col B=1, col C=2 = January)
const MONTH_COL = {
  "01": 2, "02": 3, "03": 4, "04": 5,
  "05": 6, "06": 7, "07": 8, "08": 9,
  "09": 10, "10": 11, "11": 12, "12": 13,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { year = "2026", rate = 520 } = req.body || {};

  try {
    // 1. Fetch approved expenses from Supabase
    const SUPA_URL = process.env.VITE_SUPABASE_URL;
    const SUPA_KEY = process.env.VITE_SUPABASE_ANON_KEY;

    const supaRes = await fetch(
      `${SUPA_URL}/rest/v1/expenses?status=eq.approved&select=*`,
      { headers: { "apikey": SUPA_KEY, "Authorization": `Bearer ${SUPA_KEY}` } }
    );
    if (!supaRes.ok) throw new Error(`Supabase fetch failed: ${supaRes.status}`);
    const expenses = await supaRes.json();

    // 2. Aggregate totals: { rowNum: { monthCol: amountUSD } }
    const grid = {};
    for (const exp of expenses) {
      if (!exp.monthKey) continue;
      const [y, m] = exp.monthKey.split("-");
      if (y !== year) continue;

      const row = CATEGORY_ROW[exp.category];
      const col = MONTH_COL[m];
      if (!row || !col) continue;

      // Convert to USD
      const amtUSD = exp.currency === "USD"
        ? exp.amount
        : exp.amount / rate;

      if (!grid[row]) grid[row] = {};
      grid[row][col] = (grid[row][col] || 0) + amtUSD;
    }

    // 3. Read template, modify with ExcelJS (pure JS, no Python needed)
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();

    // Template is bundled with the deployment
    const templatePath = path.join(process.cwd(), "HotelYuli_Template.xlsx");
    await wb.xlsx.readFile(templatePath);

    const ws = wb.getWorksheet("Expenses 2026");
    if (!ws) throw new Error("Sheet 'Expenses 2026' not found in template");

    // 4. Write values into cells — only write, never overwrite existing formulas in TOTAL rows
    const TOTAL_ROWS = new Set([12, 31, 37, 45, 56, 57]);
    for (const [rowStr, cols] of Object.entries(grid)) {
      const rowNum = parseInt(rowStr);
      if (TOTAL_ROWS.has(rowNum)) continue;
      for (const [colStr, val] of Object.entries(cols)) {
        const colNum = parseInt(colStr);
        const cell = ws.getCell(rowNum, colNum);
        // Round to 2 decimals
        cell.value = Math.round(val * 100) / 100;
      }
    }

    // 5. Return the Excel file
    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="HotelYuli_Expenses_${year}.xlsx"`);
    res.status(200).send(Buffer.from(buffer));

  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: err.message });
  }
}
