import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
// Grouped expense categories matching Hotel Yuli chart of accounts
const CATEGORY_GROUPS = [
  {
    group: "Employee Costs",
    items: ["Planilla", "CCSS"],
  },
  {
    group: "Fixed Operating Expenses",
    items: [
      "Accountant",
      "Pool Maintenance",
      "Gas",
      "Electric",
      "Water",
      "Internet",
      "Telephone",
      "Strauss Water",
      "Servicios Sanitarios JS",
      "Google LLC",
      "Google Ads",
      "MNK Seguros",
      "Hotel Competence LLC",
      "Parqueo",
      "OSA",
      "Hacienda - Renta",
      "Limpieza - Servicios Profesionales",
    ],
  },
  {
    group: "Variable Operating — Supplies",
    items: [
      "HR Suplidora",
      "Walmart / Varianza Pequeño",
    ],
  },
  {
    group: "Variable Operating — Maintenance",
    items: [
      "External Maintenance",
      "AC Maintenance",
      "NOVEX",
      "Ferretería Palmares",
      "Ferretería EPA S.A.",
      "El Colono",
      "Ferretería Iguana Verde",
      "General Maintenance",
    ],
  },
  {
    group: "Travel & Operations",
    items: [
      "Flights",
      "Daily Expenses",
      "Rental Car",
      "Travel Expenses",
    ],
  },
  {
    group: "Commissions & Bookings",
    items: [
      "Comisión",
      "Booking",
      "Unique",
    ],
  },
];

// Flat list for validation / AI matching
const CATEGORIES = CATEGORY_GROUPS.flatMap((g) => g.items);

const CURRENCIES = ["USD", "CRC"];
const BANK_ACCOUNTS = ["BAC USD Account", "BAC CRC Account"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Staff & admin config
const STAFF = ["Frenesi", "Diana", "Roberto", "Rene", "Michelle", "Yusrei", "Milka"];
const ADMINS = ["Yusrei", "Diana", "Milka"];
const ADMIN_PIN = "0995";

// Hotel Yuli Guest Guide palette
const B = {
  darkWine: "#4D333E",
  darkWineLight: "#6B4A58",
  terracotta: "#C97B77",
  terracottaLight: "#D99A97",
  terracottaDark: "#A8625E",
  cream: "#FAF8F5",
  blush: "#F0EAE4",
  blushDark: "#E4DCD4",
  white: "#FFFFFF",
  textDark: "#4D333E",
  textMid: "#7A616B",
  textLight: "#A08E96",
  green: "#5A9E6F",
  greenLight: "#EDF6F0",
  greenDark: "#3D7A4F",
  red: "#C45050",
  redLight: "#FDF0F0",
  whatsapp: "#25D366",
  whatsappDark: "#1DA851",
};

// ─── Storage helpers (localStorage for production) ───────────────────────────
const STORE_KEY = "yuli-expenses-v3";

async function loadData() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function saveData(data) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  catch (e) { console.error("Save failed:", e); }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function getMonthKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

function formatCurrency(amount, currency) {
  if (currency === "CRC") return `₡${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

const DEFAULT_DATA = { expenses: [], bankStatements: [], monthlyReports: {} };

// ─── AI Invoice Scanner ──────────────────────────────────────────────────────
async function scanInvoiceWithAI(base64Data, mediaType, isPdf = false) {
  const groupedStr = CATEGORY_GROUPS.map((g) => `${g.group}: [${g.items.join(", ")}]`).join("; ");
  
  // Build the content block — PDF uses "document" type, images use "image" type
  const fileBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: `Eres un extractor de datos de facturas para Hotel Yuli, un hotel boutique en Uvita, Costa Rica. La mayoría de los documentos están en ESPAÑOL costarricense.

ANALIZA esta imagen cuidadosamente. Puede ser:
- Factura electrónica de Costa Rica (con cédula jurídica, consecutivo, clave numérica)
- Tiquete electrónico / comprobante de caja
- Recibo de pago / comprobante de transferencia bancaria (SINPE, BAC, BCR)
- Captura de pantalla de pago móvil (SINPE Móvil)
- Factura de servicios públicos (ICE, CNFL, AyA, Coopeguanacaste, JASEC)
- Recibo de planilla / CCSS
- Factura de proveedor (ferretería, supermercado, distribuidor)
- Cualquier otro documento de gasto

BUSCA estos campos en el documento (pueden estar en español):
- TOTAL / Total a pagar / Monto / Importe / Total General / Total Venta / Saldo
- Fecha / Date / Fecha de emisión / Fecha factura
- Nombre del emisor / Razón social / Proveedor / Vendedor / De:
- Descripción / Detalle / Concepto / Líneas de detalle

IMPORTANTE sobre montos:
- Si ves ₡ o "colones" o montos grandes sin símbolo (ej: 125.000 o 85,500) → CRC
- Si ves $ o "dólares" o "USD" → USD  
- En Costa Rica el formato de números puede ser: 125.000,00 o 125,000.00 — ambos significan ciento veinticinco mil
- Busca el TOTAL FINAL, no subtotales. Si hay IVA, usa el total con IVA incluido
- Si hay múltiples montos, usa "Total" / "Total a Pagar" / el monto más grande al final

Responde SOLO con un objeto JSON (sin markdown, sin backticks, sin explicación):
{
  "amount": number (solo el número, sin símbolos de moneda. Ej: 125000 no "₡125.000"),
  "currency": "USD" o "CRC",
  "vendor": "string" (nombre del negocio o persona que emitió la factura),
  "date": "YYYY-MM-DD" (fecha del documento),
  "category": "string" (DEBE ser exactamente uno de estos valores: ${groupedStr}),
  "description": "string" (resumen de 5-10 palabras en inglés de lo que se compró),
  "confidence": "high" o "medium" o "low"
}

Reglas de categoría:
- ICE/CNFL/Coopeguanacaste/JASEC → "Electric"
- AyA/ASADA/acueducto → "Water"  
- ICE Internet/Tigo/Claro/Kolbi → "Internet"
- ICE Telefonía/Claro/Tigo celular → "Telephone"
- HR Suplidora → "HR Suplidora"
- EPA/Ferretería EPA → "Ferretería EPA S.A."
- El Colono → "El Colono"
- Ferretería Palmares → "Ferretería Palmares"
- Iguana Verde → "Ferretería Iguana Verde"
- NOVEX → "NOVEX"
- Walmart/Pequeño Mundo/PriceSmart/Auto Mercado → "Walmart / Varianza Pequeño"
- Google/Meta/Facebook Ads → "Google Ads"
- CCSS/Caja Costarricense → "CCSS"
- Planilla/nómina/salario → "Planilla"
- Aire acondicionado/AC repair → "AC Maintenance"
- Piscina/pool/cloro/químicos piscina → "Pool Maintenance"
- Strauss/dispensador agua → "Strauss Water"
- MNK/seguros/póliza → "MNK Seguros"
- Municipalidad/patente/permiso → "OSA"
- Hacienda/renta/impuesto → "Hacienda - Renta"
- Limpieza/cleaning service → "Limpieza - Servicios Profesionales"
- Booking.com/comisión reserva → "Booking"
- Si hay transferencia SINPE a persona (salario), usa "Planilla"
- Si no reconoces al proveedor, usa "General Maintenance" o "External Maintenance"

Si un campo no se puede determinar, usa null. Si la imagen está borrosa o ilegible, intenta extraer lo que puedas y usa confidence "low".` },
        ],
      }],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("API error:", response.status, errBody);
    throw new Error(`API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await response.json();
  // Check for API-level errors
  if (data.error) {
    console.error("API returned error:", data.error);
    throw new Error(data.error.message || "API error");
  }
  const text = data.content?.map((b) => (b.type === "text" ? b.text : "")).join("") || "";
  if (!text) {
    console.error("API returned empty content:", JSON.stringify(data).slice(0, 500));
    throw new Error("Empty API response");
  }
  // Clean response — handle various AI output formats
  let clean = text.replace(/```json|```/g, "").trim();
  // Find JSON object in response if there's extra text
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) clean = jsonMatch[0];
  try {
    return JSON.parse(clean);
  } catch (parseErr) {
    console.error("AI response parse failed:", clean);
    // Return partial result so form still works
    return { amount: null, currency: null, vendor: null, date: null, category: null, description: null, confidence: "low" };
  }
}

