const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

const HEADER = ["Conto", "Saldo iniziale", "Nel totale", "Nascosto", "", "Spese", "Nascosta", "", "Entrate", "Nascosta", "", "Chiave", "Valore"];
const sample = () => ({
  conti: [
    { nome: "Contanti", iniziale: 100, totale: true, nascosto: false },
    { nome: "Risparmi", iniziale: -12.3, totale: false, nascosto: false },
    { nome: "Vecchio", iniziale: 0, totale: true, nascosto: true },
  ],
  spesa: [{ nome: "Spesa", nascosta: false }, { nome: "Cene", nascosta: true }],
  entrata: [{ nome: "Stipendio", nascosta: false }, { nome: "Regali", nascosta: false }],
  kv: { nome: "Ale", colore: "blu", pac: true, etf: "vwce", importo_pac: 50, giorno_pac: 5, conto_pac: "Contanti", conto_inv: "Investimenti", quote: 1.5, prezzo: null },
});

test("parseSettings e settingsToRows fanno andata e ritorno", () => {
  const s = sample();
  const rows = C.settingsToRows(s);
  assert.equal(rows.length, 59);
  assert.ok(rows.every(r => r.length === 13));
  assert.deepEqual(C.parseSettings([HEADER, ...rows]), s);
});

test("parseSettings: valori mancanti danno i default", () => {
  const s = C.parseSettings([HEADER]);
  assert.deepEqual(s.conti, []);
  assert.deepEqual(s.kv, { nome: "", colore: "verde", pac: false, etf: "", importo_pac: 0, giorno_pac: 16, conto_pac: "", conto_inv: "", quote: null, prezzo: null });
});

test("settingsToRows: la cella di prezzo porta la formula se presente", () => {
  const s = sample(); s.kv.prezzoFormula = "=GOOGLEFINANCE(\"X\")";
  const rows = C.settingsToRows(s);
  const r = rows.find(x => x[11] === "prezzo");
  assert.equal(r[12], s.kv.prezzoFormula);
  assert.equal(C.settingsToRows(sample()).find(x => x[11] === "prezzo")[12], "");
});

const base = () => ({ conti: [{ nome: "Contanti", iniziale: 100, totale: true, nascosto: false }, { nome: "Banca", iniziale: 0, totale: true, nascosto: false }], spesa: [], entrata: [], kv: { conto_inv: "" } });

test("computeBalances con conto sconosciuto", () => {
  const r = C.computeBalances([
    { tipo: "Entrata", imp: 50, conto: "Banca" },
    { tipo: "Spesa", imp: 20, conto: "Contanti" },
    { tipo: "Spesa", imp: 30, conto: "Postepay" },
  ], base());
  assert.deepEqual(r.conti.map(c => [c.nome, c.saldo]), [["Contanti", 80], ["Banca", 50], ["Postepay", -30]]);
  assert.equal(r.conti[2].totale, true);
  assert.equal(r.totale, 100);
});

test("computeBalances esclude il conto investimenti dal totale", () => {
  const s = base(); s.conti.push({ nome: "Investimenti", iniziale: 10, totale: true, nascosto: false }); s.kv.conto_inv = "Investimenti";
  const r = C.computeBalances([{ tipo: "Entrata", imp: 5, conto: "Investimenti" }], s);
  assert.equal(r.conti[2].saldo, 15);
  assert.equal(r.totale, 100);
});

test("computeBalances: conti nascosti calcolati, conti non nel totale esclusi", () => {
  const s = base(); s.conti[1].nascosto = true; s.conti[0].totale = false;
  const r = C.computeBalances([{ tipo: "Entrata", imp: 7, conto: "Banca" }], s);
  assert.equal(r.conti[1].nascosto, true);
  assert.equal(r.conti[1].saldo, 7);
  assert.equal(r.totale, 7);
});

test("computeBalances senza movimenti", () => {
  const r = C.computeBalances([], base());
  assert.deepEqual(r.conti.map(c => c.saldo), [100, 0]);
  assert.equal(r.totale, 100);
});

test("validateName", () => {
  assert.ok(C.validateName("", []));
  assert.ok(C.validateName("   ", []));
  assert.ok(C.validateName("trasferimenti", []));
  assert.ok(C.validateName("BANCA", ["Banca"]));
  assert.ok(C.validateName(" banca ", ["Banca"]));
  assert.equal(C.validateName(" Revolut ", ["Banca"]), null);
  assert.ok(C.validateName("a".repeat(31), []));
  assert.equal(C.validateName("a".repeat(30), []), null);
});

