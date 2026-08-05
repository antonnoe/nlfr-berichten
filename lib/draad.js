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

const BASIS = "https://www.nederlanders.fr/xn/detail/";
const GROEP = "3295325";
const MAX_PAGINAS = 12;

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

// Alinea's blijven als losse regels behouden, zodat de UI ze kan tonen.
function alineas(html) {
  const ruw = String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return ontsnap(ruw)
    .split("\n")
    .map((r) => r.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

function plat(html) {
  return alineas(html).join(" ").trim();
}

const DL = /<dl\b[^>]*_id=["'][^"']*:Comment:(\d+)["'][^>]*>([\s\S]*?)<\/dl>/gi;

function leesBlok(id, binnen, postUrl) {
  const dt = (binnen.match(/<dt\b[^>]*>([\s\S]*?)<\/dt>/i) || [])[1] || "";
  const dd = (binnen.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i) || [])[1] || "";

  const body =
    (dd.match(/<div[^>]+class=["'][^"']*xg_user_generated[^"']*["'][^>]*>([\s\S]*)<\/div>/i) || [])[1] || dd;

  // Auteur: "Reactie van <a>NAAM</a>", anders het title-attribuut van de avatar.
  let auteur = plat((dt.match(/Reactie van\s*<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");
  if (!auteur) auteur = ontsnap((dt.match(/<a[^>]+class=["'][^"']*fn url[^"']*["'][^>]*title=["']([^"']+)["']/i) || [])[1] || "");
  if (!auteur) auteur = plat((dt.match(/<a[^>]+href=["'][^"']*\/profile\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/i) || [])[1] || "");

  const profiel = ontsnap((dt.match(/href=["']([^"']*\/profile\/[^"']+)["']/i) || [])[1] || "");
  const avatar = ontsnap((dt.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || "");

  // Ning toont een relatieve tijd als losse tekst achter de auteurslink.
  const naAuteur = dt.split(/<\/a>/i).pop() || "";
  const tijdTekst = plat(naAuteur).replace(/^[\s·|-]+/, "").trim();

  const regels = alineas(body);
  return {
    id,
    auteur: auteur || "Onbekend",
    profiel: profiel ? profiel.replace(/^http:/i, "https:") : "",
    avatar: avatar ? avatar.replace(/^http:/i, "https:") : "",
    tijdTekst: tijdTekst && tijdTekst.length < 60 ? tijdTekst : "",
    tekst: regels.join("\n\n"),
    href: postUrl + "?commentId=" + GROEP + "%3AComment%3A" + id,
  };
}

// Ning zet geen gewone paginalinks in de HTML (de knop is AJAX). We halen de
// vervolgpagina's daarom gewoon op tot het aantal klopt met _numComments of tot
// een pagina niets nieuws meer oplevert.

function absolute(href) {
  if (/^https?:\/\//i.test(href)) return href.replace(/^http:/i, "https:");
  return "https://www.nederlanders.fr" + (href.startsWith("/") ? "" : "/") + href;
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
    DL.lastIndex = 0;
    let m;
    while ((m = DL.exec(h))) {
      if (!gevonden.has(m[1])) gevonden.set(m[1], leesBlok(m[1], m[2], postUrl));
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
