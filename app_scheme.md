WMS Grundlage — Mind‑Map и архитектурный план (FastAPI Blueprint)

Цель: сформировать единую карту домена и поэтапный план реализации WMS на FastAPI. Уровни: Доменные сущности → Документы/процессы → Состояния → Данные/БД → API → Интеграции → Печать/ШК → Безопасность → План релизов.

⸻

0) Глоссарий (коротко)
	•	SKU/Номенклатура — карточка товара.
	•	Партия (Lot/Batch) — группа товара с едиными атрибутами (дата, срок, поставка).
	•	HU/Носитель — маркируемая единица хранения/перемещения (палета, короб).
	•	Адрес хранения — код ячейки Ряд-Стеллаж-Ярус-Ячейка (пример: 01-01-001).
	•	Задание — атомарная работа исполнителя в ТСД (сканируй, принеси, размести).
	•	Ордер/Заказ — бизнес-документ (приемка/отгрузка/перемещение/репак).
	•	ТСД — терминал сбора данных (сканер ШК).

⸻

1) Mind‑Map (верхнеуровневая)

WMS Grundlage
│
├── 1. Справочники (Master Data)
│   ├── Номенклатура (SKU)
│   │   ├── Материал: латекс, нитрил
│   │   ├── Тип: гинекология, хирургия, ортопедия, микрохирургия, обычные, высокая прочность
│   │   ├── Размер: XS…XL
│   │   ├── Производитель
│   │   ├── ШК (внешний/внутренний)
│   │   └── Ед.изм (шт, упак, короб)
│   ├── Упаковка (диспенсер, короб)
│   ├── Расходники (гофрокороб, бумага с брендом, паллет)
│   ├── Контрагенты: Поставщики, Клиенты
│   ├── Локации: Сайт → Ангар → Зона → Ряд/Стеллаж → Ярус → Ячейка (адрес)
│   ├── Оборудование: ТСД, Принтеры, Станок упаковки
│   └── Пользователи и Роли (Админ, Бригадир, Операторы)
│
├── 2. Документы (Orders)
│   ├── Приемка (Inbound Order)
│   ├── Отгрузка (Outbound Order)
│   ├── Перемещение (Transfer Order)
│   ├── Инвентаризация (Cycle Count/Stocktake)
│   ├── Списание/Коррекция (Adjustment)
│   ├── Резервирование (Reservation)
│   ├── Блокировка (Hold/Block)
│   └── Репаковка (Repack/Work Order)
│
├── 3. Операции/Процессы
│   ├── Приемка → маркировка → размещение (putaway)
│   ├── Репаковка: ручная (Ангар 2) и машинная (Ангар 3)
│   ├── Перемещение внутри и между ангарами
│   ├── Отбор/Комплектация → упаковка → отгрузка
│   ├── Инвентаризация по SKU/ячейке/зоне
│   ├── Резервирование под заказы
│   ├── Блокировка (QA/карантин)
│   └── Списание (порча, срок)
│
├── 4. Состояния
│   ├── Статус заказа: draft → planned → in_progress → completed → canceled
│   ├── Статус задания: queued → picked_up → done → failed → canceled
│   ├── Статус запаса: available, reserved, blocked, damaged, expired
│   └── Ячейка: free, occupied, reserved, blocked
│
├── 5. Инвентарь/Движения
│   ├── Запись остатка: SKU, партия, срок, количество, адрес, статус
│   └── Журнал движений (audit): кто/когда/что/сколько/откуда→куда
│
├── 6. Маркировка/ШК/Печать
│   ├── Этикетки для HU (палета/короб)
│   ├── Этикетки для ячеек
│   └── Правила кодирования (внутренний Code128 / EAN13)
│
├── 7. Интеграции и устройства
│   ├── ТСД API (эндпоинты для скан/подтверждения)
│   ├── Печать (RAW/IPP/print server)
│   └── Станок упаковки (сигналы/журналы, позже)
│
└── 8. Отчеты/Контроль
    ├── Остатки по адресам/партиям/зонам
    ├── Аналитика приемки/отгрузки/брака
    ├── KPI: SLA, точность инвентаря, производительность
    └── Ошибки/исключения/проверки качества


⸻

