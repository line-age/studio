"""Towns along a traced line (places.py), on invented places."""

from src.worked_out import places
from src.worked_out.places import Place

# A line running east for about 90 km along latitude 35.
LINE = [[(-97.0, 35.0), (-96.0, 35.0)]]


def town(name, lon, lat, sq_mi=1.0):
    return Place(name, "XX", lat, lon, sq_mi)


def test_the_towns_at_its_ends_and_the_largest_it_passes_in_order():
    found = places.towns_along(
        LINE,
        (
            town("Eastend", -96.01, 35.01),
            town("Westend", -96.99, 35.0),
            town("Bigmiddle", -96.5, 35.02, sq_mi=30),
            town("Smallmiddle", -96.4, 35.01, sq_mi=0.5),
            town("Faraway", -96.5, 35.5, sq_mi=500),
        ),
    )
    assert found[0] == "Westend" and found[-1] == "Eastend"
    assert "Bigmiddle" in found and "Faraway" not in found
    assert len(found) <= places.MAX_TOWNS


def test_a_city_a_little_off_an_end_beats_a_hamlet_beside_it(monkeypatch):
    # Room for the ends only: which town stands for the west end.
    monkeypatch.setattr(places, "MAX_TOWNS", 1)
    found = places.towns_along(
        LINE,
        (town("Hamlet", -97.0, 35.005, sq_mi=0.3), town("City", -97.05, 35.02, sq_mi=150)),
    )
    assert found == ["City"]


def test_no_town_near_it_gives_none():
    assert places.towns_along(LINE, (town("Faraway", -90.0, 40.0),)) == []
    assert places.towns_along([], ()) == []


def test_the_census_places_load_without_their_legal_suffix():
    loaded = {(p.name, p.state) for p in places.all_places()}
    assert ("Tulsa", "OK") in loaded and ("Tulsa city", "OK") not in loaded


def test_every_town_name_reads_as_written():
    from src.worked_out.places import all_places

    names = [p.name for p in all_places()]
    assert "Cañon City" in names
    assert not [n for n in names if "Ã" in n or "Â" in n]
