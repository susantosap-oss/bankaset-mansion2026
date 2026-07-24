#!/bin/bash
set -e
echo ""
echo "================================================"
echo "  Bankaset Mansion 2026 — Deploy ke Cloud Run"
echo "================================================"
echo ""
gcloud run deploy bankaset-mansion2026 \
  --source . \
  --region asia-southeast2 \
  --project bankaset-mansion2026 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --set-secrets=AUTH_SECRET=AUTH_SECRET:latest,GROQ_API_KEY=GROQ_API_KEY:latest,SERPER_API_KEY=SERPER_API_KEY:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_SHEET_ID=GOOGLE_SHEET_ID:latest,CRM_SHEET_ID=CRM_SHEET_ID:latest,GOOGLE_IMPERSONATE_SA=GOOGLE_IMPERSONATE_SA:latest
echo ""
echo "Done!"
