В текущем состоянии (коммит 5e6b868d9aca657af67bb4b92e5e2519224bcbf1) "works good. working on items"
для всей номенклатуры используется одна модель - Item. 
Для нее прописаны API-эндпоинты, валидация, а так же весь фронт, привязанный к базовым шаблонам. 
Разделение шло по параметру Item - item_type, то есть через модель ItemType.

Предлагаю разделение на 3 вида номенклатуры:
 - Сырье
 - Готовая продукция
 - Расходные материалы

 Это предполагает: 
  - удаление модели Item
  - удаление модели ItemType
  - удаление всех связей с другими моделями
  - удаление эндпоинтов api/catalogs/items.py
  - удаление связей с другими эндпоинтами и апгрейд их кода
  - удаление схем валидации для Item
  - удаление шаблонов templates/catalogs/items
  - изменение базовых шаблонов

Создание:
 - Моделей Supply, Production, Consumable
 - Связей с другими моделями
 - API-эндпоинтов для каждой модели и связей с другими эндпоинтами
 - Схем валидации 
 - Шаблонов catalogs/supplies, catalogs/productions, catalogs/consumables
 - Связей с базовым шаблоном

Текущие действия:
1. Удалены файлы:
 - app/models/item.py, app/models/item_type.py
 - app/api/catalogs/items.py, app/api/catalogs/item_types.py
 - app/schemas/items.py
 - app/templates/catalogs/items/create.html, list.html, form.html, edit.html, index.html

2. Требуется изменение кода: 
 - все связанные модели
 - все связанные эндпоинты
 - templates/catalogs/catalogs.html

3. Требуется создание
 - app/models/supply.py - создан
 - app/models/production.py - создан 
 - app/models/consumable.py - создан 
 - app/api/catalogs/supplies.py - создан 
 - app/api/catalogs/productions.py - создан 
 - app/api/catalogs/consumables.py - создан
 - app/schemas/supply.py
 - app/schemas/production.py
 - app/schemas/consumable.py
 - app/templates/catalogs/supply - list.html, create.html, edit.html, form.html
 - app/templates/catalogs/production - list.html, create.html, edit.html, form.html
 - app/templates/catalogs/consumables - list.html, create.html, edit.html, form.html

4. Так же обязательно скорректировать связи в моделях, эндпоинтах и шаблонах. 

Вот подробная карта проекта: 
❯ ls
__pycache__          app                  poetry.lock
alembic              app_scheme.md        pyproject.toml
alembic.ini          change app_scheme.md
API_ENDPOINTS.MD     main.py
❯ cd app
❯ ls
api       database  models    schemas   static    templates
❯ cd api
❯ ls
__init__.py __pycache__ catalogs    operations  tsd
❯ cd catalogs
❯ ls
__pycache__      catalogs.py      manufacturers.py units.py
barcodes.py      cells.py         materials.py
batches.py       inventory.py     sizes.py
❯ cd ..
❯ cd ..
❯ ls
api       database  models    schemas   static    templates
❯ cd models
❯ ls
__init__.py     barcode.py      cells.py        materials.py    sizes.py
__pycache__     batches.py      manufacturer.py receivings.py   units.py
❯ cd ..
❯ ls
api       database  models    schemas   static    templates
❯ cd schemas
❯ ls
__pycache__   batches.py    cells.py      orders.py     receivings.py
❯ cd ..
❯ ls
api       database  models    schemas   static    templates
❯ cd templates
❯ ls
catalogs   index.html orders     receivings scan
❯ cd catalogs
❯ ls
barcodes      cells         manufacturers suppliers
batches       inventory     materials     units
catalogs.html item_types    sizes
~/desktop/в/wms/ap/t/catalogs main !12 ❯

