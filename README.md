# nlfr-berichten

Eén serverless route die de twee publieke RSS-feeds van Nederlanders.fr (Ning)
samenvoegt tot **berichten mét hun volledige reactiedraad**. Bedoeld voor de
mobiele weergave, omdat de mobiele skin van NING 2.0 reacties weglaat.

Bewust een aparte repo en deployment, los van \`nlfr-menu\`: dat menu staat via
iframe op elke pagina van de site, en een storing in deze feed mag het menu niet
meeslepen.

## Route

\`GET /api/berichten\`

\`\`\`json
{
  "bijgewerkt": "2026-08-05T05:40:00Z",
  "berichten": [
    {
      "id": "123456",
      "titel": "…",
      "href": "https://www.nederlanders.fr/profiles/blogs/…",
      "auteur": "…",
      "datum": "2026-08-05T06:12:00Z",
      "samenvatting": "…",
      "laatsteReactie": "2026-08-05T10:41:00Z",
      "reacties": [
        { "auteur": "…", "datum": "…", "tekst": "…", "href": "…?commentId=…" }
      ]
    }
  ],
  "wezen": [ { "auteur": "…", "datum": "…", "tekst": "…", "href": "…", "label": "…" } ],
  "bronStatus": { "berichten": "ok", "activiteit": "ok" }
}
\`\`\`

Berichten staan gesorteerd op de datum van hun **laatste reactie**, zodat
levendige draadjes bovenaan komen.

## Bronnen

| Wat | URL |
|---|---|
| Berichten | \`https://www.nederlanders.fr/profiles/blog/feed?xn_auth=no\` |
| Activiteit | \`https://www.nederlanders.fr/activity/log/list?fmt=rss\` |

## Hoe de koppeling werkt

De activiteitenfeed bevat de reacties, maar zegt niet in machineleesbare vorm
bij welk bericht ze horen. Per activiteitsitem probeert \`lib/ning.js\` in deze
volgorde — de eerste treffer wint:

1. **Link.** De reactielink wijst naar de berichtpagina zelf, met
   \`?commentId=…\` erachter. De genormaliseerde basis-URL (zonder protocol, www,
   query en fragment) is de sleutel en matcht 1-op-1 met de berichtenfeed.
   Dit dekt verreweg de meeste gevallen.
2. **Ning-id.** \`<groupId>:BlogPost:<n>\` uit de link.
3. **Titel.** De berichttitel uit de activiteitenzin (tussen aanhalingstekens),
   genormaliseerd vergeleken; bij geen exacte treffer een bigram-gelijkenis met
   drempel 0,86.
4. **Wees.** Geen treffer → het item gaat naar \`wezen\`, met de titel uit de
   activiteitenzin als label. Zo verdwijnt er nooit een reactie, ook niet als
   het bericht buiten de laatste 20 van de blogfeed valt.

Alleen activiteit die een reactie is wordt meegenomen (\`reageerde op\`,
\`heeft gereageerd\`, \`commented on\`, …). Dubbele items worden ontdubbeld op
\`commentId\`.

## Caching

CDN: 2 minuten vers, 10 minuten stale-while-revalidate. De feeds worden dus
hooguit een paar keer per minuut echt opgehaald, ongeacht het aantal bezoekers.
Timeout per feed 9 s; valt één feed weg, dan blijft de andere werken.

## CORS

Alleen de eigen domeinen mogen de route aanroepen (zie \`TOEGESTAAN\` in
\`api/berichten.js\`): nederlanders.fr, cafeclaude.fr, infofrankrijk.com,
nedergids.nl en \`*.vercel.app\`. Bewust geen \`*\`, anders is dit een gratis
RSS-proxy voor iedereen.

## Installatie

1. Repo importeren in Vercel → Deploy. Geen build-instellingen, geen env-vars,
   geen KV, geen cron.
2. Controleer \`https://<deployment>/api/berichten\` in de browser.
3. Extra domeinen kun je aan hetzelfde Vercel-project hangen zonder meerkosten.

## "Nieuw sinds uw laatste bezoek"

Doet de client: bewaar de ISO-tijd van het vorige bezoek in \`localStorage\` en
markeer elke reactie met \`datum > laatstBezoek\`. Geen serverstate nodig, werkt
ook voor niet-ingelogde bezoekers uit de nieuwsbrief.

## Beperkingen

- De activiteitenfeed heeft een venster van enkele dagen; oudere reacties staan
  er niet in. Voor volledige draden op oude berichten blijft de link naar de
  site nodig.
- De reactietekst is een snippet uit de feed, geen volledige tekst.
- Ning kan de feedopmaak wijzigen; het parsen is defensief, maar bij een
  wijziging in de activiteitenzinnen moeten \`REACTIE_PATRONEN\` en
  \`haalBerichtTitel\` in \`lib/ning.js\` bijgewerkt worden.
