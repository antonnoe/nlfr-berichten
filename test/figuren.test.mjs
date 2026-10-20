// Foto's als <figure> met onderschrift, volgens het vaste contract voor de app.

import { test } from "node:test";
import assert from "node:assert/strict";
import { schoonHtml } from "../lib/schoon.js";
import { leesReacties } from "../lib/draad.js";

const FOTO = (id) =>
  `<p><a href="https://storage.ning.com/topology/rest/1.0/file/get/${id}?profile=original" target="_blank">` +
  `<img src="https://storage.ning.com/topology/rest/1.0/file/get/${id}?profile=RESIZE_710x" width="750" class="align-center"/></a></p>`;
const ORIG = (id) => `https://storage.ning.com/topology/rest/1.0/file/get/${id}?profile=original`;
const SRC = (id) => `https://storage.ning.com/topology/rest/1.0/file/get/${id}?profile=RESIZE_710x`;

const telFiguren = (h) => (h.match(/<figure>/g) || []).length;

test("NING-patroon: foto met cursief onderschrift wordt een figuur, onderschrift niet dubbel", () => {
  const { html, afbeeldingen } = schoonHtml(
    "<p>Inleiding.</p>" + FOTO(31277332671) +
    '<p style="text-align: center;"><em>Palais de Cité - foto Wikipedia</em></p><p>Daarna meer tekst.</p>'
  );
  assert.equal(
    html,
    "<p>Inleiding.</p>" +
    `<figure><a href="${ORIG(31277332671)}" target="_blank" rel="noopener"><img src="${SRC(31277332671)}" alt="" loading="lazy"></a>` +
    "<figcaption>Palais de Cité - foto Wikipedia</figcaption></figure><p>Daarna meer tekst.</p>"
  );
  assert.equal(html.split("Palais de Cité").length - 1, 1, "onderschrift maar één keer");
  assert.equal(afbeeldingen[0].onderschrift, "Palais de Cité - foto Wikipedia");
  assert.equal(afbeeldingen[0].origineel, ORIG(31277332671));
});

test("cursief onderschrift zonder centrering, lege alinea's ertussen worden overgeslagen", () => {
  const { html } = schoonHtml(FOTO(1) + "<p></p><p>&nbsp;</p><p><i>Bron: de krant</i></p><p>Tekst</p>");
  assert.match(html, /<figcaption>Bron: de krant<\/figcaption>/);
  assert.ok(!/<p>Bron/.test(html));
  assert.ok(!/<p>\s*<\/p>/.test(html), "geen lege alinea's: " + html);
});

test("gecentreerd onderschrift zonder cursief", () => {
  const { html, afbeeldingen } = schoonHtml(FOTO(2) + '<p style="text-align:center;">Foto: Jan, 2024</p><p>Tekst</p>');
  assert.match(html, /<figcaption>Foto: Jan, 2024<\/figcaption>/);
  assert.ok(!/<p>Foto: Jan/.test(html));
  assert.equal(afbeeldingen[0].onderschrift, "Foto: Jan, 2024");
});

test("geen onderschrift: geen figcaption, volgende alinea blijft staan; alt blijft", () => {
  const { html, afbeeldingen } = schoonHtml(
    '<p><img src="https://storage.ning.com/x/get/3?profile=RESIZE_710x" alt="Een poes"></p><p>Gewone tekst, niet cursief en links.</p>'
  );
  assert.equal(telFiguren(html), 1);
  assert.ok(!/figcaption/.test(html));
  assert.match(html, /alt="Een poes"/);
  assert.match(html, /<p>Gewone tekst/);
  assert.equal(afbeeldingen[0].onderschrift, null);
  assert.equal(afbeeldingen[0].origineel, "https://storage.ning.com/x/get/3?profile=original");
});

test("lange cursieve of half-cursieve alinea is geen onderschrift", () => {
  const lang = "x".repeat(301);
  assert.ok(!/figcaption/.test(schoonHtml(FOTO(4) + `<p><em>${lang}</em></p>`).html));
  assert.ok(!/figcaption/.test(schoonHtml(FOTO(4) + "<p>Een <em>half</em> cursieve zin</p>").html));
  assert.ok(!/figcaption/.test(schoonHtml(FOTO(4) + "<p><em>a</em> en <em>b</em></p>").html));
});

