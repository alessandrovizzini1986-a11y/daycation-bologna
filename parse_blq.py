#!/usr/bin/env python3
"""
Daycation Bologna - Parser orari ufficiali BLQ
Scarica il PDF corrente da bologna-airport.it, parsa partenze + arrivi,
e genera /public/data.json pronto per l'app.

Uso: python3 parse_blq.py
"""
import re, json, sys, os, subprocess, urllib.request, datetime, pathlib

# ─────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────
BASE_URL = "https://www.bologna-airport.it/System/pdf"
OUTPUT_DIR = pathlib.Path(__file__).parent / "public"
OUTPUT_FILE = OUTPUT_DIR / "data.json"
TMP_PDF = "/tmp/blq_current.pdf"
TMP_TXT = "/tmp/blq_current.txt"


def detect_current_season():
    """Determina la stagione IATA corrente.
    Estate: ultima domenica di marzo → ultima domenica di ottobre.
    Inverno: il resto.
    """
    today = datetime.date.today()
    year = today.year
    # ultima domenica di marzo
    last_sun_mar = max(d for d in (datetime.date(year, 3, day) for day in range(25, 32))
                       if d.weekday() == 6)
    # ultima domenica di ottobre
    last_sun_oct = max(d for d in (datetime.date(year, 10, day) for day in range(25, 32))
                       if d.weekday() == 6)

    if last_sun_mar <= today < last_sun_oct:
        return f"summer_{year}"
    elif today < last_sun_mar:
        return f"winter_{year-1}_{year}"
    else:
        return f"winter_{year}_{year+1}"


def download_pdf(season):
    """Prova a scaricare il PDF per la stagione data.
    Ritorna True se ok, False altrimenti."""
    url = f"{BASE_URL}/orario_voli_{season}.pdf"
    print(f"📥 Download {url}", file=sys.stderr)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (daycation-bologna parser)"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        with open(TMP_PDF, "wb") as f:
            f.write(data)
        print(f"   OK - {len(data)} bytes", file=sys.stderr)
        return True
    except Exception as e:
        print(f"   FAIL - {e}", file=sys.stderr)
        return False


def pdf_to_text():
    """Estrae testo dal PDF preservando il layout tabellare."""
    result = subprocess.run(
        ["pdftotext", "-layout", TMP_PDF, TMP_TXT],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"pdftotext failed: {result.stderr}")


# ─────────────────────────────────────────────────────────────────────
# REGEX (riusate dal parser validato sul PDF Estate 2026)
# ─────────────────────────────────────────────────────────────────────
RE_FLIGHT = re.compile(
    r'^\s{0,40}'
    r'(?P<dest>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\u2019\'\.\- ]{1,40}?)\s{2,}'
    r'(?P<airline>[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\.\- ]{1,30}?)\s{2,}'
    r'(?P<fno>[A-Z0-9]{1,4}\s?\d{1,5})\s+'
    r'(?P<dep>\d{2}:\d{2})\s+'
    r'(?P<arr>\d{2}:\d{2}\*?)\s+'
    r'(?P<freq>[1-7\-]{7})'
    r'(?:\s+(?P<val>\d{2}/\d{2}/\d{4}\s*-\s*\d{2}/\d{2}/\d{4}))?'
    r'.*$'
)
RE_VAL = re.compile(r'^\s*(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})\s*[\u2022•]?\s*$')


def parse_freq(s):
    return [i+1 for i, c in enumerate(s) if c != '-']


def freq_bitmap(freq_list):
    return sum(1 << (d-1) for d in freq_list)


def vstr_compact(a, b):
    """'09/04/2026' '31/08/2026' -> ['0409','0831']"""
    da, ma, ya = a.split('/')
    db, mb, yb = b.split('/')
    return [ma+da, mb+db]


def find_departures_arrivals_split(lines):
    """Trova l'indice di riga dove inizia la sezione Arrivi."""
    for i, ln in enumerate(lines):
        if 'Arrivi voli di linea' in ln or 'Flight arrivals' in ln:
            return i
    # fallback: cerca header "Da" (origine)
    for i, ln in enumerate(lines):
        if re.match(r'^\s+Da\s+Compagnia', ln):
            return i
    return None


