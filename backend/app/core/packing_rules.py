from __future__ import annotations

import re


def normalize_item_title(title: str) -> str:
    cleaned = re.sub(r"\s+", " ", title.strip().lower())
    return cleaned.replace("ё", "е")


DEFAULT_PAIRS_PER_BOX: dict[str, int] = {
    normalize_item_title("двойная пара"): 50,
    normalize_item_title("микрохирургия"): 50,
    normalize_item_title("ортопедия"): 50,
    normalize_item_title("ультра"): 100,
    normalize_item_title("гинекология"): 50,
    normalize_item_title("хир с полимерным"): 100,
    normalize_item_title("хир"): 100,
    normalize_item_title("хир-2-хлор"): 100,
    normalize_item_title("хир-1-хлор"): 100,
    normalize_item_title("хир изопрен"): 100,
    normalize_item_title("хир нитрил"): 100,
    normalize_item_title("латекс анатом"): 500,
    normalize_item_title("латекс hr"): 250,
    normalize_item_title("латекс 2-хлор"): 500,
    normalize_item_title("латекс 1-хлор"): 500,
    normalize_item_title("латекс гладкие"): 500,
    normalize_item_title("латекс с полимер"): 500,
    normalize_item_title("латекс удлин"): 250,
    normalize_item_title("латекс диаг"): 500,
    normalize_item_title("стер латекс 1-хлор"): 125,
    normalize_item_title("стер латекс 2-хлор"): 125,
    normalize_item_title("стер латекс"): 125,
    normalize_item_title("стер нитрил"): 125,
    normalize_item_title("нитрил hr короткий"): 250,
    normalize_item_title("нитрил hr удлин"): 250,
    normalize_item_title("нитрил диаг"): 500,
}

ORDERED_RULE_PREFIXES: tuple[str, ...] = tuple(
    sorted(DEFAULT_PAIRS_PER_BOX, key=len, reverse=True)
)


def resolve_pairs_per_box(item_title: str, fallback: int | None = None) -> int:
    normalized_title = normalize_item_title(item_title)
    if normalized_title in DEFAULT_PAIRS_PER_BOX:
        return DEFAULT_PAIRS_PER_BOX[normalized_title]

    for prefix in ORDERED_RULE_PREFIXES:
        if normalized_title.startswith(prefix):
            return DEFAULT_PAIRS_PER_BOX[prefix]

    return fallback or 100
