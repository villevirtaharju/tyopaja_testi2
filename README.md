# Kipinä Basket – ottelupalaute

QR-koodilla toimiva palautekysely Kipinä Basketin kotiotteluihin. Jokaisella ottelutapahtumalla on oma
kysely ja oma dashboard, ja yleisnäkymä vertaa otteluita keskenään. Tarkoitus on kerätä katsojilta
dataa, jonka pohjalta seuran työntekijä voi tehdä perustellumpia päätöksiä tulevista otteluista.

## Miten se toimii

1. **Luo ottelu** hallintapaneelissa (vastustaja, päivä, halli ja arvonnan palkinto). Ottelu saa oman
   kyselylinkin ja QR-koodin.
2. **Tulosta QR-juliste** valmiista A4-pohjasta tai lataa koodi PNG/SVG-kuvana screenille tai someen.
   Julisteessa näkyy arvonnan palkinto, joka on katsojalle tärkein syy skannata koodi.
3. **Katsojat vastaavat** puhelimella noin minuutissa. Kirjautumista ei tarvita ja vastaukset ovat nimettömiä.
   Vastaamisen jälkeen katsoja voi osallistua arvontaan.
4. **Seuraa dashboardia**: luvut päivittyvät ottelun aikana minuutin välein.
5. **Sulje kysely** ottelun jälkeen ja **arvo voittaja** yhdellä painalluksella. Lisää katsojamäärä, niin näet
   vastausprosentin.

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

## Arvonta: kannustin vastata

Jokaiseen otteluun voi liittää arvonnan vastaajien kesken (oletuspalkinto: pelaajan pelipaita). Palkinnon voi
vaihtaa otteluittain, esimerkiksi "Kapteenin nimikoitu pelipaita".

- **Palkinto näkyy** julisteessa ja kyselyn alussa: "Vastaa ja osallistu arvontaan!"
- **Osallistuminen vain vastaajille.** Palautteen lähettäminen antaa kertakäyttöisen, allekirjoitetun tunnisteen,
  jolla katsoja osallistuu arvontaan. Ilman vastausta ei voi osallistua.
- **Kerran per henkilö.** Samalla sähköpostilla tai puhelinnumerolla voi osallistua kerran per ottelu
  (numerot tunnistetaan muodosta riippumatta: `040 123 4567` = `+358401234567`).
- **Palaute pysyy nimettömänä.** Yhteystiedot kysytään vasta palautteen lähettämisen jälkeen ja tallennetaan
  erilliseen tauluun ilman viittausta vastaukseen. Osallistujista tallennetaan vain päivämäärä (ei kellonaikaa),
  eikä taulu säilytä lisäysjärjestystä, joten osallistumista ei voi yhdistää palautteeseen jälkikäteen.
- **Reilu arvonta.** Voittaja arvotaan satunnaisesti vasta, kun kysely on suljettu. Jos voittajaa ei tavoiteta,
  uuden voittajan voi arpoa, eikä sama henkilö voi voittaa kahdesti. Arvonnan jälkeen uusia osallistujia ei oteta.
- **Tietojen poisto.** Yhteystiedot poistuvat automaattisesti säilytysajan jälkeen (oletus 60 päivää), ja ne voi
  poistaa itse heti, kun palkinto on luovutettu.
- **Kannustimen vaikutus.** Yleisnäkymä vertaa vastausmääriä ja vastausprosenttia otteluissa, joissa arvonta oli
  ja joissa ei ollut. Seura näkee suoraan, kannattaako palkinto.

Kyselyssä näytetään arvonnan säännöt ja tietosuojateksti, jotka ovat tiedostossa
[`src/raffle.js`](src/raffle.js). **Tarkistakaa säännöt ennen käyttöönottoa** ja muokatkaa ne seuran omiksi.
Maksuttomassa markkinointiarvonnassa osallistumisehtojen tulee olla selkeät ja helposti saatavilla, ja
yhteystietojen käsittelyyn sovelletaan tietosuoja-asetusta. Tämä ei ole juridinen neuvo.

## Dashboardit

**Yleisnäkymä** (`/admin/`)
- Kaikkien otteluiden vastausmäärä, kokonaisarvio ja NPS
- Kokonaisarvion ja NPS:n kehitys ottelu ottelulta (klikkaa pistettä, niin ottelun dashboard aukeaa)
- Osa-alueiden keskiarvot heikoimmasta vahvimpaan
- Vertailutaulukko, jossa jokaisen ottelun osa-alueet on väritetty (tummempi = parempi)
- Automaattiset havainnot, esim. heikoin osa-alue ja tärkein tiedotuskanava

