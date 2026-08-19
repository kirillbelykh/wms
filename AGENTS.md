# AGENTS

## Карта проекта (быстрый ориентир)

Читай этот блок первым. Полные файлы открывай только по ссылке из карты.

### Корень

| Путь | Зачем |
|---|---|
| `frontend/` | React + Vite + Tailwind 4 + HeroUI toasts |
| `backend/app/` | FastAPI: `api` → `services` → `repositories`/`models` + `schemas` |
| `tests/` | pytest (sqlite in-memory) |
| `migrations/` | Alembic (прод в основном на Postgres) |
| `.codex/skills/` | Локальные skill'ы: ui-style, react-patterns, wms-domain, … |
| `.env` | Локальный dev (gitignored). Для UI без Docker: sqlite + `REDIS_DISABLED=true` |

### Frontend: куда смотреть

| Задача | Файлы |
|---|---|
| Роуты | `frontend/src/App.tsx` |
| Шелл / сайдбар / права меню | `frontend/src/components/layout/AppLayout.tsx` |
| HTTP API | `frontend/src/api/client.ts` |
| Типы API | `frontend/src/types/wms.ts` |
| Toast (HeroUI Alert) | `frontend/src/lib/toast.ts`, `frontend/src/components/ui/AppToaster.tsx` |
| Date picker (HeroUI) | `frontend/src/components/ui/date-picker.tsx` (`DateInput`, value = `YYYY-MM-DD`) |
| Slider (HeroUI) | `frontend/src/components/ui/slider.tsx` |
| Select (HeroUI) | `frontend/src/components/ui/select.tsx` (`SelectNative`, children = `<option>` / `<optgroup>`) |
| Search (HeroUI SearchField) | `frontend/src/components/ui/search-input.tsx` |
| UI-примитивы | `frontend/src/components/ui/*` (`button`, `card` → HeroUI Card, `table` → HeroUI Table, `dialog`/`ConfirmDialog` → HeroUI Modal, `date-picker`, `slider`, `select`, `search-input`, …) |
| Права разделов | `frontend/src/lib/sectionAccess.ts` |
| Даты/статусы/координаты | `frontend/src/lib/utils.ts` |
| Auth / theme / picking state | `frontend/src/stores/{authStore,appStore,pickingStore}.ts` |
| WS + push toasts | `frontend/src/hooks/useRealtimeNotifications.ts` |
| Стили / токены | `frontend/src/index.css` (`--wms-*`; не конфликтовать с HeroUI `--background/--focus`) |

### Frontend: экраны → файл

| URL | Page |
|---|---|
| `/login` | `LoginPage.tsx` |
| `/warehouses` | `WarehousesPage.tsx` |
| `/items`, `/items/:id` | `ItemsPage.tsx`, `ItemDetailPage.tsx` |
| `/stocks` | `StockPage.tsx` |
| `/orders`, `/orders/:id` | `OrdersPage.tsx`, `OrderDetailPage.tsx` |
| `/picking/:orderId` | `PickingPage.tsx` (без AppLayout) |
| `/orders/:orderId/pick-operations` | `PickOperationsPage.tsx` |
| `/production`, `/production/:id`, `/production/tasks/:taskKey` | `ProductionPage.tsx`, `ProductionDetailPage.tsx`, `ProductionTaskDetailPage.tsx` |
| `/employees` | `EmployeesPage.tsx` |
| `/move` | `MovePage.tsx` |
| `/history` | `HistoryPage.tsx` |
| `/reports` | `ReportsPage.tsx` |
| `/chz` | `ChzPage.tsx` |
| `/settings` | `SettingsPage.tsx` |
| `/admin/users`, `/admin/roles` | `AdminUsersPage.tsx`, `AdminRolesPage.tsx` |
| `/marking/*` | `pages/marking/` — отдельный контур |

### Marking (отдельный контур)

- Вход: `pages/marking/MarkingPage.tsx`
- UI-язык: `marking-ui.tsx`, `components/`
- API: `pages/marking/api.ts` (+ `agentFetch.ts`), не `src/api/client.ts`
- Табы: `tabs/{Orders,Download,Intro,Labels,Aggregation,Chz,Tsd}Tab.tsx`
- Workspaces: `workspaces/*`

### Backend: куда смотреть

