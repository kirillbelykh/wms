Структура ручек для WMS:

1. Склады, зоны, ячейки

GET    /warehouses                 — список всех складов
GET    /warehouses/{id}            — получить склад по ID
POST   /warehouses                 — создать склад
PUT    /warehouses/{id}            — обновить склад
DELETE /warehouses/{id}            — удалить склад

GET    /zones                       — список зон
GET    /zones/{id}                  — зона по ID
POST   /zones                       — создать зону
PUT    /zones/{id}                  — обновить
DELETE /zones/{id}                  — удалить

GET    /cells                       — список ячеек
GET    /cells/{id}                  — ячейка по ID
POST   /cells                       — создать ячейку
PUT    /cells/{id}                  — обновить
DELETE /cells/{id}                  — удалить


2. Поставщики, пользователи

GET    /suppliers
GET    /suppliers/{id}
POST   /suppliers
PUT    /suppliers/{id}
DELETE /suppliers/{id}

GET    /users
GET    /users/{id}
POST   /users
PUT    /users/{id}
DELETE /users/{id}

3. Номенклатура и партии

GET    /items
GET    /items/{id}
POST   /items
PUT    /items/{id}
DELETE /items/{id}

GET    /batches
GET    /batches/{id}
POST   /batches
PUT    /batches/{id}
DELETE /batches/{id}

4. Приёмки

GET    /receipts                    — список приёмок (фильтры: статус, склад, поставщик)
GET    /receipts/create             — форма создания приёмки (HTML)
POST   /receipts/create             — создать приёмку
GET    /receipts/{id}               — приёмка по ID
PUT    /receipts/{id}               — обновление приёмки
DELETE /receipts/{id}               — удалить приёмку

# Позиции приёмки
GET    /receipts/{id}/items
POST   /receipts/{id}/items
PUT    /receipts/{id}/items/{item_id}
DELETE /receipts/{id}/items/{item_id}

# Статусы
POST   /receipts/{id}/start
POST   /receipts/{id}/complete
POST   /receipts/{id}/cancel

5. Перемещения

GET    /movements
GET    /movements/{id}
POST   /movements                     — создать перемещение (откуда → куда, qty)
PUT    /movements/{id}
DELETE /movements/{id}

6. Комплектация заказов

GET    /orders
GET    /orders/{id}
POST   /orders
PUT    /orders/{id}
DELETE /orders/{id}

# Позиции заказа
GET    /orders/{id}/items
POST   /orders/{id}/items
PUT    /orders/{id}/items/{item_id}
DELETE /orders/{id}/items/{item_id}

# Статусы заказа
POST   /orders/{id}/start
POST   /orders/{id}/complete
POST   /orders/{id}/cancel

7. Отгрузки

GET    /shipments
GET    /shipments/{id}
POST   /shipments                     — формирование отгрузки по заказу
PUT    /shipments/{id}
DELETE /shipments/{id}

# Сканирование перед отправкой
POST   /shipments/{id}/scan
POST   /shipments/{id}/complete

8. Инвентаризация

GET    /inventories
GET    /inventories/{id}
POST   /inventories                    — создать инвентаризацию (полная/частичная)
PUT    /inventories/{id}
DELETE /inventories/{id}

# Позиции инвентаризации
GET    /inventories/{id}/items
POST   /inventories/{id}/items
PUT    /inventories/{id}/items/{item_id}
DELETE /inventories/{id}/items/{item_id}

# Статусы
POST   /inventories/{id}/start
POST   /inventories/{id}/complete

9. Брак и списания

GET    /defects
GET    /defects/{id}
POST   /defects                         — зарегистрировать брак
PUT    /defects/{id}
DELETE /defects/{id}

10. Маркировка и ШК

POST   /barcodes/generate               — создать штрихкод для партии/товара
GET    /barcodes/{code}                 — получить изображение/информацию

11. Отчеты

GET    /reports/stock                    — остатки по складам/ячейкам
GET    /reports/movement                 — движение товаров
GET    /reports/batches                  — история партий
GET    /reports/expiry                   — отчёт по срокам годности
GET    /reports/defects                  — отчёт по браку
GET    /reports/inventory                — отчёт по инвентаризации

12. Аутентификация

POST   /auth/login
POST   /auth/logout
GET    /auth/me



