// lib/draad.js — de VOLLEDIGE reactiedraad van één blogbericht, gelezen van de
// berichtpagina zelf. De activiteitenfeed toont maar een paar dagen; dit haalt
// alles, inclusief de vervolgpagina's die Ning gebruikt vanaf ~10 reacties.
//
// Ning-structuur (vastgesteld op de echte pagina):
//   <dl _id="3295325:Comment:1373622" class="comment vcard …">
//     <dt> … <a class="fn url" href="/profile/JoJo" title="JoJo">…</a>
//            Reactie van <a href="/profile/JoJo">JoJo</a> gisteren </dt>
//     <dd> <div class="xg_user_generated"><p>…</p><p>…</p></div> </dd>
//   </dl>

import { haalPagina } from "./ning.js";
// De tekstextractie zelf staat in lib/schoon.js: die haalt de NING-knoppen en
// kopregels eruit die anders als reactietekst in de app belanden.
import { ontsnap, alineas, plat, binnenDiv, reactieRegels } from "./schoon.js";

const BASIS = "https://www.nederlanders.fr/xn/detail/";
const GROEP = "3295325";
const MAX_PAGINAS = 12;

const DL = /<dl\b[^>]*_id=["'][^"']*:Comment:(\d+)["'][^>]*>([\s\S]*?)<\/dl>/gi;