| Домен | api | service | model |
|---|---|---|---|
| auth/users | `api/auth.py`, `api/admin.py` | `services/user.py` | `models/user.py` |
| roles | `api/roles.py` | (permissions in core) | `models/role.py` |
| warehouses/cells | `api/warehouses.py`, `api/cell.py` | `services/warehouse.py`, `cell.py` | `warehouse.py`, `cell.py` |
| items/stock | `api/item.py`, `api/stock.py` | `item.py`, `stock.py` | `item.py`, `stock.py` |
| orders/picking | `api/order.py`, `api/picking.py` | `order.py`, `picking.py`, `order_reservation.py` | `order.py`, `pick_operation.py` |
| production | `api/production.py` | `production.py` | `production.py` |
| chz | `api/chz.py` | `chz.py` | `chz.py` |
| history/rollback | `api/audit.py` | `audit.py`, `history_rollback.py` | `audit.py` |
| push | `api/push.py` | `push.py` | `push_subscription.py` |
| employees | `api/employees.py` | `employee.py` | `employee.py` |

Слои: тонкий router → service → repository/model. Схемы контракта: `backend/app/schemas/`.

### Локальный dev (без Docker)

- API: `uv run uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000`
- UI: `cd frontend && npm run dev` → `http://127.0.0.1:5173`
- БД: sqlite `dev.local.db` через `.env` (`DATABASE_URL=sqlite:///./dev.local.db`)
- Toast API совместим со старым sonner: `import { toast } from '@/lib/toast'`

### Частые ловушки

- Не переименовывай класс `focus-ring` без правки CSS: HeroUI тоже объявляет `@utility focus-ring` (синие кольца). Наш override в `index.css`.
- CSS-токены приложения — `--wms-*`. Сырые `--background/--focus/--ring` принадлежат HeroUI.
- `/marking` не унифицировать с CRUD-страницами.
- Даты заказов — MSK (`Europe/Moscow`) через helper'ы в `utils.ts`.

## Главный принцип

Перед любым изменением сначала изучи существующую реализацию в этом же модуле.

- Если похожее решение уже есть, используй его как основной шаблон.
- Не создавай новые паттерны, если текущая задача укладывается в существующие.
- Не выравнивай проект под "идеальную" архитектуру ценой переписывания уже работающего кода.
- При сомнении копируй локальный стиль области, которую меняешь: обычные CRUD-страницы, производственные экраны, админку или `/marking`.

## Архитектура

- Репозиторий разделён на `backend/` и `frontend/`.
- `backend/app` построен слоями: `api` -> `services` -> `models`/`repositories` -> `schemas`.
- FastAPI-роутеры должны оставаться тонкими: валидация входа, permission check, вызов сервиса, при необходимости audit log и websocket-уведомление.
- Основная бизнес-логика живёт в `backend/app/services`.
- Pydantic-схемы живут в `backend/app/schemas` и задают контракт API.
- `frontend/src/pages` содержит экранную логику.
- `frontend/src/components/ui` содержит переиспользуемые примитивы интерфейса.
- `frontend/src/components/layout` и `frontend/src/components/warehouse` содержат составные layout- и domain-компоненты.
- `frontend/src/lib` хранит форматтеры, status-label helper'ы и общие функции.
- Серверное состояние на фронтенде хранится через TanStack Query.
- Локальное состояние страницы хранится внутри страницы через `useState`; глобальное состояние используется точечно через Zustand (`authStore`, `appStore`, `pickingStore`).
- Основной HTTP-слой фронтенда централизован в `frontend/src/api/client.ts`.
- Исключение: модуль `/marking` живёт отдельным контуром и уже использует собственный `api.ts`, raw `fetch` и свою внутреннюю UI-структуру. Не пытайся насильно привести его к паттернам обычных CRUD-страниц.
- Контракт между фронтендом и бэкендом в основном проходит в `snake_case` без отдельного слоя DTO-маппинга.

### Философия проекта

- Это не маркетинговый сайт, а операционный WMS-интерфейс с плотными данными и быстрыми действиями.
- Проект предпочитает эволюцию существующих экранов, а не изобретение нового визуального языка.
- Интерфейс должен выглядеть спокойно и утилитарно: светлый фон, тонкие границы, мягкие карточки, сдержанные акценты, короткие анимации.
- Бизнес-ограничения важнее "красивой абстракции": статусы, остатки, аудит, rollback и терминология должны сохраняться даже в мелких UI-изменениях.

## Правила React

