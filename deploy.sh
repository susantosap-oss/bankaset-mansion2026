#!/bin/bash
set -e
PROJECT=bankaset-mansion2026
REGION=asia-southeast2

echo ""
echo "================================================"
echo "  Bankaset Mansion 2026 — Deploy ke Cloud Run"
echo "================================================"
echo ""

# Kurangi egress Networking: source staging & build di region yang sama
gcloud config set builds/region $REGION

gcloud builds submit \
  --config cloudbuild.yaml \
  --gcs-source-staging-dir=gs://run-sources-$PROJECT-$REGION/source \
  --project $PROJECT

echo ""
echo "================================================"
echo "  Cleanup: hapus artifact lama"
echo "================================================"

# Hapus semua image tanpa tag di cloud-run-source-deploy (simpan hanya latest)
echo "→ cloud-run-source-deploy: hapus image tanpa tag..."
OLD=$(gcloud artifacts docker images list \
  $REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$PROJECT \
  --filter="tags=''" \
  --format="value(version)" \
  --project=$PROJECT 2>/dev/null || true)

if [ -n "$OLD" ]; then
  while IFS= read -r digest; do
    [ -z "$digest" ] && continue
    echo "  Deleting $digest"
    gcloud artifacts docker images delete \
      "$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/$PROJECT@$digest" \
      --quiet --project=$PROJECT 2>/dev/null || true
  done <<< "$OLD"
  echo "  ✓ Selesai"
else
  echo "  ✓ Tidak ada image lama"
fi

# Hapus semua image di bankaset/app kecuali yang ber-tag 'latest'
echo "→ bankaset/app: hapus image tanpa tag 'latest'..."
OLD2=$(gcloud artifacts docker images list \
  $REGION-docker.pkg.dev/$PROJECT/bankaset/app \
  --format="value(version,TAGS)" \
  --project=$PROJECT 2>/dev/null \
  | grep -v "latest" | awk '{print $1}' || true)

if [ -n "$OLD2" ]; then
  while IFS= read -r digest; do
    [ -z "$digest" ] && continue
    echo "  Deleting $digest"
    gcloud artifacts docker images delete \
      "$REGION-docker.pkg.dev/$PROJECT/bankaset/app@$digest" \
      --delete-tags --quiet --project=$PROJECT 2>/dev/null || true
  done <<< "$OLD2"
  echo "  ✓ Selesai"
else
  echo "  ✓ Tidak ada image lama"
fi

echo ""
echo "Done!"
