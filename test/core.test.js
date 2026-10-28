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