- Перед изменением страницы найди 1-2 похожих экрана в том же разделе и повтори их структуру.
- Для серверных данных по умолчанию используй `useQuery` и `useMutation` прямо в странице, как это уже сделано в `OrdersPage`, `StockPage`, `WarehousesPage`, `PickingPage`, `ProductionPage`.
- После мутаций инвалидируй существующие query key, а не придумывай новый механизм синхронизации.
- Для нетривиальных форм используй `react-hook-form` + `zodResolver`.
- Для простых локальных диалогов допустим локальный `useState`, если соседний код в этом же модуле уже написан так.
- Производные коллекции, словари, фильтрацию и агрегации выноси в `useMemo`, если паттерн уже есть рядом.
- Не выноси page-local helper'ы в глобальные утилиты без повторного использования минимум в нескольких местах.
- Для destructive-действий используй `ConfirmDialog`, а не `window.confirm`.
- Для ошибок и успехов используй `toast` и `getErrorMessage`.
- На кликабельных строках и карточках защищай интерактивные дочерние элементы через `isEventFromInteractiveElement`, `data-interactive` или `stopPropagation`, как сделано в текущих таблицах и карточках.
- Учитывай permission-based навигацию и видимость разделов через `sectionAccess.ts`.
- Не переделывай админские страницы под React Query только ради единообразия: в проекте уже есть области с более ручным стилем.
- Для `/marking` сначала изучай `MarkingPage.tsx`, `marking-ui.tsx`, `tabs/*`, `workspaces/*`; это отдельная подсистема со своими layout-паттернами.

## Правила TypeScript

- Соблюдай текущий `strict`-режим, но подстраивайся под локальный стиль файла.
- Для API-сущностей используй интерфейсы из `frontend/src/types/wms.ts` и расширяй их там же, если меняется контракт.
- Сохраняй `snake_case` полей API на фронтенде: `item_id`, `shipping_date`, `actual_shipping_date`, `pairs_quantity`, `suggested_stock_id`.
- Не вводи слой преобразования `snake_case -> camelCase`, если задача прямо этого не требует.
- Статусы и типы остатков держи строковыми union-типами в текущем стиле.
- Пустые значения отражай так же, как это делает API: `null` и `undefined` не смешивай без причины.
- Для дат и MSK-нормализации используй существующие helper'ы из `frontend/src/lib/utils.ts`, а не новые ad hoc-преобразования.
- `any` допустим только как локальное исключение в уже слаботипизированной области; по умолчанию предпочитай явные интерфейсы и узкие типы.

## Правила компонентов

- Сначала ищи готовый примитив в `frontend/src/components/ui`.
- Для новых экранов используй существующий layout-каркас: `page-shell`, последовательность "toolbar/filter card -> content card/table/grid", стандартные `Card`, `Badge`, `Button`, `Dialog`, `Table`, `Skeleton`.
- Не создавай новый дизайн-сет поверх текущего набора UI-примитивов.
- Для data-dense экранов сохраняй существующий паттерн: desktop-таблица + mobile-карточки или mobile-список.
- Для таблиц по умолчанию используй `components/ui/table.tsx`, потому что в проект уже встроены настройки колонок и их ширины.
- Повторяющиеся summary-блоки ориентируй на стиль `WarehouseSummaryCard` и карточек метрик из `StockPage`, `ItemDetailPage`, `PickingPage`, `ProductionDetailPage`.
- Визуальные акценты должны оставаться локальными и функциональными: badge для статуса, progress для прогресса, muted-текст для вторичной информации.
- Framer Motion используй сдержанно и по существующим паттернам: короткие fade/slide/hover transitions без тяжёлой хореографии.
- Для маркировки используй существующие `MarkingPanel`, `MarkingMetric`, workspace-navigation и card language из `frontend/src/pages/marking`.

## Правила именования

- React-компоненты: `PascalCase`.
- Страницы: `*Page.tsx`.
- Хуки: `use*`.
- Zustand stores: `*Store.ts`.
- Фронтенд API-функции: глагол + сущность (`getOrders`, `createWarehouse`, `updateOrderStatus` не нужен, если уже есть `updateOrder`).
- Query key: массивы с сущностью первым элементом (`['orders']`, `['orders', id]`, `['picking', orderId]`).
- Backend services: глагольные функции (`create_order`, `request_supply`, `transfer_production_to_stock`).
- Backend router files и service files именуются по домену (`order.py`, `production.py`, `stock.py`).
- Используй доменные имена проекта: `warehouse`, `cell`, `stock`, `order`, `picking`, `production`, `chz`, `history`.
- В UI и комментариях предпочитай устоявшуюся терминологию проекта, а не синонимы.

## Правила работы с API

