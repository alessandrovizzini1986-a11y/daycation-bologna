# Daycation Bologna

App personale per trovare gite in giornata in aereo da Bologna BLQ, con orari
ufficiali aggiornati automaticamente.

**Online:** https://alessandrovizzini1986-a11y.github.io/daycation-bologna/
(GitHub Pages, branch `main`).

## Come funziona

- **Dati**: il parser scarica il PDF ufficiale degli orari da `bologna-airport.it`
  e lo trasforma in JSON.
- **Aggiornamento**: una GitHub Action gira 3 volte al giorno (~03:23, ~07:23 e
  ~16:23 ora italiana estiva; GitHub può partire in ritardo), scarica il PDF
  corrente (rileva da sola se è stagione `summer_YYYY` o `winter_YYYY_YYYY+1`),
  riparsa tutto, aggiorna i prezzi e fa commit dei JSON se è cambiato qualcosa.
  GitHub Pages ripubblica automaticamente.
  Se BLQ ha online anche l'orario della stagione successiva e/o precedente,
  vengono accodati: ogni stagione vale fino al giorno prima dell'inizio della
  successiva (es. estate fino al 31/10, inverno dal 01/11).
- **Se fallisce**: una seconda Action (`rerun-on-failure.yml`) rilancia la run
  una volta in automatico; se fallisce ancora, il giro successivo recupera.
- **App**: HTML statico (`index.html` alla radice) che fa `fetch('data.json')` al
  caricamento e mostra le daycation possibili per la data scelta.

## Setup iniziale (una volta sola)

### 1. GitHub
- Crea un nuovo repository su GitHub (es. `daycation-bologna`)
- Carica tutti i file di questa cartella nel repo
- Vai in `Settings → Actions → General → Workflow permissions`
- Seleziona **"Read and write permissions"** → salva
  (così l'action può fare commit del data.json aggiornato)

### 2. GitHub Pages
- Vai in `Settings → Pages`
- Source: **"Deploy from a branch"** → branch `main`, cartella `/ (root)` → salva
- Dopo 1-2 minuti il sito è su `https://<utente>.github.io/daycation-bologna/`

### 3. Primo aggiornamento dati
- Vai su GitHub → tab "Actions" → "Update BLQ flight data" → "Run workflow"
- Aspetta ~30 secondi
- GitHub Pages ripubblicherà entro 1-2 minuti

L'URL di GitHub Pages mostrerà l'app con dati freschi.

## Prezzi nell'app (opzionale)

L'app può mostrare un badge **"da €XX A/R"** su ogni destinazione, con il prezzo
più basso andata+ritorno diretto preso dalla cache di Aviasales (ricerche reali
recenti). I prezzi vengono scaricati dalla stessa GitHub Action (3 volte al giorno) e
salvati dentro `data.json` e `weekend-data.json`: nessun costo a runtime,
funziona anche offline.

Per attivarli serve un token gratuito Travelpayouts (vale anche come affiliato:
le prenotazioni dal badge ti riconoscono una commissione):

1. Registrati su [travelpayouts.com](https://www.travelpayouts.com) e prendi il
   token API qui: `Tools → API` (Aviasales Data API).
2. Su GitHub: `Settings → Secrets and variables → Actions → New repository secret`
   - `TRAVELPAYOUTS_TOKEN` = il tuo token (obbligatorio)
   - `TRAVELPAYOUTS_MARKER` = il tuo marker affiliato (opzionale, per le commissioni)
3. Lancia la action (`Actions → Run workflow`): popola i prezzi e fa commit.

Senza il secret, lo step prezzi non fa nulla e tutto il resto funziona come prima.

## Manutenzione

**Zero.** 3 volte al giorno il bot controlla, aggiorna se serve, e GitHub Pages
ripubblica da solo. Quando l'aeroporto pubblica gli orari della nuova stagione
(estate o inverno), la action prende il nuovo PDF automaticamente, anche prima
del cambio stagione.

Se vuoi forzare un aggiornamento subito: GitHub → Actions → Run workflow.

## Weekend da Bologna

Oltre alle gite in giornata c'è una seconda app, **`weekend.html`**: trova fughe
di **1-2 notti** (partenza ven/sab, rientro domenica), calcolando le ore reali a
destinazione. Usa lo stesso PDF ufficiale ma un dataset non filtrato
(`weekend-data.json`), perché per i weekend servono anche i voli serali e del
mattino presto che Daycation scarta. Le due app sono collegate tra loro nel
footer.

## File

```
.
├── parse_blq.py              # Parser PDF → data.json + weekend-data.json
├── fetch_prices.py           # Prezzi A/R (Travelpayouts) → meta.prices in data.json
├── index.html                # App "Daycation" (gite in giornata)
├── data.json                 # Generato dal parser (subset daycation + prezzi)
├── weekend.html              # App "Weekend da Bologna" (1-2 notti)
├── weekend-data.json         # Generato dal parser (orario completo)
├── sw.js                     # Service worker (offline / PWA)
├── manifest.json             # Manifest PWA
├── .github/workflows/
│   ├── update-data.yml       # Action 3x/giorno (aggiorna entrambi i json)
│   └── rerun-on-failure.yml  # Rilancia una volta la action se fallisce
├── netlify.toml              # Vecchia config Netlify (non usata: il sito è su GitHub Pages)
└── README.md
```

## Limiti onesti

- I dati sono solo BLQ: niente voli da altri aeroporti italiani.
- Solo voli diretti: niente combinazioni con scalo.
- I prezzi nell'app (se attivati, vedi sopra) sono un riferimento "da €XX A/R"
  aggiornato più volte al giorno dalla cache Aviasales, non la quotazione live del giorno
  esatto: per la conferma resta il bottone "Cerca prezzi" (Skyscanner).
- Se BLQ cambia il layout del PDF o la nomenclatura degli URL, il parser
  potrebbe rompersi. In quel caso la action fallisce visibilmente su GitHub e
  serve sistemare il parser.
