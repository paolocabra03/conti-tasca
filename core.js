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
const ETF_LIST = [
  { id: "vwrp", nome: "Vanguard FTSE All-World UCITS ETF (USD) Acc", isin: "IE00BK5BQT80", ticker: "LON:VWRP" },
  { id: "swda", nome: "iShares Core MSCI World UCITS ETF (Acc)", isin: "IE00B4L5Y983", ticker: "LON:SWDA" },
  { id: "cspx", nome: "iShares Core S&P 500 UCITS ETF (Acc)", isin: "IE00B5BMR087", ticker: "LON:CSPX" },
];
// Prezzo in euro di un titolo di Google Finance, qualunque sia la valuta di quotazione (GBX = pence).
const priceFormula = t => '=LET(p;GOOGLEFINANCE("' + t + '");c;GOOGLEFINANCE("' + t + '";"currency");IF(c="EUR";p;IF(c="GBX";p/100*GOOGLEFINANCE("CURRENCY:GBPEUR");p*GOOGLEFINANCE("CURRENCY:"&c&"EUR"))))';
// Riga del foglio (Impostazioni) che contiene la chiave indicata: i valori partono dalla riga 2.
const kvRow = key => KV_KEYS.indexOf(key) + 2;
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
    else if (key === "prezzo") { const e = ETF_LIST.find(x => x.id === k.etf); v = e ? priceFormula(e.ticker) : (k.prezzoFormula || ""); } // il prezzo è una formula: riscriverla evita di cancellarla
    else if (v == null) v = "";
    rows[i][11] = key; rows[i][12] = v;
  });
  return rows;
}

// Rende i movimenti letti dal foglio coerenti con le formule: Tipo solo Spesa/Entrata (le altre righe si scartano),
// spazi tolti, Conto riportato al nome di Impostazioni (maiuscole ignorate), "Trasferimenti" in qualunque maiuscola.
function normalizeMov(mov, s) {
  const names = new Map((s.conti || []).map(c => [c.nome.toLowerCase(), c.nome]));
  const out = [];
  for (const m of mov) {
    const t = str(m.tipo).toLowerCase();
    if (t !== "spesa" && t !== "entrata") continue;
    const tip = str(m.tip), conto = str(m.conto);
    out.push({ ...m, tipo: t === "spesa" ? "Spesa" : "Entrata", tip: tip.toLowerCase() === "trasferimenti" ? "Trasferimenti" : tip, conto: names.get(conto.toLowerCase()) || conto });
  }
  return out;
}

