#!/bin/sh
# Автоматический бэкап PostgreSQL. Запускается через cron на хосте или внутри контейнера.

BACKUP_DIR=${BACKUP_DIR:-/backups}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME=${POSTGRES_DB:-grundlage_db}
DB_USER=${POSTGRES_USER:-grundlage_user}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}

mkdir -p "$BACKUP_DIR"

# Создаем дамп
pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.dump"

# Удаляем старые бэкапы
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: ${DB_NAME}_${TIMESTAMP}.dump"
