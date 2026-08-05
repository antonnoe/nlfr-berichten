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
    const c = (e && e.cause) || {};
    return {
      tellingen: {},
      status: "fout: " + [e && e.name, e && e.message, c.code, c.message].filter(Boolean).join(" | "),
    };
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
    const j = html.search(/reactie/i);
    uit.debug = {
      lengte: html.length,
      blokken: posities.length,
      titel: (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "",
      bijBlogPost: i > -1 ? html.slice(Math.max(0, i - 700), i + 1800) : "geen :BlogPost: gevonden",
      bijReactie: j > -1 ? html.slice(Math.max(0, j - 700), j + 700) : "woord 'reactie' niet gevonden",
    };
  }
  return uit;
}
