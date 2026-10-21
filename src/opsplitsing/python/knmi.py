"""KNMI EDR-client volgens de officiële documentatie en OpenAPI-specificatie.

Live gegevens zijn met een geregistreerde EDR-sleutel gevalideerd.
API-sleutels worden uitsluitend naar de vaste KNMI-host gestuurd.
"""

import argparse
import hashlib
import json
import os
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .profile import day_minutes

COLLECTION = "10-minute-in-situ-meteorological-observations"
BASE_URL = f"https://api.dataplatform.knmi.nl/edr/v1/collections/{COLLECTION}"


class KNMIError(RuntimeError):
    pass


def load_env_file(path: Path) -> None:
    """Lees eenvoudige KEY=waarde-regels uit een lokaal, door Git genegeerd bestand.

    Bestaande omgevingsvariabelen gaan voor; het bestand vult alleen aan.
    """
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Voorkom dat een Authorization-header naar een andere host gaat.
        return None


def day_query(day: date) -> dict[str, str]:
    """Neem omringende metingen mee voor interpolatie aan de daggrenzen.

    KNMI-tijdstempels zijn het einde van het meetinterval. Ze worden hier niet
    hernoemd naar intervalbegin; die interpretatie hoort bij de modelverwerking.
    """
    minutes = day_minutes(day)
    start = minutes[0] - timedelta(minutes=10)
    end = minutes[-1] + timedelta(minutes=11)
    stamp = lambda dt: dt.isoformat().replace("+00:00", "Z")
    return {"datetime": f"{stamp(start)}/{stamp(end)}", "parameter-name": "ff,dd"}


class KNMIClient:
    def __init__(self, cache_dir: Path | None = None):
        self.key = os.environ.get("KNMI_EDR_API_KEY", "").strip()
        if not self.key:
            raise KNMIError("KNMI_EDR_API_KEY ontbreekt. Voeg een EDR API-sleutel toe in de beveiligde omgevingsinstellingen.")
        self.cache_dir = cache_dir
        self.opener = build_opener(NoRedirects())

    def _get(self, path: str = "", params: dict[str, str] | None = None, cacheable: bool = True) -> dict:
        url = BASE_URL + path
        if params:
            url += "?" + urlencode(params)
        cache = None
        if self.cache_dir is not None and cacheable:
            cache = self.cache_dir / (hashlib.sha256(url.encode()).hexdigest() + ".json")
            if cache.exists():
                return json.loads(cache.read_text())
        request = Request(url, headers={"Authorization": self.key, "Accept": "application/json"})
        try:
            with self.opener.open(request, timeout=45) as response:
                data = json.load(response)
        except HTTPError as exc:
            messages = {
                401: "KNMI weigert de sleutel: controleer de EDR API-binding.",
                403: "Geen toegang tot KNMI EDR: controleer API-rechten en netwerktoegang.",
                429: "KNMI-aanvraaglimiet bereikt; probeer later opnieuw.",
            }
            raise KNMIError(messages.get(exc.code, f"KNMI geeft HTTP {exc.code}.")) from None
        except (URLError, TimeoutError):
            raise KNMIError("KNMI is niet bereikbaar; controleer netwerktoegang.") from None
        except (ValueError, UnicodeError):
            raise KNMIError("KNMI heeft geen geldig JSON-antwoord geleverd.") from None
        if not isinstance(data, dict):
            raise KNMIError("Onverwacht KNMI-antwoord; een JSON-object was vereist.")
        if cache is not None:
            cache.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=cache.parent, delete=False) as file:
                json.dump(data, file)
                temporary = Path(file.name)
            temporary.replace(cache)
        return data

    def metadata(self) -> dict:
        return self._get()

    def locations(self) -> dict:
        return self._get("/locations")

    def observations(self, station_id: str, day: date) -> dict:
        if not station_id:
            raise ValueError("Een geverifieerd KNMI-station-ID is vereist.")
        query = day_query(day)
        end = datetime.fromisoformat(query["datetime"].split("/")[1].replace("Z", "+00:00"))
        # Recente dagen kunnen nog metingen bijkrijgen; pas na een dag vast in de cache.
        final = end < datetime.now(timezone.utc) - timedelta(days=1)
        return self._get("/locations/" + quote(station_id, safe=""), query, cacheable=final)

    def observations_range(self, station_id: str, start: datetime, end: datetime) -> dict:
        """Tienminutenwaarden over een willekeurige afgesloten periode, bijvoorbeeld een heel jaar."""
        if not station_id:
            raise ValueError("Een geverifieerd KNMI-station-ID is vereist.")
        if end > datetime.now(timezone.utc) - timedelta(days=1):
            raise ValueError("Alleen afgesloten perioden; recente metingen kunnen nog veranderen.")
        stamp = lambda dt: dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        query = {"datetime": f"{stamp(start)}/{stamp(end)}", "parameter-name": "ff,dd"}
        return self._get("/locations/" + quote(station_id, safe=""), query)


def main() -> int:
    parser = argparse.ArgumentParser(description="Controleer KNMI EDR-toegang zonder sleutels te tonen.")
    parser.parse_args()
    load_env_file(Path(__file__).resolve().parent.parent / ".env")
    try:
        client = KNMIClient()
        metadata = client.metadata()
        locations = client.locations()
        print(json.dumps({"collection": metadata.get("id"), "extent": metadata.get("extent"),
                          "parameters": list(metadata.get("parameter_names", {})),
                          "station_count": len(locations.get("features", []))}, indent=2))
        return 0
    except KNMIError as exc:
        print(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