2) Карта зон/ангаров
	•	Ангар 1 — хранение готовой продукции после стерилизации (Зоны: Приемка, Хранение, Экспедиция).
	•	Ангар 2 — ручная переупаковка в диспенсеры (Зоны: Буфер сырья, Рабочие места, Готовая к упаковке).
	•	Ангар 3 — машинная упаковка в бумагу + короб (Зоны: Буфер, Линия, Готовая продукция).
	•	Склады расходников — бумага, гофрокороба, паллеты (Зоны: Расходники/Сервис).
	•	Адресация: AA-RR-YY-ЯЧ (пример: 01-03-02-015). Минимальное правило — одна ячейка = один SKU/партия.

⸻

3) Сущности (ER‑набор)

3.1 Master Data
	•	Product (SKU): id, name, material, type, size, manufacturer_id, base_uom, barcode_external?, barcode_internal?, active.
	•	Packaging: id, name, uom, capacity (шт/короб), dimensions, weight.
	•	Consumable: id, name, type (paper, corrugated, pallet), barcode?, uom.
	•	BusinessPartner: id, kind (supplier|customer), name, contacts.
	•	Site/Hangar/Zone/Rack/Level/Bin: id, code, parent_id, capacity, single_sku (bool), status.
	•	Equipment: id, type (tsd|printer|machine), code, zone_id.
	•	User/Role: id, login, role (admin|supervisor|operator), pin/credentials.

3.2 Inventory & Logistics
	•	Batch: id, product_id, lot_no, mfg_date?, exp_date?, supplier_id.
	•	HandlingUnit (HU): id, code (этикетка), product_id?, batch_id?, qty, uom, state, parent_hu_id?, current_bin_id.
	•	Stock (остатки): id, product_id, batch_id, bin_id, qty, uom, status (available|reserved|blocked|damaged|expired).
	•	Movement (журнал): id, ts, user_id, from_bin_id?, to_bin_id?, product_id, batch_id, qty, uom, ref_type/ref_id.

3.3 Documents & Tasks
	•	Order: id, number, type (inbound|outbound|transfer|repack|count|adjust|reserve|block), bp_id?, created_by, created_at, status, due_at?.
	•	OrderLine: id, order_id, product_id, qty, uom, batch_attrs (exp?), notes.
	•	Task: id, order_id, type (receive|putaway|pick|pack|move|count|repack), assignee_id?, status, priority, created_at, started_at?, finished_at?.
	•	Reservation: id, order_id, product_id, batch_id?, qty, bin_id?, status.
	•	Block: id, scope (bin|batch|product), scope_id, reason, status.
	•	CountSheet: id, zone/bin scope, status; CountLine: id, product_id, expected_qty, counted_qty.
	•	Adjustment: id, reason (damage|expiry|correction), lines (product/batch/qty).
	•	RepackOrder: id, input_sku, output_sku, bom (consumables), qty_plan, qty_done, workstation/zone.

Ключевые связи:
	•	Product 1—* Batch; Batch 1—* Stock; Bin 1—* Stock; Order 1—* OrderLine; Order 1—* Task.
	•	Stock уникально по (product_id, batch_id, bin_id, status).
	•	Один Bin хранит один (product,batch) (правило валидации).

⸻

4) Процессы (по шагам)

4.1 Приемка (Inbound)
	1.	Создание Order(type=inbound) по поставщику: позиции (SKU, qty, batch attrs?).
	2.	На воротах: скан входящих ШК → генерация HU (если нет) → печать этикеток.
	3.	Task(receive): подтверждение факта и количества по каждой строке.
	4.	Автосоздание Task(putaway): система предлагает адрес по стратегии (по зоне/емкости/один SKU).
	5.	Исполнитель размещает, сканирует ячейку → создается Stock; журнал Movement.
	6.	Закрытие заказа (полностью/частично).

4.2 Репаковка (Ангар 2,3)
	1.	RepackOrder: input_sku (bulk), output_sku (диспенсер/короб), план qty; прикрепить BOM расходников.
	2.	Резерв входных остатков (Stock → reserved).
	3.	Task(repack): списание input по факту, списание consumables, выпуск output как новые HU + Stock.
	4.	При необходимости — печать диспенсерных/коробочных этикеток.

4.3 Перемещение
	•	Transfer Order → Task(move): скан from_bin → HU/SKU → to_bin; обновление Stock/Movement.

