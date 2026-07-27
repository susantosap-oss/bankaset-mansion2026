#!/bin/bash
set -e
echo ""
echo "================================================"
echo "  Bankaset Mansion 2026 — Deploy ke Cloud Run"
echo "================================================"
echo ""

# Kurangi egress Networking: source staging & build di region yang sama
gcloud config set builds/region asia-southeast2

gcloud builds submit \
  --config cloudbuild.yaml \
  --gcs-source-staging-dir=gs://run-sources-bankaset-mansion2026-asia-southeast2/source \
  --project bankaset-mansion2026

echo ""
echo "Done!"