test("parseSignedAmount", () => {
  assert.equal(C.parseSignedAmount("-50"), -50);
  assert.equal(C.parseSignedAmount("−12,30"), -12.3);
  assert.equal(C.parseSignedAmount("1.500"), 1500);
  assert.ok(Number.isNaN(C.parseSignedAmount("abc")));
  assert.ok(Number.isNaN(C.parseSignedAmount("")));
});

test("parseInputAmount invariato", () => {
  assert.equal(C.parseInputAmount("12,50"), 12.5);
  assert.equal(C.parseInputAmount("1.500,25"), 1500.25);
  assert.ok(Number.isNaN(C.parseInputAmount("-5")));
  assert.equal(C.SHEET.mov, 100);
});

// Valori semplici di una riga di GridData (come li rileggerebbe l'app).
const cellVal = c => { const v = (c && c.userEnteredValue) || {}; return v.stringValue ?? v.numberValue ?? v.formulaValue ?? v.boolValue ?? ""; };
const gridRows = sh => sh.data[0].rowData.map(r => (r.values || []).map(cellVal));
const createInput = () => ({ nome: "Marco", conti: [{ nome: "Contanti", iniziale: 50 }, { nome: "Banca", iniziale: -12.3 }], spesa: ["Spesa", "Pasti"], entrata: ["Stipendio"], colore: "blu" });

test("buildCreateBody: titolo, locale e fogli con gli sheetId giusti", () => {
  const b = C.buildCreateBody(createInput());
  assert.equal(b.properties.title, "Conti in tasca – Marco");
  assert.equal(b.properties.locale, "it_IT");
  assert.equal(b.properties.timeZone, "Europe/Rome");
  assert.deepEqual(b.sheets.map(s => [s.properties.sheetId, s.properties.title]),
    [[100, "Movimenti"], [200, "Conti"], [300, "Riepilogo"], [400, "PAC"], [500, "Impostazioni"]]);
  assert.ok(b.sheets.every(s => s.properties.gridProperties.frozenRowCount === 1));
});

test("buildCreateBody: intestazioni di Movimenti e PAC", () => {
  const b = C.buildCreateBody(createInput());
  assert.deepEqual(gridRows(b.sheets[0])[0], ["Data", "Tipo", "Tipologia", "Importo", "Categoria", "Conto", "Descrizione"]);
  assert.deepEqual(gridRows(b.sheets[3])[0], ["Data", "ETF", "Importo", "Quote", "Prezzo per quota", "Note"]);
});

test("buildCreateBody: Impostazioni rilette con parseSettings", () => {
  const imp = C.buildCreateBody(createInput()).sheets[4];
  assert.equal(imp.properties.gridProperties.rowCount, 60);
  assert.equal(imp.properties.gridProperties.columnCount, 13);
  const rows = gridRows(imp);
  assert.equal(rows.length, 60);
  assert.deepEqual(rows[0], ["Conto", "Saldo iniziale", "Nel totale", "Nascosto", "", "Tipologia spesa", "Nascosta", "", "Tipologia entrata", "Nascosta", "", "Chiave", "Valore"]);
  const s = C.parseSettings(rows);
  assert.deepEqual(s.conti, [{ nome: "Contanti", iniziale: 50, totale: true, nascosto: false }, { nome: "Banca", iniziale: -12.3, totale: true, nascosto: false }]);
  assert.deepEqual(s.spesa, [{ nome: "Spesa", nascosta: false }, { nome: "Pasti", nascosta: false }]);
  assert.deepEqual(s.entrata, [{ nome: "Stipendio", nascosta: false }]);
  assert.equal(s.kv.nome, "Marco");
  assert.equal(s.kv.colore, "blu");
  assert.equal(s.kv.pac, false);
});

test("buildCreateBody: formule di Conti e Riepilogo in A1", () => {
  const b = C.buildCreateBody(createInput());
  for (const i of [1, 2]) {
    const f = b.sheets[i].data[0].rowData[0].values[0].userEnteredValue.formulaValue;
    assert.ok(typeof f === "string" && f.startsWith("="), b.sheets[i].properties.title);
  }
  assert.ok(b.sheets[1].data[0].rowData[0].values[0].userEnteredValue.formulaValue.includes('SUM(FILTER(s;t<>"NO"))'));
});

test("buildFormatRequests: date, euro e mesi sulle colonne giuste", () => {
  const reqs = C.buildFormatRequests();
  const f = (id, col) => reqs.find(r => r.repeatCell.range.sheetId === id && r.repeatCell.range.startColumnIndex === col);
  assert.equal(f(100, 0).repeatCell.cell.userEnteredFormat.numberFormat.pattern, "dd/mm/yyyy");
  assert.equal(f(100, 3).repeatCell.cell.userEnteredFormat.numberFormat.pattern, "#,##0.00 €");
  assert.equal(f(400, 0).repeatCell.cell.userEnteredFormat.numberFormat.pattern, "dd/mm/yyyy");
  assert.equal(f(400, 2).repeatCell.cell.userEnteredFormat.numberFormat.pattern, "#,##0.00 €");
  assert.equal(f(300, 0).repeatCell.cell.userEnteredFormat.numberFormat.pattern, "mmmm yyyy");
});

