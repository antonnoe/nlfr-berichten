// lib/ning.js — Ning-feeds ophalen, parseren en reacties aan berichten koppelen.
// Geen dependencies: de feeds zijn eenvoudige RSS 2.0 met CDATA.

const BLOG_FEED = "https://www.nederlanders.fr/profiles/blog/feed?xn_auth=no";
const ACTIVITEIT_FEED = "https://www.nederlanders.fr/activity/log/list?fmt=rss";

const HAAL_TIMEOUT_MS = 9000;
const GELIJKENIS_DREMPEL = 0.86;

// --- ophalen ---------------------------------------------------------------

// Ning stuurt zijn intermediate certificaat niet mee, waardoor Node de keten
// niet kan sluiten (UNABLE_TO_GET_ISSUER_CERT_LOCALLY) terwijl browsers dat wel
// oplossen. We proberen dus eerst strikt en vallen alleen bij die ene fout terug
// op een soepele dispatcher — uitsluitend voor deze twee publieke feeds.
let soepel = null;
async function soepeleDispatcher() {
  if (soepel !== null) return soepel;
  try {
    const { Agent } = await import("undici");
    soepel = new Agent({ connect: { rejectUnauthorized: false } });
  } catch {
    soepel = false;
  }
  return soepel;
}

const CERT_FOUTEN = [
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
];

function isCertFout(e) {
  const c = (e && e.cause) || {};
  return CERT_FOUTEN.includes(c.code);
}

const KOP = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  "accept-language": "nl,en;q=0.8",
};

