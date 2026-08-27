// De berichttekst hoort bij de draad: zonder het bericht is een reactielijst
// geen discussie. De app had alleen de samenvatting van 260 tekens uit de feed.
//
// Deze tests draaien op nagebouwde Ning-HTML en bewijzen het GEDRAG van de
// extractie: de romp vóór de reacties, een minimale lengte, en een nette
// terugval. Ze bewijzen NIET dat de echte pagina er zo uitziet — dat kan alleen
// tegen nederlanders.fr zelf, en die is vanuit de bouwomgeving niet bereikbaar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { berichtUit } from "../lib/draad.js";

const REACTIE = `
<dl _id="3295325:Comment:1" class="comment vcard">
  <dt><a class="fn url" href="/profile/JoJo" title="JoJo">JoJo</a> Reactie van <a href="/profile/JoJo">JoJo</a> gisteren</dt>
  <dd><div class="xg_user_generated"><p>Dat herken ik volledig, bij ons ging het net zo.</p></div></dd>
</dl>`;

const MET_TEKST = `<html><body>
<div class="postbody"><div class="xg_user_generated">
  <p>De taxe d'habitation op tweede woningen is dit jaar opnieuw gewijzigd en dat raakt veel Nederlanders met een vakantiehuis in Frankrijk.</p>
  <p>Hieronder zet ik op een rij wat er precies verandert en per wanneer.</p>
</div></div>
${REACTIE}
</body></html>`;

test("de berichttekst komt als losse alinea's terug", () => {
  const b = berichtUit(MET_TEKST);
  assert.ok(b, "bericht ontbreekt");
  assert.equal(b.regels.length, 2, "twee alinea's verwacht");
  assert.match(b.regels[0], /taxe d'habitation/);
  assert.match(b.regels[1], /wat er precies verandert/);
});

test("een reactie wordt niet voor de berichttekst aangezien", () => {
  const b = berichtUit(MET_TEKST);
  assert.ok(!b.regels.join(" ").includes("Dat herken ik"),
    "een reactie is in de berichttekst beland");
});

test("ook zonder postbody-container wordt de romp gevonden", () => {
  const zonder = `<html><body>
    <div class="xg_user_generated"><p>Een bericht van voldoende lengte om als echte inhoud te tellen, met genoeg tekst erin.</p></div>
    ${REACTIE}</body></html>`;
  const b = berichtUit(zonder);
  assert.ok(b, "de tweede kandidaat hoort te werken");
  assert.match(b.regels[0], /voldoende lengte/);
});

test("zonder herkenbare tekst is het null, niet een halve tekst", () => {
  const kaal = `<html><body><div class="iets-anders"><p>Kort.</p></div>${REACTIE}</body></html>`;
  assert.equal(berichtUit(kaal), null, "hoort null te zijn zodat de afnemer terugvalt");
});

test("een kort bijschrift telt niet als bericht", () => {
  const bijschrift = `<html><body>
    <div class="xg_user_generated"><p>Foto: eigen archief</p></div>${REACTIE}</body></html>`;
  assert.equal(berichtUit(bijschrift), null, "een bijschrift is geen bericht");
});

test("een pagina zonder enige inhoud levert null", () => {
  assert.equal(berichtUit("<html><body></body></html>"), null);
  assert.equal(berichtUit(""), null);
  assert.equal(berichtUit(null), null);
});
