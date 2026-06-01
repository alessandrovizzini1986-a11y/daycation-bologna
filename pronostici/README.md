# Pronostici — scommetti con la testa

Strumento personale per scommettere in modo **disciplinato**, non a caso.
Web-app statica (PWA): la apri da telefono o pc, funziona anche offline, salva
tutto **solo sul tuo dispositivo** (niente account, niente server).

> **Sport**: Calcio (Serie A, coppe UEFA) e Tennis.
> **Filosofia**: non si guadagna indovinando il risultato, ma trovando le quote
> di *valore*, puntando la quota giusta (Kelly) e registrando ogni giocata.

## Cosa fa

1. **Cruscotto** — bankroll attuale, profitto, ROI/yield, % vincenti, giocate
   aperte e grafico dell'andamento.
2. **Trova value (live)** — scarica le quote reali di tutti i bookmaker,
   rimuove il margine, calcola la probabilità "vera" di consenso e segnala dove
   un bookmaker **paga più del giusto**. Quello è il value.
3. **Calcolatore**
   - *Value & Kelly*: quota + tua probabilità → edge e stake consigliato.
   - *No-vig*: incolli le quote di un mercato → probabilità senza margine.
4. **Registro** — ogni giocata con esito, statistiche, export/import del backup.
5. **Impostazioni** — bankroll, frazione di Kelly, chiave API.

## Dati live: chiave API gratuita (1 minuto)

1. Vai su **https://the-odds-api.com/** → "Get API Key" (piano gratuito, 500
   richieste/mese).
2. Copia la chiave.
3. Nell'app: **Impostazioni → Chiave API → incolla → Salva**.
4. Tab **Live → Aggiorna lista → Cerca scommesse di valore**.

Senza chiave l'app funziona lo stesso: usi il Calcolatore e il Registro a mano.

## Come trovo il value (metodo)

Per ogni partita prendo le quote di **tutti** i bookmaker, a ognuno tolgo il
margine (no-vig) e faccio la **media** → è la probabilità di consenso del
mercato, la stima più affidabile che esista gratis. Poi controllo ogni
bookmaker: se uno offre una quota **più alta** di quella equa rispetto al
consenso, lì c'è valore. È il metodo "soft book vs consenso sharp" usato dai
value bettor.

> ⚠️ Il value è un *vantaggio statistico sul lungo periodo*, non una garanzia
> sulla singola giocata. Per questo conta la gestione del bankroll: punta
> sempre con ¼ di Kelly e non rincorrere le perdite.

## Avvio in locale

È tutto statico, nessuna build:

```
# dalla cartella pronostici/
python3 -m http.server 8080
# poi apri http://localhost:8080
```

Oppure pubblicala su Netlify / GitHub Pages puntando a questa cartella.

## File

```
pronostici/
├── index.html              # interfaccia (5 tab)
├── app.js                  # tutta la logica: value, Kelly, no-vig, registro, live
├── style.css               # tema scuro mobile-first
├── manifest.webmanifest    # PWA
├── sw.js                   # service worker (offline)
├── icon.svg                # icona
└── README.md
```

## Gioco responsabile

Questo è uno strumento di analisi per uso personale. Scommetti solo soldi che
puoi permetterti di perdere. Se il gioco diventa un problema:
**Telefono Verde Nazionale 800 558 822** (gratuito e anonimo).
