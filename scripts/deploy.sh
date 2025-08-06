#!/bin/bash

# Production deployment script for Portfolio Tracker
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
COMPOSE_FILE="docker-compose.prod.yml"

echo "Starting deployment for ${ENVIRONMENT} environment..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Pre-deployment checks
echo "Running pre-deployment checks..."

# Check if required environment variables are set
required_vars=("JWT_SECRET" "POSTGRES_PASSWORD" "ALPHA_VANTAGE_API_KEY")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "Error: Required environment variable $var is not set"
        exit 1
    fi
done

# Check if SSL certificates exist
if [ ! -f "./nginx/ssl/cert.pem" ] || [ ! -f "./nginx/ssl/private.key" ]; then
    echo "Warning: SSL certificates not found. Generating self-signed certificates..."
    ./scripts/generate-ssl-cert.sh
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p logs backups nginx/ssl

# Build and start services
echo "Building and starting services..."
docker-compose -f ${COMPOSE_FILE} build --no-cache
docker-compose -f ${COMPOSE_FILE} up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 30

# Run database migrations
echo "Running database migrations..."
./scripts/db-migrate.sh ${ENVIRONMENT}

# Health checks
echo "Running health checks..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "Backend health check passed"
        break
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "Error: Backend health check failed after $max_attempts attempts"
        exit 1
    fi
    
    echo "Attempt $attempt/$max_attempts: Backend not ready, waiting..."
    sleep 10
    ((attempt++))
done

# Check frontend
if curl -f http://localhost/ > /dev/null 2>&1; then
    echo "Frontend health check passed"
else
    echo "Warning: Frontend health check failed"
fi

# Start monitoring services
echo "Starting monitoring services..."
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Setup log rotation
echo "Setting up log rotation..."
sudo cp config/logrotate.conf /etc/logrotate.d/portfolio-tracker

# Setup automated backups
echo "Setting up automated backups..."
(crontab -l 2>/dev/null; echo "0 2 * * * $(pwd)/scripts/backup-cron.sh") | crontab -

echo "Deployment completed successfully!"
echo ""
echo "Services are running:"
echo "  - Frontend: http://localhost (HTTPS: https://localhost)"
echo "  - Backend API: http://localhost:3001"
echo "  - Grafana: http://localhost:3000"
echo "  - Prometheus: http://localhost:9090"
echo ""
echo "Next steps:"
echo "  1. Update DNS records to point to this server"
echo "  2. Replace self-signed SSL certificates with trusted certificates"
echo "  3. Configure monitoring alerts"
echo "  4. Test all functionality"