/* ---------- Impostazioni: rinomina, salvataggio, utilizzo ---------- */
test("renameRequests conto: Movimenti colonna F e Impostazioni colonna M", () => {
  const r = C.renameRequests("conto", "Banca", "Intesa");
  assert.equal(r.length, 2);
  const [a, b] = r.map(x => x.findReplace);
  assert.deepEqual(a.range, { sheetId: 100, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 });
  assert.deepEqual(b.range, { sheetId: 500, startRowIndex: 1, startColumnIndex: 12, endColumnIndex: 13 });
  for (const f of [a, b]) {
    assert.equal(f.find, "Banca"); assert.equal(f.replacement, "Intesa");
    assert.equal(f.matchCase, false); assert.equal(f.matchEntireCell, true);
  }
});

test("renameRequests tipologia: nessuna findReplace (si usa renameRowRequests)", () => {
  assert.deepEqual(C.renameRequests("spesa", "Pasti", "Cibo"), []);
  assert.deepEqual(C.renameRequests("entrata", "Pasti", "Cibo"), []);
});

test("renameRowRequests: solo le righe col Tipo giusto, una richiesta per gruppo di righe vicine", () => {
  const rows = [
    [1, "Spesa", "Regali"], [2, "Spesa", "Regali"], [3, "Entrata", "Regali"], [4, "Spesa", "Pasti"],
    [5, "Spesa", "Regali"], [6, "Spesa", "Regali"], [7, "Spesa", "Regali"], [8, "Spesa", "regali"],
  ];
  const r = C.renameRowRequests(rows, "spesa", "Regali", "Doni");
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].updateCells.start, { sheetId: 100, rowIndex: 1, columnIndex: 2 });
  assert.equal(r[0].updateCells.rows.length, 2);
  assert.deepEqual(r[1].updateCells.start, { sheetId: 100, rowIndex: 5, columnIndex: 2 });
  assert.equal(r[1].updateCells.rows.length, 3);
  assert.deepEqual(r[1].updateCells.rows[2], { values: [{ userEnteredValue: { stringValue: "Doni" } }] });
  assert.equal(r[1].updateCells.fields, "userEnteredValue");
  const e = C.renameRowRequests(rows, "entrata", "Regali", "Doni");
  assert.equal(e.length, 1);
  assert.deepEqual(e[0].updateCells.start, { sheetId: 100, rowIndex: 3, columnIndex: 2 });
  assert.equal(C.renameRowRequests(rows, "entrata", "Pasti", "X").length, 0);
});

test("settingsUpdateRequest: 59 righe su Impostazioni A2:M60, formula del prezzo come formulaValue", () => {
  const s = sample(); s.kv.prezzoFormula = "=GOOGLEFINANCE(\"X\")";
  const u = C.settingsUpdateRequest(s).updateCells;
  assert.deepEqual(u.start, { sheetId: 500, rowIndex: 1, columnIndex: 0 });
  assert.equal(u.fields, "userEnteredValue");
  assert.equal(u.rows.length, 59);
  assert.ok(u.rows.every(r => r.values.length === 13));
  assert.deepEqual(u.rows[0].values[0], { userEnteredValue: { stringValue: "Contanti" } });
  assert.deepEqual(u.rows[0].values[1], { userEnteredValue: { numberValue: 100 } });
  const prezzo = u.rows[9].values[12];
  assert.deepEqual(prezzo, { userEnteredValue: { formulaValue: "=GOOGLEFINANCE(\"X\")" } });
  assert.deepEqual(u.rows[40].values[0], {});
});

test("usage: conta i movimenti del conto o della tipologia (solo il Tipo giusto)", () => {
  const mov = [
    { tipo: "Spesa", tip: "Regali", conto: "Banca" },
    { tipo: "Entrata", tip: "Regali", conto: "Banca" },
    { tipo: "Spesa", tip: "Spesa", conto: "Contanti" },
  ];
  assert.equal(C.usage(mov, "conto", "Banca"), 2);
  assert.equal(C.usage(mov, "spesa", "Regali"), 1);
  assert.equal(C.usage(mov, "entrata", "Regali"), 1);
  assert.equal(C.usage(mov, "spesa", "Nessuna"), 0);
});