function computeBalances(mov, s) {
  const list = s.conti.map(c => ({ nome: c.nome, saldo: c.iniziale, totale: c.totale, nascosto: c.nascosto }));
  const by = new Map(list.map(c => [c.nome, c]));
  for (const m of mov) {
    if (!m.conto) continue;
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
  if (/^[=<>]/.test(n) || /[*?~]/.test(n)) return "Non usare i simboli = < > * ? ~.";
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

/* ---------- modifica delle impostazioni dall'app ---------- */
// Cambia il nome di un conto nei movimenti e nelle chiavi conto_pac/conto_inv di Impostazioni (maiuscole e cella intera contano).
// Le tipologie no: la stessa parola può stare tra spese ed entrate, e findReplace non filtra per Tipo (vedi renameRowRequests).
function renameRequests(kind, oldName, newName) {
  if (kind !== "conto") return [];
  const fr = (sheetId, col) => ({ findReplace: {
    find: oldName, replacement: newName, matchCase: false, matchEntireCell: true,
    range: { sheetId, startRowIndex: 1, startColumnIndex: col, endColumnIndex: col + 1 },
  } });
  return [fr(SHEET.mov, 5), fr(SHEET.imp, 12)];
}
// Righe di Movimenti!A2:C da cambiare per una tipologia: stesso Tipo e stesso nome (esatto).
const rowsToRename = (rows, kind, oldName) => {
  const tipo = kind === "spesa" ? "Spesa" : "Entrata", hit = [];
  (rows || []).forEach((r, i) => { if (r && r[1] === tipo && r[2] === oldName) hit.push(i); });
  return hit;
};
// Una updateCells sulla sola colonna C per ogni gruppo di righe vicine (riga del foglio = indice + 2).
function renameRowRequests(rows, kind, oldName, newName) {
  const out = [];
  let run = null;
  for (const i of rowsToRename(rows, kind, oldName)) {
    if (run && run.last === i - 1) { run.last = i; run.req.updateCells.rows.push({ values: [toCell(newName)] }); continue; }
    run = { last: i, req: { updateCells: { start: { sheetId: SHEET.mov, rowIndex: i + 1, columnIndex: 2 }, rows: [{ values: [toCell(newName)] }], fields: "userEnteredValue" } } };
    out.push(run.req);
  }
  return out;
}
// Più rinomine insieme: se un nome nuovo coincide con un vecchio che sta cambiando anche lui, si passa da nomi provvisori
// (altrimenti A→B e B→X, fatte una dopo l'altra, finirebbero entrambe in X).
function renameSteps(changes) {
  const olds = new Set(changes.map(c => c.kind + "\u0000" + c.old));
  if (!changes.some(c => olds.has(c.kind + "\u0000" + c.new))) return changes.map(c => ({ kind: c.kind, old: c.old, new: c.new }));
  const tmp = changes.map((c, i) => ({ kind: c.kind, old: c.old, new: "\u0001tmp" + i }));
  return tmp.concat(changes.map((c, i) => ({ kind: c.kind, old: "\u0001tmp" + i, new: c.new })));
}
const toCell = v => {
  if (typeof v === "number") return { userEnteredValue: { numberValue: v } };
  const t = v == null ? "" : String(v);
  if (t === "") return {};
  return { userEnteredValue: t.startsWith("=") ? { formulaValue: t } : { stringValue: t } };
};
// Riscrive Impostazioni!A2:M60 con lo stato indicato.
function settingsUpdateRequest(s) {
  return { updateCells: {
    start: { sheetId: SHEET.imp, rowIndex: 1, columnIndex: 0 },
    rows: settingsToRows(s).map(r => ({ values: r.map(toCell) })),
    fields: "userEnteredValue",
  } };
}
// Quanti movimenti usano un conto o una tipologia (per le tipologie conta solo il Tipo giusto).
function usage(mov, kind, name) {
  return (mov || []).filter(m => kind === "conto" ? m.conto === name : m.tip === name && m.tipo === (kind === "spesa" ? "Spesa" : "Entrata")).length;
}

/* ---------- creazione del foglio ---------- */
const CONTI_F = '=ARRAYFORMULA(LET(n;FILTER(Impostazioni!A2:A;Impostazioni!A2:A<>"");i;FILTER(Impostazioni!B2:B;Impostazioni!A2:A<>"");t;FILTER(Impostazioni!C2:C;Impostazioni!A2:A<>"");e;MAP(n;LAMBDA(c;SUMIFS(Movimenti!D:D;Movimenti!F:F;c;Movimenti!B:B;"Entrata")));u;MAP(n;LAMBDA(c;SUMIFS(Movimenti!D:D;Movimenti!F:F;c;Movimenti!B:B;"Spesa")));s;i+e-u;VSTACK(HSTACK("Conto";"Saldo iniziale";"Entrate";"Uscite";"Saldo");HSTACK(n;i;e;u;s);HSTACK("Totale";"";"";"";SUM(FILTER(s;t<>"NO"))))))';
const RIEP_F = '=ARRAYFORMULA(IFERROR(LET(d;FILTER(Movimenti!A:D;ISNUMBER(Movimenti!A:A);Movimenti!C:C<>"Trasferimenti");k;EOMONTH(CHOOSECOLS(d;1);-1)+1;m;SORT(UNIQUE(k));e;MAP(m;LAMBDA(x;SUMPRODUCT((k=x)*(CHOOSECOLS(d;2)="Entrata")*CHOOSECOLS(d;4))));u;MAP(m;LAMBDA(x;SUMPRODUCT((k=x)*(CHOOSECOLS(d;2)="Spesa")*CHOOSECOLS(d;4))));VSTACK(HSTACK("Mese";"Entrate";"Uscite";"Netto");HSTACK(m;e;u;e-u)));HSTACK("Mese";"Entrate";"Uscite";"Netto")))';
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
    properties: { title: "Conti in tasca – " + str(nome), locale: "it_IT", timeZone: "Europe/Rome" },
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

const C = { SHEET, ETF_LIST, priceFormula, kvRow, parseSettings, settingsToRows, renameRequests, renameRowRequests, rowsToRename, renameSteps, settingsUpdateRequest, usage, buildCreateBody, buildFormatRequests, computeBalances, normalizeMov, validateName, parseInputAmount, parseSignedAmount };
if (typeof module === "object" && module.exports) module.exports = C; else root.CA_CORE = C;
})(typeof window !== "undefined" ? window : globalThis);