// ─── WhatsApp Share ──────────────────────────────────────────────────────────
function buildWhatsAppMessage(expense) {
  const curr = expense.currency === "CRC" ? `₡${Number(expense.amount).toLocaleString()}` : `$${Number(expense.amount).toFixed(2)}`;
  const lines = [
    `📋 *Expense Report — Hotel Yuli*`,
    ``,
    `💰 *${curr} ${expense.currency}*`,
    `📂 ${expense.category}`,
    expense.vendor ? `🏪 ${expense.vendor}` : null,
    `📅 ${formatDate(expense.date)}`,
    `💳 ${expense.paymentMethod}${expense.bankAccount ? ` · ${expense.bankAccount}` : ""}`,
    `👤 ${expense.submittedBy}`,
    expense.description ? `📝 ${expense.description}` : null,
    `🧾 Invoice: ${expense.invoiceAttached ? "✓ Attached in app" : "✗ Not attached"}`,
    ``,
    `_Submitted via Hotel Yuli Expense Tracker_`,
  ].filter(Boolean);
  return encodeURIComponent(lines.join("\n"));
}

function openWhatsAppShare(expense) {
  const msg = buildWhatsAppMessage(expense);
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Camera: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  Check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  X: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  FileText: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  BarChart: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>,
  Send: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Trash: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  ChevronDown: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Sparkle: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>,
  Scan: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>,
  Wand: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="M11 6.2L9.7 5"/><path d="M11 11.8l-1.3 1.2"/><path d="M3 21l9-9"/></svg>,
  WhatsApp: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  NewExpense: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
};

// ─── Scanning Animation ──────────────────────────────────────────────────────
function ScanningOverlay({ message }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(77,51,62,0.88)", borderRadius: "12px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px", zIndex: 10 }}>
      <div style={{ position: "relative", width: "48px", height: "48px" }}>
        <div style={{ width: "48px", height: "48px", border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid white", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", color: B.white }}><Icons.Wand /></div>
      </div>
      <div style={{ color: "white", fontSize: "14px", fontWeight: 600, textAlign: "center", padding: "0 20px" }}>{message}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ConfidenceBadge({ level }) {
  const colors = {
    high: { bg: B.greenLight, text: B.greenDark, label: "AI: High confidence" },
    medium: { bg: "#FFF8E1", text: "#D4890B", label: "AI: Review suggested" },
    low: { bg: B.redLight, text: B.red, label: "AI: Low confidence — check values" },
  };
  const c = colors[level] || colors.medium;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: c.text, background: c.bg, padding: "4px 10px", borderRadius: "6px" }}>
      <Icons.Sparkle /> {c.label}
    </div>
  );
}

