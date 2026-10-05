# Kipinän ottelupalaute

QR-koodilla toimiva palautekysely Kipinän Basketin kotiotteluihin. Jokaisella ottelutapahtumalla on oma
kysely ja oma dashboard, ja yleisnäkymä vertaa otteluita keskenään. Tarkoitus on kerätä katsojilta
dataa, jonka pohjalta seuran työntekijä voi tehdä perustellumpia päätöksiä tulevista otteluista.

## Miten se toimii

1. **Luo ottelu** hallintapaneelissa (vastustaja, päivä, halli). Ottelu saa oman kyselylinkin ja QR-koodin.
2. **Tulosta QR-juliste** valmiista A4-pohjasta tai lataa koodi PNG/SVG-kuvana screenille tai someen.
3. **Katsojat vastaavat** puhelimella noin minuutissa. Kirjautumista ei tarvita ja vastaukset ovat nimettömiä.
4. **Seuraa dashboardia**: luvut päivittyvät ottelun aikana minuutin välein.
5. **Sulje kysely** kun haluat, ja lisää katsojamäärä, niin näet vastausprosentin.

## Kyselyn sisältö

| Kysymys | Mihin päätökseen se auttaa |
|---|---|
| Kokonaisarvio 1–5 (pakollinen) | Onnistuiko tapahtuma kokonaisuutena, ja onko suunta parempaan |
| Suositteluindeksi 0–10 (pakollinen) | NPS: levittävätkö katsojat sanaa, mikä on tärkein kasvun ajuri |
| Osa-alueet 1–5: tunnelma, pelin viihdyttävyys, juonto ja väliaikaohjelma, kioski, lipunmyynti ja sisäänpääsy, halli | Mihin resurssit ja kehitystyö kannattaa kohdistaa |
| Monesko ottelu | Tuleeko uutta yleisöä, vai pyöriikö sama porukka |
| Mistä kuuli ottelusta | Mihin markkinointikanaviin panostaa |
| Kenen kanssa tuli, ikä | Kenelle tapahtumaa kannattaa suunnata (perheet, nuoret, työporukat…) |
| Aikooko tulla uudelleen | Lojaalisuus ja ennuste tuleville otteluille |
| Mikä oli parasta / mitä parantaa | Konkreettiset ideat ja ongelmat omin sanoin |

Kysymyksiä voi muokata tiedostossa [`src/questions.js`](src/questions.js). Lomake, validointi, dashboard
ja CSV-vienti päivittyvät samasta määrittelystä. **Älä vaihda olemassa olevien kysymysten `id`-arvoja**,
koska silloin vanhojen otteluiden vastaukset eivät enää vertaudu uusiin.

## Dashboardit

**Yleisnäkymä** (`/admin/`)
- Kaikkien otteluiden vastausmäärä, kokonaisarvio ja NPS
- Kokonaisarvion ja NPS:n kehitys ottelu ottelulta (klikkaa pistettä, niin ottelun dashboard aukeaa)
- Osa-alueiden keskiarvot heikoimmasta vahvimpaan
- Vertailutaulukko, jossa jokaisen ottelun osa-alueet on väritetty (tummempi = parempi)
- Automaattiset havainnot, esim. heikoin osa-alue ja tärkein tiedotuskanava

**Ottelun dashboard**
- QR-koodi, tulostettava juliste, PNG/SVG-lataus ja kyselyn linkki
- Vastaukset, vastausprosentti, kokonaisarvio ja NPS verrattuna muihin otteluihin
- Jakaumat: kokonaisarvio, NPS (arvostelijat / passiiviset / suosittelijat), osa-alueet,
  tiedotuskanavat, uudet vs. palaavat katsojat, seurue, ikä, paluuaikomus
- Avoimet kommentit suodatettuina (parannusehdotukset, kehut, tyytymättömät)
- CSV-vienti Exceliin (puolipistein eroteltu, ääkköset toimivat)
- Muistiinpanot, esim. "teemapäivä: perheottelu", jotta vertailu muihin otteluihin on helpompaa

### Lukujen tulkinta

- **Kokonaisarvio** on keskiarvo asteikolla 1–5. Yli 4 on hyvä taso.
- **NPS** = suosittelijoiden (9–10) osuus miinus arvostelijoiden (0–6) osuus, asteikolla −100…+100.
  Yli 0 on hyvä ja yli 30 erinomainen.