**Ottelun dashboard**
- QR-koodi, tulostettava juliste, PNG/SVG-lataus ja kyselyn linkki
- Arvonta: osallistujamäärä, voittajan arvonta ja yhteystiedot, uusi arvonta, osallistujatietojen poisto
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
- Näytä QR-koodi screenillä 4. neljänneksen aikana ja ottelun jälkeen. Pyydä kuuluttajaa mainitsemaan kysely
  ja pelipaidan arvonta.
- Paras hetki vastata on heti ottelun jälkeen, kun kokemus on tuoreena. Pidä kysely auki vielä illan ajan.
- Sulje kysely seuraavana päivänä, arvo voittaja ja ilmoita hänelle. Kerro somessa, että paita on arvottu
  (voittajan nimellä vain hänen luvallaan), niin seuraavaan arvontaan osallistuu entistä useampi.

## Kokeile omalla puhelimella (esittelytila)

Esittelytilassa sovellus pyörii omalla tietokoneellasi, ja puhelin käyttää sitä saman wifin kautta.
Kyselyn QR-koodin voi skannata suoraan näytöltä puhelimen kameralla, aivan kuten katsoja hallissa.
Esittelytila sopii myös sovelluksen näyttämiseen seuralle.

1. **Asenna Node.js** osoitteesta [nodejs.org](https://nodejs.org) (LTS-versio, oletusasetuksilla).
2. **Lataa koodi:** avaa repositorio GitHubissa, valitse haaraksi `main`, paina vihreää **Code**-painiketta
   ja valitse **Download ZIP**. Napsauta ZIP-tiedostoa hiiren oikealla ja valitse **Pura kaikki** (Windows),
   tai tuplaklikkaa sitä (Mac).
3. **Tuplaklikkaa käynnistystiedostoa** puretussa kansiossa:
   - Windows: `Kaynnista-demo-Windows.bat`. Jos Windows varoittaa ("Windows suojasi tietokoneesi"),
     valitse **Lisätietoja** ja sitten **Suorita silti**.
   - Mac: `Kaynnista-demo-Mac.command`. Jos Mac ei suostu avaamaan tiedostoa, napsauta sitä hiiren
     oikealla, valitse **Avaa** ja vahvista **Avaa**.

   Ensimmäisellä kerralla tiedosto asentaa tarvittavat osat, mikä kestää noin minuutin.
4. **Skannaa** ikkunaan tuleva QR-koodi puhelimella. Puhelimen pitää olla samassa wifissä kuin kone.
5. **Seuraa vastauksia** koneen selaimessa osoitteessa, jonka ikkuna näyttää (salasana `kipina`).
   Valitse **Testiottelu**. Siellä voit myös sulkea kyselyn ja arpoa voittajan.

Pidä ikkuna auki kokeilun ajan. Lopetus: sulje ikkuna tai paina Ctrl+C.

Esittelytila aloittaa aina puhtaalta pöydältä: mukana on keksittyä esimerkkidataa ja tyhjä Testiottelu,
jossa on pelipaidan arvonta. Data nollautuu, kun esittelytila käynnistetään uudelleen.

Jos puhelin ei saa yhteyttä, salli Node.js tietokoneen palomuurissa (Windows ja Mac kysyvät tätä
ensimmäisellä kerralla). Tarkista myös, ettei wifi ole vierasverkko, joka estää laitteiden väliset yhteydet.
Samalla puhelimella voi vastata kuhunkin otteluun kerran. Kokeile uudelleen selaimen yksityisessä tilassa
tai luo hallinnassa uusi ottelu.

Käynnistystiedostojen sijaan voit myös avata päätteen kansiossa ja kirjoittaa `npm install` ja
`npm run demo`.

## Julkinen testiversio (jaettava QR-koodi)

Kun haluat, että kuka tahansa voi testata kyselyä omalla puhelimellaan, sovellus julkaistaan
internetiin. Repossa on valmis [Render](https://render.com)-pohja (`render.yaml`), jolla julkaisu
onnistuu selaimessa muutamalla klikkauksella.

**Julkaisu:**
1. Luo tili osoitteessa [render.com](https://render.com). Helpointa on valita **Sign up with GitHub**.
2. Valitse Renderin hallintapaneelissa **New → Blueprint** ja yhdistä repositorio
   `villevirtaharju/tyopaja_testi2` (anna Renderille pääsy siihen). Valitse haaraksi `main`.
3. Render lukee asetukset `render.yaml`-tiedostosta ja kysyy **ADMIN_PASSWORD**-arvon. Keksi vahva
   salasana hallintaan, koska sivu on julkinen.
4. Paina **Deploy Blueprint**. Render pyytää maksutiedot: pysyvän levyn takia käytössä on Starter-taso
   (noin 7 $/kk + levy 1 Gt noin 0,25 $/kk, laskutus käytön mukaan).
5. Julkaisu kestää muutaman minuutin. Palvelun osoite näkyy Renderissä, esimerkiksi
   `https://kipina-palaute.onrender.com`.

**Käyttö:**
- Avaa `https://<palvelun-osoite>/admin/` ja kirjaudu valitsemallasi salasanalla. Ensimmäisellä
  käynnistyksellä mukana on esimerkkidataa ja tyhjä **Testiottelu**.
- Avaa Testiottelu ja jaa sen QR-koodi (**Lataa PNG**) tai linkki kenelle tahansa, esimerkiksi viestillä
  tai somessa. Tulostettava juliste löytyy samasta paikasta.
- Esimerkkiottelut voi poistaa ottelun sivulta (**Poista ottelu**), ja uusia otteluita voi luoda vapaasti.
- Kun `main`-haaraan yhdistetään muutoksia, Render päivittää sovelluksen automaattisesti, ja tiedot säilyvät.
- Kun testaus on ohi, poista palvelu Renderistä, niin laskutus loppuu.

**Testitila:** julkinen versio käynnistyy testitilassa (`TEST_MODE=true`). Silloin kyselyssä, hallinnassa
ja julisteessa lukee selvästi "Testiversio", ja arvonnan kohdalla kerrotaan, ettei arvontaa oikeasti
järjestetä. Näin testaajat eivät luule kyselyä seuran viralliseksi eivätkä anna oikeita yhteystietojaan.
Arvontatiedot poistuvat 14 päivän kuluttua. Koska sivulla on seuran logo, kysy seuralta lupa ennen kuin
jaat linkkiä laajasti. Ota testitila pois päältä vasta, kun sovellus on seuran käytössä ja arvonnan säännöt
on sovittu (aseta silloin myös `PRIVACY_CONTACT`).

Ilmaiseksi Renderissä voi kokeilla vaihtamalla `render.yaml`:ssa `plan: free` ja poistamalla `disk`-osion.
Silloin palvelu kuitenkin nukahtaa 15 minuutin käyttämättömyyden jälkeen, ja kaikki vastaukset katoavat
aina kun se käynnistyy uudelleen.

## Asennus ja käynnistys

Vaatii Node.js 22.13:n tai uudemman. Tietokantana toimii Noden sisäänrakennettu SQLite, joten erillistä
tietokantapalvelinta ei tarvita.

```bash
npm install
cp .env.example .env      # aseta ainakin ADMIN_PASSWORD
npm start                 # http://localhost:3000/admin/
```

Haluatko kokeilla esimerkkidatalla? Aja `npm run seed`. Komento luo neljä esimerkkiottelua satunnaisine
vastauksineen. Kahdessa niistä on pelipaidan arvonta kuvitteellisine osallistujineen, joten kannustimen
vaikutus näkyy heti yleisnäkymässä.

### Ympäristömuuttujat

| Muuttuja | Kuvaus |
|---|---|
| `ADMIN_PASSWORD` | Hallintapaneelin salasana. Ilman tätä käytetään oletusta `kipina`, joka ei sovi tuotantoon. |
| `SESSION_SECRET` | Valinnainen. Jos tyhjä, satunnainen avain luodaan kerran ja tallennetaan tietokantaan. |
| `PUBLIC_URL` | Julkinen osoite, johon QR-koodit osoittavat, esim. `https://palaute.kipinabasket.fi`. **Aseta tämä tuotannossa.** Renderissä käytetään automaattisesti palvelun omaa osoitetta. |
| `PORT` | Portti (oletus 3000). |
| `DB_FILE` | SQLite-tiedoston polku (oletus `data/palaute.db`). |
| `TRUST_PROXY` | Expressin `trust proxy`. Oletus luottaa vain yksityisverkon välityspalvelimiin. |
| `RAFFLE_ORGANIZER` | Arvonnan järjestäjä ja rekisterinpitäjä säännöissä (oletus `Kipinä Basket ry`). |
| `PRIVACY_CONTACT` | Seuran yhteystieto tietosuoja-asioihin, esim. sähköposti. **Aseta ennen arvontoja.** |
| `PRIVACY_POLICY_URL` | Valinnainen linkki seuran tietosuojaselosteeseen. |
| `RAFFLE_RETENTION_DAYS` | Montako päivää osallistujien yhteystietoja säilytetään (oletus 60). |
| `TEST_MODE` | `true` = julkinen testiversio: "Testiversio"-merkinnät, arvonta ei ole todellinen, ja tyhjään tietokantaan luodaan esimerkkidata ja Testiottelu. |

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
- Arvonnan yhteystiedot kysytään erikseen vastaamisen jälkeen, eikä niitä voi yhdistää palautteeseen
  (katso [Arvonta](#arvonta-kannustin-vastata)). Ne poistuvat automaattisesti säilytysajan jälkeen.
- Sama selain voi vastata kuhunkin otteluun kerran (eväste + selaimen muisti).
- Vastausten ja kirjautumisyritysten määrää rajoitetaan IP-osoitteittain muistissa.
- Hallintapaneeli on salasanan takana. Evästeet ovat HttpOnly ja SameSite=Lax.
- CSV-viennissä kaavoiksi tulkittavat solut estetään (Excel-injektio).

## Seuran ilme (logo ja värit)

Ilme noudattaa Kipinä Basketin visuaalista ilmettä (Partnership Deck, kausi 2026–2027).

- **Logo:** seuran päälogo on tiedostossa `public/brand/logo.png` (läpinäkyvä tausta, 473 × 640 px).
  Se näkyy kyselyssä, hallintapaneelissa, julisteessa ja selaimen välilehdellä. Logon voi vaihtaa
  korvaamalla tiedoston (myös `logo.svg`, `logo.webp` tai `logo.jpg` käyvät). Jos logo puuttuu, käytetään
  varakuvaketta `public/brand/placeholder-logo.svg`.
- **Värit:** seuran paletti on kulta `#CCB687`, musta `#000000` ja valkoinen `#FFFFFF`. Ne ovat
  `--brand`- ja `--gold`-muuttujissa tiedoston [`public/styles.css`](public/styles.css) alussa (vaalea ja
  tumma tila) sekä julisteen tyyleissä ([`public/admin/juliste.html`](public/admin/juliste.html)).
  Kulta on valkoisella pohjalla liian vaalea pieneksi tekstiksi, joten pienissä kultaisissa teksteissä
  käytetään samaa sävyä tummennettuna (`--gold-ink: #766032`).
- **Fontti:** sanamerkissä ja otsikoissa on leveä ja lihava Archivo (avoin lisenssi), joka on lähellä seuran
  materiaalien typografiaa. Fontti tarjoillaan omalta palvelimelta, ei Googlen kautta.
- Kaavioiden värit ovat erillään seuran väreistä, jotta ne pysyvät luettavina ja värisokeille sopivina.

## Kehitys

```bash
npm test        # API- ja tilastotestit (node:test)
npm run seed    # esimerkkidata
npm run demo    # esittelytila puhelimella kokeiluun
```

Rakenne:

```
server.js              käynnistys ja asetukset
src/app.js             reitit: kysely, hallinta, QR, CSV
src/questions.js       kysymykset ja vastausten validointi
src/stats.js           tunnusluvut ja automaattiset havainnot
src/demo-data.js       esimerkkidata ja Testiottelu (seed, esittelytila, testitila)
src/raffle.js          arvonnan tunnisteet, yhteystietojen tarkistus ja säännöt
src/db.js              SQLite-tietokanta
public/survey.html     katsojan kysely (mobiili)
public/admin/          dashboardit, kirjautuminen ja tulostettava juliste
public/brand/          seuran logo
scripts/seed.js        esimerkkidata komentoriviltä
render.yaml            julkaisupohja Renderiin (julkinen testiversio)
scripts/demo.js        esittelytila puhelimella kokeiluun
Kaynnista-demo-*       esittelytilan käynnistys tuplaklikkaamalla (Windows .bat, Mac .command)
test/                  testit
```
