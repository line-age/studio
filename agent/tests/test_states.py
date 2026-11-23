import json

import pytest

import states

CASES = json.loads((states.DATA.parent / "states-cases.json").read_text())["cases"]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_a_line_is_in_the_states_studio_puts_it_in(case):
    lines = [[tuple(p) for p in line] for line in case["lines"]]
    assert states.states_of(lines) == case["states"]
