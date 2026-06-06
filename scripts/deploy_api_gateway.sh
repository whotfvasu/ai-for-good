#!/usr/bin/env bash
#
# Create / update the marrow-api HTTP API Gateway and wire the four L1 routes.
#
#   bash scripts/deploy_api_gateway.sh
#
# Idempotent. Run after scripts/deploy_lambdas.sh.
#
# Wires the current Marrow API routes to Lambda.
#
# Opens CORS to the Amplify origin and localhost:3000.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
API_NAME="marrow-api"
AMPLIFY_ORIGIN="${AMPLIFY_ORIGIN:-https://vasu.d3c96kkpfabejg.amplifyapp.com}"

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "Account: $ACCOUNT  Region: $REGION"

# -- 1. CORS config (JSON file because shorthand parsing is awful) ---------
CORS_FILE=$(mktemp)
cat > "$CORS_FILE" <<EOF
{
  "AllowOrigins": ["${AMPLIFY_ORIGIN}", "http://localhost:3000"],
  "AllowMethods": ["GET", "POST", "OPTIONS"],
  "AllowHeaders": ["content-type", "authorization"],
  "MaxAge": 3600
}
EOF

# -- 2. Find or create the HTTP API ----------------------------------------
API_ID=$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'] | [0].ApiId" --output text 2>/dev/null || echo "")

if [ "$API_ID" = "None" ] || [ -z "$API_ID" ]; then
  echo "-> Creating HTTP API $API_NAME..."
  API_ID=$(aws apigatewayv2 create-api \
    --name "$API_NAME" \
    --protocol-type HTTP \
    --cors-configuration "file://$CORS_FILE" \
    --region "$REGION" \
    --query 'ApiId' --output text)
  echo "   $API_ID"
else
  echo "-> Updating CORS on existing API $API_ID..."
  aws apigatewayv2 update-api \
    --api-id "$API_ID" \
    --cors-configuration "file://$CORS_FILE" \
    --region "$REGION" > /dev/null
fi
rm -f "$CORS_FILE"

API_ENDPOINT="https://${API_ID}.execute-api.${REGION}.amazonaws.com"

# -- 3. Routes: method, path, lambda name (space-separated) ----------------
ROUTES=(
  "GET /health marrow-health"
  "GET /forecast marrow-forecast"
  "GET /rank-donors marrow-rank-donors"
  "POST /family/ack marrow-family-ack"
  "POST /notify/donor marrow-notify-donor"
  "GET /donor/{id}/insight marrow-saathi-chat"
  "GET /saathi/chat/open marrow-saathi-chat"
  "POST /saathi/chat/turn marrow-saathi-chat"
  "GET /conversations marrow-saathi-chat"
)

for entry in "${ROUTES[@]}"; do
  read -r METHOD ROUTE_PATH LAMBDA_NAME <<< "$entry"
  ROUTE_KEY="$METHOD $ROUTE_PATH"
  LAMBDA_ARN="arn:aws:lambda:$REGION:$ACCOUNT:function:$LAMBDA_NAME"

  echo "-> Wiring '$ROUTE_KEY' -> $LAMBDA_NAME"

  # 3a. Integration (Lambda proxy)
  INTEGRATION_ID=$(aws apigatewayv2 get-integrations \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?contains(IntegrationUri, ':function:$LAMBDA_NAME')] | [0].IntegrationId" \
    --output text 2>/dev/null || echo "")

  if [ "$INTEGRATION_ID" = "None" ] || [ -z "$INTEGRATION_ID" ]; then
    INTEGRATION_ID=$(aws apigatewayv2 create-integration \
      --api-id "$API_ID" \
      --integration-type AWS_PROXY \
      --integration-uri "$LAMBDA_ARN" \
      --payload-format-version "2.0" \
      --region "$REGION" \
      --query 'IntegrationId' --output text)
    echo "   integration: $INTEGRATION_ID (created)"
  else
    echo "   integration: $INTEGRATION_ID (reused)"
  fi

  # 3b. Route (create or update to point at the right integration)
  EXISTING_ROUTE_ID=$(aws apigatewayv2 get-routes \
    --api-id "$API_ID" \
    --region "$REGION" \
    --query "Items[?RouteKey=='$ROUTE_KEY'] | [0].RouteId" \
    --output text 2>/dev/null || echo "")

  if [ "$EXISTING_ROUTE_ID" = "None" ] || [ -z "$EXISTING_ROUTE_ID" ]; then
    aws apigatewayv2 create-route \
      --api-id "$API_ID" \
      --route-key "$ROUTE_KEY" \
      --target "integrations/$INTEGRATION_ID" \
      --region "$REGION" > /dev/null
    echo "   route created"
  else
    aws apigatewayv2 update-route \
      --api-id "$API_ID" \
      --route-id "$EXISTING_ROUTE_ID" \
      --target "integrations/$INTEGRATION_ID" \
      --region "$REGION" > /dev/null
    echo "   route updated"
  fi

  # 3c. Lambda permission for API Gateway to invoke this Lambda
  # Statement ID must be alphanumeric/dash/underscore.
  SID=$(echo "apigw-${METHOD}-${ROUTE_PATH}" | tr -c 'a-zA-Z0-9-' '-')
  aws lambda add-permission \
    --function-name "$LAMBDA_NAME" \
    --statement-id "$SID" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT:$API_ID/*/*" \
    --region "$REGION" >/dev/null 2>&1 || echo "   permission already exists"
done

# -- 4. Ensure $default stage with auto-deploy -----------------------------
echo "-> Ensuring \$default stage..."
EXISTING_STAGE=$(aws apigatewayv2 get-stage \
  --api-id "$API_ID" \
  --stage-name '$default' \
  --region "$REGION" \
  --query 'StageName' --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_STAGE" ]; then
  aws apigatewayv2 create-stage \
    --api-id "$API_ID" \
    --stage-name '$default' \
    --auto-deploy \
    --region "$REGION" > /dev/null
  echo "   created with auto-deploy"
else
  echo "   already present"
fi

echo ""
echo "============================================================"
echo "OK API live: $API_ENDPOINT"
echo "============================================================"
echo ""
echo "Smoke tests (no auth, plain curl):"
echo ""
echo "  curl $API_ENDPOINT/health"
echo ""
echo "  curl '$API_ENDPOINT/forecast?anchor_date=2025-08-17&window=7' | head -c 600"
echo ""
echo "  # Pick a real patient_id from the forecast response, then:"
echo "  curl '$API_ENDPOINT/rank-donors?patient_id=PASTE_ID&anchor_date=2025-08-17&limit=5'"
echo ""
echo "Next step: paste this URL into Amplify console as NEXT_PUBLIC_API_URL."
echo "  $API_ENDPOINT"
