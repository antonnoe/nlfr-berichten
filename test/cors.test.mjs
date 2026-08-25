// De allowlist moet subdomeinen van de eigen domeinen toelaten: IF-Mobiel wordt
// als iframe ingebed op mobiel.nederlanders.fr en stuurt dát als Origin mee.
// Een lijst met alleen de kale en de www-vorm liet zo'n verzoek vallen, waarna
// de app op demo-berichten terugviel.
//
// De weigeringen zijn even belangrijk als de toelatingen: een simpele endsWith
// zonder punt zou kwaadnederlanders.fr binnenlaten.

import { test } from "node:test";
import assert from "node:assert/strict";
import { origineToegestaan, cors } from "../lib/cors.js";

const TOESTAAN = [
  "https://mobiel.nederlanders.fr",
  "https://nederlanders.fr",
  "https://www.nederlanders.fr",
  "https://infofrankrijk.com",
  "https://www.infofrankrijk.com",
  "https://cafeclaude.fr",
  "https://nedergids.nl",
  "https://if-mobiel.vercel.app",
  "https://nlfr-menu-git-branch.vercel.app",
];

const WEIGEREN = [
  "https://kwaadnederlanders.fr",       // suffix zonder puntgrens
  "https://nederlanders.fr.evil.com",   // eigen domein als subdomein van een ander
  "http://mobiel.nederlanders.fr",      // geen https
  "https://vercel.app",                 // het kale platformdomein
  "https://evil.example.com",
  "https://nedergids.nl.attacker.net",
  "not-a-url",
  "",
];

test("eigen domeinen en hun subdomeinen worden toegelaten", () => {
  for (const o of TOESTAAN) {
    assert.equal(origineToegestaan(o), true, `${o} hoort toegestaan te zijn`);
  }
});

test("spoofing, http en het kale platformdomein worden geweigerd", () => {
  for (const o of WEIGEREN) {
    assert.equal(origineToegestaan(o), false, `${o} hoort geweigerd te worden`);
  }
});

function nepRes() {
  const headers = {};
  return { headers, setHeader: (k, v) => { headers[k] = v; } };
}

test("cors() echoot een toegestane Origin terug en zet Vary", () => {
  const res = nepRes();
  cors({ headers: { origin: "https://mobiel.nederlanders.fr" } }, res);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://mobiel.nederlanders.fr");
  assert.equal(res.headers["Vary"], "Origin");
});

test("cors() zet geen Allow-Origin bij een geweigerde Origin", () => {
  const res = nepRes();
  cors({ headers: { origin: "https://kwaadnederlanders.fr" } }, res);
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
});

test("cors() zet geen Allow-Origin als er helemaal geen Origin is", () => {
  const res = nepRes();
  cors({ headers: {} }, res);
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
  assert.equal(res.headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
});
