#!/bin/bash
set -e

echo "🚀 Deploying MGNREGA PWA to VPS..."

# Variables
VPS_HOST="${VPS_HOST:-user@your-vps-ip}"
APP_DIR="/opt/mgnrega-pwa"

# Build images locally
echo "📦 Building Docker images..."
docker-compose -f infrastructure/docker-compose.prod.yml build

# Save images
echo "💾 Saving images..."
docker save mgnrega_api:latest | gzip > /tmp/api.tar.gz
docker save mgnrega_worker:latest | gzip > /tmp/worker.tar.gz
docker save mgnrega_web:latest | gzip > /tmp/web.tar.gz

# Transfer to VPS
echo "📤 Transferring to VPS..."
scp /tmp/*.tar.gz $VPS_HOST:/tmp/

# Deploy on VPS
echo "🔧 Deploying on VPS..."
ssh $VPS_HOST << 'ENDSSH'
  cd /tmp
  docker load < api.tar.gz
  docker load < worker.tar.gz
  docker load < web.tar.gz
  
  cd /opt/mgnrega-pwa
  docker-compose -f infrastructure/docker-compose.prod.yml down
  docker-compose -f infrastructure/docker-compose.prod.yml up -d
  
  rm /tmp/*.tar.gz
  docker system prune -f
ENDSSH

echo "✅ Deployment complete!"
echo "🌐 Access at https://your-domain.com"

# Cleanup
rm /tmp/*.tar.gz