function leesBlok(id, binnen, postUrl) {
  const dt = (binnen.match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/i) || [])[1] || "";
  const dd = (binnen.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i) || [])[1] || "";

  // De reactietekst is de div.xg_user_generated BINNEN het <dd> — precies die
  // node, met de <div>'s meegeteld, zodat de knoppen die Ning erachter rendert
  // er niet bij zitten. Ontbreekt hij, dan het hele <dd>; het opruimen doet
  // reactieRegels hieronder dan alsnog.
  const body = binnenDiv(dd, "xg_user_generated") ?? dd;

  // Auteur: "Reactie van <a>NAAM</a>", anders het title-attribuut van de avatar.
  let auteur = plat((dt.match(/Reactie van\s*<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");
  if (!auteur) auteur = ontsnap((dt.match(/<a[^>]+class=["'][^"']*fn url[^"']*["'][^>]*title=["']([^"']+)["']/i) || [])[1] || "");
  if (!auteur) auteur = plat((dt.match(/<a[^>]+href=["'][^"']*\/profile\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");

  const profiel = ontsnap((dt.match(/href=["']([^"']*\/profile\/[^"']+)["']/i) || [])[1] || "");
  const avatar = ontsnap((dt.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "");

  // Ning toont een relatieve tijd als losse tekst achter de auteurslink.
  const naAuteur = dt.split(/<\/a>/i).pop() || "";
  const tijdTekst = plat(naAuteur).replace(/^[\s·|-]+/, "").trim();

  const tijd = tijdTekst && tijdTekst.length < 60 ? tijdTekst : "";

  // Auteur en tijd gaan als eigen velden mee; ze horen niet óók in de tekst.
  const regels = reactieRegels(body, { auteur, tijdTekst: tijd });
  return {
    id,
    auteur: auteur || "Onbekend",
    profiel: profiel ? profiel.replace(/^http:/i, "https:") : "",
    avatar: avatar ? avatar.replace(/^http:/i, "https:") : "",
    tijdTekst: tijd,
    tekst: regels.join("\n\n"),
    href: postUrl + "?commentId=" + GROEP + "%3AComment%3A" + id,
  };
}

// Alle reactieblokken uit een stuk pagina-HTML. Apart en geëxporteerd zodat de
// tests de echte parser op een opgeslagen pagina kunnen draaien, zonder netwerk.
export function leesReacties(html, postUrl) {
  const uit = [];
  DL.lastIndex = 0;
  let m;
  while ((m = DL.exec(String(html || "")))) uit.push(leesBlok(m[1], m[2], postUrl || ""));
  return uit;
}

// Ning zet geen gewone paginalinks in de HTML (de knop is AJAX). We halen de
// vervolgpagina's daarom gewoon op tot het aantal klopt met _numComments of tot
// een pagina niets nieuws meer oplevert.

function absolute(href) {
  if (/^https?:\/\//i.test(href)) return href.replace(/^http:/i, "https:");
  return "https://www.nederlanders.fr" + (href.startsWith("/") ? "" : "/") + href;
}

// De berichttekst zelf staat op dezelfde pagina die we hierboven toch al
// ophalen — alleen buiten de reactie-<dl>'s. Zonder die tekst is een draad geen
// discussie maar een rij losse antwoorden: de app had alleen de samenvatting
// van 260 tekens uit de feed.
//
// LET OP: dit is HTML-schrapen op een pagina die per Ning-thema kan verschillen.
// Vindt geen enkel patroon iets, dan is `bericht` null en toont de afnemer de
// samenvatting met een verwijzing naar de site — nooit een half bericht.
export function berichtUit(html) {
  // De reactiedraad eerst wegknippen, anders vist de eerste greep een reactie op.
  const romp = String(html || "").split(/<dl\b[^>]*_id=["'][^"']*:Comment:/i)[0];

  const kandidaten = [
    // 1) de gebruikelijke Ning-container voor de berichtinhoud
    /<div[^>]+class=["'][^"']*postbody[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<dl|<ul|$)/i,
    // 2) dezelfde klasse die ook een reactie omhult, maar dan in de romp
    /<div[^>]+class=["'][^"']*xg_user_generated[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<dl|<ul|$)/i,
  ];
  for (const re of kandidaten) {
    const m = romp.match(re);
    if (!m) continue;
    const regels = alineas(m[1]);
    // Eén korte regel is vrijwel zeker een bijschrift, geen bericht.
    if (regels.length && regels.join(" ").length > 80) return { regels };
  }
  return null;
}

function slugUit(html) {
  const m = html.match(/href=["']([^"']*\/profiles\/blogs\/[^"'?#]+)/i);
  return m ? absolute(ontsnap(m[1])) : "";
}

export async function haalDraad(postId, opties) {
  const debug = !!(opties && opties.debug);
  const postUrl = BASIS + GROEP + ":BlogPost:" + encodeURIComponent(postId);

  let html = "";
  try {
    html = await haalPagina(postUrl);
  } catch (e) {
    return { reacties: [], status: "fout: " + (e && e.message), bron: postUrl };
  }

  const verwacht = parseInt((html.match(/_numComments=["'](\d+)["']/i) || [])[1] || "0", 10);
  const slug = slugUit(html);

  const gevonden = new Map();
  const lees = (h) => {
    for (const r of leesReacties(h, postUrl)) {
      if (!gevonden.has(r.id)) gevonden.set(r.id, r);
    }
  };
  lees(html);

  const opgehaald = [];
  if (slug && verwacht && gevonden.size < verwacht) {
    for (let n = 2; n <= MAX_PAGINAS; n++) {
      const voor = gevonden.size;
      try {
        lees(await haalPagina(slug + "?page=" + n));
      } catch (e) {
        break;
      }
      opgehaald.push(n);
      if (gevonden.size === voor) break;        // niets nieuws meer
      if (gevonden.size >= verwacht) break;     // compleet
    }
  }

  const reacties = [...gevonden.values()].filter((r) => r.tekst && r.tekst.length > 1);

  const uit = {
    // null als de tekst niet te vinden was; de afnemer valt dan terug op de
    // samenvatting uit de feed in plaats van een half bericht te tonen.
    bericht: berichtUit(html),
    reacties,
    aantal: reacties.length,
    verwacht: verwacht || reacties.length,
    volledig: !verwacht || reacties.length >= verwacht,
    status: "ok",
    bron: postUrl,
  };
  if (debug) {
    uit.debug = { lengte: html.length, slug, opgehaald, verwacht };
  }
  return uit;
}
