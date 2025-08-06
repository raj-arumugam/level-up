#!/bin/bash

# Database backup script for Portfolio Tracker
# Usage: ./scripts/db-backup.sh [backup-name]

set -e

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Configuration
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME=${1:-"portfolio_tracker_backup_${TIMESTAMP}"}
CONTAINER_NAME="portfolio-tracker-db-prod"

# Create backup directory if it doesn't exist
mkdir -p ${BACKUP_DIR}

echo "Starting database backup..."
echo "Backup name: ${BACKUP_NAME}"
echo "Timestamp: ${TIMESTAMP}"

# Create database backup
docker exec ${CONTAINER_NAME} pg_dump \
    -U ${POSTGRES_USER} \
    -d ${POSTGRES_DB} \
    --no-password \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=custom \
    > ${BACKUP_DIR}/${BACKUP_NAME}.dump

# Create SQL backup as well
docker exec ${CONTAINER_NAME} pg_dump \
    -U ${POSTGRES_USER} \
    -d ${POSTGRES_DB} \
    --no-password \
    --verbose \
    --clean \
    --if-exists \
    --create \
    --format=plain \
    > ${BACKUP_DIR}/${BACKUP_NAME}.sql

# Compress backups
gzip ${BACKUP_DIR}/${BACKUP_NAME}.dump
gzip ${BACKUP_DIR}/${BACKUP_NAME}.sql

echo "Database backup completed successfully!"
echo "Files created:"
echo "  - ${BACKUP_DIR}/${BACKUP_NAME}.dump.gz"
echo "  - ${BACKUP_DIR}/${BACKUP_NAME}.sql.gz"

# Clean up old backups (keep last 7 days)
find ${BACKUP_DIR} -name "portfolio_tracker_backup_*.gz" -mtime +7 -delete

echo "Old backups cleaned up (kept last 7 days)"

# Verify backup integrity
echo "Verifying backup integrity..."
gunzip -t ${BACKUP_DIR}/${BACKUP_NAME}.dump.gz
gunzip -t ${BACKUP_DIR}/${BACKUP_NAME}.sql.gz

echo "Backup verification completed successfully!"