- На бэкенде сначала найди похожий router/service pair и повтори его структуру.
- Новую бизнес-логику добавляй в `services`, а не в FastAPI-роутер.
- Для входных и выходных моделей используй Pydantic-схемы из `backend/app/schemas`.
- Для защищённых действий используй `PermissionChecker(...)`; для обычных авторизованных чтений следуй соседнему endpoint.
- Для значимых изменений сущностей смотри, есть ли рядом `log_operation(...)` и `notify_all(...)`; если паттерн уже используется для этой сущности, поддержи его.
- На фронтенде добавляй обычные запросы в `frontend/src/api/client.ts`.
- Исключение: если изменение относится к `/marking`, сначала смотри `frontend/src/pages/marking/api.ts` и существующие `fetch`-вызовы этого модуля.
- Axios-клиент уже умеет `baseURL`, bearer-token и refresh flow. Не дублируй это в новых местах.
- Возвращай `response.data`, как в существующих API helper'ах.
- Не меняй формат дат и времён. Заказы и отгрузки в проекте нормализуются к `Europe/Moscow`.
- Для складских и производственных операций не теряй audit-данные, нужные для истории и rollback: `source_stock_id`, `cell_id`, `quantity`, снимки `before`, статусные переходы.

## Правила изменений существующего кода

- Любое изменение начинается с чтения похожей реализации в том же домене.
- Старайся менять только ту область, которую действительно затрагивает задача.
- Не делай "попутную унификацию" соседних файлов без прямой необходимости.
- Если зона уже написана в локально неоднородном стиле, не выпрямляй её автоматически под остальной проект.
- Не меняй визуальный язык проекта: цвета, отступы, типографику и характер карточек нужно продолжать, а не переосмысливать.
- Не переименовывай существующие статусы и доменные поля ради "чистоты".
- Не вводи новую абстракцию, если текущая логика умещается в локальный helper, текущую страницу или существующий сервис.
- При изменениях в остатках, сборке, производстве, CHZ и истории всегда проверяй, не ломается ли rollback и не теряются ли ссылки на удаляемые остатки.
- Для новых UI-элементов сначала посмотри, как это уже решено в `WarehousesPage`, `OrdersPage`, `StockPage`, `PickingPage`, `ProductionPage` или `/marking`.

## Правила тестирования

- Для изменений бэкенд-логики добавляй или обновляй `pytest`-тесты в стиле существующих файлов из `tests/`.
- Новые тесты должны проверять бизнес-правило, а не только happy path.
- Для логики заказов и сборки особенно важны:
  - status transitions;
  - частичная и полная сборка;
  - ожидание производства;
  - MSK-нормализация дат;
  - восстановление через history rollback.
- Для складских изменений особенно важны:
  - перемещение и списание полного остатка;
  - сохранность audit-данных после удаления stock;
  - запрет смешения `inventory_type` в ячейке.
- Для production-изменений особенно важны:
  - совместимость `inventory_type`;
  - ограничения transfer/receipt;
  - связь с ожидающими заказами;
  - CHZ-запросы производства.
- Для фронтенда обязательных unit-тестов в репозитории почти нет, поэтому минимумом считаются `typecheck`, сборка и ручная проверка экрана.

## Правила проверки изменений

- Если трогали фронтенд, запусти в `frontend/`:
  - `npm run typecheck`
  - `npm run build`
- Если трогали бэкенд, запусти минимум целевые тесты `pytest` по затронутому домену.
- Если менялась бизнес-логика бэкенда, по возможности дополнительно прогоняй:
  - `pytest`
  - `ruff check backend`
  - `mypy backend --ignore-missing-imports`
- Если менялся UI, вручную проверь:
  - desktop и mobile-представление;
  - таблицу и альтернативный card/grid-вариант, если он есть на странице;
  - toast/error states;
  - destructive-confirmation;
  - консистентность терминологии.
- Перед завершением перечитай diff и убери:
  - новый паттерн, если рядом уже есть существующий;
  - лишние абстракции;
  - стилистические отклонения от текущего автора.

## Доменные ориентиры

- Координата ячейки в проекте выражается как `rack-tier-cell` и отображается через `formatCoordinate(cell)`.
- `rack` в коде соответствует ряду/стеллажу, `tier` — ярусу, `cell` — ячейке.
- Отдельной сущности паллеты в текущем проекте нет. Остатки учитываются на уровне `stock` внутри ячейки.
- `stocks` — это реальные остатки с количеством, типом номенклатуры и атрибутами партии.
- `finished_goods`, `raw_material`, `consumable` — базовые типы остатков и номенклатуры, которые влияют на формы, подписи, единицы измерения и бизнес-ограничения.
- Для обычных ячеек нельзя смешивать разные `inventory_type`; заметное исключение уже зашито для склада `Производство`.
- Заказ может ждать производство, если подходящий остаток ещё не найден.
- Производство пополняет склад и может автоматически закрывать ожидание по заказам через появившийся остаток.