4.4 Отбор/Отгрузка
	1.	Outbound Order (клиент, позиции).
	2.	Аллокация: резерв FEFO (раньше срок) или FIFO.
	3.	Task(pick): маршрут по адресам; скан SKU/HU/ячейка.
	4.	Task(pack): упаковка, печать отгрузочных этикеток/накладных.
	5.	Закрытие и выдача документов.

4.5 Инвентаризация
	•	CountSheet по зоне/ячейкам, Task(count) на операторов; сравнение expected vs counted; формирование Adjustment.

4.6 Резервирование/Блокировка/Списание
	•	Reservation: под заказ/репак; уменьшает available.
	•	Block: ячейка/партия/товар → недоступно для отбора.
	•	Adjustment: списание порчи/срока с журналом причин.

⸻

5) Состояния (State Machines)
	•	Order: draft → planned → in_progress → completed | canceled.
	•	Task: queued → picked_up → done | failed | canceled.
	•	Stock: available ↔ reserved; available → blocked/damaged/expired; обратимость через Adjustment.
	•	Bin: free ↔ occupied; occupied → reserved/blocked.

Правила:
	•	Закрыть Order можно, если все Task в done и расхождения обработаны (Adjustment).
	•	В ячейке допускается только один (product,batch).
	•	FEFO на отбор по exp_date, если есть; иначе FIFO по Movement.ts.

⸻

6) Модель БД (минимальный состав полей)

products(id, name, material, type, size, manufacturer_id, base_uom, barcode_ext, barcode_int, active)

batches(id, product_id FK, lot_no, exp_date, supplier_id FK)

partners(id, kind, name, contacts)

sites / hangars / zones / racks / levels / bins(id, code, parent_id, capacity, single_sku, status)

stock(id, product_id, batch_id, bin_id, qty, uom, status, UNIQUE(product_id,batch_id,bin_id,status))

hu(id, code, product_id?, batch_id?, qty, uom, state, parent_hu_id?, current_bin_id?)

orders(id, number, type, bp_id, created_by, created_at, due_at, status)

order_lines(id, order_id FK, product_id, qty, uom, exp_req?, notes)

tasks(id, order_id FK, type, assignee_id, status, priority, created_at, started_at, finished_at)

reservations(id, order_id FK, product_id, batch_id?, qty, bin_id?, status)

blocks(id, scope, scope_id, reason, status, created_by, created_at)

count_sheets(id, scope_zone_id?, scope_bin_id?, status)

count_lines(id, sheet_id FK, product_id, expected_qty, counted_qty)

adjustments(id, reason, created_by, created_at)

adjustment_lines(id, adjustment_id FK, product_id, batch_id?, qty_delta, bin_id?)

movements(id, ts, user_id, from_bin_id?, to_bin_id?, product_id, batch_id?, qty, uom, ref_type, ref_id)

Индексы: stock(product_id,batch_id,bin_id), movements(ts), orders(type,status,created_at), order_lines(order_id), tasks(order_id,status), batches(product_id,exp_date).

Нумерация: ORD-YYYY-000001, TSK-YYYY-000001, HU-YYYY-xxxxx.

⸻

7) API Blueprint (FastAPI)

