// De reactietekst die we leveren is alleen wat iemand schreef — geen NING-
// interface. Aanleiding: in de app stond bij een reactie op "Tapijt van Bayeux
// nu in Londen tentoongesteld" letterlijk
//
//     Reactie van loes Heil Nu net
//     Reactie wissenWanneer men ooit Vikingschepen wilt zien...
//
// De fixture test/fixtures/ning-reactie.html is de ECHTE HTML van die pagina,
// anoniem opgehaald. De eerste twee tests draaien de echte parser daarover; de
// rest bewaakt dat de aanpak generiek is en niet op deze ene knoptekst leunt.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { leesReacties } from "../lib/draad.js";
import { reactieRegels, binnenDiv, isInterfaceRegel, isKopregel, schoonRegels } from "../lib/schoon.js";

const FIXTURE = fs.readFileSync(new URL("./fixtures/ning-reactie.html", import.meta.url), "utf8");
const POST = "https://www.nederlanders.fr/xn/detail/3295325:BlogPost:1375879";

// --- de echte pagina -------------------------------------------------------

test("de fixture bevat het probleem dat we oplossen", () => {
  assert.ok(FIXTURE.includes('title="Reactie wissen"'), "de beheerlink hoort in de fixture te staan");
  assert.ok(FIXTURE.includes("<dt>Reactie van "), "de geplakte kopregel hoort in de fixture te staan");
});

test("geen enkele reactie levert nog NING-interfacetekst", () => {
  const reacties = leesReacties(FIXTURE, POST);
  assert.equal(reacties.length, 3, "drie reacties in de fixture");
  for (const r of reacties) {
    assert.ok(!/Reactie wissen/i.test(r.tekst), r.auteur + ": knop 'Reactie wissen' zit nog in de tekst");
    assert.ok(!/Reactie van/i.test(r.tekst), r.auteur + ": kopregel 'Reactie van …' zit nog in de tekst");
    assert.ok(!/delete_link|xg_user_generated|<[a-z]/i.test(r.tekst), r.auteur + ": er lekt HTML mee");
  }
});

test("de tekst van de geplakte reactie begint bij het eerste echte woord", () => {
  const r = leesReacties(FIXTURE, POST).find((x) => x.id === "1376159");
  assert.ok(r, "reactie 1376159 ontbreekt");
  assert.match(r.tekst, /^Wanneer men ooit Vikingschepen wilt zien/,
    "de tekst hoort te beginnen waar de schrijfster begon");
  assert.match(r.tekst, /Maliënkolder dragen\.$/, "en compleet te zijn tot het eind");
  assert.equal(r.auteur, "loes Heil");
  assert.equal(r.tijdTekst, "4 uur geleden");
});

test("de twee gewone reacties blijven ongemoeid", () => {
  const reacties = leesReacties(FIXTURE, POST);
  assert.equal(
    reacties.find((r) => r.id === "1375884").tekst,
    "Tapijt is een gallicisme! In Nederlands heet het wandkleed."
  );
  assert.match(reacties.find((r) => r.id === "1375906").tekst, /^Een bekentenis van mijn kant/);
  assert.match(reacties.find((r) => r.id === "1375906").tekst, /Ceci n'est pas un wandkleed/,
    "de aanhalingstekens en de hele slotzin horen te blijven staan");
});

// --- generiek, niet alleen deze knop ---------------------------------------

const KNOPPEN = [
  ["Reactie wissen", 'class="icon delete delete_link" title="Reactie wissen"'],
  ["Bewerken", 'class="edit_link" title="Bewerken"'],
  ["Beantwoorden", 'class="reply_link"'],
  ["Verwijderen", 'class="delete_link"'],
  ["Melden", 'class="flag_link"'],
  ["Reageren", 'class="comment_link reply"'],
  ["Delete Comment", 'class="icon delete delete_link" title="Delete Comment"'],
  ["Edit", 'class="edit_link"'],
  ["Reply", 'class="reply_link"'],
];

for (const [label, attrs] of KNOPPEN) {
  test(`de knop "${label}" verdwijnt uit de reactietekst`, () => {
    const dd = `<div class="xg_user_generated"><a href="#" ${attrs}>${label}</a><p>Dit is de echte reactie van een lezer.</p></div>`;
    const tekst = reactieRegels(binnenDiv(dd, "xg_user_generated"), null).join("\n\n");
    assert.equal(tekst, "Dit is de echte reactie van een lezer.");
  });
}

