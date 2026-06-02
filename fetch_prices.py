#!/usr/bin/env python3
"""
Daycation Bologna - Prezzi A/R via Travelpayouts (Aviasales Data API)

Gira DOPO parse_blq.py: legge data.json, per ogni città daycation chiede il
prezzo più basso andata+ritorno DIRETTO da BLQ (dalla cache Aviasales) e lo
salva in data.json sotto meta.prices, indicizzato per codice IATA.

Fail-soft per design:
  - senza TRAVELPAYOUTS_TOKEN esce subito senza toccare data.json;
  - un errore sul singolo volo non blocca gli altri né la pipeline.

La doc Travelpayouts dice esplicitamente che questi prezzi vengono dalla cache
(ricerche reali delle ultime 48h) e sono pensati per generare pagine statiche:
è esattamente l'uso qui (snapshot notturno nel JSON).
"""
import os, re, sys, json, time, datetime, pathlib, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).parent
DATA_FILE = ROOT / "data.json"
INDEX_FILE = ROOT / "index.html"
API = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"

TOKEN = os.environ.get("TRAVELPAYOUTS_TOKEN", "").strip()
MARKER = os.environ.get("TRAVELPAYOUTS_MARKER", "").strip()


def city_to_iata():
    """Estrae la mappa città→IATA da CITY_INFO in index.html (unica fonte)."""
    html = INDEX_FILE.read_text(encoding="utf-8")
    return {c: iata for c, iata in re.findall(r"'([^']+)':\{iata:'([A-Z]{0,3})'", html)}


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


def main():
    if not TOKEN:
        print("TRAVELPAYOUTS_TOKEN assente: salto i prezzi (data.json invariato).",
              file=sys.stderr)
        return

    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    iata_map = city_to_iata()
    cities = data.get("meta", {}).get("cities", [])

    # Cerco nei prossimi 2 mesi e tengo il più basso: la cache è più ricca su orizzonti vicini.
    today = datetime.date.today()
    months = sorted({today.strftime("%Y-%m"),
                     (today.replace(day=1) + datetime.timedelta(days=32)).strftime("%Y-%m")})

    prices, ok, miss = {}, 0, 0
    for city in cities:
        iata = iata_map.get(city)
        if not iata:
            continue
        best = None
        for m in months:
            try:
                p = cheapest_roundtrip(iata, m)
            except Exception as e:
                print(f"   {city} ({iata}) {m}: errore {e}", file=sys.stderr)
                continue
            if p and (best is None or p["eur"] < best["eur"]):
                best = p
            time.sleep(0.15)  # gentile con l'API
        if best:
            best["upd"] = today.isoformat()
            prices[iata] = best
            ok += 1
        else:
            miss += 1

    data.setdefault("meta", {})["prices"] = prices
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                         encoding="utf-8")
    print(f"Prezzi: {ok} trovati, {miss} senza dati in cache.", file=sys.stderr)


if __name__ == "__main__":
    main()
