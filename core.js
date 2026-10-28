// Logica pura (senza pagina né rete): impostazioni, saldi, nomi, importi. Provata con `node --test test/`.
(function (root) {
"use strict";
const SHEET = { mov: 100, conti: 200, riep: 300, pac: 400, imp: 500 };
const KV_KEYS = ["nome", "colore", "pac", "etf", "importo_pac", "giorno_pac", "conto_pac", "conto_inv", "quote", "prezzo"];
const ROWS = 59, COLS = 13; // Impostazioni!A2:M60
const str = v => (v == null ? "" : String(v)).trim();
const num = (v, def) => { if (typeof v === "number" && isFinite(v)) return v; const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : def; };
const yes = v => str(v).toUpperCase() === "SI";
const sn = b => (b ? "SI" : "NO");
const cents = n => Math.round(n * 100) / 100;

function parseSettings(rows) {
  const s = { conti: [], spesa: [], entrata: [], kv: { nome: "", colore: "verde", pac: false, etf: "", importo_pac: 0, giorno_pac: 16, conto_pac: "", conto_inv: "", quote: null, prezzo: null } };
  const raw = {};
  for (const r of (rows || []).slice(1)) {
    if (str(r[0])) s.conti.push({ nome: str(r[0]), iniziale: num(r[1], 0), totale: str(r[2]).toUpperCase() !== "NO", nascosto: yes(r[3]) });
    if (str(r[5])) s.spesa.push({ nome: str(r[5]), nascosta: yes(r[6]) });
    if (str(r[8])) s.entrata.push({ nome: str(r[8]), nascosta: yes(r[9]) });
    if (str(r[11])) raw[str(r[11])] = r[12];
  }
  const k = s.kv;
  for (const key of ["nome", "colore", "etf", "conto_pac", "conto_inv"]) if (str(raw[key])) k[key] = str(raw[key]);
  k.pac = yes(raw.pac);
  k.importo_pac = num(raw.importo_pac, 0);
  k.giorno_pac = num(raw.giorno_pac, 16);
  k.quote = str(raw.quote) === "" ? null : num(raw.quote, null);
  k.prezzo = str(raw.prezzo) === "" ? null : num(raw.prezzo, null);
  return s;
}

function settingsToRows(s) {
  const rows = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  s.conti.slice(0, ROWS).forEach((c, i) => { rows[i][0] = c.nome; rows[i][1] = c.iniziale; rows[i][2] = sn(c.totale); rows[i][3] = sn(c.nascosto); });
  s.spesa.slice(0, ROWS).forEach((c, i) => { rows[i][5] = c.nome; rows[i][6] = sn(c.nascosta); });
  s.entrata.slice(0, ROWS).forEach((c, i) => { rows[i][8] = c.nome; rows[i][9] = sn(c.nascosta); });
  const k = s.kv || {};
  KV_KEYS.forEach((key, i) => {
    let v = k[key];
    if (key === "pac") v = sn(v);
    else if (key === "prezzo") v = k.prezzoFormula || ""; // il prezzo è una formula: riscriverla evita di cancellarla
    else if (v == null) v = "";
    rows[i][11] = key; rows[i][12] = v;
  });
  return rows;
}

function computeBalances(mov, s) {
  const list = s.conti.map(c => ({ nome: c.nome, saldo: c.iniziale, totale: c.totale, nascosto: c.nascosto }));
  const by = new Map(list.map(c => [c.nome, c]));
  for (const m of mov) {
    let c = by.get(m.conto);
    if (!c) { c = { nome: m.conto, saldo: 0, totale: true, nascosto: false }; by.set(m.conto, c); list.push(c); }
    c.saldo += m.tipo === "Entrata" ? m.imp : -m.imp;
  }
  const inv = s.kv && s.kv.conto_inv;
  let totale = 0;
  for (const c of list) { c.saldo = cents(c.saldo); if (c.totale && c.nome !== inv) totale += c.saldo; }
  return { conti: list, totale: cents(totale) };
}

function validateName(name, existing) {
  const n = String(name == null ? "" : name).trim();
  if (!n) return "Scrivi un nome.";
  if (n.length > 30) return "Al massimo 30 caratteri.";
  const l = n.toLowerCase();
  if (l === "trasferimenti") return "Questo nome è riservato.";
  if ((existing || []).some(e => String(e).trim().toLowerCase() === l)) return "Esiste già.";
  return null;
}

// Accetta "12,50", "12.5", "1.500" (= millecinquecento) e "1.500,25"; testo con lettere o simboli strani no.
const parseInputAmount = (s, dec = 2) => {
  let t = String(s || "").trim().replace(/[\s€]/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const k = Math.pow(10, dec);
  return Math.round(parseFloat(t) * k) / k;
};
// Come sopra, con un "-" o "−" iniziale (saldo iniziale negativo).
const parseSignedAmount = s => {
  const t = String(s || "").trim();
  const neg = /^[-−]/.test(t);
  const n = parseInputAmount(neg ? t.slice(1) : t);
  return neg ? -n : n;
};

/* ---------- creazione del foglio ---------- */
const CONTI_F = '=LET(n;FILTER(Impostazioni!A2:A;Impostazioni!A2:A<>"");i;FILTER(Impostazioni!B2:B;Impostazioni!A2:A<>"");t;FILTER(Impostazioni!C2:C;Impostazioni!A2:A<>"");e;MAP(n;LAMBDA(c;SUMIFS(Movimenti!D:D;Movimenti!F:F;c;Movimenti!B:B;"Entrata")));u;MAP(n;LAMBDA(c;SUMIFS(Movimenti!D:D;Movimenti!F:F;c;Movimenti!B:B;"Spesa")));s;i+e-u;VSTACK(HSTACK("Conto";"Saldo iniziale";"Entrate";"Uscite";"Saldo");HSTACK(n;i;e;u;s);HSTACK("Totale";"";"";"";SUM(FILTER(s;t="SI")))))';
const RIEP_F = '=IFERROR(LET(d;FILTER(Movimenti!A2:D;Movimenti!A2:A<>"";Movimenti!C2:C<>"Trasferimenti");k;EOMONTH(CHOOSECOLS(d;1);-1)+1;m;SORT(UNIQUE(k));e;MAP(m;LAMBDA(x;SUMPRODUCT((k=x)*(CHOOSECOLS(d;2)="Entrata")*CHOOSECOLS(d;4))));u;MAP(m;LAMBDA(x;SUMPRODUCT((k=x)*(CHOOSECOLS(d;2)="Spesa")*CHOOSECOLS(d;4))));VSTACK(HSTACK("Mese";"Entrate";"Uscite";"Netto");HSTACK(m;e;u;e-u)));HSTACK("Mese";"Entrate";"Uscite";"Netto"))';
const IMP_HEAD = ["Conto", "Saldo iniziale", "Nel totale", "Nascosto", "", "Tipologia spesa", "Nascosta", "", "Tipologia entrata", "Nascosta", "", "Chiave", "Valore"];
const cell = v => {
  if (typeof v === "number") return { userEnteredValue: { numberValue: v } };
  const s = v == null ? "" : String(v);
  if (!s) return {};
  return { userEnteredValue: s.startsWith("=") ? { formulaValue: s } : { stringValue: s } };
};
const row = vals => ({ values: vals.map(cell) });
const sheet = (sheetId, title, rows, grid) => ({
  properties: { sheetId, title, gridProperties: { frozenRowCount: 1, ...(grid || {}) } },
  data: [{ startRow: 0, startColumn: 0, rowData: rows.map(row) }],
});

// Corpo di POST https://sheets.googleapis.com/v4/spreadsheets per il foglio di un nuovo utente.
function buildCreateBody({ nome, conti, spesa, entrata, colore }) {
  const s = {
    conti: (conti || []).map(c => ({ nome: str(c.nome), iniziale: num(c.iniziale, 0), totale: true, nascosto: false })),
    spesa: (spesa || []).map(n => ({ nome: str(n), nascosta: false })),
    entrata: (entrata || []).map(n => ({ nome: str(n), nascosta: false })),
    kv: { nome: str(nome), colore: str(colore) || "verde", pac: false, etf: "", importo_pac: 0, giorno_pac: 16, conto_pac: "", conto_inv: "", quote: null, prezzo: null },
  };
  return {
    properties: { title: "Contabile – " + str(nome), locale: "it_IT", timeZone: "Europe/Rome" },
    sheets: [
      sheet(SHEET.mov, "Movimenti", [["Data", "Tipo", "Tipologia", "Importo", "Categoria", "Conto", "Descrizione"]]),
      sheet(SHEET.conti, "Conti", [[CONTI_F]]),
      sheet(SHEET.riep, "Riepilogo", [[RIEP_F]]),
      sheet(SHEET.pac, "PAC", [["Data", "ETF", "Importo", "Quote", "Prezzo per quota", "Note"]]),
      sheet(SHEET.imp, "Impostazioni", [IMP_HEAD, ...settingsToRows(s)], { rowCount: ROWS + 1, columnCount: COLS }),
    ],
  };
}
// Formati delle colonne (date, euro, mesi): spreadsheets.create non li accetta per colonne intere,
// quindi vanno con un :batchUpdate subito dopo la creazione.
function buildFormatRequests() {
  const fmt = (sheetId, col, type, pattern) => ({ repeatCell: {
    range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
    cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
    fields: "userEnteredFormat.numberFormat",
  } });
  const DATE = "dd/mm/yyyy", EUR = "#,##0.00 €";
  return [
    fmt(SHEET.mov, 0, "DATE", DATE), fmt(SHEET.mov, 3, "CURRENCY", EUR),
    fmt(SHEET.pac, 0, "DATE", DATE), fmt(SHEET.pac, 2, "CURRENCY", EUR), fmt(SHEET.pac, 4, "CURRENCY", EUR),
    fmt(SHEET.riep, 0, "DATE", "mmmm yyyy"),
    ...[1, 2, 3].map(c => fmt(SHEET.riep, c, "CURRENCY", EUR)),
    ...[1, 2, 3, 4].map(c => fmt(SHEET.conti, c, "CURRENCY", EUR)),
  ];
}

const C = { SHEET, parseSettings, settingsToRows, buildCreateBody, buildFormatRequests, computeBalances, validateName, parseInputAmount, parseSignedAmount };
if (typeof module === "object" && module.exports) module.exports = C; else root.CA_CORE = C;
})(typeof window !== "undefined" ? window : globalThis);