test("een knop die tegen de tekst geplakt zit knipt niet het eerste woord af", () => {
  // Precies de vorm uit de fixture: </a> levert geen regeleinde, dus vroeger
  // werd dit "Reactie wissenWanneer men…".
  const dd = `<a class="icon delete delete_link" title="Reactie wissen">Reactie wissen</a><div class="xg_user_generated"><p>Wanneer men ooit gaat kijken.</p></div>`;
  assert.equal(reactieRegels(dd, null).join(" "), "Wanneer men ooit gaat kijken.");
});

test("de actiebalk die Ning náást de tekst rendert komt niet mee", () => {
  const dd = `
    <div class="xg_user_generated"><p>De echte reactie, met genoeg tekst.</p></div>
    <p class="comment-actions"><a href="#" class="delete_link">Reactie wissen</a> <a href="#" class="reply_link">Beantwoorden</a></p>`;
  const tekst = reactieRegels(binnenDiv(dd, "xg_user_generated"), null).join(" ");
  assert.equal(tekst, "De echte reactie, met genoeg tekst.");
});

test("een kopregel zonder herkenbare knop valt op het vangnet", () => {
  // Platgeslagen kopie: geen <dt>, geen class — alleen nog tekst.
  const regels = ["Reactie van Jan Jansen gisteren", "Reactie wissen", "De echte inhoud staat hier."];
  assert.deepEqual(schoonRegels(regels, null), ["De echte inhoud staat hier."]);
});

test("auteur en tijd staan niet ook nog eens in de tekst", () => {
  const regels = ["loes Heil", "4 uur geleden", "loes Heil 4 uur geleden", "De echte inhoud."];
  assert.deepEqual(
    schoonRegels(regels, { auteur: "loes Heil", tijdTekst: "4 uur geleden" }),
    ["De echte inhoud."]
  );
});

// --- en niet te gretig -----------------------------------------------------

test("een gewone link in een reactie blijft gewoon staan", () => {
  const dd = `<div class="xg_user_generated"><p>Kijk op <a href="https://www.service-public.fr/">service-public.fr</a> voor de regels.</p></div>`;
  assert.equal(
    reactieRegels(binnenDiv(dd, "xg_user_generated"), null).join(" "),
    "Kijk op service-public.fr voor de regels."
  );
});

test("een zin die toevallig met 'Reactie van' begint blijft staan", () => {
  const lang = "Reactie van Jan hierboven klopt niet, want de belastingdienst rekent het anders en dat staat ook zo in de brief die ik vorige maand kreeg.";
  assert.equal(isKopregel(lang), false, "een echte zin is geen kopregel");
  assert.deepEqual(schoonRegels([lang], null), [lang]);
});

test("een kort woord dat geen Ning-knop is overleeft als reactie", () => {
  for (const kort of ["Bedankt", "Mee eens", "Antwoord", "Wissen", "Klopt"]) {
    assert.equal(isInterfaceRegel(kort), false, kort + " is geen knoplabel");
  }
});

test("alinea's blijven losse regels", () => {
  const dd = `<div class="xg_user_generated"><p>Eerste alinea.</p><p>Tweede alinea.</p></div>`;
  assert.equal(
    reactieRegels(binnenDiv(dd, "xg_user_generated"), null).join("\n\n"),
    "Eerste alinea.\n\nTweede alinea."
  );
});

// --- binnenDiv telt de div's mee -------------------------------------------

test("binnenDiv stopt bij het </div> dat er echt bij hoort", () => {
  const dd = `<div class="xg_user_generated"><div class="citaat"><p>Binnen.</p></div></div><p class="actions">Buiten.</p>`;
  const binnen = binnenDiv(dd, "xg_user_generated");
  assert.ok(binnen.includes("Binnen."));
  assert.ok(!binnen.includes("Buiten."), "de actiebalk erna hoort er niet bij");
});

test("binnenDiv geeft null als de klasse er niet is", () => {
  assert.equal(binnenDiv("<p>niets</p>", "xg_user_generated"), null);
  assert.equal(binnenDiv("", "xg_user_generated"), null);
});
