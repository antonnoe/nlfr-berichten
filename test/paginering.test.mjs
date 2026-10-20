// Reactiepaginering. Aanleiding: "Niet alle reacties konden worden opgehaald
// (10 van 28)". NING toont 10 reacties per pagina; de vervolgpagina's staan op
// <slug>?id=<groep>:BlogPost:<id>&page=N. De oude code pakte als slug de eerste
// /profiles/blogs/-link van de pagina, en dat is een zijbalklink naar een ánder
// bericht, waardoor pagina 2 niets nieuws gaf en de lus stopte na 10.
//
// De fixture is nagebouwd naar de echte pagina (28 reacties, 3 pagina's, een
// redirect van /xn/detail/… naar /profiles/blogs/<slug>, een zijbalklink naar
// een ander bericht vóór de paginering).

import { test } from "node:test";
import assert from "node:assert/strict";
import { haalDraad, slugUit, paginaUrl } from "../lib/draad.js";

const POST = "1379843";
const SLUG = "https://www.nederlanders.fr/profiles/blogs/d-gr-vement-de-taxe";
const ID = "3295325%3ABlogPost%3A" + POST;

function dl(n) {
  return `<dl _id="3295325:Comment:${2000 + n}" class="comment vcard"><dt>Reactie van <a href="/profile/u${n}">Lid ${n}</a> nu</dt>` +
    `<dd><div class="xg_user_generated"><p>Reactie nummer ${n}</p></div></dd></dl>`;
}

function pagina(n, totaal = 28) {
  const van = (n - 1) * 10 + 1, tot = Math.min(n * 10, totaal);
  let reacties = "";
  for (let i = van; i <= tot; i++) reacties += dl(i);
  const knoppen = [1, 2, 3].map((p) => `<a href="${SLUG}?id=${ID}&amp;page=${p}#comments">${p}</a>`).join("");
  return `<html><body><div id="sidebar"><a href="https://www.nederlanders.fr/profiles/blogs/online-boekhouden-in-frankrijk">ander bericht</a></div>` +
    `<div class="postbody"><div class="xg_user_generated"><p>${"Het bericht zelf, lang genoeg om als bericht te gelden. ".repeat(3)}</p></div></div>` +
    `<div _numComments="${totaal}"></div>${reacties}<div class="pagination">${knoppen}</div></body></html>`;
}

// Nepnetwerk: houdt bij welke URL's zijn opgehaald.
function nepNing({ traag = [], kapot = [], totaal = 28 } = {}) {
  const log = [];
  const haal = async (url, timeoutMs) => {
    log.push(url);
    if (url.includes("/xn/detail/")) return { tekst: pagina(1, totaal), url: SLUG };
    const n = +new URL(url).searchParams.get("page");
    if (!url.startsWith(SLUG + "?id=")) throw new Error("verkeerde pagina opgehaald: " + url);
    if (kapot.includes(n)) throw new Error("time-out");
    if (traag.includes(n)) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    return { tekst: pagina(n, totaal), url };
  };
  return { haal, log };
}

test("alle 28 reacties komen binnen, in volgorde, over drie pagina's", async () => {
  const { haal, log } = nepNing();
  const d = await haalDraad(POST, { haal, debug: true });
  assert.equal(d.aantal, 28);
  assert.equal(d.verwacht, 28);
  assert.equal(d.volledig, true);
  assert.deepEqual(d.reacties.map((r) => r.id), Array.from({ length: 28 }, (_, i) => String(2001 + i)));
  assert.deepEqual(d.debug.paginas, [1, 2, 3]);
  assert.deepEqual(d.debug.ontbreekt, []);
  assert.equal(log.filter((u) => u.includes("page=")).length, 2, "alleen pagina 2 en 3 hoeven extra");
});

test("de slug is die van dit bericht, niet de zijbalklink", () => {
  assert.equal(slugUit(pagina(1), POST, ""), SLUG);
  assert.equal(slugUit("<html></html>", POST, SLUG), SLUG, "val terug op de redirect-URL");
  assert.equal(slugUit('<a href="https://www.nederlanders.fr/profiles/blogs/ander">x</a>', POST, ""), "",
    "een willekeurige blogslug is geen bewijs");
  assert.equal(paginaUrl(SLUG, POST, 2), SLUG + "?id=" + ID + "&page=2");
});

test("een lange draad (44 reacties, 5 pagina's) wordt ook volledig opgehaald", async () => {
  const lijst = Array.from({ length: 5 }, (_, i) => i + 1);
  const haal = async (url) => {
    if (url.includes("/xn/detail/")) return { tekst: pagina5(1), url: SLUG };
    return { tekst: pagina5(+new URL(url).searchParams.get("page")), url };
  };
  function pagina5(n) {
    return pagina(n, 44).replace(/<a href="[^"]*page=3[^"]*">3<\/a>/, lijst.map((p) => `<a href="${SLUG}?id=${ID}&amp;page=${p}">${p}</a>`).join(""));
  }
  const d = await haalDraad(POST, { haal });
  assert.equal(d.aantal, 44);
  assert.equal(d.volledig, true);
});

test("een trage pagina: gedeeltelijk resultaat blijft bruikbaar, volledig=false", async () => {
  const { haal } = nepNing({ traag: [3] });
  const d = await haalDraad(POST, { haal, debug: true });
  assert.equal(d.status, "ok");
  assert.equal(d.aantal, 20, "pagina 1 en 2 zijn binnen");
  assert.equal(d.verwacht, 28);
  assert.equal(d.volledig, false);
  assert.deepEqual(d.debug.ontbreekt, [3]);
});

test("mislukt pagina 2, dan komt pagina 3 er nog wel bij", async () => {
  const { haal } = nepNing({ kapot: [2] });
  const d = await haalDraad(POST, { haal });
  assert.equal(d.aantal, 18);
  assert.equal(d.volledig, false);
});

test("een eerste mislukte poging wordt herkanst", async () => {
  let poging = 0;
  const basis = nepNing().haal;
  const haal = async (url, t) => {
    if (url.includes("page=2") && poging++ === 0) throw new Error("tijdelijk");
    return basis(url, t);
  };
  const d = await haalDraad(POST, { haal });
  assert.equal(d.aantal, 28);
});

test("is het budget op, dan geen extra paginaverzoeken en toch een antwoord", async () => {
  const { haal, log } = nepNing();
  const d = await haalDraad(POST, { haal, budgetMs: 1 });
  assert.equal(d.status, "ok");
  assert.equal(d.aantal, 10);
  assert.equal(d.volledig, false);
  assert.equal(log.filter((u) => u.includes("page=")).length, 0);
});

test("een draad zonder vervolgpagina's blijft één verzoek", async () => {
  const { haal, log } = nepNing({ totaal: 6 });
  const d = await haalDraad(POST, { haal });
  assert.equal(d.aantal, 6);
  assert.equal(log.length, 1);
});
