#!/usr/bin/env python3
"""
Daycation Bologna - Prezzi A/R via Travelpayouts (Aviasales Data API)

Gira DOPO parse_blq.py: per ogni città chiede il prezzo più basso andata+ritorno
DIRETTO da BLQ (dalla cache Aviasales) e lo salva in meta.prices (indicizzato per
IATA) sia in data.json (Daycation) sia in weekend-data.json (Weekend).

Le città comuni alle due app vengono chieste all'API una volta sola (cache).

Fail-soft per design:
  - senza TRAVELPAYOUTS_TOKEN esce subito senza toccare i JSON;
  - un errore sul singolo volo non blocca gli altri né la pipeline.

La doc Travelpayouts dice esplicitamente che questi prezzi vengono dalla cache
(ricerche reali delle ultime 48h) e sono pensati per generare pagine statiche:
è esattamente l'uso qui (snapshot notturno nei JSON).
"""
import os, re, sys, json, time, datetime, pathlib, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).parent
DATA_FILE = ROOT / "data.json"
WEEKEND_FILE = ROOT / "weekend-data.json"
HTML_FILES = [ROOT / "index.html", ROOT / "weekend.html"]
API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

TOKEN = os.environ.get("TRAVELPAYOUTS_TOKEN", "").strip()
MARKER = os.environ.get("TRAVELPAYOUTS_MARKER", "").strip()


def city_to_iata():
    """Mappa città→IATA da CITY_INFO di index.html + weekend.html (uniche fonti)."""
    mapping = {}
    for f in HTML_FILES:
        html = f.read_text(encoding="utf-8")
        for c, iata in re.findall(r"'([^']+)':\{iata:'([A-Z]{0,3})'", html):
            mapping[c] = iata
    return mapping


def booking_link(path):
    """Costruisce il link Aviasales completo (con marker affiliato se presente)."""
    if not path:
        return None
    url = "https://www.aviasales.com" + path
    if MARKER:
        url += ("&" if "?" in url else "?") + "marker=" + urllib.parse.quote(MARKER)
    return url


def cheapest_roundtrip(iata, month):
    """Prezzo A/R diretto più basso BLQ↔IATA nel mese dato (YYYY-MM). None se assente."""
    qs = urllib.parse.urlencode({
        "origin": "BLQ", "destination": iata, "departure_at": month,
        "currency": "eur", "direct": "true", "one_way": "false",
        "sorting": "price", "limit": 1, "token": TOKEN,
    })
    req = urllib.request.Request(f"{API}?{qs}", headers={"User-Agent": "daycation-bologna"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.load(resp)
    rows = payload.get("data") or []
    if not rows:
        return None
    r = rows[0]
    return {"eur": round(r["price"]), "link": booking_link(r.get("link")),
            "on": (r.get("departure_at") or "")[:10]}


def fetch_best(iata, months, today):
    """Prezzo più basso tra i mesi indicati. None se la cache non ha dati."""
    best = None
    for m in months:
        try:
            p = cheapest_roundtrip(iata, m)
        except Exception as e:
            print(f"   {iata} {m}: errore {e}", file=sys.stderr)
            continue
        if p and (best is None or p["eur"] < best["eur"]):
            best = p
        time.sleep(0.15)  # gentile con l'API
    if best:
        best["upd"] = today.isoformat()
    return best


def annotate(path, iata_map, months, cache, today):
    """Aggiunge meta.prices al JSON dato, riusando la cache tra i file."""
    data = json.loads(path.read_text(encoding="utf-8"))
    prices = {}
    for city in data.get("meta", {}).get("cities", []):
        iata = iata_map.get(city)
        if not iata:
            continue
        if iata not in cache:
            cache[iata] = fetch_best(iata, months, today)
        if cache[iata]:
            prices[iata] = cache[iata]
    data.setdefault("meta", {})["prices"] = prices
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    print(f"{path.name}: {len(prices)} prezzi su {len(data['meta'].get('cities', []))} città.",
          file=sys.stderr)


def main():
    if not TOKEN:
        print("TRAVELPAYOUTS_TOKEN assente: salto i prezzi (JSON invariati).", file=sys.stderr)
        return

    iata_map = city_to_iata()
    today = datetime.date.today()
    # Prossimi 2 mesi, tengo il più basso: la cache è più ricca su orizzonti vicini.
    months = sorted({today.strftime("%Y-%m"),
                     (today.replace(day=1) + datetime.timedelta(days=32)).strftime("%Y-%m")})

    cache = {}
    for path in (DATA_FILE, WEEKEND_FILE):
        annotate(path, iata_map, months, cache, today)
    print(f"Totale rotte interrogate: {len(cache)}.", file=sys.stderr)


if __name__ == "__main__":
    main()
