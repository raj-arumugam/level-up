#!/bin/bash

# Database migration script for Portfolio Tracker
# Usage: ./scripts/db-migrate.sh [environment]

set -e

# Configuration
ENVIRONMENT=${1:-production}
CONTAINER_NAME="portfolio-tracker-backend-prod"

echo "Running database migrations for ${ENVIRONMENT} environment..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Check if backend container is running
if ! docker ps | grep -q ${CONTAINER_NAME}; then
    echo "Error: Backend container '${CONTAINER_NAME}' is not running"
    echo "Please start the containers first: docker-compose -f docker-compose.prod.yml up -d"
    exit 1
fi

# Run Prisma migrations
echo "Applying Prisma migrations..."
docker exec ${CONTAINER_NAME} npx prisma migrate deploy

# Generate Prisma client
echo "Generating Prisma client..."
docker exec ${CONTAINER_NAME} npx prisma generate

# Verify migration status
echo "Checking migration status..."
docker exec ${CONTAINER_NAME} npx prisma migrate status

echo "Database migrations completed successfully!"

# Optional: Run database seeding for production
read -p "Do you want to run database seeding? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Running database seeding..."
    docker exec ${CONTAINER_NAME} npx prisma db seed
    echo "Database seeding completed!"
fi