async function eenPoging(url, dispatcher) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HAAL_TIMEOUT_MS);
  try {
    const opties = { signal: ctrl.signal, headers: KOP, redirect: "follow" };
    if (dispatcher) opties.dispatcher = dispatcher;
    const r = await fetch(url, opties);
    if (!r.ok) throw new Error("status " + r.status);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function haalTekst(url) {
  try {
    return await eenPoging(url, null);
  } catch (e) {
    if (!isCertFout(e)) throw e;
    const d = await soepeleDispatcher();
    if (!d) throw e;
    return await eenPoging(url, d);
  }
}

// --- parsen ----------------------------------------------------------------

function ontdoe(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

function veld(blok, naam) {
  const m = blok.match(new RegExp("<" + naam + "[^>]*>([\\s\\S]*?)</" + naam + ">", "i"));
  return m ? ontdoe(m[1]) : "";
}

function items(xml) {
  const uit = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) uit.push(m[1]);
  return uit;
}

function naarIso(s) {
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

// --- normaliseren ----------------------------------------------------------

// Basis-URL zonder protocol, www, query en fragment. Dit is de koppelsleutel.
function sleutel(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    return (u.host.replace(/^www\./i, "") + u.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return String(url).split("?")[0].split("#")[0].replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
  }
}

function param(url, naam) {
  try {
    return new URL(url).searchParams.get(naam);
  } catch {
    return null;
  }
}

// Ning-ids: "2030893:BlogPost:123456" / "2030893:Comment:123456"
function blogPostId(url) {
  const m = decodeURIComponent(String(url || "")).match(/(\d+):BlogPost:(\d+)/i);
  return m ? m[2] : null;
}

function normTitel(s) {
  return ontdoe(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Dice-coëfficiënt op bigrams — genoeg voor titelvarianten met afkapping.
function gelijkenis(a, b) {
  a = normTitel(a);
  b = normTitel(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4) return a === b ? 1 : 0;
  const bi = (s) => {
    const set = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      set.set(g, (set.get(g) || 0) + 1);
    }
    return set;
  };
  const A = bi(a), B = bi(b);
  let raak = 0, totA = 0, totB = 0;
  for (const [, n] of A) totA += n;
  for (const [g, n] of B) {
    totB += n;
    if (A.has(g)) raak += Math.min(n, A.get(g));
  }
  return (2 * raak) / (totA + totB);
}

// --- activiteitsitems duiden ----------------------------------------------

const REACTIE_PATRONEN = [
  /reageerde op/i,
  /heeft gereageerd/i,
  /gereageerd op/i,
  /commented on/i,
  /left a comment/i,
  /reactie op/i,
];

function isReactie(titel) {
  return REACTIE_PATRONEN.some((p) => p.test(titel));
}

// De berichttitel staat meestal tussen aanhalingstekens, anders na "op".
function haalBerichtTitel(zin) {
  const q = zin.match(/["'\u2018\u2019\u201c\u201d]([^"'\u2018\u2019\u201c\u201d]{4,})["'\u2018\u2019\u201c\u201d]/);
  if (q) return q[1].trim();
  const na = zin.match(/(?:blogbericht|blog post|bericht|discussie|blog)\s+(?:van\s+\S+\s+)?(.{6,})$/i);
  if (na) return na[1].replace(/\s+van\s+\S+\s*$/i, "").trim();
  const opna = zin.match(/\bop\b\s+(.{6,})$/i);
  return opna ? opna[1].trim() : "";
}

function haalAuteur(zin) {
  const m = zin.match(/^(.{2,60}?)\s+(?:heeft\s+)?(?:reageerde|gereageerd|commented|left)/i);
  return m ? m[1].trim() : "";
}

// --- publieke functies -----------------------------------------------------

// Volledige oorzaak van een mislukte fetch; "fetch failed" alleen zegt niets.
function reden(e) {
  if (!e) return "onbekend";
  const c = e.cause || {};
  return [e.name, e.message, c.code, c.errno, c.message, c.reason]
    .filter(Boolean)
    .join(" | ");
}

export async function haalBerichten() {
  const [blogXml, actXml] = await Promise.allSettled([
    haalTekst(BLOG_FEED),
    haalTekst(ACTIVITEIT_FEED),
  ]);

  const bronStatus = {
    berichten: blogXml.status === "fulfilled" ? "ok" : "fout: " + reden(blogXml.reason),
    activiteit: actXml.status === "fulfilled" ? "ok" : "fout: " + reden(actXml.reason),
  };

  const berichten = blogXml.status === "fulfilled" ? parseBlog(blogXml.value) : [];
  const acts = actXml.status === "fulfilled" ? parseActiviteit(actXml.value) : [];

  const { gekoppeld, wezen } = koppel(berichten, acts);
  return { berichten: gekoppeld, wezen, bronStatus };
}

function parseBlog(xml) {
  return items(xml)
    .map((b) => {
      const link = veld(b, "link") || veld(b, "guid");
      const titel = veld(b, "title");
      if (!link || !titel) return null;
      const beschrijving = veld(b, "description");
      return {
        id: blogPostId(link) || sleutel(link),
        titel,
        href: link,
        sleutel: sleutel(link),
        auteur: veld(b, "dc:creator") || veld(b, "author") || "",
        datum: naarIso(veld(b, "pubDate")) || null,
        samenvatting: beschrijving.length > 240 ? beschrijving.slice(0, 237).trimEnd() + "…" : beschrijving,
        reacties: [],
      };
    })
    .filter(Boolean);
}

function parseActiviteit(xml) {
  return items(xml)
    .map((b) => {
      const zin = veld(b, "title");
      if (!zin || !isReactie(zin)) return null;
      const link = veld(b, "link") || veld(b, "guid");
      const tekst = veld(b, "description");
      return {
        zin,
        href: link,
        sleutel: sleutel(link),
        commentId: param(link, "commentId"),
        blogPostId: blogPostId(link),
        auteur: haalAuteur(zin) || veld(b, "dc:creator") || "",
        berichtTitel: haalBerichtTitel(zin),
        datum: naarIso(veld(b, "pubDate")) || null,
        tekst: tekst.length > 280 ? tekst.slice(0, 277).trimEnd() + "…" : tekst,
      };
    })
    .filter(Boolean);
}

function koppel(berichten, acts) {
  const opSleutel = new Map();
  const opId = new Map();
  for (const p of berichten) {
    opSleutel.set(p.sleutel, p);
    if (p.id) opId.set(String(p.id), p);
  }

  const wezen = [];
  const gezien = new Set();

  for (const a of acts) {
    // dedupe op commentId (activiteit kan dubbel voorkomen)
    const uniek = a.commentId || a.href + "|" + a.datum;
    if (gezien.has(uniek)) continue;
    gezien.add(uniek);

    let doel = opSleutel.get(a.sleutel) || null;            // 1. link
    if (!doel && a.blogPostId) doel = opId.get(a.blogPostId) || null; // 2. id

    if (!doel && a.berichtTitel) {                           // 3. titel
      const n = normTitel(a.berichtTitel);
      doel = berichten.find((p) => normTitel(p.titel) === n) || null;
      if (!doel) {
        let beste = null, score = 0;
        for (const p of berichten) {
          const s = gelijkenis(a.berichtTitel, p.titel);
          if (s > score) { score = s; beste = p; }
        }
        if (beste && score >= GELIJKENIS_DREMPEL) doel = beste;
      }
    }

    const reactie = { auteur: a.auteur, datum: a.datum, tekst: a.tekst, href: a.href };

    if (doel) {
      doel.reacties.push(reactie);                           // 4. of wees
    } else {
      wezen.push({ ...reactie, label: a.berichtTitel || a.zin });
    }
  }

  for (const p of berichten) {
    p.reacties.sort((x, y) => new Date(x.datum || 0) - new Date(y.datum || 0));
    p.laatsteReactie = p.reacties.length ? p.reacties[p.reacties.length - 1].datum : null;
    delete p.sleutel;
  }

  // levendigste draden bovenaan: laatste reactie, anders publicatiedatum
  berichten.sort(
    (a, b) =>
      new Date(b.laatsteReactie || b.datum || 0) - new Date(a.laatsteReactie || a.datum || 0)
  );

  wezen.sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));
  return { gekoppeld: berichten, wezen: wezen.slice(0, 25) };
}
