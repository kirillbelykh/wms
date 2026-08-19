#!/bin/bash
set -e

echo "=== Pulling latest changes ==="
git pull origin main

echo "=== Building and starting containers ==="
docker compose -f docker-compose.prod.yml up -d --build

echo "=== Running migrations ==="
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

echo "=== Cleaning up old images ==="
docker image prune -f

echo "=== Deployment complete! ==="
