# MGNREGA PWA - Production Deployment Guide

## Prerequisites

1. **VPS Server** (DigitalOcean, Linode, or AWS EC2)
   - Minimum: 4 vCPU, 8GB RAM, 80GB SSD
   - Ubuntu 22.04 LTS
   - Static IP address

2. **Domain Name**
   - DNS A record pointing to VPS IP

3. **External Services**
   - data.gov.in API key
   - DigitalOcean Spaces (or S3) bucket
   - Sentry account (optional)

## Step 1: Initial Server Setup

```bash
# SSH into VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Create application directory
mkdir -p /opt/mgnrega-pwa
cd /opt/mgnrega-pwa

# Clone repository
git clone https://github.com/your-org/mgnrega-pwa.git .
```

## Step 2: Configure Environment

```bash
# Create .env file
cp .env.example .env.production
nano .env.production

# Add production values
DATABASE_URL=postgresql://user:pass@postgres:5432/mgnrega
REDIS_URL=redis://redis:6379
DATAGOVIN_API_KEY=your_actual_api_key
S3_ENDPOINT=nyc3.digitaloceanspaces.com
S3_BUCKET=mgnrega-production
# ... etc
```

## Step 3: SSL Certificate (Let's Encrypt)

```bash
# Install certbot
apt install certbot -y

# Get certificate
certbot certonly --standalone -d mgnrega.example.com

# Certificate will be at:
# /etc/letsencrypt/live/mgnrega.example.com/fullchain.pem
# /etc/letsencrypt/live/mgnrega.example.com/privkey.pem

# Copy to nginx directory
cp /etc/letsencrypt/live/mgnrega.example.com/*.pem infrastructure/nginx/ssl/

# Auto-renewal
crontab -e
# Add: 0 0 1 * * certbot renew --quiet
```

## Step 4: Deploy Application

```bash
# Build and start services
docker-compose -f infrastructure/docker-compose.prod.yml up -d

# Initialize database
docker-compose -f infrastructure/docker-compose.prod.yml exec api \
  npm run migrate

# Check logs
docker-compose -f infrastructure/docker-compose.prod.yml logs -f
```

## Step 5: Monitoring Setup

See docs/MONITORING.md for complete Prometheus + Grafana setup.

## Maintenance

### Backup Database
```bash
docker-compose exec postgres pg_dump -U mgnrega_user mgnrega > backup.sql
```

### View Logs
```bash
docker-compose logs -f api
docker-compose logs -f worker
```

### Update Application
```bash
git pull origin main
docker-compose -f infrastructure/docker-compose.prod.yml up -d --build
```

Deployment complete! 🎉