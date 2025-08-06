#!/bin/bash

# Health check script for Portfolio Tracker
# Usage: ./scripts/health-check.sh

set -e

echo "Running health checks for Portfolio Tracker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check service health
check_service() {
    local service_name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n "Checking $service_name... "
    
    if response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null); then
        if [ "$response" -eq "$expected_status" ]; then
            echo -e "${GREEN}✓ OK${NC} (HTTP $response)"
            return 0
        else
            echo -e "${RED}✗ FAIL${NC} (HTTP $response, expected $expected_status)"
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Connection failed)"
        return 1
    fi
}

# Function to check Docker container
check_container() {
    local container_name=$1
    
    echo -n "Checking container $container_name... "
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        if [ "$(docker inspect -f '{{.State.Health.Status}}' "$container_name" 2>/dev/null)" = "healthy" ]; then
            echo -e "${GREEN}✓ OK${NC} (Running and healthy)"
            return 0
        elif docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
            echo -e "${YELLOW}⚠ WARNING${NC} (Running but no health check)"
            return 0
        else
            echo -e "${RED}✗ FAIL${NC} (Not healthy)"
            return 1
        fi
    else
        echo -e "${RED}✗ FAIL${NC} (Not running)"
        return 1
    fi
}

# Function to check database connection
check_database() {
    echo -n "Checking database connection... "
    
    if docker exec portfolio-tracker-db-prod pg_isready -U ${POSTGRES_USER:-portfolio_user_prod} > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        return 1
    fi
}

# Function to check disk space
check_disk_space() {
    echo -n "Checking disk space... "
    
    usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        echo -e "${GREEN}✓ OK${NC} (${usage}% used)"
        return 0
    elif [ "$usage" -lt 90 ]; then
        echo -e "${YELLOW}⚠ WARNING${NC} (${usage}% used)"
        return 0
    else
        echo -e "${RED}✗ CRITICAL${NC} (${usage}% used)"
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    echo -n "Checking memory usage... "
    
    usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [ "$usage" -lt 80 ]; then
        echo -e "${GREEN}✓ OK${NC} (${usage}% used)"
        return 0
    elif [ "$usage" -lt 90 ]; then
        echo -e "${YELLOW}⚠ WARNING${NC} (${usage}% used)"
        return 0
    else
        echo -e "${RED}✗ CRITICAL${NC} (${usage}% used)"
        return 1
    fi
}

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Initialize counters
total_checks=0
failed_checks=0

# Container health checks
echo "=== Container Health Checks ==="
containers=("portfolio-tracker-db-prod" "portfolio-tracker-backend-prod" "portfolio-tracker-frontend-prod")

for container in "${containers[@]}"; do
    total_checks=$((total_checks + 1))
    if ! check_container "$container"; then
        failed_checks=$((failed_checks + 1))
    fi
done

# Service health checks
echo ""
echo "=== Service Health Checks ==="

services=(
    "Backend API:http://localhost:3001/api/health"
    "Frontend:http://localhost/"
    "Database:check_database"
)

for service in "${services[@]}"; do
    total_checks=$((total_checks + 1))
    service_name=$(echo "$service" | cut -d: -f1)
    service_url=$(echo "$service" | cut -d: -f2-)
    
    if [ "$service_url" = "check_database" ]; then
        if ! check_database; then
            failed_checks=$((failed_checks + 1))
        fi
    else
        if ! check_service "$service_name" "$service_url"; then
            failed_checks=$((failed_checks + 1))
        fi
    fi
done

# System resource checks
echo ""
echo "=== System Resource Checks ==="

total_checks=$((total_checks + 2))
if ! check_disk_space; then
    failed_checks=$((failed_checks + 1))
fi

if ! check_memory; then
    failed_checks=$((failed_checks + 1))
fi

# Summary
echo ""
echo "=== Health Check Summary ==="
passed_checks=$((total_checks - failed_checks))

if [ $failed_checks -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC} ($passed_checks/$total_checks)"
    exit 0
else
    echo -e "${RED}$failed_checks checks failed${NC} ($passed_checks/$total_checks passed)"
    exit 1
fi