- **Pieni otos**: jos vastauksia on alle 10, dashboard muistuttaa, että luvut ovat suuntaa antavia.

## Vinkkejä ottelupäivään

- Laita QR-julisteita katsomoon, kioskille, wc-tilojen oville ja uloskäynneille.
- Näytä QR-koodi screenillä 4. neljänneksen aikana ja ottelun jälkeen. Pyydä kuuluttajaa mainitsemaan kysely.
- Paras hetki vastata on heti ottelun jälkeen, kun kokemus on tuoreena. Pidä kysely auki vielä illan ajan.
- Jos haluat järjestää arvonnan vastaajien kesken, kerää yhteystiedot erillisellä lomakkeella, jotta
  palaute pysyy nimettömänä.

## Asennus ja käynnistys

Vaatii Node.js 22.13:n tai uudemman. Tietokantana toimii Noden sisäänrakennettu SQLite, joten erillistä
tietokantapalvelinta ei tarvita.

```bash
npm install
cp .env.example .env      # aseta ainakin ADMIN_PASSWORD
npm start                 # http://localhost:3000/admin/
```

Haluatko kokeilla esimerkkidatalla? Aja `npm run seed`. Komento luo neljä esimerkkiottelua satunnaisine
vastauksineen.

### Ympäristömuuttujat

| Muuttuja | Kuvaus |
|---|---|
| `ADMIN_PASSWORD` | Hallintapaneelin salasana. Ilman tätä käytetään oletusta `kipina`, joka ei sovi tuotantoon. |
| `SESSION_SECRET` | Satunnainen merkkijono kirjautumisevästeiden allekirjoitukseen. Ilman sitä kirjautuminen nollautuu uudelleenkäynnistyksessä. |
| `PUBLIC_URL` | Julkinen osoite, johon QR-koodit osoittavat, esim. `https://palaute.kipinabasket.fi`. **Aseta tämä tuotannossa.** |
| `PORT` | Portti (oletus 3000). |
| `DB_FILE` | SQLite-tiedoston polku (oletus `data/palaute.db`). |
| `TRUST_PROXY` | Expressin `trust proxy`. Oletus luottaa vain yksityisverkon välityspalvelimiin. |

### Tuotantoon

Sovellus on yksi Node-prosessi ja yksi SQLite-tiedosto. Se toimii missä tahansa palvelussa, jossa on
**pysyvä levy** (esim. Fly.io volume, Render disk, Railway volume tai oma VPS). Mukana on `Dockerfile`:

```bash
docker build -t kipina-palaute .
docker run -p 3000:3000 -v kipina-data:/app/data \
  -e ADMIN_PASSWORD=... -e SESSION_SECRET=... -e PUBLIC_URL=https://palaute.kipinabasket.fi \
  kipina-palaute
```

- Käytä HTTPS:ää. Pilvipalvelut hoitavat sen yleensä automaattisesti.
- Varmuuskopioi `data/`-hakemisto säännöllisesti.
- Tulosta QR-julisteet vasta, kun `PUBLIC_URL` on asetettu lopulliseen osoitteeseen.

## Tietosuoja ja väärinkäytösten esto

- Kysely ei kysy nimeä, sähköpostia tai muita tunnistetietoja, eikä IP-osoitteita tallenneta.
- Sama selain voi vastata kuhunkin otteluun kerran (eväste + selaimen muisti).
- Vastausten ja kirjautumisyritysten määrää rajoitetaan IP-osoitteittain muistissa.
- Hallintapaneeli on salasanan takana. Evästeet ovat HttpOnly ja SameSite=Lax.
- CSV-viennissä kaavoiksi tulkittavat solut estetään (Excel-injektio).

## Kehitys

```bash
npm test        # API- ja tilastotestit (node:test)
npm run seed    # esimerkkidata
```

Rakenne:

```
server.js              käynnistys ja asetukset
src/app.js             reitit: kysely, hallinta, QR, CSV
src/questions.js       kysymykset ja vastausten validointi
src/stats.js           tunnusluvut ja automaattiset havainnot
src/db.js              SQLite-tietokanta
public/survey.html     katsojan kysely (mobiili)
public/admin/          dashboardit, kirjautuminen ja tulostettava juliste
test/                  testit
```
