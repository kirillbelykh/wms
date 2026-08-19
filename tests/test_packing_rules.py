from __future__ import annotations

import pytest

from backend.app.schemas.warehouse import ItemCreate
from backend.app.services.item import create_item

pytestmark = pytest.mark.asyncio


async def test_item_creation_applies_default_pairs_per_box_by_title_prefix(db_session):
    sterile_latex = await create_item(
        db_session,
        ItemCreate(
            title="стер латекс M",
            name="Стерильные латексные M",
            product_type="gloves",
            size="M",
            color="natural",
        ),
    )
    nitrile_diag = await create_item(
        db_session,
        ItemCreate(
            title="нитрил диаг длинные",
            name="Нитрил диаг длинные",
            product_type="gloves",
            size="L",
            color="blue",
        ),
    )

    assert sterile_latex.max_pairs_per_box == 125
    assert nitrile_diag.max_pairs_per_box == 500