test("twee foto's na elkaar: elk een figuur, onderschrift alleen bij de tweede", () => {
  const { html, afbeeldingen } = schoonHtml(FOTO(5) + FOTO(6) + '<p style="text-align:center"><em>Twee zichten</em></p>');
  assert.equal(telFiguren(html), 2);
  assert.equal((html.match(/<figcaption>/g) || []).length, 1);
  assert.ok(html.indexOf("Twee zichten") > html.indexOf(ORIG(6)));
  assert.equal(afbeeldingen[0].onderschrift, null);
  assert.equal(afbeeldingen[1].onderschrift, "Twee zichten");
});

test("twee foto's in één alinea: onderschrift alleen bij de laatste", () => {
  const { html } = schoonHtml(
    '<p><img src="https://storage.ning.com/a/get/7"><img src="https://storage.ning.com/a/get/8"></p><p><em>Onder</em></p>'
  );
  assert.equal(telFiguren(html), 2);
  assert.equal((html.match(/<figcaption>/g) || []).length, 1);
  assert.match(html, /get\/8\?profile=original" target="_blank" rel="noopener"><img [^>]*><\/a><figcaption>Onder/);
});

test("origineel: externe afbeelding blijft zelf, http wordt https, link naar andere host telt niet", () => {
  const { html, afbeeldingen } = schoonHtml(
    '<p><a href="http://example.org/groot.jpg"><img src="http://example.org/klein.jpg" alt="a"></a></p>'
  );
  assert.equal(afbeeldingen[0].origineel, "https://example.org/klein.jpg");
  assert.match(html, /<a href="https:\/\/example\.org\/klein\.jpg" target="_blank" rel="noopener"><img/);
});

test("tekst en foto in één alinea blijven in volgorde; gewone links houden rel=noopener; javascript: valt weg", () => {
  const { html } = schoonHtml(
    '<p>Voor <a href="http://voorbeeld.nl/x">link</a> <a href="javascript:alert(1)">fout</a> <img src="https://storage.ning.com/q/get/9"> na</p>'
  );
  assert.match(html, /<p>Voor <a href="https:\/\/voorbeeld\.nl\/x" target="_blank" rel="noopener">link<\/a>/);
  assert.ok(!/javascript/.test(html));
  assert.match(html, /<\/figure><p>na<\/p>/);
});

test("lege alinea's verdwijnen uit html", () => {
  const { html } = schoonHtml("<p></p><p>Tekst</p><p> <br> </p><p><strong></strong></p>");
  assert.equal(html, "<p>Tekst</p>");
});

test("figure/figcaption uit de bron: figcaption wordt onderschrift", () => {
  const { html } = schoonHtml(
    '<figure><img src="https://storage.ning.com/f/get/10"><figcaption>Uit de bron</figcaption></figure>'
  );
  assert.equal(telFiguren(html), 1);
  assert.match(html, /<figcaption>Uit de bron<\/figcaption>/);
});

test("een reactie krijgt dezelfde figuren", () => {
  const pagina = `<dl _id="3295325:Comment:9" class="comment vcard"><dt>Reactie van <a href="/profile/x">Jan</a> nu</dt>
    <dd><div class="xg_user_generated"><p>Zie hier</p>${FOTO(11)}<p style="text-align: center;"><em>Mijn tuin</em></p></div></dd></dl>`;
  const [r] = leesReacties(pagina, "https://www.nederlanders.fr/xn/detail/3295325:BlogPost:1");
  assert.match(r.html, /<figure>.*<figcaption>Mijn tuin<\/figcaption><\/figure>/);
  assert.equal(r.html.split("Mijn tuin").length - 1, 1);
  assert.equal(r.afbeeldingen[0].onderschrift, "Mijn tuin");
  assert.equal(r.afbeeldingen[0].origineel, ORIG(11));
});
