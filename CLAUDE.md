# CLAUDE.md
Repo: nlfr-berichten

## Wat dit is
Eén Vercel-deployment met serverless routes die de twee publieke RSS-feeds van Nederlanders.fr (Ning) samenvoegt tot berichten met hun volledige reactiedraad. Bedoeld voor de mobiele weergave, omdat de mobiele skin van NING 2.0 reacties weglaat.

## Live adres
Niet in de repo vastgelegd. (Alleen de plaatshouder `https://<deployment>/api/berichten` staat in README.md.)

## Opbouw
- `api/berichten.js`: GET /api/berichten, berichten gesorteerd op laatste reactie, met `wezen` en `bronStatus`.
- `api/reacties.js`: /api/reacties, alle reactiepagina's van één bericht.
- `api/tellingen.js`: /api/tellingen, reactieaantallen per bericht, alleen voor diagnose.
- `lib/ning.js`: feeds ophalen, parseren en reacties koppelen (link, Ning-id, titel, wees).
- `lib/draad.js`: volledige reactiedraad van een berichtpagina.
- `lib/schoon.js`: Ning-HTML opschonen (veilige subset, figuren met onderschrift).
- `lib/tellingen.js`: reactieaantallen uit de blog-overzichtspagina.
- `lib/cors.js`: gedeelde CORS-allowlist (nederlanders.fr, cafeclaude.fr, infofrankrijk.com, nedergids.nl, infopoche.fr, plus subdomeinen daarvan en subdomeinen van vercel.app en claudeusercontent.com).
- `test/`: tests met `node --test`.
- `index.html`: eenvoudige API-pagina.

## Techniek
Node 20 of hoger, ES-modules, geen build. Afhankelijkheden: `entities` en `undici`. Script: `npm test`. `vercel.json`: cleanUrls aan, maxDuration 20 seconden voor `api/*.js`. Geen cron, geen KV.

## Externe diensten en namen van omgevingsvariabelen
- Ning (nederlanders.fr): blogfeed `profiles/blog/feed?xn_auth=no` en activiteitenfeed `activity/log/list?fmt=rss`, anoniem opgehaald.
- Vercel (hosting en CDN-cache).
- Omgevingsvariabelen: geen, de code leest geen `process.env`.

## Hoe het live gaat
Repo importeren in Vercel en deployen, zonder build-instellingen en zonder omgevingsvariabelen (README.md). CDN-cache: 2 minuten vers, 10 minuten stale-while-revalidate; timeout per feed 9 seconden.

## Regels en besluiten
Uit README.md:
- Bewust een aparte repo en deployment, los van `nlfr-menu`: een storing in deze feed mag het menu niet meeslepen.
- CORS: alleen eigen domeinen, bewust geen `*`, anders is dit een gratis RSS-proxy voor iedereen.
- Er verdwijnt nooit een reactie: wat niet te koppelen is gaat naar `wezen`.
- Nieuw sinds het laatste bezoek doet de client (localStorage), geen serverstate.
- Bij een wijziging in de activiteitenzinnen van Ning moeten `REACTIE_PATRONEN` en `haalBerichtTitel` in `lib/ning.js` worden bijgewerkt.

## Laatst nagelopen
Laatst nagelopen: 5 november 2026
