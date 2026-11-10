#!/bin/bash
# Kipinä Basket – esittelytila. Tuplaklikkaa tätä tiedostoa Macissa.
cd "$(dirname "$0")" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  echo
  echo "Node.js puuttuu tästä koneesta."
  echo "Asenna LTS-versio sivulta, joka aukeaa nyt selaimeen, ja tuplaklikkaa tätä tiedostoa uudelleen."
  open https://nodejs.org
  read -r -p "Paina Enter sulkeaksesi."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Asennetaan tarvittavat osat. Tämä tehdään vain ensimmäisellä kerralla ja kestää noin minuutin..."
  if ! npm install --no-fund --no-audit; then
    echo
    echo "Asennus epäonnistui. Tarkista internetyhteys ja yritä uudelleen."
    read -r -p "Paina Enter sulkeaksesi."
    exit 1
  fi
fi
npm run demo