// ─── Success Screen (WhatsApp already opened) ───────────────────────────────
function SubmitSuccess({ expense, onNewExpense }) {
  const curr = expense.currency === "CRC" ? `₡${Number(expense.amount).toLocaleString()}` : `$${Number(expense.amount).toFixed(2)}`;

  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      {/* Success animation */}
      <div style={{
        width: "72px", height: "72px", borderRadius: "50%", background: B.greenLight,
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
        animation: "popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={B.greenDark} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>

      <h2 style={{ fontSize: "20px", fontWeight: 700, color: B.textDark, margin: "0 0 6px" }}>Saved & Sent!</h2>
      <div style={{ fontSize: "24px", fontWeight: 700, color: B.darkWine, marginBottom: "4px" }}>{curr}</div>
      <div style={{ fontSize: "14px", color: B.textMid, marginBottom: "8px" }}>
        {expense.category}{expense.vendor ? ` · ${expense.vendor}` : ""}
      </div>

      {/* Status badges */}
      <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, color: B.greenDark, background: B.greenLight, padding: "4px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
          <Icons.Check /> Saved to report
        </span>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#128C7E", background: "#E8F8F5", padding: "4px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px" }}>
          <Icons.WhatsApp /> WhatsApp opened
        </span>
      </div>

      {/* Summary card */}
      <div style={{ background: B.blush, borderRadius: "14px", padding: "16px", textAlign: "left", marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "13px" }}>
          <div><span style={{ color: B.textLight }}>Date:</span> <span style={{ color: B.textDark, fontWeight: 500 }}>{formatDate(expense.date)}</span></div>
          <div><span style={{ color: B.textLight }}>Payment:</span> <span style={{ color: B.textDark, fontWeight: 500 }}>{expense.paymentMethod}</span></div>
          <div><span style={{ color: B.textLight }}>Bank:</span> <span style={{ color: B.textDark, fontWeight: 500 }}>{expense.bankAccount || "—"}</span></div>
          <div><span style={{ color: B.textLight }}>Invoice:</span> <span style={{ color: expense.invoiceAttached ? B.greenDark : B.red, fontWeight: 500 }}>{expense.invoiceAttached ? "✓ Attached" : "✗ Missing"}</span></div>
        </div>
        {expense.description && <div style={{ fontSize: "13px", color: B.textMid, marginTop: "8px", paddingTop: "8px", borderTop: `1px solid ${B.blushDark}` }}>{expense.description}</div>}
      </div>

      {/* New Expense — primary action now */}
      <button onClick={onNewExpense} style={{
        width: "100%", padding: "14px", borderRadius: "12px", border: "none",
        background: B.darkWine, color: B.white, fontSize: "15px", fontWeight: 700,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        transition: "all 0.2s", marginBottom: "10px",
      }}>
        <Icons.NewExpense /> Submit Another Expense
      </button>

      {/* Re-share to WhatsApp if needed */}
      <button onClick={() => openWhatsAppShare(expense)} style={{
        width: "100%", padding: "12px", borderRadius: "12px", border: `1.5px solid ${B.blushDark}`,
        background: B.white, color: B.textMid, fontSize: "13px", fontWeight: 600,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        transition: "all 0.2s",
      }}>
        <Icons.WhatsApp /> Didn't send? Share again
      </button>

      <style>{`@keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Login Screen ────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [selected, setSelected] = useState(null);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const pinRef = useRef(null);

  const handleSelect = (name) => {
    setSelected(name);
    setShowPin(false);
    setPin("");
    setPinError(false);
  };

  const handleContinue = () => {
    if (!selected) return;
    const isAdmin = ADMINS.includes(selected);
    if (isAdmin && !showPin) {
      setShowPin(true);
      setTimeout(() => pinRef.current?.focus(), 100);
      return;
    }
    if (isAdmin && showPin) {
      if (pin === ADMIN_PIN) {
        onLogin(selected, "admin");
      } else {
        setPinError(true);
        setPin("");
        setTimeout(() => setPinError(false), 1500);
      }
      return;
    }
    // Non-admin staff
    onLogin(selected, "staff");
  };

  const handleStaffOnly = () => {
    if (selected && ADMINS.includes(selected)) {
      onLogin(selected, "staff");
    }
  };

  const getInitial = (name) => name.charAt(0).toUpperCase();
  const colors = ["#C97B77", "#7BA3C9", "#7BC98A", "#C9B87B", "#9B7BC9", "#C97BAE", "#7BC9C1"];

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: B.cream, fontFamily: "system-ui, -apple-system, sans-serif", padding: "20px" }}>
      <div style={{ background: B.white, borderRadius: "16px", padding: "36px 28px", maxWidth: "400px", width: "100%", boxShadow: "0 4px 24px rgba(77,51,62,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontSize: "24px", color: B.darkWine, fontWeight: 600, letterSpacing: "0.06em", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>HOTEL YULI</div>
          <div style={{ fontSize: "14px", color: B.terracotta, marginTop: "4px", fontWeight: 500 }}>Expense Tracker</div>
        </div>

        <div style={{ fontSize: "13px", fontWeight: 600, color: B.textMid, marginBottom: "12px" }}>Who are you?</div>

        {/* Staff grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" }}>
          {STAFF.map((name, i) => {
            const isSelected = selected === name;
            const isAdmin = ADMINS.includes(name);
            return (
              <button key={name} onClick={() => handleSelect(name)} style={{
                padding: "14px 12px", borderRadius: "12px", border: isSelected ? `2px solid ${B.terracotta}` : `1.5px solid ${B.blushDark}`,
                background: isSelected ? B.blush : B.white, cursor: "pointer",
                display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s",
                transform: isSelected ? "scale(1.02)" : "scale(1)",
              }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "50%", background: colors[i % colors.length],
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: B.white, fontSize: "15px", fontWeight: 700, flexShrink: 0,
                }}>
                  {getInitial(name)}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: B.textDark }}>{name}</div>
                  {isAdmin && <div style={{ fontSize: "10px", color: B.terracotta, fontWeight: 600 }}>Admin</div>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Admin PIN entry */}
        {showPin && (
          <div style={{ marginBottom: "16px", animation: "slideUp 0.2s ease" }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: B.textMid, marginBottom: "6px" }}>Admin PIN</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") handleContinue(); }}
                placeholder="····"
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: "10px", fontSize: "20px", fontWeight: 600,
                  textAlign: "center", letterSpacing: "8px",
                  border: `1.5px solid ${pinError ? B.red : B.blushDark}`,
                  background: pinError ? B.redLight : B.cream,
                  color: B.textDark, outline: "none", transition: "all 0.2s",
                }}
              />
            </div>
            {pinError && <div style={{ fontSize: "12px", color: B.red, fontWeight: 600, marginTop: "6px" }}>Wrong PIN — try again</div>}
            <button onClick={handleStaffOnly} style={{
              background: "none", border: "none", color: B.textLight, fontSize: "11px",
              cursor: "pointer", textDecoration: "underline", marginTop: "8px", padding: 0,
            }}>
              Continue as staff instead
            </button>
          </div>
        )}

        {/* Continue button */}
        <button onClick={handleContinue} disabled={!selected} style={{
          width: "100%", padding: "14px", borderRadius: "12px", border: "none",
          background: !selected ? B.blushDark : B.darkWine, color: B.white,
          fontSize: "15px", fontWeight: 700, cursor: !selected ? "default" : "pointer",
          transition: "all 0.2s", opacity: !selected ? 0.5 : 1,
        }}>
          {!selected ? "Select your name" : showPin ? "Enter as Admin" : ADMINS.includes(selected) ? "Continue →" : "Enter"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function ExpenseApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("submit");
  const [role, setRole] = useState("staff");
  const [staffName, setStaffName] = useState("");
  const [nameSet, setNameSet] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const saved = await loadData();
      setData(saved || { ...DEFAULT_DATA });
      setLoading(false);
    })();
  }, []);

  const persist = useCallback(async (newData) => {
    setData(newData);
    await saveData(newData);
  }, []);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === "error" ? 8000 : 3000);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: B.cream, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "28px", color: B.darkWine, fontWeight: 600, letterSpacing: "0.05em" }}>HOTEL YULI</div>
          <div style={{ fontSize: "13px", color: B.textLight, marginTop: "8px", fontFamily: "system-ui, sans-serif" }}>Loading expense tracker...</div>
        </div>
      </div>
    );
  }

  if (!nameSet) {
    return <LoginScreen onLogin={(name, role) => { setStaffName(name); setRole(role); setNameSet(true); }} />;
  }

  const navItems = role === "admin"
    ? [{ id: "submit", label: "Submit", icon: <Icons.Plus /> }, { id: "review", label: "Review", icon: <Icons.FileText /> }, { id: "report", label: "Reports", icon: <Icons.BarChart /> }]
    : [{ id: "submit", label: "Submit", icon: <Icons.Plus /> }, { id: "myexpenses", label: "My Expenses", icon: <Icons.FileText /> }];

  return (
    <div style={{ minHeight: "100vh", background: B.cream, fontFamily: "system-ui, -apple-system, sans-serif", position: "relative" }}>
      {/* Header */}
      <div style={{ background: B.darkWine, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ color: B.white, fontSize: "16px", fontWeight: 600, letterSpacing: "0.06em", fontFamily: "'Cormorant Garamond', Georgia, serif" }}>HOTEL YULI</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px" }}>Expense Tracker</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>{staffName}</span>
          <span style={{ background: role === "admin" ? B.terracotta : "rgba(255,255,255,0.15)", color: B.white, fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{role}</span>
          <button onClick={() => { setNameSet(false); setStaffName(""); setRole("staff"); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", cursor: "pointer", fontSize: "11px", textDecoration: "underline" }}>Switch</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", background: B.white, borderBottom: `1px solid ${B.blushDark}`, position: "sticky", top: "56px", zIndex: 99 }}>
        {navItems.map((item) => (
          <button key={item.id} onClick={() => setView(item.id)} style={{
            flex: 1, padding: "12px 8px 10px", background: "none", border: "none",
            borderBottom: view === item.id ? `2.5px solid ${B.terracotta}` : "2.5px solid transparent",
            color: view === item.id ? B.darkWine : B.textLight, fontSize: "12px",
            fontWeight: view === item.id ? 700 : 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", transition: "all 0.2s",
          }}>{item.icon} {item.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px", maxWidth: "600px", margin: "0 auto" }}>
        {view === "submit" && <SubmitExpense data={data} persist={persist} staffName={staffName} showToast={showToast} />}
        {view === "myexpenses" && <MyExpenses data={data} staffName={staffName} />}
        {view === "review" && role === "admin" && <ReviewExpenses data={data} persist={persist} showToast={showToast} />}
        {view === "report" && role === "admin" && <MonthlyReport data={data} persist={persist} showToast={showToast} />}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: toast.type === "success" ? B.greenDark : B.red, color: B.white,
          padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 600,
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 1000, animation: "slideUp 0.3s ease",
        }}>{toast.msg}</div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
        @keyframes slideUp { from { opacity:0; transform: translateX(-50%) translateY(20px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: ${B.terracotta} !important; outline: none; }
      `}</style>
    </div>
  );
}

// ─── Submit Expense (with AI Scanner + WhatsApp Share) ───────────────────────
function SubmitExpense({ data, persist, staffName, showToast }) {
  const [form, setForm] = useState({
    amount: "", currency: "USD", category: "", description: "",
    bankAccount: "", paymentMethod: "Transfer", vendor: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [invoiceData, setInvoiceData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [aiConfidence, setAiConfidence] = useState(null);
  const [aiFieldsSet, setAiFieldsSet] = useState(new Set());
  const [submittedExpense, setSubmittedExpense] = useState(null); // for success screen
  const fileRef = useRef(null);

  // Compress image to max ~1200px wide for API
  const compressImage = (dataUrl, maxWidth = 1200, quality = 0.8) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      };
      img.onerror = () => resolve(dataUrl); // fallback to original
      img.src = dataUrl;
    });
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      let dataUrl = ev.target.result;
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      setInvoiceData({ name: file.name, type: file.type, dataUrl });

      setScanning(true);
      setScanMessage("Preparing file...");

      let base64, mediaType;

      if (isPdf) {
        // PDF: send raw base64, no compression, show PDF icon as preview
        setInvoicePreview(null); // no image preview for PDF
        base64 = dataUrl.split(",")[1];
        mediaType = "application/pdf";
      } else {
        // Image: compress and preview
        try {
          const compressed = await compressImage(dataUrl);
          dataUrl = compressed;
          setInvoicePreview(compressed);
        } catch {
          setInvoicePreview(dataUrl);
        }
        base64 = dataUrl.split(",")[1];
        mediaType = "image/jpeg";
      }

      setScanMessage("Leyendo factura...");
      try {
        setTimeout(() => setScanMessage("Extrayendo montos y proveedor..."), 1500);
        setTimeout(() => setScanMessage("Clasificando categoría..."), 3000);

        const result = await scanInvoiceWithAI(base64, mediaType, isPdf);
        const filledFields = new Set();
        const newForm = { ...form };
        if (result.amount != null) { newForm.amount = String(result.amount); filledFields.add("amount"); }
        if (result.currency) { newForm.currency = result.currency; filledFields.add("currency"); }
        if (result.vendor) { newForm.vendor = result.vendor; filledFields.add("vendor"); }
        if (result.date) { newForm.date = result.date; filledFields.add("date"); }
        if (result.category && CATEGORIES.includes(result.category)) { newForm.category = result.category; filledFields.add("category"); }
        if (result.description) { newForm.description = result.description; filledFields.add("description"); }
        if (result.currency === "CRC") { newForm.bankAccount = "BAC CRC Account"; filledFields.add("bankAccount"); }
        else if (result.currency === "USD") { newForm.bankAccount = "BAC USD Account"; filledFields.add("bankAccount"); }
        setForm(newForm);
        setAiFieldsSet(filledFields);
        setAiConfidence(result.confidence || "medium");
        setScanning(false);
        showToast(`AI filled ${filledFields.size} fields — review & submit`);
      } catch (err) {
        console.error("AI scan error:", err);
        setScanning(false);
        // Show actual error on screen for debugging
        const errMsg = err?.message || String(err);
        showToast(`Scan error: ${errMsg.slice(0, 80)}`, "error");
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!form.amount || !form.category || !form.date) {
      showToast("Fill in amount, category and date", "error");
      return;
    }
    setSubmitting(true);
    const expense = {
      id: genId(), ...form,
      amount: parseFloat(form.amount.replace(/,/g, "")),
      submittedBy: staffName, submittedAt: new Date().toISOString(),
      status: "pending", invoiceAttached: !!invoiceData,
      invoiceFileName: invoiceData?.name || null,
      invoiceThumb: invoiceData?.dataUrl || null,
      matched: false, monthKey: getMonthKey(form.date), aiScanned: aiConfidence != null,
    };
    if (expense.invoiceThumb && expense.invoiceThumb.length > 50000) {
      expense.invoiceThumbTruncated = true;
      expense.invoiceThumb = expense.invoiceThumb.substring(0, 50000);
    }
    const newData = { ...data, expenses: [...data.expenses, expense] };
    await persist(newData);
    // Auto-open WhatsApp with expense details
    openWhatsAppShare(expense);
    setSubmittedExpense(expense);
    setSubmitting(false);
  };

  const resetForm = () => {
    setForm({ amount: "", currency: "USD", category: "", description: "", bankAccount: "", paymentMethod: "Transfer", vendor: "", date: new Date().toISOString().slice(0, 10) });
    setInvoicePreview(null);
    setInvoiceData(null);
    setAiConfidence(null);
    setAiFieldsSet(new Set());
    setSubmittedExpense(null);
  };

  // ── Show success screen after submit ──
  if (submittedExpense) {
    return <SubmitSuccess expense={submittedExpense} onNewExpense={resetForm} />;
  }

  const fieldStyle = {
    width: "100%", padding: "11px 14px", borderRadius: "10px",
    border: `1.5px solid ${B.blushDark}`, fontSize: "14px",
    background: B.white, color: B.textDark, transition: "border-color 0.2s",
    appearance: "none", WebkitAppearance: "none",
  };

  const aiHighlight = (fieldName) => {
    if (!aiFieldsSet.has(fieldName)) return {};
    return { borderColor: B.terracotta, background: "#FFF9F5", boxShadow: `0 0 0 2px rgba(201,123,119,0.15)` };
  };

  const labelStyle = { fontSize: "12px", fontWeight: 600, color: B.textMid, display: "block", marginBottom: "5px" };

  const aiLabel = (fieldName, text) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
      <label style={{ ...labelStyle, marginBottom: 0 }}>{text}</label>
      {aiFieldsSet.has(fieldName) && (
        <span style={{ fontSize: "10px", fontWeight: 600, color: B.terracotta, display: "flex", alignItems: "center", gap: "3px" }}><Icons.Sparkle /> AI</span>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: B.textDark, margin: 0 }}>New Expense</h2>
        {(form.amount || invoicePreview || invoiceData) && (
          <button onClick={resetForm} style={{ background: "none", border: "none", color: B.textLight, fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>Clear</button>
        )}
      </div>

      {/* Invoice Upload */}
      <div style={{ marginBottom: "20px" }}>
        <input type="file" accept="image/*,.pdf" ref={fileRef} onChange={handleFile} style={{ display: "none" }} />
        {invoicePreview ? (
          /* Image preview */
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: `1.5px solid ${B.blushDark}` }}>
            <img src={invoicePreview} alt="Invoice" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", display: "block" }} />
            {scanning && <ScanningOverlay message={scanMessage} />}
            <button onClick={() => { setInvoicePreview(null); setInvoiceData(null); }} style={{
              position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.6)", border: "none",
              borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: B.white, zIndex: 20,
            }}><Icons.X /></button>
            {!scanning && (
              <div style={{ position: "absolute", bottom: "8px", left: "8px", background: B.greenDark, color: B.white, fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "6px" }}>
                ✓ {invoiceData?.name}
              </div>
            )}
          </div>
        ) : invoiceData ? (
          /* PDF preview (no image, show icon) */
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden", border: `1.5px solid ${B.blushDark}`, background: B.blush, padding: "28px 20px", textAlign: "center" }}>
            {scanning && <ScanningOverlay message={scanMessage} />}
            <button onClick={() => { setInvoicePreview(null); setInvoiceData(null); }} style={{
              position: "absolute", top: "8px", right: "8px", background: "rgba(0,0,0,0.3)", border: "none",
              borderRadius: "50%", width: "28px", height: "28px", display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer", color: B.white, zIndex: 20,
            }}><Icons.X /></button>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={B.terracotta} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div style={{ fontSize: "14px", fontWeight: 600, color: B.textDark, marginTop: "8px" }}>{invoiceData.name}</div>
            {!scanning && <div style={{ fontSize: "12px", color: B.greenDark, fontWeight: 600, marginTop: "4px" }}>✓ PDF attached</div>}
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} style={{
            width: "100%", padding: "28px 20px", borderRadius: "14px",
            border: `2.5px dashed ${B.terracotta}`, background: "rgba(201,123,119,0.04)",
            cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center",
            gap: "10px", color: B.darkWine, transition: "all 0.2s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icons.Scan />
              <span style={{ fontSize: "15px", fontWeight: 700 }}>Scan Invoice</span>
            </div>
            <span style={{ fontSize: "12px", color: B.textLight, fontWeight: 400 }}>
              📷 Take a photo · 📁 Upload from gallery or files
            </span>
          </button>
        )}
      </div>

      {aiConfidence && !scanning && <div style={{ marginBottom: "14px" }}><ConfidenceBadge level={aiConfidence} /></div>}

      {/* Form fields */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
        <div style={{ flex: 2 }}>
          {aiLabel("amount", "Amount *")}
          <input type="text" inputMode="decimal" value={form.amount}
            onChange={(e) => { setForm({ ...form, amount: e.target.value }); setAiFieldsSet((s) => { const n = new Set(s); n.delete("amount"); return n; }); }}
            placeholder="0.00" style={{ ...fieldStyle, fontSize: "18px", fontWeight: 600, ...aiHighlight("amount") }} />
        </div>
        <div style={{ flex: 1 }}>
          {aiLabel("currency", "Currency")}
          <div style={{ position: "relative" }}>
            <select value={form.currency} onChange={(e) => {
              setForm({ ...form, currency: e.target.value, bankAccount: e.target.value === "CRC" ? "BAC CRC Account" : "BAC USD Account" });
              setAiFieldsSet((s) => { const n = new Set(s); n.delete("currency"); return n; });
            }} style={{ ...fieldStyle, paddingRight: "30px", ...aiHighlight("currency") }}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c === "CRC" ? "₡ CRC" : "$ USD"}</option>)}
            </select>
            <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "14px" }}>
        {aiLabel("date", "Date *")}
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} style={{ ...fieldStyle, ...aiHighlight("date") }} />
      </div>

      <div style={{ marginBottom: "14px" }}>
        {aiLabel("category", "Category *")}
        <div style={{ position: "relative" }}>
          <select value={form.category} onChange={(e) => { setForm({ ...form, category: e.target.value }); setAiFieldsSet((s) => { const n = new Set(s); n.delete("category"); return n; }); }}
            style={{ ...fieldStyle, paddingRight: "30px", color: form.category ? B.textDark : B.textLight, ...aiHighlight("category") }}>
            <option value="">Select category...</option>
            {CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            ))}
          </select>
          <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
        </div>
      </div>

      <div style={{ marginBottom: "14px" }}>
        {aiLabel("vendor", "Vendor / Supplier")}
        <input type="text" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}
          placeholder="Who was paid?" style={{ ...fieldStyle, ...aiHighlight("vendor") }} />
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "14px" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Payment Method</label>
          <div style={{ position: "relative" }}>
            <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} style={{ ...fieldStyle, paddingRight: "30px" }}>
              <option value="Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="SINPE">SINPE Móvil</option>
            </select>
            <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {aiLabel("bankAccount", "Bank Account")}
          <div style={{ position: "relative" }}>
            <select value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
              style={{ ...fieldStyle, paddingRight: "30px", color: form.bankAccount ? B.textDark : B.textLight, ...aiHighlight("bankAccount") }}>
              <option value="">Select...</option>
              {BANK_ACCOUNTS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "20px" }}>
        {aiLabel("description", "Notes")}
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Additional details..." rows={2}
          style={{ ...fieldStyle, resize: "vertical", minHeight: "60px", ...aiHighlight("description") }} />
      </div>

      {!invoicePreview && <div style={{ fontSize: "11px", color: B.textLight, textAlign: "center", marginBottom: "16px" }}>or submit without invoice (admin will flag it)</div>}

      <button onClick={handleSubmit} disabled={submitting} style={{
        width: "100%", padding: "14px", borderRadius: "12px", border: "none",
        background: submitting ? B.textLight : B.darkWine, color: B.white,
        fontSize: "15px", fontWeight: 700, cursor: submitting ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "all 0.2s",
      }}>
        {submitting ? "Submitting..." : <><Icons.Send /> Submit Expense</>}
      </button>
    </div>
  );
}

