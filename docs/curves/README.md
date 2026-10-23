# SWT-DD-130: gedigitaliseerde vermogenscurve

[`fryslan-swt-dd-130-4.3-107db.json`](fryslan-swt-dd-130-4.3-107db.json)
is geactiveerd als standaard en past bij het bestaande uploadformaat van `windprofiel.application.validate_curve`.
[`fryslan-swt-dd-130-4.3-107db.csv`](fryslan-swt-dd-130-4.3-107db.csv)
bevat dezelfde 29 punten voor gebruik in spreadsheets of andere modellen:
`wind_speed_ms,power_kw`. De vermogens gelden voor **één turbine**; de app
vermenigvuldigt voor Fryslân met 89 en rekent kW om naar MW.

## Bron en variant

- Siemens Gamesa, *Onshore*, 2023, **pdf-pagina 39**.
- [Bron-pdf](https://www.windindustrie-in-deutschland.de/f/4104/0/643d565004491b4732569ca3/GeneralpresentationOnshoreDE1.pdf#page=39).
- Exacte lijn: **SWT-DD-130 @ 4.3; 107 dB**. De andere twee lijnen zijn niet gebruikt.
- Vermogen 4.300 kW; rotor 130 m. Referentieluchtdichtheid is niet vermeld.
- SHA-256 van de gebruikte pdf:
  `1cdea27db383169d5525f5cc2f30f713c46574160cd65b97f8361a3dcd6c0d33`.

Siemens Gamesa noemt de 4,3 MW/130 m-turbines van Fryslân
[SWT-DD-130](https://www.siemensgamesa.com/global/en/home/press-releases/Van-Oord-preferred-contractor-030817.html).
De curvepagina beschrijft echter een Japan/IEC IB-uitvoering. Gelijke modelnaam
bevestigt geen identieke bedrijfsinstelling voor Fryslân. Dit is een
gedigitaliseerde presentatiegrafiek, geen gecertificeerde tabel of bevestigde
projectspecifieke curve.

## Omzetting

De punten komen rechtstreeks uit de vectorlijn in de pdf, uitgelezen met PyMuPDF.
Er is geen kubische curve gefit. De gebruikte lijn bestaat uit 28 rechte segmenten
met 29 hoekpunten; de kleur is RGB `(0.196, 0.0941, 0.314)`.
In pdf-coördinaten, met de oorsprong linksboven:

- `v = (x - 307.44000244) × 28 / (500.64001465 - 307.44000244)`.
- `P = (210.72000122 - y) × 4300 / (210.72000122 - 127.92001343)`.

De x-ankers zijn 0 en 28 m/s, de y-ankers het nulsegment en het nominale plateau
van 4.300 kW. De assenlabels zijn visueel gecontroleerd. Snelheden zijn afgerond
op hele m/s (grootste verschil met de berekende x-coördinaat < 0,03 m/s),
vermogens op 10 kW. Die afronding geeft geen nauwkeurigheidsgarantie: de bron is
een kleine presentatiegrafiek. `windprofiel` interpoleert lineair tussen de punten.
De vermogensafname van circa 23 tot 28 m/s is behouden; bijvoorbeeld 2.930 kW
bij 25 m/s en 860 kW bij 28 m/s. Het laatste punt is geen nulvermogen.

## Bereikgrens in het importbestand

De bron toont **0–28 m/s** en geeft geen definitieve uitschakelsnelheid. De app
vereist wel een eindige `cut_out` boven het laatste punt en geeft vanaf die grens
nul. Daarom bevat het JSON-bestand **`cut_out: 28.01`**: een technische
bereikgrens, geen bevestigde turbinespecificatie. Tussen 28 en 28,01 m/s houdt
de bestaande interpolator het laatste vermogen vast; vanaf 28,01 m/s geeft hij
nul. De werkelijke turbine kan zich daar anders gedragen. De bron bevestigt ook
geen hysterese, herstartgedrag of projectspecifieke stormregeling.

Deze aanname staat in `status`, zodat zij na upload in de curvemetadata zichtbaar
blijft. Het extra object `provenance` bewaart de omzetting en broncontrole in het
bestand; de bestaande validator neemt alleen de ondersteunde velden over.

## Gebruiken in windprofiel

Start `python3 -m windprofiel.server --port 8000` vanuit de hoofdmap. Kies onder
**Meetstations en vermogenscurves** bij Fryslân het JSON-bestand en upload het.
Hetzelfde kan via de bestaande API:

```sh
curl --fail-with-body \
  -H 'Content-Type: application/json' \
  --data-binary @docs/curves/fryslan-swt-dd-130-4.3-107db.json \
  http://127.0.0.1:8000/api/curves/fryslan
```

De standaardcurve staat in `windprofiel/data/fryslan.json` en identiek in
`src/opsplitsing/python/data/fryslan.json` voor de website en browser-Python.
Een upload naar `.cache/curves/fryslan.json` heeft nog steeds voorrang op de lokale
standaard. De JSON en CSV in deze map bewaren dezelfde bronpunten.

De begrensde JavaScript-berekening leest dit JSON-bestand rechtstreeks en houdt de
laatste 860 kW vast van 28 tot 28,01 m/s. Een eigen lagere bereikgrens stopt het
model eerder; een hogere grens verlengt het bronbereik niet. De aparte instelling
voor nominaal vermogen schaalt alle vermogens evenredig. Start- en nominale wind
blijven instellingen voor het afzonderlijke theoretische kubische scenario. De
parkpagina opent standaard met de turbinecurve; onbegrensd theoretisch potentieel
is apart aan te zetten.

De windjaren 2022–2025 voor de waterstofberekeningen zijn opnieuw doorgerekend met
de opgeslagen windsnelheden en dezelfde WINS50-hoogtevertaling, stations,
tijdstempels en aandelen. `scripts/update-turbine-supplies.py` herhaalt dit zonder
netwerkverkeer. Modelversie 12 voorkomt hergebruik van eerdere berekeningscaches.
De bestaande numerieke vergelijkingen in `docs/vergelijking.md` zijn historische
resultaten met de vorige curve, geen nieuwe validatie van deze grafiek.
