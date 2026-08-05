// lib/draad.js — de volledige reactiedraad van één blogbericht ophalen door de
// berichtpagina zelf te lezen. De activiteitenfeed toont maar een paar dagen;
// dit haalt alles. Bewust defensief: Ning-HTML kan wijzigen.

import { haalPagina } from "./ning.js";

const BASIS = "https://www.nederlanders.fr/xn/detail/";

// Ning geeft elk reactieblok een id met ":Comment:" erin.
const COMMENT_ID = /id=["']?[^"'\s>]*?:Comment:(\d+)["']?/gi;

function ontsnap(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&hellip;/gi, "\u2026")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function plat(html) {
  return ontsnap(
    String(html || "")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function auteurUit(blok) {
  const m = blok.match(/<a[^>]+href=["'][^"']*\/profile\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return "";
  const naam = plat(m[1]);
  return naam.length > 1 && naam.length < 70 ? naam : "";
}

function datumUit(blok) {
  const kandidaten = [
    /<(?:abbr|time)[^>]+(?:datetime|title)=["']([^"']+)["']/i,
    /\bdata-time=["']([^"']+)["']/i,
    /<span[^>]+class=["'][^"']*date[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
  ];
  for (const re of kandidaten) {
    const m = blok.match(re);
    if (!m) continue;
    const d = new Date(plat(m[1]));
    if (!isNaN(d)) return d.toISOString();
  }
  return null;
}

// De reactietekst zit in het langste tekstblok van het reactieblok, na de byline.
function tekstUit(blok) {
  const gericht = blok.match(
    /<(?:div|p)[^>]+class=["'][^"']*(?:description|comment-?(?:body|text|content)|xg_user_generated)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p)>/i
  );
  if (gericht) {
    const t = plat(gericht[1]);
    if (t.length > 1) return t;
  }
  // Terugval: alle alinea's, byline-achtige regels eruit.
  const alineas = [...blok.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => plat(m[1]))
    .filter((t) => t.length > 1 && !/^(reageren|beantwoorden|verwijderen|permalink)$/i.test(t));
  if (alineas.length) return alineas.join(" ").slice(0, 4000);
  return plat(blok).slice(0, 4000);
}

// Knip de pagina in blokken: van elk ":Comment:<id>" tot aan het volgende.
function splitsBlokken(html) {
  const posities = [];
  let m;
  COMMENT_ID.lastIndex = 0;
  while ((m = COMMENT_ID.exec(html))) posities.push({ id: m[1], start: m.index });

  const uniek = [];
  const gezien = new Set();
  for (const p of posities) {
    if (gezien.has(p.id)) continue;
    gezien.add(p.id);
    uniek.push(p);
  }

  return uniek.map((p, i) => ({
    id: p.id,
    html: html.slice(p.start, i + 1 < uniek.length ? uniek[i + 1].start : Math.min(p.start + 12000, html.length)),
  }));
}

export async function haalDraad(postId, opties) {
  const debug = !!(opties && opties.debug);
  const url = BASIS + "3295325:BlogPost:" + encodeURIComponent(postId);

  let html = "";
  try {
    html = await haalPagina(url);
  } catch (e) {
    return { reacties: [], status: "fout: " + (e && e.message), bron: url };
  }

  const blokken = splitsBlokken(html);
  const reacties = blokken
    .map((b) => ({
      id: b.id,
      auteur: auteurUit(b.html) || "Onbekend",
      datum: datumUit(b.html),
      tekst: tekstUit(b.html),
      href: url + "?commentId=3295325%3AComment%3A" + b.id,
    }))
    .filter((r) => r.tekst && r.tekst.length > 1);

  reacties.sort((a, b) => new Date(a.datum || 0) - new Date(b.datum || 0));

  const uit = { reacties, status: "ok", bron: url, aantal: reacties.length };
  if (debug) {
    const i = html.indexOf(":Comment:");
    uit.debug = {
      lengte: html.length,
      blokken: blokken.length,
      fragment: i > -1 ? html.slice(Math.max(0, i - 1500), i + 3000) : html.slice(0, 3000),
    };
  }
  return uit;
}
