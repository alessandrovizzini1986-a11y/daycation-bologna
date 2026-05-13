# Daycation Bologna

App personale per trovare gite in giornata in aereo da Bologna BLQ, con orari
ufficiali aggiornati automaticamente.

## Come funziona

- **Dati**: il parser scarica il PDF ufficiale degli orari da `bologna-airport.it`
  e lo trasforma in JSON.
- **Aggiornamento**: una GitHub Action gira ogni notte alle 04:00 UTC, scarica
  il PDF corrente (rileva da sola se è stagione `summer_YYYY` o
  `winter_YYYY_YYYY+1`), riparsa tutto, e fa commit del nuovo `data.json` se è
  cambiato qualcosa. Netlify ribuilda automaticamente.
- **App**: HTML statico (`public/index.html`) che fa `fetch('data.json')` al
  caricamento e mostra le daycation possibili per la data scelta.

## Setup iniziale (una volta sola)

### 1. GitHub
- Crea un nuovo repository su GitHub (es. `daycation-bologna`)
- Carica tutti i file di questa cartella nel repo
- Vai in `Settings → Actions → General → Workflow permissions`
- Seleziona **"Read and write permissions"** → salva
  (così l'action può fare commit del data.json aggiornato)

### 2. Netlify
- Vai su [netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
- Connetti il repository GitHub
- Configurazione automatica:
  - Build command: vuoto o `echo`
  - Publish directory: `public`
- Deploy

### 3. Primo aggiornamento dati
- Vai su GitHub → tab "Actions" → "Update BLQ flight data" → "Run workflow"
- Aspetta ~30 secondi
- Netlify ribuilderà entro 1-2 minuti

L'URL Netlify (es. `daycation-bologna.netlify.app`) mostrerà l'app con dati
freschi.

## Manutenzione

**Zero.** Ogni notte il bot controlla, aggiorna se serve, e Netlify ripubblica
da solo. Quando l'aeroporto pubblica gli orari della nuova stagione (estate o
inverno), la action prende il nuovo PDF automaticamente.

Se vuoi forzare un aggiornamento subito: GitHub → Actions → Run workflow.

## File

```
.
├── parse_blq.py              # Parser PDF → JSON
├── public/
│   ├── index.html            # App statica
│   └── data.json             # Generato dal parser
├── .github/workflows/
│   └── update-data.yml       # Action giornaliera
├── netlify.toml              # Config Netlify
└── README.md
```

## Limiti onesti

- I dati sono solo BLQ: niente voli da altri aeroporti italiani.
- Solo voli diretti: niente combinazioni con scalo.
- Niente prezzi nell'app: i prezzi reali si vedono cliccando "Cerca prezzi"
  (apre Skyscanner già filtrato per quella tratta e quel giorno).
- Se BLQ cambia il layout del PDF o la nomenclatura degli URL, il parser
  potrebbe rompersi. In quel caso la action fallisce visibilmente su GitHub e
  serve sistemare il parser.
