#!/bin/bash

# Database restore script for Portfolio Tracker
# Usage: ./scripts/db-restore.sh <backup-file>

set -e

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "Error: Please provide a backup file"
    echo "Usage: ./scripts/db-restore.sh <backup-file>"
    echo "Example: ./scripts/db-restore.sh ./backups/portfolio_tracker_backup_20240101_120000.dump.gz"
    exit 1
fi

BACKUP_FILE=$1

# Check if backup file exists
if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file '${BACKUP_FILE}' not found"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Configuration
CONTAINER_NAME="portfolio-tracker-db-prod"
TEMP_DIR="/tmp/portfolio_restore_$$"

echo "Starting database restore..."
echo "Backup file: ${BACKUP_FILE}"

# Create temporary directory
mkdir -p ${TEMP_DIR}

# Extract backup file if compressed
if [[ ${BACKUP_FILE} == *.gz ]]; then
    echo "Extracting compressed backup..."
    gunzip -c ${BACKUP_FILE} > ${TEMP_DIR}/restore.dump
    RESTORE_FILE="${TEMP_DIR}/restore.dump"
else
    RESTORE_FILE=${BACKUP_FILE}
fi

# Stop application containers to prevent connections
echo "Stopping application containers..."
docker-compose -f docker-compose.prod.yml stop backend frontend

# Wait for connections to close
sleep 5

# Drop existing connections
docker exec ${CONTAINER_NAME} psql \
    -U ${POSTGRES_USER} \
    -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid();"

# Restore database
echo "Restoring database..."
if [[ ${RESTORE_FILE} == *.sql ]]; then
    # SQL format restore
    docker exec -i ${CONTAINER_NAME} psql \
        -U ${POSTGRES_USER} \
        -d postgres \
        < ${RESTORE_FILE}
else
    # Custom format restore
    docker exec -i ${CONTAINER_NAME} pg_restore \
        -U ${POSTGRES_USER} \
        -d postgres \
        --clean \
        --if-exists \
        --create \
        --verbose \
        < ${RESTORE_FILE}
fi

# Clean up temporary files
rm -rf ${TEMP_DIR}

# Start application containers
echo "Starting application containers..."
docker-compose -f docker-compose.prod.yml start backend frontend

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Verify restore
echo "Verifying database restore..."
docker exec ${CONTAINER_NAME} psql \
    -U ${POSTGRES_USER} \
    -d ${POSTGRES_DB} \
    -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"

echo "Database restore completed successfully!"