// ─── My Expenses (Staff) ─────────────────────────────────────────────────────
function MyExpenses({ data, staffName }) {
  const mine = data.expenses.filter((e) => e.submittedBy === staffName).sort((a, b) => new Date(b.date) - new Date(a.date));
  if (mine.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: B.textLight }}>
        <Icons.FileText />
        <p style={{ marginTop: "12px", fontSize: "14px" }}>No expenses submitted yet</p>
      </div>
    );
  }
  return (
    <div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: B.textDark, margin: "0 0 16px" }}>My Expenses</h2>
      {mine.map((e) => <ExpenseCard key={e.id} expense={e} />)}
    </div>
  );
}

// ─── Review Expenses (Admin) ─────────────────────────────────────────────────
function ReviewExpenses({ data, persist, showToast }) {
  const [filter, setFilter] = useState("pending");
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date().toISOString()));

  const filtered = data.expenses
    .filter((e) => { if (filter === "all") return e.monthKey === selectedMonth; return e.status === filter && e.monthKey === selectedMonth; })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const pending = data.expenses.filter((e) => e.status === "pending" && e.monthKey === selectedMonth).length;

  const handleAction = async (id, status) => {
    const newExpenses = data.expenses.map((e) => e.id === id ? { ...e, status, reviewedAt: new Date().toISOString() } : e);
    await persist({ ...data, expenses: newExpenses });
    showToast(status === "approved" ? "Approved ✓" : "Rejected");
  };

  const handleDelete = async (id) => {
    await persist({ ...data, expenses: data.expenses.filter((e) => e.id !== id) });
    showToast("Deleted");
  };

  const monthKeys = [...new Set(data.expenses.map((e) => e.monthKey))].sort().reverse();
  if (!monthKeys.includes(selectedMonth)) monthKeys.unshift(selectedMonth);

  return (
    <div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: B.textDark, margin: "0 0 4px" }}>Review Expenses</h2>
      {pending > 0 && <div style={{ fontSize: "13px", color: B.terracottaDark, fontWeight: 600, marginBottom: "14px" }}>{pending} pending approval</div>}

      <div style={{ marginBottom: "12px", position: "relative" }}>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{
          width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1.5px solid ${B.blushDark}`,
          fontSize: "14px", background: B.white, color: B.textDark, appearance: "none", WebkitAppearance: "none", paddingRight: "30px"
        }}>
          {monthKeys.map((mk) => { const [y, m] = mk.split("-"); return <option key={mk} value={mk}>{MONTHS[parseInt(m) - 1]} {y}</option>; })}
        </select>
        <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {["pending", "approved", "rejected", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flex: 1, padding: "8px 4px", borderRadius: "8px", border: "none",
            background: filter === f ? B.darkWine : B.white,
            color: filter === f ? B.white : B.textMid,
            fontSize: "12px", fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
            transition: "all 0.15s", boxShadow: filter !== f ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
          }}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: B.textLight, fontSize: "14px" }}>No {filter} expenses for this month</div>
      ) : (
        filtered.map((e) => (
          <ExpenseCard key={e.id} expense={e} showActions={e.status === "pending"}
            onApprove={() => handleAction(e.id, "approved")}
            onReject={() => handleAction(e.id, "rejected")}
            onDelete={() => handleDelete(e.id)} />
        ))
      )}
    </div>
  );
}

// ─── Expense Card ────────────────────────────────────────────────────────────
function ExpenseCard({ expense: e, showActions, onApprove, onReject, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors = {
    pending: { bg: "#FFF8E1", text: "#D4890B", label: "Pending" },
    approved: { bg: B.greenLight, text: B.greenDark, label: "Approved" },
    rejected: { bg: B.redLight, text: B.red, label: "Rejected" },
  };
  const s = statusColors[e.status];

  return (
    <div onClick={() => setExpanded(!expanded)}
      style={{ background: B.white, borderRadius: "12px", padding: "14px 16px", marginBottom: "10px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: `1px solid ${B.blushDark}`, cursor: "pointer", transition: "all 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "16px", fontWeight: 700, color: B.textDark }}>{formatCurrency(e.amount, e.currency)}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: s.text, background: s.bg, padding: "2px 8px", borderRadius: "5px" }}>{s.label}</span>
            {e.aiScanned && <span style={{ fontSize: "10px", fontWeight: 600, color: B.terracotta, display: "flex", alignItems: "center", gap: "2px" }}><Icons.Sparkle /> AI</span>}
          </div>
          <div style={{ fontSize: "13px", color: B.textMid, fontWeight: 500 }}>{e.category}</div>
          <div style={{ fontSize: "11px", color: B.textLight, marginTop: "2px" }}>{formatDate(e.date)} · {e.submittedBy}{e.vendor ? ` · ${e.vendor}` : ""}</div>
        </div>
        {e.invoiceAttached ? (
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: B.greenLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: B.greenDark }}><Icons.Check /></div>
        ) : (
          <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: B.redLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: B.red }}><span style={{ fontSize: "10px", fontWeight: 700 }}>!</span></div>
        )}
      </div>

      {expanded && (
        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${B.blush}` }}>
          {e.description && <div style={{ fontSize: "13px", color: B.textMid, marginBottom: "8px" }}>{e.description}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", color: B.textLight }}>
            <div><strong>Payment:</strong> {e.paymentMethod}</div>
            <div><strong>Bank:</strong> {e.bankAccount || "—"}</div>
            <div><strong>Invoice:</strong> {e.invoiceAttached ? "✓ " + (e.invoiceFileName || "Attached") : "✗ Missing"}</div>
            <div><strong>Matched:</strong> {e.matched ? "✓ Yes" : "—"}</div>
          </div>
          {e.invoiceThumb && <div style={{ marginTop: "10px" }}><img src={e.invoiceThumb} alt="Invoice" style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "8px" }} /></div>}
          {/* WhatsApp re-share from card */}
          <button onClick={(ev) => { ev.stopPropagation(); openWhatsAppShare(e); }} style={{
            width: "100%", marginTop: "10px", padding: "9px", borderRadius: "8px", border: "none",
            background: B.whatsapp, color: B.white, fontSize: "12px", fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}>
            <Icons.WhatsApp /> Share to WhatsApp
          </button>
        </div>
      )}

      {showActions && (
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }} onClick={(ev) => ev.stopPropagation()}>
          <button onClick={onApprove} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", background: B.greenDark, color: B.white, fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}><Icons.Check /> Approve</button>
          <button onClick={onReject} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: "none", background: B.red, color: B.white, fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}><Icons.X /> Reject</button>
          <button onClick={onDelete} style={{ padding: "10px 14px", borderRadius: "8px", border: `1px solid ${B.blushDark}`, background: B.white, color: B.textLight, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icons.Trash /></button>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Report (Admin) ──────────────────────────────────────────────────
function MonthlyReport({ data, persist, showToast }) {
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(new Date().toISOString()));

  const monthExpenses = data.expenses.filter((e) => e.monthKey === selectedMonth);
  const approved = monthExpenses.filter((e) => e.status === "approved");
  const pending = monthExpenses.filter((e) => e.status === "pending");
  const missingInvoice = monthExpenses.filter((e) => !e.invoiceAttached && e.status !== "rejected");

  const totalsByCurrency = {};
  approved.forEach((e) => { if (!totalsByCurrency[e.currency]) totalsByCurrency[e.currency] = 0; totalsByCurrency[e.currency] += e.amount; });

  const byCategory = {};
  approved.forEach((e) => {
    const key = `${e.category}|${e.currency}`;
    if (!byCategory[key]) byCategory[key] = { category: e.category, currency: e.currency, total: 0, count: 0 };
    byCategory[key].total += e.amount; byCategory[key].count++;
  });
  const categoryList = Object.values(byCategory).sort((a, b) => b.total - a.total);

  const exportCSV = () => {
    const headers = ["Date","Amount","Currency","Category","Vendor","Payment Method","Bank Account","Submitted By","Status","Invoice Attached","AI Scanned","Notes"];
    const rows = approved.map((e) => [e.date, e.amount, e.currency, e.category, e.vendor || "", e.paymentMethod, e.bankAccount || "", e.submittedBy, e.status, e.invoiceAttached ? "Yes" : "No", e.aiScanned ? "Yes" : "No", (e.description || "").replace(/,/g, ";")]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    const [y, m] = selectedMonth.split("-");
    a.download = `HotelYuli_Expenses_${MONTHS[parseInt(m) - 1]}_${y}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast("CSV downloaded ✓");
  };

  const approveAll = async () => {
    const newExpenses = data.expenses.map((e) => e.monthKey === selectedMonth && e.status === "pending" ? { ...e, status: "approved", reviewedAt: new Date().toISOString() } : e);
    await persist({ ...data, expenses: newExpenses });
    showToast(`${pending.length} expenses approved ✓`);
  };

  const monthKeys = [...new Set(data.expenses.map((e) => e.monthKey))].sort().reverse();
  if (!monthKeys.includes(selectedMonth)) monthKeys.unshift(selectedMonth);

  const cardStyle = { background: B.white, borderRadius: "12px", padding: "16px", marginBottom: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", border: `1px solid ${B.blushDark}` };

  return (
    <div>
      <h2 style={{ fontSize: "18px", fontWeight: 700, color: B.textDark, margin: "0 0 14px" }}>Monthly Report</h2>

      <div style={{ marginBottom: "16px", position: "relative" }}>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{
          width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1.5px solid ${B.blushDark}`,
          fontSize: "14px", background: B.white, color: B.textDark, appearance: "none", WebkitAppearance: "none", paddingRight: "30px"
        }}>
          {monthKeys.map((mk) => { const [y, m] = mk.split("-"); return <option key={mk} value={mk}>{MONTHS[parseInt(m) - 1]} {y}</option>; })}
        </select>
        <div style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: B.textLight }}><Icons.ChevronDown /></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: B.textLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Expenses</div>
          <div style={{ marginTop: "6px" }}>
            {Object.entries(totalsByCurrency).map(([cur, total]) => (
              <div key={cur} style={{ fontSize: "18px", fontWeight: 700, color: B.darkWine }}>{formatCurrency(total, cur)}</div>
            ))}
            {Object.keys(totalsByCurrency).length === 0 && <div style={{ fontSize: "18px", fontWeight: 700, color: B.textLight }}>—</div>}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: B.textLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div>
          <div style={{ marginTop: "8px", fontSize: "13px" }}>
            <div style={{ color: B.greenDark }}>✓ {approved.length} approved</div>
            <div style={{ color: "#D4890B" }}>◷ {pending.length} pending</div>
            {missingInvoice.length > 0 && <div style={{ color: B.red }}>! {missingInvoice.length} missing invoice</div>}
          </div>
        </div>
      </div>

      {categoryList.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: B.textDark, marginBottom: "12px" }}>By Category</div>
          {categoryList.map((c, i) => {
            const maxTotal = categoryList[0]?.total || 1;
            const pct = (c.total / maxTotal) * 100;
            return (
              <div key={i} style={{ marginBottom: "10px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                  <span style={{ color: B.textMid }}>{c.category} <span style={{ color: B.textLight }}>({c.count})</span></span>
                  <span style={{ fontWeight: 600, color: B.textDark }}>{formatCurrency(c.total, c.currency)}</span>
                </div>
                <div style={{ height: "6px", borderRadius: "3px", background: B.blush }}>
                  <div style={{ height: "100%", borderRadius: "3px", background: B.terracotta, width: `${pct}%`, transition: "width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missingInvoice.length > 0 && (
        <div style={{ ...cardStyle, background: B.redLight, borderColor: "#FECACA" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: B.red, marginBottom: "6px" }}>⚠ Missing Invoices</div>
          {missingInvoice.map((e) => (
            <div key={e.id} style={{ fontSize: "12px", color: B.textMid, padding: "4px 0" }}>
              {formatDate(e.date)} · {formatCurrency(e.amount, e.currency)} · {e.category} · {e.submittedBy}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        {pending.length > 0 && (
          <button onClick={approveAll} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: B.greenDark, color: B.white, fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <Icons.Check /> Approve All ({pending.length})
          </button>
        )}
        {approved.length > 0 && (
          <button onClick={exportCSV} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: B.darkWine, color: B.white, fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <Icons.Download /> Export CSV
          </button>
        )}
      </div>
      {approved.length > 0 && <div style={{ fontSize: "11px", color: B.textLight, textAlign: "center", marginTop: "8px" }}>Export approved expenses as CSV for Sharad accountants</div>}
    </div>
  );
}
