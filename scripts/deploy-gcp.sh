#!/bin/bash
# AGROSTATIS — Google Cloud Deployment Script
# Prerequisites: gcloud CLI authenticated, project selected
#
# Usage:
#   ./scripts/deploy-gcp.sh [project-id] [region]
#
# Example:
#   ./scripts/deploy-gcp.sh agrostatis-prod europe-west6

set -euo pipefail

PROJECT=${1:-$(gcloud config get-value project)}
REGION=${2:-europe-west6}  # Zurich
SERVICE=agrostatis-platform
IMAGE=gcr.io/$PROJECT/$SERVICE

echo "═══════════════════════════════════════════════════════"
echo "  AGROSTATIS — Deploying to Google Cloud"
echo "  Project: $PROJECT"
echo "  Region:  $REGION"
echo "═══════════════════════════════════════════════════════"

# ─── 1. Enable required APIs ────────────────────────────────────────
echo "Enabling GCP APIs..."
gcloud services enable \
  sqladmin.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  --project=$PROJECT

# ─── 2. Create Cloud SQL instance (if not exists) ───────────────────
INSTANCE_NAME=agrostatis-db
if ! gcloud sql instances describe $INSTANCE_NAME --project=$PROJECT &>/dev/null; then
  echo "Creating Cloud SQL PostgreSQL instance..."
  gcloud sql instances create $INSTANCE_NAME \
    --project=$PROJECT \
    --database-version=POSTGRES_16 \
    --tier=db-custom-2-4096 \
    --region=$REGION \
    --storage-size=20GB \
    --storage-type=SSD \
    --database-flags=cloudsql.enable_pgaudit=off \
    --root-password=agrostatis-$(openssl rand -hex 8)

  # Create database
  gcloud sql databases create agrostatis \
    --instance=$INSTANCE_NAME \
    --project=$PROJECT

  echo "IMPORTANT: Enable PostGIS and H3 extensions manually via Cloud SQL console"
  echo "  CREATE EXTENSION IF NOT EXISTS postgis;"
  echo "  CREATE EXTENSION IF NOT EXISTS h3;"
  echo "  CREATE EXTENSION IF NOT EXISTS h3_postgis;"
else
  echo "Cloud SQL instance $INSTANCE_NAME already exists"
fi

# ─── 3. Create Cloud Storage bucket (if not exists) ─────────────────
BUCKET=gs://${PROJECT}-geodata
if ! gsutil ls $BUCKET &>/dev/null; then
  echo "Creating Cloud Storage bucket..."
  gsutil mb -l $REGION $BUCKET
  gsutil iam ch allUsers:objectViewer $BUCKET  # public read for tiles
else
  echo "Bucket $BUCKET already exists"
fi

# ─── 4. Build and push Docker image ────────────────────────────────
echo "Building Docker image..."
gcloud builds submit \
  --tag $IMAGE \
  --project=$PROJECT \
  --timeout=600

# ─── 5. Deploy to Cloud Run ────────────────────────────────────────
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE \
  --image=$IMAGE \
  --project=$PROJECT \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=2 \
  --min-instances=0 \
  --max-instances=5 \
  --add-cloudsql-instances=${PROJECT}:${REGION}:${INSTANCE_NAME} \
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="DATABASE_URL=postgresql://postgres:PASSWORD@/agrostatis?host=/cloudsql/${PROJECT}:${REGION}:${INSTANCE_NAME}"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "  Update DATABASE_URL password in Cloud Run settings"
echo "═══════════════════════════════════════════════════════"

# Show the service URL
gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT --format='value(status.url)'
