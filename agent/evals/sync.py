"""Put the cases into the LangSmith dataset `studio-agent-cases`.

Each case keeps one example id for good, so syncing again updates and never copies. An
example holds only the case's id and its question in words: the world it runs on is made
on this side, from the generator.
"""

from typing import Any

from evals.cases import load

DATASET = "studio-agent-cases"


def _example(case) -> dict[str, Any]:
    return {
        "id": case.example_id,
        "inputs": {"case": case.id, "words": case.question["words"], "world": case.world},
        "outputs": {"must": case.must, "must_not": case.must_not},
        "metadata": {"behaviour": case.behaviour, "labeled_by": case.labeled_by, "note": case.note},
        "split": [case.split, case.behaviour],
    }


def sync(client) -> int:
    if not client.has_dataset(dataset_name=DATASET):
        client.create_dataset(
            DATASET, description="Use cases for the Studio Agent. Invented data only."
        )
    dataset = client.read_dataset(dataset_name=DATASET)
    have = {str(e.id) for e in client.list_examples(dataset_id=dataset.id)}
    cases = load()
    new = [_example(c) for c in cases if c.example_id not in have]
    old = [_example(c) for c in cases if c.example_id in have]
    if new:
        client.create_examples(dataset_id=dataset.id, examples=new)
    if old:
        client.update_examples(dataset_id=dataset.id, updates=old)
    return len(cases)


if __name__ == "__main__":
    from pathlib import Path

    from dotenv import load_dotenv
    from langsmith import Client

    load_dotenv(Path(__file__).parent.parent / ".env")
    print(f"{sync(Client())} cases in {DATASET}")