def parse_section(lines):
    """Parsa una sezione (partenze o arrivi) e ritorna lista di voli."""
    types, payloads = [], []
    for ln in lines:
        if ':' in ln and re.search(r'\d{2}:\d{2}', ln):
            m = RE_FLIGHT.match(ln)
            if m:
                d = m.groupdict()
                d['arr'] = d['arr'].replace('*', '').strip()
                types.append('F')
                payloads.append(d)
                continue
        m = RE_VAL.match(ln)
        if m:
            types.append('V')
            payloads.append([m.group(1), m.group(2)])
            continue
        types.append(None)
        payloads.append(None)

    F_idx = [i for i, t in enumerate(types) if t == 'F']
    F_pos = {x: i for i, x in enumerate(F_idx)}
    flight_vals = [[] for _ in F_idx]

    # Validità orfane assegnate al volo precedente (regola del PDF BLQ)
    last_F = None
    for i, t in enumerate(types):
        if t == 'F':
            last_F = i
        elif t == 'V':
            if last_F is not None:
                flight_vals[F_pos[last_F]].append(payloads[i])
            else:
                # validità prima del primo volo: assegna al successivo
                for j in range(i+1, len(types)):
                    if types[j] == 'F':
                        flight_vals[F_pos[j]].append(payloads[i])
                        break

    flights = []
    for fi, F_raw in enumerate(F_idx):
        d = payloads[F_raw]
        vals = []
        if d.get('val'):
            m = re.match(r'(\d{2}/\d{2}/\d{4})\s*-\s*(\d{2}/\d{2}/\d{4})', d['val'])
            if m:
                vals.append(vstr_compact(m.group(1), m.group(2)))
        for vp in flight_vals[fi]:
            vals.append(vstr_compact(vp[0], vp[1]))
        if not vals:
            continue
        flights.append({
            "city": re.sub(r'\s+', ' ', d['dest']).strip(),
            "airline": re.sub(r'\s+', ' ', d['airline']).strip(),
            "flightNo": re.sub(r'\s+', ' ', d['fno']).strip().replace(' ', ''),
            "dep": d['dep'],
            "arr": d['arr'],
            "freq": parse_freq(d['freq']),
            "val": vals,
        })
    return flights


def main():
    season = detect_current_season()
    print(f"📅 Stagione corrente: {season}", file=sys.stderr)

    if not download_pdf(season):
        # fallback: prova stagione prossima/precedente
        print("Tentativo fallback su altre stagioni...", file=sys.stderr)
        for fallback in [f"summer_{datetime.date.today().year}",
                          f"winter_{datetime.date.today().year-1}_{datetime.date.today().year}"]:
            if fallback != season and download_pdf(fallback):
                season = fallback
                break
        else:
            print("❌ Impossibile scaricare PDF da BLQ", file=sys.stderr)
            sys.exit(1)

    pdf_to_text()
    lines = open(TMP_TXT).readlines()
    split_idx = find_departures_arrivals_split(lines)
    if not split_idx:
        print("❌ Impossibile trovare divisione partenze/arrivi", file=sys.stderr)
        sys.exit(1)

    print(f"   Split a riga {split_idx}", file=sys.stderr)
    deps = parse_section(lines[:split_idx])
    arrs = parse_section(lines[split_idx:])
    print(f"   Partenze: {len(deps)} | Arrivi: {len(arrs)}", file=sys.stderr)

    # ─── FILTRO daycation-utile ───
    # Partenze utili: parte tra 04:00 e 14:00 (per arrivare a destinazione entro il primo pomeriggio)
    # Arrivi utili: arrivano a BLQ tra 16:00 e 23:59 (sera, ritorno serale)
    deps_dc = [v for v in deps if '04:00' <= v['dep'] <= '14:00']
    arrs_dc = [v for v in arrs if v['arr'] >= '16:00']

    # Tieni solo città con sia andata sia ritorno utili
    cities_with_both = set(v['city'] for v in deps_dc) & set(v['city'] for v in arrs_dc)
    deps_dc = [v for v in deps_dc if v['city'] in cities_with_both]
    arrs_dc = [v for v in arrs_dc if v['city'] in cities_with_both]
    print(f"   Daycation-utili: {len(deps_dc)} dep + {len(arrs_dc)} arr | Città: {len(cities_with_both)}", file=sys.stderr)

    # ─── Formato compatto array ───
    def compact(v):
        return [v['city'], v['flightNo'], v['dep'], v['arr'],
                freq_bitmap(v['freq']), v['val']]

    output = {
        "meta": {
            "source": "Aeroporto G. Marconi Bologna (BLQ)",
            "season": season,
            "url": f"{BASE_URL}/orario_voli_{season}.pdf",
            "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "deps_total": len(deps),
            "arrs_total": len(arrs),
            "deps_daycation": len(deps_dc),
            "arrs_daycation": len(arrs_dc),
            "cities": sorted(cities_with_both),
        },
        "d": [compact(v) for v in deps_dc],
        "a": [compact(v) for v in arrs_dc],
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, ensure_ascii=False, separators=(',', ':'))
    print(f"✅ Scritto {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE)} bytes)", file=sys.stderr)


if __name__ == '__main__':
    main()
