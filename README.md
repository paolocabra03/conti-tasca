# Contabile

App web per tenere le proprie finanze personali: spese, entrate, trasferimenti tra conti, grafici e (a scelta) un piano di accumulo. Si installa sul telefono dal browser, come una normale app.

Ogni persona usa il **suo foglio Google, nel suo Drive**. L'app lo crea al primo avvio e lo ritrova da sola agli accessi successivi. In questo repository non c'è nessun dato personale: il codice è solo l'app.

## Come provarla

Servono Node.js e Python.

- Test: dalla cartella del progetto, `node --test` (senza indicare cartelle).
- Controllo della sintassi: `node --check app.js core.js sw.js`.
- Server locale: `python -m http.server 8791 --bind 127.0.0.1`, poi apri http://127.0.0.1:8791/. Da `localhost` l'accesso a Google non funziona (indirizzo non autorizzato): per le prove usa dati finti nel `localStorage`.

## Struttura

- `index.html`: pagina e stile
- `app.js`: schermate e collegamento con Google
- `core.js`: logica pura (calcoli, righe del foglio), coperta dai test
- `config.js`: identificativo OAuth dell'app
- `sw.js`, `manifest.webmanifest`, `icons/`: installazione e uso senza rete
