# Daycation — Brief di restyling per Claude Design

Incolla questo come prompt su **claude.ai/design** e allega i file
`index.html` e `weekend.html` come riferimento del contenuto/funzioni attuali.

---

## IL PROMPT (copia da qui)

> Sei un product designer senior. Devi fare il **restyling visivo** di "Daycation",
> una web-app personale (in **italiano**) che trova **gite in giornata e weekend in
> aereo da Bologna**. Ti allego le pagine attuali (`index.html` = giornata,
> `weekend.html` = 1-3 notti): **stesso contenuto e stesse funzioni**, look nuovo.
>
> **Voglio un'estetica "di domani": moderna, pulita, ariosa e funzionale** — come i
> migliori prodotti travel del 2025. Niente fronzoli: deve sembrare veloce e premium.
>
> **Direzione:**
> - Mobile-first (la quasi totalità è da telefono), pollice-friendly.
> - Tipografia forte e gerarchica; numeri grandi e leggibili (le "ore sul posto" sono l'eroe).
> - Profondità con gradienti soffusi e un tocco di vetro (glassmorphism leggero), ombre morbide, angoli arrotondati.
> - Palette "viaggio": cielo/mare + un accento caldo da tramonto; **dark mode** inclusa.
> - Micro-interazioni eleganti (hover/tap, comparsa card), ma performance prima di tutto.
> - Accessibilità: contrasto AA, target tap ≥44px, focus visibili.
>
> **Devi mantenere TUTTI questi componenti e funzioni:**
> 1. Header con logo + switch tra "Daycation" (giornata) e "Weekend".
> 2. Form di ricerca: per **data** o per **destinazione**, + ore minime sul posto, passeggeri, range date, filtro giorni della settimana, dropdown città con ricerca.
> 3. Barra **ordinamento**: 💶 Prezzo · ⏱ Più tempo · 🌅 Parte prima · 🌙 Rientra.
> 4. **Card risultato** (il pezzo forte): bandiera + città, **ore reali sul posto** (numero grande) + ore lorde, compagnia aerea, volo andata e ritorno con orari, **badge prezzo "da €XX"**, pulsante condividi, pulsante "Cerca prezzi".
> 5. Nota onesta sui prezzi (testo piccolo) sotto i risultati.
> 6. Stati vuoti/errore curati, footer, look PWA (icona, theme-color).
>
> **Vincoli tecnici irrinunciabili (verrà reimplementato a mano):**
> - Output come **HTML + CSS (+ JS vanilla se serve) autonomo**, NIENTE framework,
>   NIENTE build: il sito è una **PWA statica single-file** su GitHub Pages.
> - Usa **CSS custom properties** per i token (colori, tipo, spazi, raggi, ombre) così
>   è facile riportarli nel codice.
>
> **Consegnami:**
> 1. Un mini **design system**: palette (light+dark), scala tipografica, spaziature, raggi, ombre — come variabili CSS.
> 2. Il **ridisegno delle 3 schermate chiave**: home/form, lista risultati con 2-3 card, stato vuoto.
> 3. La **card risultato** come componente isolato con le sue varianti (con prezzo / senza prezzo / rotta nuova / weekend).
> Tutto in HTML/CSS pulito e commentato, pronto da portare nel sito.

---

## Note per te (non per il prompt)

- Quando Claude Design ti dà il risultato, **rimandamelo** (incolla l'HTML/CSS o i token):
  lo **porto io dentro** `index.html` e `weekend.html` mantenendo logica e dati.
- Conviene allegare **entrambe** le pagine: condividono lo stesso stile, così il
  redesign resta coerente tra Daycation e Weekend.
- Se Claude Design ti chiede priorità: di' che **mobile + card risultato + dark mode**
  sono le cose che contano di più.

## Inventario componenti (riferimento rapido)

| Componente | Contenuto chiave |
|---|---|
| Header | logo ✈️, titolo, sottotitolo, switch Daycation/Weekend |
| Form ricerca | tab data/destinazione, ore minime, passeggeri, range, filtro giorni, dropdown città |
| Sort bar | 💶 Prezzo · ⏱ Più tempo · 🌅 Parte prima · 🌙 Rientra |
| Card risultato | bandiera+città, ore reali (grande) + lorde, compagnia, voli A/R con orari, badge "da €", condividi, Cerca prezzi |
| Nota prezzi | testo onesto "prezzi indicativi…" |
| Stati | vuoto, errore, fuori stagione |
| Footer / PWA | crediti, theme-color, manifest |

## Palette attuale (da rinnovare)
- Scuro brand: `#0A1628` · Blu: `#0E4EAD` · Accento caldo: `#F5A623`
- Grigi testo: `#6B7785` / `#94A3B8` · Sfondi: `#F5F7FB` / `#fff` · Verde prezzo: `#067A52`