test("renameSteps: rinomine incrociate passano da nomi provvisori", () => {
  const simple = C.renameSteps([{ kind: "conto", old: "A", new: "B" }]);
  assert.deepEqual(simple, [{ kind: "conto", old: "A", new: "B" }]);
  const steps = C.renameSteps([{ kind: "spesa", old: "A", new: "B" }, { kind: "spesa", old: "B", new: "X" }]);
  assert.equal(steps.length, 4);
  // simulazione: tre celle A, B, C
  let cells = ["A", "B", "C"];
  for (const st of steps) cells = cells.map(c => c === st.old ? st.new : c);
  assert.deepEqual(cells, ["B", "X", "C"]);
});

test("ETF_LIST: id unici, ISIN di 12 caratteri, ticker presente", () => {
  assert.ok(C.ETF_LIST.length >= 3);
  assert.equal(new Set(C.ETF_LIST.map(e => e.id)).size, C.ETF_LIST.length);
  for (const e of C.ETF_LIST) { assert.equal(e.isin.length, 12); assert.ok(e.nome && e.ticker); }
  assert.equal(C.ETF_LIST[0].id, "vwrp");
});

test("priceFormula: formula con il ticker due volte e la gestione delle valute", () => {
  const f = C.priceFormula("LON:VWRP");
  assert.ok(f.startsWith("="));
  assert.equal(f.split('"LON:VWRP"').length - 1, 2);
  assert.ok(f.includes("GBX") && f.includes("CURRENCY:GBPEUR"));
});

test("settingsToRows: con un ETF della lista scrive la formula del prezzo (ha la precedenza)", () => {
  const s = sample();
  s.kv = { ...(s.kv || {}), etf: "vwrp", prezzoFormula: "=1+1" };
  const rows = C.settingsToRows(s);
  const i = rows.findIndex(r => r[11] === "prezzo");
  assert.ok(String(rows[i][12]).includes("LON:VWRP"));
  s.kv.etf = "";
  assert.equal(C.settingsToRows(s)[i][12], "=1+1");
  s.kv.etf = "sconosciuto"; s.kv.prezzoFormula = undefined;
  assert.equal(C.settingsToRows(s)[i][12], "");
});

test("kvRow: riga della chiave nelle Impostazioni (foglio, 1 = prima riga dati A2)", () => {
  assert.equal(C.kvRow("quote"), 9 + 1);
  assert.equal(C.kvRow("nome"), 2);
});

/* ---------- giro finale: valori scritti a mano e nomi ---------- */
const setBase = () => C.parseSettings([HEADER, ["Banca", 100, "SI", "NO"], ["Vuoto", 5, "", "NO"]]);
test("normalizeMov: tipo minuscolo, conto con spazio, tipo estraneo scartato, trasferimenti minuscolo", () => {
  const s = setBase();
  const out = C.normalizeMov([
    { tipo: "entrata", tip: " Stipendio ", imp: 10, conto: "banca " },
    { tipo: "Spesa", tip: "trasferimenti", imp: 4, conto: "BANCA" },
    { tipo: "", tip: "x", imp: 99, conto: "Banca" },
    { tipo: "Altro", tip: "x", imp: 99, conto: "Banca" },
  ], s);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(m => [m.tipo, m.tip, m.conto]), [["Entrata", "Stipendio", "Banca"], ["Spesa", "Trasferimenti", "Banca"]]);
});
test("saldi con valori scritti a mano: stessi risultati del foglio", () => {
  const s = setBase();
  const mov = C.normalizeMov([
    { tipo: "entrata", tip: "A", imp: 10, conto: "banca " },
    { tipo: "Spesa", tip: "A", imp: 3, conto: "Banca" },
    { tipo: "Spesa", tip: "A", imp: 7, conto: "" },
    { tipo: "", tip: "A", imp: 50, conto: "Banca" },
  ], s);
  const b = C.computeBalances(mov, s);
  assert.deepEqual(b.conti.map(c => [c.nome, c.saldo]), [["Banca", 107], ["Vuoto", 5]]);
  assert.equal(b.totale, 112); // "Nel totale" vuoto = nel totale
});
test("formula Conti: nel totale tutto tranne NO; renameRequests ignora le maiuscole", () => {
  assert.ok(C.buildCreateBody("x") && JSON.stringify(C.buildCreateBody("x")).includes('t<>\\"NO\\"'));
  assert.ok(C.renameRequests("conto", "a", "b").every(r => r.findReplace.matchCase === false));
});
test("validateName rifiuta simboli da formula", () => {
  for (const n of ["=SOMMA", "<a", ">a", "a*b", "a?b", "a~b"]) assert.match(C.validateName(n, []), /simboli/);
  assert.equal(C.validateName("Risparmi-2", []), null);
});
