// HTML-entiteiten in namen en tekst. Aanleiding: "Anton Noë" stond in de app als
// "Anton No&euml" — NING levert de entiteit zonder afsluitende puntkomma, en de
// oude handvol losse vervangingen kende &euml helemaal niet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ontsnap, schoonHtml } from "../lib/schoon.js";
import { leesReacties } from "../lib/draad.js";
import { haalBerichten } from "../lib/ning.js";

test("entiteit zonder puntkomma wordt gedecodeerd (No&euml -> Noë)", () => {
  assert.equal(ontsnap("Anton No&euml, beheerder"), "Anton Noë, beheerder");
  assert.equal(ontsnap("Anton No&euml"), "Anton Noë");
  assert.equal(ontsnap("Anton No&euml;"), "Anton Noë");
});

test("benoemde entiteiten buiten de legacy-lijst, ook zonder puntkomma", () => {
  assert.equal(ontsnap("Fonci&egrave;re v&oacute;&oacute;r"), "Foncière vóór");
  assert.equal(ontsnap("wacht&hellip"), "wacht…");
});

test("numerieke entiteiten, decimaal en hexadecimaal", () => {
  assert.equal(ontsnap("&#233;&#xE9;&#x1F600;"), "éé😀");
});

test("een URL-parameter wordt niet voor een entiteit aangezien", () => {
  assert.equal(ontsnap("zie ?a=1&lang=nl"), "zie ?a=1&lang=nl");
});

test("geen dubbele decodering: &amp;lt; wordt &lt;, niet <", () => {
  assert.equal(ontsnap("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
  // en in uitgeleverde HTML blijft het een letterlijke tekst, geen tag
  const { html } = schoonHtml("<p>&amp;lt;b&amp;gt; &amp; &lt;i&gt;</p>");
  assert.equal(html, "<p>&amp;lt;b&amp;gt; &amp; &lt;i&gt;</p>");
});

test("de auteur 'Anton Noë' in een reactie komt correct uit de NING-pagina", () => {
  const html = `<dl _id="3295325:Comment:77" class="comment vcard">
    <dt><a class="fn url" href="/profile/AntonNoe" title="Anton Noë">x</a>
    Reactie van <a href="/profile/AntonNoe">Anton No&euml, beheerder en gastheer</a> gisteren</dt>
    <dd><div class="xg_user_generated"><p>Welkom Fonci&egrave;re &amp; co</p></div></dd></dl>`;
  const [r] = leesReacties(html, "https://www.nederlanders.fr/xn/detail/3295325:BlogPost:1");
  assert.equal(r.auteur, "Anton Noë, beheerder en gastheer");
  assert.equal(r.tekst, "Welkom Foncière & co");
});

test("feedtitels en -auteurs: CDATA en XML-geëscapete velden worden één keer gedecodeerd", async () => {
  const feed = (titel, naam) => `<feed><entry><title>${titel}</title>
    <link rel="alternate" href="http://www.nederlanders.fr/xn/detail/3295325:BlogPost:5"/>
    <author><name>${naam}</name></author>
    <summary type="html">&lt;p&gt;tekst&lt;/p&gt;</summary></entry></feed>`;
  const echteFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    const tekst = u.includes("blog/feed")
      ? feed("Dennis &amp; Lupita", "Anton No&euml;")
      : "<rss><channel></channel></rss>";
    return { ok: true, url: u, text: async () => tekst };
  };
  try {
    const d = await haalBerichten();
    assert.equal(d.berichten[0].auteur, "Anton Noë");
    assert.match(d.berichten[0].titel, /^Dennis & Lupita/);
  } finally {
    globalThis.fetch = echteFetch;
  }
});
