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

import { haalPaginaMet } from "./ning.js";
// De tekstextractie zelf staat in lib/schoon.js: die haalt de NING-knoppen en
// kopregels eruit die anders als reactietekst in de app belanden.
import { ontsnap, ontsnapAttr, alineas, plat, binnenDiv, reactieRegels, schoonHtml, veiligeUrl } from "./schoon.js";

const BASIS = "https://www.nederlanders.fr/xn/detail/";
const GROEP = "3295325";
// NING toont 10 reacties per pagina. 30 pagina's = 300 reacties; daarboven kappen
// we af (volledig:false), liever dan een functie die de maxDuration van Vercel raakt.
const PER_PAGINA = 10;
const MAX_PAGINAS = 30;
const PARALLEL = 5;               // gelijktijdige paginaverzoeken naar NING
const PAGINA_TIMEOUT_MS = 6000;   // per pagina; trage pagina = gedeeltelijk resultaat
const TOTAAL_BUDGET_MS = 14000;   // ruim onder maxDuration (20 s) in vercel.json

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
  if (!auteur) auteur = ontsnapAttr((dt.match(/<a[^>]+class=["'][^"']*fn url[^"']*["'][^>]*title=["']([^"']+)["']/i) || [])[1] || "");
  if (!auteur) auteur = plat((dt.match(/<a[^>]+href=["'][^"']*\/profile\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");

  const profiel = ontsnapAttr((dt.match(/href=["']([^"']*\/profile\/[^"']+)["']/i) || [])[1] || "");
  const avatar = ontsnapAttr((dt.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "");

  // Ning toont een relatieve tijd als losse tekst achter de auteurslink.
  const naAuteur = dt.split(/<\/a>/i).pop() || "";
  const tijdTekst = plat(naAuteur).replace(/^[\s·|-]+/, "").trim();

  const tijd = tijdTekst && tijdTekst.length < 60 ? tijdTekst : "";

  // Auteur en tijd gaan als eigen velden mee; ze horen niet óók in de tekst.
  const regels = reactieRegels(body, { auteur, tijdTekst: tijd });
  const rijk = schoonHtml(body, { koppenOok: true });
  return {
    id,
    auteur: auteur || "Onbekend",
    profiel: profiel ? profiel.replace(/^http:/i, "https:") : "",
    avatar: avatar ? avatar.replace(/^http:/i, "https:") : "",
    tijdTekst: tijd,
    tekst: regels.join("\n\n"),
    html: rijk.html,
    afbeeldingen: rijk.afbeeldingen,
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

  // 1) de gebruikelijke Ning-container voor de berichtinhoud, met de <div>'s
  //    meegeteld (een bericht met geplakte <div>'s knipte de oude regex te vroeg af)
  // 2) dezelfde klasse die ook een reactie omhult, maar dan in de romp
  const kandidaten = [
    binnenDiv(romp, "postbody"),
    (romp.match(/<div[^>]+class=["'][^"']*xg_user_generated[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<div|<dl|<ul|$)/i) || [])[1],
  ];
  for (const k of kandidaten) {
    if (!k) continue;
    const regels = alineas(k);
    const rijk = schoonHtml(k);
    // Eén korte regel is vrijwel zeker een bijschrift, geen bericht. Een bericht
    // met foto('s) telt wel, ook als de begeleidende tekst kort is.
    if ((regels.length && regels.join(" ").length > 80) || (rijk.afbeeldingen.length && regels.length)) {
      return { regels, html: rijk.html, afbeeldingen: rijk.afbeeldingen };
    }
    if (rijk.afbeeldingen.length) return { regels, html: rijk.html, afbeeldingen: rijk.afbeeldingen };
  }
  return null;
}

// De basis-URL van de berichtpagina zelf, zoals NING hem na de redirect toont:
// https://www.nederlanders.fr/profiles/blogs/<slug>. Dit moet DE slug van DIT
// bericht zijn. Vroeger pakte deze functie de eerste /profiles/blogs/-link op de
// pagina, en dat is een zijbalklink naar een ander bericht: pagina 2 was dan de
// reactiepagina van een ander bericht, leverde niets nieuws op, en de lus brak af
// na 10 van de 28 reacties.
export function slugUit(html, postId, eindUrl) {
  const id = encodeURIComponent(GROEP + ":BlogPost:" + postId);
  const bron = String(html || "");
  // 1) een paginaknop van dit bericht: .../profiles/blogs/<slug>?id=<dit id>&page=2
  const re = /href=["']([^"']*\/profiles\/blogs\/[^"'?#]+)\?([^"']*)["']/gi;
  let m;
  while ((m = re.exec(bron))) {
    const q = ontsnapAttr(m[2]);
    if (q.includes(id) || decodeURIComponent(q.replace(/%(?![0-9a-f]{2})/gi, "%25")).includes(GROEP + ":BlogPost:" + postId)) {
      return absolute(ontsnapAttr(m[1]));
    }
  }
  // 2) de URL waar de redirect op uitkwam
  try {
    const u = new URL(eindUrl || "");
    if (/^\/profiles\/blogs\/[^/]+\/?$/i.test(u.pathname)) return u.origin.replace(/^http:/i, "https:") + u.pathname.replace(/\/$/, "");
  } catch { /* geen geldige URL */ }
  // 3) canonical
  const c = bron.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*\/profiles\/blogs\/[^"'?#]+)/i);
  return c ? absolute(ontsnapAttr(c[1])) : "";
}

export function paginaUrl(slug, postId, n) {
  return slug + "?id=" + encodeURIComponent(GROEP + ":BlogPost:" + postId) + "&page=" + n;
}

// Het hoogste paginanummer uit de paginering van de pagina zelf.
function laatstePagina(html) {
  let max = 1;
  for (const m of String(html || "").matchAll(/[?&;]page=(\d{1,3})\b/gi)) max = Math.max(max, +m[1]);
  return max;
}

// Haalt pagina 2..n parallel op (hoogstens PARALLEL tegelijk), elk met een eigen
// time-out en één herkansing, binnen een totaalbudget. Een pagina die niet lukt
// stopt de rest niet: wat binnen is blijft bruikbaar en `ontbreekt` zegt welke.
async function haalPaginas(nummers, maakUrl, haal, deadline) {
  const binnen = new Map();
  const ontbreekt = [];
  let volgende = 0;
  async function werker() {
    while (volgende < nummers.length) {
      const n = nummers[volgende++];
      let gelukt = false;
      for (let poging = 0; poging < 2 && !gelukt; poging++) {
        const rest = deadline - Date.now();
        if (rest < 1500) break;
        try {
          const r = await haal(maakUrl(n), Math.min(PAGINA_TIMEOUT_MS, rest));
          binnen.set(n, r.tekst);
          gelukt = true;
        } catch { /* herkansing of ontbreekt */ }
      }
      if (!gelukt) ontbreekt.push(n);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, nummers.length) }, werker));
  return { binnen, ontbreekt: ontbreekt.sort((a, b) => a - b) };
}

export async function haalDraad(postId, opties) {
  const debug = !!(opties && opties.debug);
  const haal = (opties && opties.haal) || haalPaginaMet;
  const deadline = Date.now() + ((opties && opties.budgetMs) || TOTAAL_BUDGET_MS);
  const postUrl = BASIS + GROEP + ":BlogPost:" + encodeURIComponent(postId);

  let html = "", eindUrl = "";
  try {
    const r = await haal(postUrl, PAGINA_TIMEOUT_MS);
    html = r.tekst;
    eindUrl = r.url;
  } catch (e) {
    return { reacties: [], status: "fout: " + (e && e.message), bron: postUrl };
  }

  const verwacht = parseInt((html.match(/_numComments=["'](\d+)["']/i) || [])[1] || "0", 10);
  const slug = slugUit(html, postId, eindUrl);

  const perPagina = new Map([[1, html]]);
  let ontbreekt = [];
  const aantalPaginas = Math.min(
    MAX_PAGINAS,
    Math.max(laatstePagina(html), Math.ceil(verwacht / PER_PAGINA), 1)
  );
  if (slug && aantalPaginas > 1 && leesReacties(html, postUrl).length < verwacht) {
    const nummers = [];
    for (let n = 2; n <= aantalPaginas; n++) nummers.push(n);
    const r = await haalPaginas(nummers, (n) => paginaUrl(slug, postId, n), haal, deadline);
    for (const [n, t] of r.binnen) perPagina.set(n, t);
    ontbreekt = r.ontbreekt;
  }

  // In paginavolgorde, ontdubbeld op reactie-id.
  const gevonden = new Map();
  for (const n of [...perPagina.keys()].sort((a, b) => a - b)) {
    for (const r of leesReacties(perPagina.get(n), postUrl)) {
      if (!gevonden.has(r.id)) gevonden.set(r.id, r);
    }
  }

  const reacties = [...gevonden.values()].filter((r) => (r.tekst && r.tekst.length > 1) || r.afbeeldingen.length);

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
    uit.debug = { lengte: html.length, slug, paginas: [...perPagina.keys()], ontbreekt, verwacht };
  }
  return uit;
}
