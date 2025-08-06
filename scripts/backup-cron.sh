#!/bin/bash

# Automated backup cron job setup
# This script sets up automated database backups

# Add this line to your crontab to run daily backups at 2 AM:
# 0 2 * * * /path/to/your/project/scripts/backup-cron.sh

# Change to project directory
cd "$(dirname "$0")/.."

# Run backup with timestamp
./scripts/db-backup.sh

# Log the backup completion
echo "$(date): Automated backup completed" >> ./logs/backup.log