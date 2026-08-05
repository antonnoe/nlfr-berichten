// lib/tellingen.js — het aantal reacties per bericht, in één ophaalactie.
// De blog-overzichtspagina noemt per bericht het aantal reacties; dat is veel
// goedkoper dan dertig berichtpagina's ophalen.

import { haalPagina } from "./ning.js";

const LIJST = "https://www.nederlanders.fr/profiles/blog/list";

// Ning schrijft "1 commentaar", "24 commentaren" of "Geen reacties".
const AANTAL = /(\d[\d.]*)\s*(?:commentaar|commentaren|reactie|reacties|comment|comments)/i;
const GEEN = /geen\s+(?:reacties|commentaren|comments)/i;
// Het bericht-id staat in _snid="3295325:BlogPost:1373956".
const SNID = /_snid=["'][^"']*:BlogPost:(\d+)["']/gi;

export async function haalTellingen(opties) {
  const debug = !!(opties && opties.debug);
  let html = "";
  try {
    html = await haalPagina(LIJST);
  } catch (e) {
    const c = (e && e.cause) || {};
    return {
      tellingen: {},
      status: "fout: " + [e && e.name, e && e.message, c.code, c.message].filter(Boolean).join(" | "),
    };
  }

  const tellingen = {};

  const lees = (h) => {
    const posities = [];
    SNID.lastIndex = 0;
    let m;
    while ((m = SNID.exec(h))) posities.push({ id: m[1], start: m.index });
    for (let i = 0; i < posities.length; i++) {
      const van = posities[i].start;
      const tot = i + 1 < posities.length ? posities[i + 1].start : Math.min(van + 8000, h.length);
      const blok = h.slice(van, tot).replace(/<[^>]*>/g, " ");
      const id = posities[i].id;
      if (GEEN.test(blok)) {
        if (!(id in tellingen)) tellingen[id] = 0;
        continue;
      }
      const a = blok.match(AANTAL);
      if (!a) continue;
      const n = parseInt(a[1].replace(/\./g, ""), 10);
      if (!isNaN(n)) tellingen[id] = Math.max(tellingen[id] || 0, n);
    }
    return posities.length;
  };

  const blokken = lees(html);

  // De overzichtspagina toont 20 berichten; de feed er 30. Pagina 2 erbij.
  let blokken2 = 0;
  try {
    blokken2 = lees(await haalPagina(LIJST + "?page=2"));
  } catch (e) {}

  const uit = { tellingen, status: "ok", gevonden: Object.keys(tellingen).length };
  if (debug) {
    const i = html.search(/:BlogPost:/i);
    const j = html.search(/reactie/i);
    uit.debug = {
      lengte: html.length,
      blokken: blokken + blokken2,
      titel: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "",
      bijBlogPost: i > -1 ? html.slice(Math.max(0, i - 700), i + 1800) : "geen :BlogPost: gevonden",
      bijReactie: j > -1 ? html.slice(Math.max(0, j - 700), j + 700) : "woord 'reactie' niet gevonden",
    };
  }
  return uit;
}
