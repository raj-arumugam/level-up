# Portfolio Tracker - Production Deployment Guide

This guide covers the complete production deployment setup for the Portfolio Tracker application.

## Prerequisites

- Docker and Docker Compose installed
- Domain name configured (optional for local deployment)
- SSL certificates (can be generated automatically)
- Required environment variables configured

## Quick Start

1. **Clone and configure environment**:
   ```bash
   git clone <repository-url>
   cd portfolio-tracker
   cp .env.production .env
   # Edit .env with your production values
   ```

2. **Deploy the application**:
   ```bash
   ./scripts/deploy.sh production
   ```

3. **Verify deployment**:
   ```bash
   ./scripts/health-check.sh
   ```

## Detailed Setup

### 1. Environment Configuration

Copy the production environment template and configure your values:

```bash
cp .env.production .env
cp frontend/.env.production frontend/.env.production.local
```

**Critical environment variables to configure**:
- `JWT_SECRET`: Strong secret key (minimum 32 characters)
- `POSTGRES_PASSWORD`: Secure database password
- `ALPHA_VANTAGE_API_KEY`: Your Alpha Vantage API key
- `EMAIL_*`: Email service configuration
- `REACT_APP_API_URL`: Your domain's API URL

### 2. SSL Certificate Setup

**Option A: Self-signed certificates (development/testing)**:
```bash
./scripts/generate-ssl-cert.sh yourdomain.com
```

**Option B: Let's Encrypt certificates (production)**:
```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./nginx/ssl/private.key
```

### 3. Database Setup

The deployment script automatically handles database setup, but you can run migrations manually:

```bash
./scripts/db-migrate.sh production
```

### 4. Monitoring Setup

Start monitoring services:
```bash
docker-compose -f monitoring/docker-compose.monitoring.yml up -d
```

Access monitoring dashboards:
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090

### 5. Backup Configuration

Automated backups are configured during deployment. Manual backup:
```bash
./scripts/db-backup.sh
```

Restore from backup:
```bash
./scripts/db-restore.sh ./backups/portfolio_tracker_backup_YYYYMMDD_HHMMSS.dump.gz
```

## Service Architecture

### Docker Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 80 | React application (nginx) |
| Backend | 3001 | Node.js API server |
| Database | 5432 | PostgreSQL database |
| Nginx Proxy | 443 | SSL termination and reverse proxy |
| Redis | 6379 | Caching and session storage |

### Monitoring Services

| Service | Port | Description |
|---------|------|-------------|
| Grafana | 3000 | Monitoring dashboards |
| Prometheus | 9090 | Metrics collection |
| Node Exporter | 9100 | System metrics |
| cAdvisor | 8080 | Container metrics |
| Loki | 3100 | Log aggregation |

## Security Features

### Network Security
- All HTTP traffic redirected to HTTPS
- SSL/TLS encryption with modern cipher suites
- Rate limiting on API endpoints
- CORS protection

### Application Security
- JWT-based authentication
- Password hashing with bcrypt
- Input validation and sanitization
- SQL injection prevention
- XSS protection headers

### Infrastructure Security
- Non-root containers
- Security headers (HSTS, CSP, etc.)
- Regular security updates
- Log monitoring and alerting

## Maintenance

### Regular Tasks

1. **Update SSL certificates** (if using Let's Encrypt):
   ```bash
   sudo certbot renew
   ```

2. **Monitor logs**:
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f
   ```

3. **Check system health**:
   ```bash
   ./scripts/health-check.sh
   ```

4. **Update application**:
   ```bash
   git pull
   docker-compose -f docker-compose.prod.yml build --no-cache
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Backup Schedule

- **Automated daily backups**: 2:00 AM (configured via cron)
- **Retention**: 7 days for daily backups
- **Location**: `./backups/` directory

### Log Rotation

Logs are automatically rotated daily with 30-day retention:
- Application logs: `/app/logs/`
- Nginx logs: `/var/log/nginx/`
- System logs: `/var/log/`

## Troubleshooting

### Common Issues

1. **SSL Certificate Errors**:
   ```bash
   # Check certificate validity
   openssl x509 -in ./nginx/ssl/cert.pem -text -noout
   
   # Regenerate self-signed certificate
   ./scripts/generate-ssl-cert.sh yourdomain.com
   ```

2. **Database Connection Issues**:
   ```bash
   # Check database status
   docker exec portfolio-tracker-db-prod pg_isready -U portfolio_user_prod
   
   # View database logs
   docker logs portfolio-tracker-db-prod
   ```

3. **High Memory Usage**:
   ```bash
   # Check container resource usage
   docker stats
   
   # Restart services if needed
   docker-compose -f docker-compose.prod.yml restart
   ```

### Log Locations

- **Application logs**: `./logs/app.log`
- **Error logs**: `./logs/error.log`
- **Nginx logs**: `./logs/nginx/`
- **Database logs**: `docker logs portfolio-tracker-db-prod`

### Health Check Endpoints

- **Backend**: `http://localhost:3001/api/health`
- **Frontend**: `http://localhost/health`
- **Database**: Internal health checks via Docker

## Performance Optimization

### Database Optimization
- Connection pooling configured
- Query optimization with indexes
- Regular VACUUM and ANALYZE operations

### Frontend Optimization
- Static asset caching (1 year)
- Gzip compression enabled
- CDN-ready configuration

### Backend Optimization
- Request/response compression
- Rate limiting to prevent abuse
- Efficient logging configuration

## Scaling Considerations

### Horizontal Scaling
- Load balancer configuration ready
- Stateless application design
- Database connection pooling

### Vertical Scaling
- Resource limits configurable via Docker
- Memory and CPU monitoring included
- Auto-restart on failure

## Support

For deployment issues:
1. Check the health check script output
2. Review application and system logs
3. Verify environment configuration
4. Check Docker container status

For application issues:
1. Monitor Grafana dashboards
2. Check Prometheus metrics
3. Review error logs
4. Verify API connectivity