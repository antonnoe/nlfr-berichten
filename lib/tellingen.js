// lib/tellingen.js — het aantal reacties per bericht, in één ophaalactie.
// De blog-overzichtspagina noemt per bericht het aantal reacties; dat is veel
// goedkoper dan dertig berichtpagina's ophalen.

import { haalPagina } from "./ning.js";

const LIJST = "https://www.nederlanders.fr/profiles/blog/list";

const AANTAL = /(\d[\d.]*)\s*(?:reactie|reacties|comment|comments)\b/i;

export async function haalTellingen(opties) {
  const debug = !!(opties && opties.debug);
  let html = "";
  try {
    html = await haalPagina(LIJST);
  } catch (e) {
    return { tellingen: {}, status: "fout: " + (e && e.message) };
  }

  // De pagina in blokken knippen op elk voorkomen van een BlogPost-id.
  const posities = [];
  const re = /:BlogPost:(\d+)/gi;
  let m;
  while ((m = re.exec(html))) posities.push({ id: m[1], start: m.index });

  const tellingen = {};
  for (let i = 0; i < posities.length; i++) {
    const van = posities[i].start;
    const tot = i + 1 < posities.length ? posities[i + 1].start : Math.min(van + 6000, html.length);
    const blok = html.slice(van, tot).replace(/<[^>]*>/g, " ");
    const t = blok.match(AANTAL);
    if (!t) continue;
    const n = parseInt(t[1].replace(/\./g, ""), 10);
    if (!isNaN(n)) tellingen[posities[i].id] = Math.max(tellingen[posities[i].id] || 0, n);
  }

  const uit = { tellingen, status: "ok", gevonden: Object.keys(tellingen).length };
  if (debug) {
    const i = html.search(/:BlogPost:/i);
    uit.debug = { lengte: html.length, blokken: posities.length, fragment: html.slice(Math.max(0, i - 800), i + 2600) };
  }
  return uit;
}
