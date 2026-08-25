// Gedeelde CORS-allowlist voor de routes van deze repo.
//
// Stond eerder als een identiek blok in elke route. Toen bleek dat subdomeinen
// ontbraken moest dezelfde correctie op meerdere plaatsen gebeuren — precies de
// reden om het één keer te hebben.
//
// Waarom subdomeinen meetellen: IF-Mobiel wordt als iframe ingebed op
// mobiel.nederlanders.fr. Bij een fetch uit een iframe is de Origin die van de
// iframe zelf, niet die van de omliggende pagina. Een lijst met alleen de kale
// en de www-vorm laat zo'n verzoek vallen, waarna de app op demo-data terugvalt.
//
// Geen "*": dit zijn eigen routes. De allowlist is het verschil tussen "open
// voor ons" en "open voor iedereen".

const EIGEN_DOMEINEN = [
  "nederlanders.fr",
  "cafeclaude.fr",
  "infofrankrijk.com",
  "nedergids.nl",
];

// Eigen deploys en previews: alléén als subdomein, nooit het kale
// platformdomein — dat zou iedere Vercel-gebruiker toegang geven.
const EIGEN_DEPLOYS = ["vercel.app", "claudeusercontent.com"];

export function origineToegestaan(origin) {
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  // De punt in "." + d is wat telt: zonder die punt zou kwaadnederlanders.fr
  // en nederlanders.fr.evil.com meeglippen op een simpele endsWith.
  return (
    EIGEN_DOMEINEN.some((d) => h === d || h.endsWith("." + d)) ||
    EIGEN_DEPLOYS.some((d) => h.endsWith("." + d))
  );
}

export function cors(req, res) {
  const o = req.headers.origin;
  if (o && origineToegestaan(o)) {
    res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}
