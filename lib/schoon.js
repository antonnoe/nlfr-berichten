// lib/schoon.js — HTML van Ning terugbrengen tot de tekst die een mens schreef.
//
// WAAROM DIT BESTAAT
// In de app verscheen bij een reactie NING-interfacetekst als onderdeel van de
// reactie zelf, bijvoorbeeld op "Tapijt van Bayeux nu in Londen tentoongesteld":
//
//   Reactie van loes Heil Nu net
//   Reactie wissenWanneer men ooit Vikingschepen wilt zien…
//
// De oorzaak zit in de opgeslagen reactie: de schrijfster heeft een gerenderd
// Ning-reactieblok gekopieerd en in haar eigen reactie geplakt, inclusief de
// kopregel <dt>Reactie van … Nu net</dt> en de beheerknop
// <a class="icon delete delete_link" title="Reactie wissen">. Die HTML staat dus
// gewoon in de reactietekst, ook als je de pagina anoniem ophaalt — wat deze
// scraper doet (zie lib/ning.js: geen cookies, geen sessie).
//
// De oude extractie pakte in het <dd> alles van de eerste xg_user_generated tot
// het LAATSTE </div> en strooide daar de tags uit. Zo kwamen de kopregel en de
// knop in de tekst terecht, met "Reactie wissen" tegen het eerste woord geplakt
// omdat </a> geen regeleinde oplevert.
//
// AANPAK — twee lagen, allebei generiek:
//   1. Knip de interface-elementen als NODE weg: geneste kopregels (<dt>), knop-
//      en actielinks (herkend aan class/title), <button>'s. Daarmee verdwijnt
//      ook het aan elkaar plakken, want het element gaat in zijn geheel weg.
//   2. Vangnet op regelniveau: wat er ondanks laag 1 nog als kale interfacetekst
//      overblijft (andere Ning-skin, andere taal, platgeslagen kopie) valt af
//      tegen een denylist.
// Zo werkt het ook voor knoppen die we hier nog niet gezien hebben, en niet
// alleen voor deze ene reactie.

// --- entities --------------------------------------------------------------

