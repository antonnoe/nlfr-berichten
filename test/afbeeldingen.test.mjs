// Foto's in berichten en reacties blijven behouden, als https en absoluut.

import { test } from "node:test";
import assert from "node:assert/strict";
import { schoonHtml, veiligeUrl } from "../lib/schoon.js";
import { leesReacties, berichtUit } from "../lib/draad.js";

test("veiligeUrl: https blijft, http en // worden https, relatief wordt absoluut", () => {
  assert.equal(veiligeUrl("https://storage.ning.com/a.jpg"), "https://storage.ning.com/a.jpg");
  assert.equal(veiligeUrl("http://storage.ning.com/a.jpg"), "https://storage.ning.com/a.jpg");
  assert.equal(veiligeUrl("//storage.ning.com/a.jpg"), "https://storage.ning.com/a.jpg");
  assert.equal(veiligeUrl("/xn/f.png"), "https://www.nederlanders.fr/xn/f.png");
  assert.equal(veiligeUrl("foto.png"), "https://www.nederlanders.fr/foto.png");
});

test("veiligeUrl: gevaarlijke of onbruikbare bronnen vervallen", () => {
  assert.equal(veiligeUrl("javascript:alert(1)"), "");
  assert.equal(veiligeUrl("data:image/png;base64,AAAA"), "");
  assert.equal(veiligeUrl(""), "");
});

test("schoonHtml houdt <img> met alt, maakt src https/absoluut, zonder width/height/style", () => {
  const { html, afbeeldingen } = schoonHtml(
    '<p>Kijk:</p><a href="http://storage.ning.com/o.jpg?profile=original"><img src="//storage.ning.com/b.jpg?profile=RESIZE_710x" ' +
    'width="710" height="400" style="float:left" class="align-full" alt="Een &amp; poes"/></a>' +
    '<img src="/rel.png"><img src="http://storage.ning.com/c.jpg">'
  );
  assert.deepEqual(afbeeldingen.map((a) => a.src), [
    "https://storage.ning.com/b.jpg?profile=RESIZE_710x",
    "https://www.nederlanders.fr/rel.png",
    "https://storage.ning.com/c.jpg",
  ]);
  assert.equal(afbeeldingen[0].alt, "Een & poes");
  assert.match(html, /<img src="https:\/\/storage\.ning\.com\/b\.jpg\?profile=RESIZE_710x" alt="Een &amp; poes" loading="lazy">/);
  assert.ok(!/width|height|style|class=/i.test(html), "layout-attributen horen weg: " + html);
  assert.ok(!/src="http:/i.test(html), "geen http-bron");
});

test("schoonHtml laat scripts, data:-afbeeldingen en trackingpixels vallen", () => {
  const { html, afbeeldingen } = schoonHtml(
    '<p>x</p><script>alert(1)</script><img src="data:image/gif;base64,R0lG"><img src="https://t.example/p.gif" width="1" height="1">'
  );
  assert.equal(afbeeldingen.length, 0);
  assert.ok(!/script|alert|<img/i.test(html));
});

test("een reactie met foto levert html en afbeeldingen", () => {
  const html = `<dl _id="3295325:Comment:9" class="comment vcard"><dt>Reactie van <a href="/profile/x">Jan</a> nu</dt>
    <dd><div class="xg_user_generated"><p>Zie hier</p><p><img src="//storage.ning.com/z.jpg" alt="tuin"></p></div></dd></dl>`;
  const [r] = leesReacties(html, "https://www.nederlanders.fr/xn/detail/3295325:BlogPost:1");
  assert.equal(r.tekst, "Zie hier");
  assert.equal(r.afbeeldingen.length, 1);
  assert.equal(r.afbeeldingen[0].src, "https://storage.ning.com/z.jpg");
  assert.match(r.html, /<img [^>]*alt="tuin"/);
});

test("de berichttekst op de pagina houdt zijn foto's, ook met geneste div's", () => {
  const pagina = `<html><body><div class="postbody"><div class="xg_user_generated">
    <div><p>Een flink verhaal over de tuin die we dit jaar hebben aangelegd, met veel foto's erbij zoals hieronder.</p></div>
    <p><a href="https://storage.ning.com/o.jpg"><img src="https://storage.ning.com/f.jpg?profile=RESIZE_710x" class="align-full"/></a></p>
    <div><p>Tweede alinea.</p></div></div></div><div class="left-panel"></div></body></html>`;
  const b = berichtUit(pagina);
  assert.ok(b);
  assert.equal(b.afbeeldingen.length, 1);
  assert.equal(b.afbeeldingen[0].src, "https://storage.ning.com/f.jpg?profile=RESIZE_710x");
  assert.match(b.html, /Tweede alinea/);
  assert.equal(b.regels.length, 2);
});