7.1 Публичная структура
	•	/auth/* — логин/refresh, роли (admin/supervisor/operator).
	•	/md/* — справочники (products, partners, bins…).
	•	/orders/* — CRUD + статусы.
	•	/tasks/* — выдача и подтверждение заданий.
	•	/stock/* — остатки, движение.
	•	/labels/* — генерация шаблонов для печати.
	•	/tsd/* — облегченные эндпоинты под сканер (низкий latency, idempotency).
	•	/reports/* — отчеты/KPI.

7.2 Примеры
	•	Создать заказ на приемку: POST /orders/inbound
Body:

{
  "partner_id": 12,
  "lines": [
    {"product_id": 101, "qty": 1000, "uom": "шт", "exp_req": "2026-12-31"},
    {"product_id": 102, "qty": 500,  "uom": "шт"}
  ]
}


	•	Подтвердить строку приемки (ТСД): POST /tsd/receive/confirm

{"order_id": 2001, "product_id": 101, "qty": 200, "hu_code": "HU-2025-00012"}


	•	Разместить (putaway): POST /tsd/putaway

{"hu_code": "HU-2025-00012", "to_bin": "01-03-02-015"}


	•	Резерв под отгрузку: POST /orders/outbound/{id}/allocate

Idempotency: заголовок Idempotency-Key на ТСД‑методах.

⸻

8) Правила стратегий
	•	Putaway: по зонам + вместимости + признаку single_sku.
	•	Picking: FEFO (exp_date) → FIFO, минимизация ходов по маршруту.
	•	Валидации: ячейка не может принять второй SKU/batch; блоки/резервы учитываются.

⸻

9) Печать/ШК
	•	Внутренний стандарт: Code128 с полями: HU, SKU, Batch, Qty.
	•	Этикетка ячейки: BinCode (читаемый + ШК).
	•	Печать: очередь печати /labels/print, драйвер принтера абстрагирован адаптером.

⸻

10) Безопасность/Качество
	•	RBAC: admin/supervisor/operator с granular permissions по ресурсам.
	•	Аудит: все изменения → movements и action‑лог.
	•	Конкурентный доступ: оптимистические версии на stock, транзакции на движения.
	•	Ошибки: строгие коды бизнес‑ошибок (BIN_BLOCKED, SKU_MISMATCH, OVERPICK, EXPIRED).

⸻

11) План релизов (итерации)

M0. Скелет и базовые справочники
FastAPI проект, Alembic, SQLAlchemy, RBAC, Products/Bins/Partners CRUD, генерация номеров.

M1. Приемка v1
Inbound Order + Receive/Putaway через API, HU/Labels, Movement журнал.

M2. Остатки и адресное хранение
Просмотры по зонам/ячейкам/партиям, FEFO‑атрибуты.

M3. Перемещения
Transfer Orders + TSD move.

M4. Репаковка
RepackOrder, списание input, выпуск output, расходники/BOM.

M5. Отгрузка
Outbound Orders, резервирование, picking/packing, печать отгрузочных.

M6. Инвентаризация/Списание
CountSheet/Lines, Adjustment.

M7. Блокировки/Резервы/Качество
Block/Release, причины, отчеты по браку.

M8. TСД/UI и печать
Упрощенные эндпоинты, idempotency, драйвер печати.

M9. Отчеты/KPI
Остатки, обороты, точность, производительность.

M10. Харденинг
Тесты (Pytest), нагрузка, миграции, бэкапы, мониторинг.

⸻

12) Тест‑кейсы (минимум)
	•	Приемка частичная/избыточная, неверный SKU, просроченная партия.
	•	Putaway в занятый/заблокированный адрес — отказ.
	•	Перемещение между ангарами с сохранением партии.
	•	Отбор FEFO с конфликтом резерва.
	•	Репак: списание расходников, выпуск правильного SKU.
	•	Инвентаризация: расхождение → Adjustment.

⸻

13) Шаблоны данных (пример)
	•	Product:

{"name":"Перчатки нитрил", "material":"нитрил", "type":"хирургия", "size":"M", "manufacturer_id":3, "base_uom":"шт", "barcode_ext":"4601234567890"}


	•	Bin:

{"code":"01-03-02-015", "parent_id": 302, "capacity": 1000, "single_sku": true, "status":"free"}


	•	Inbound Order:

{
  "partner_id": 7,
  "lines": [
    {"product_id": 101, "qty": 1000, "uom":"шт", "exp_req":"2026-12-31"},
    {"product_id": 102, "qty": 500,  "uom":"шт"}
  ]
}



⸻

14) Карта зависимостей по слоям (для реализации)
	•	Domain: модели/правила/валидаторы (pydantic models, services).
	•	Persistence: SQLAlchemy ORM + Alembic, репозитории.
	•	API: роутеры по bounded contexts: md, orders, tasks, stock, tsd, labels.
	•	Integration: адаптер печати, абстракция ТСД.
	•	Security: JWT + RBAC.
	•	Observability: логирование, аудит, метрики.

⸻

15) Что зашить в первую реализацию (минимум для рабочей приёмки)
	•	Справочники: Product, Partner, Bin.
	•	Order/OrderLine (inbound), Task(receive, putaway).
	•	Stock/Movement, Batch (exp_date опционально).
	•	Правило «один SKU/партия на ячейку», FEFO на отбор.
	•	Печать HU/ячейка (заглушка принтера — PDF/RAW).
	•	Ролевой доступ: только operator может подтверждать задания.

С этой картой можно идти по Milestones и выпускать функционал инкрементально без переделок модели.