export function ontsnap(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

// --- laag 1: interface-elementen als node weghalen --------------------------

// Ning hangt zijn acties aan herkenbare klassen: "icon delete delete_link",
// "edit_link", "reply_link", "flag_link". \b aan beide kanten, zodat "editorial"
// of "deleted-user" niet meeliften.
const ACTIE_KLASSE =
  /\bclass=["'][^"']*\b(?:delete|delete_link|delete-link|edit|edit_link|edit-link|reply|reply_link|reply-link|flag|flag_link|report|report_link|moderate|approve|spam|permalink|quote)\b[^"']*["']/i;

// De labels zelf. Nederlands zoals de site hem toont, plus de Engelse varianten
// die Ning teruggeeft zodra de skin of de gebruikerstaal anders staat.
//
// Twee lijsten, want de twee lagen mogen niet even streng zijn. Binnen een <a>
// met een actie-class of een title is "Bewerken" onmiskenbaar een knop. Als
// kale regel is een enkel woord dat niet ook echt een Ning-knoplabel is
// ("Antwoord", "Wissen") best een korte reactie van een lezer — die halen we
// dus niet weg.
const ELEMENT_LABELS = [
  "wissen", "verwijder", "verwijderen", "bewerk", "bewerken",
  "antwoord", "antwoorden", "beantwoorden", "reageer", "reageren",
  "melden", "rapporteren", "citeren", "permalink",
  "delete", "remove", "edit", "reply", "report", "flag", "quote", "moderate",
];

// De knoplabels zoals Ning ze voluit toont; als hele regel is dit nooit iets
// dat een lezer zelf typte.
const REGEL_LABELS = [
  "reactie wissen", "reactie verwijderen", "reactie bewerken", "reactie melden",
  "reactie rapporteren", "bericht wissen", "bericht verwijderen",
  "bewerken", "beantwoorden", "verwijderen", "melden", "reageren",
  "rapporteren", "citeren", "permalink",
  "delete comment", "delete post", "edit comment", "reply to this",
  "flag as inappropriate", "report an issue",
  "delete", "edit", "reply", "report", "flag", "quote", "moderate",
];

const LABELS = new Set([...ELEMENT_LABELS, ...REGEL_LABELS]);
const REGELS = new Set(REGEL_LABELS);

function alsLabel(s) {
  return String(s || "")
    .replace(/[\s ]+/g, " ")
    .replace(/^[\s·|•—–\-*]+|[\s·|•—–\-*:]+$/g, "")
    .trim()
    .toLowerCase();
}

function kaal(html) {
  return ontsnap(String(html || "").replace(/<[^>]*>/g, " "));
}

// Is dit een knop/actie van de interface en niet iets dat iemand schreef?
function isActieLink(attrs, binnen) {
  if (ACTIE_KLASSE.test(attrs)) return true;
  const titel = (attrs.match(/\btitle=["']([^"']*)["']/i) || [])[1];
  if (titel && LABELS.has(alsLabel(ontsnap(titel)))) return true;
  return LABELS.has(alsLabel(kaal(binnen)));
}

// Eén regel tekst die niets anders is dan een knoplabel.
export function isInterfaceRegel(regel) {
  return REGELS.has(alsLabel(regel));
}

// De kopregel die Ning boven elke reactie zet: "Reactie van <naam> <tijd>".
// Auteur en tijd leveren we als aparte velden, dus in de tekst hoort hij niet.
// De lengtegrens houdt een echte zin die toevallig zo begint ("Reactie van Jan
// hierboven klopt niet, want …") buiten schot.
const KOPREGEL = /^(?:reactie van|reactie door|comment by|commented by|in reply to)\b/i;

export function isKopregel(regel) {
  const r = String(regel || "").trim();
  return r.length < 120 && KOPREGEL.test(r);
}

// Haalt de interface-nodes uit een stuk HTML. Elk verwijderd element laat een
// regeleinde achter, zodat een knop die tegen de tekst aan geplakt zat ("Reactie
// wissenWanneer men…") niet stilzwijgend aan het eerste woord blijft kleven maar
// een eigen regel wordt — die laag 2 dan alsnog herkent.
export function stripInterface(html, opties) {
  const koppenOok = !!(opties && opties.koppenOok);
  let t = String(html || "");

  t = t.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  // Geneste reactiekoppen. Alleen bij reactieteksten: in een bericht kan <dt>
  // een gewone definitielijst zijn.
  if (koppenOok) t = t.replace(/<dt\b[^>]*>[\s\S]*?<\/dt>/gi, "\n");

  // Formulieren en knoppen zijn nooit inhoud.
  t = t.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, "\n");
  t = t.replace(/<(form|select|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, "\n");
  t = t.replace(/<input\b[^>]*>/gi, "\n");

  // Actielinks. <a> nest niet, dus een niet-gulzige greep is hier veilig.
  t = t.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (heel, attrs, binnen) =>
    isActieLink(attrs, binnen) ? "\n" : heel
  );

  return t;
}

// --- de tekstnode aanwijzen -------------------------------------------------

// Ning zet de tekst die iemand schreef in <div class="xg_user_generated">. Alles
// wat daar in het <dd> naast staat is interface: de wis-/bewerk-/beantwoord-
// links die Ning achter de tekst rendert.
//
// De oude code greep van de eerste xg_user_generated tot het LAATSTE </div> in
// het blok en had die buren er dus altijd bij. Hier tellen we de <div>'s mee, en
// stoppen we bij het </div> dat er echt bij hoort. Sluit de HTML niet netjes af
// — wat gebeurt zodra iemand losse HTML in zijn reactie plakt — dan nemen we de
// rest van het blok; laag 1 en 2 ruimen de interface daarbinnen alsnog op.
const OPEN_DIV = /<div\b[^>]*>|<\/div\s*>/gi;

export function binnenDiv(html, klasse) {
  const bron = String(html || "");
  const start = bron.search(
    new RegExp('<div[^>]+class=["\'][^"\']*' + klasse + '[^"\']*["\'][^>]*>', "i")
  );
  if (start < 0) return null;
  const open = bron.slice(start).match(/^<div[^>]*>/i);
  if (!open) return null;

  const vanaf = start + open[0].length;
  let diep = 1;
  OPEN_DIV.lastIndex = vanaf;
  let m;
  while ((m = OPEN_DIV.exec(bron))) {
    diep += m[0][1] === "/" ? -1 : 1;
    if (diep === 0) return bron.slice(vanaf, m.index);
  }
  return bron.slice(vanaf);
}

// --- HTML naar regels ------------------------------------------------------

// Alinea's blijven als losse regels behouden, zodat de UI ze kan tonen.
export function alineas(html, opties) {
  const ruw = stripInterface(html, opties)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|dd|dt|dl|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return ontsnap(ruw)
    .split("\n")
    .map((r) => r.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

export function plat(html) {
  return alineas(html).join(" ").trim();
}

// --- laag 2: vangnet op regelniveau ----------------------------------------

// `weg` (auteur, tijdTekst) vallen af als ze als losse regel in de tekst staan:
// die leveren we al als eigen velden.
export function schoonRegels(regels, weg) {
  const extra = new Set(
    (Array.isArray(weg) ? weg : [weg])
      .flatMap((w) => (w && typeof w === "object" ? [w.auteur, w.tijdTekst] : [w]))
      .map(alsLabel)
      .filter((s) => s && s.length < 60)
  );
  // Auteur + tijd achter elkaar op één regel ("loes Heil Nu net") komt ook voor.
  const auteurTijd = [...extra];
  for (const a of auteurTijd) for (const b of auteurTijd) if (a !== b) extra.add(a + " " + b);

  return regels.filter((r) => {
    if (isInterfaceRegel(r)) return false;
    if (isKopregel(r)) return false;
    return !extra.has(alsLabel(r));
  });
}

// De hele keten voor één reactielichaam: node's weg, dan het vangnet.
export function reactieRegels(html, weg) {
  return schoonRegels(alineas(html, { koppenOok: true }), weg);
}
