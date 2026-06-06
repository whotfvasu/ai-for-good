#!/usr/bin/env bash
#
# Deploy the Marrow Lambdas + the shared IAM role.
#
#   bash scripts/deploy_lambdas.sh
#
# Idempotent — re-runs cleanly. First run creates everything; subsequent runs
# update code + configuration. Lambdas read from DynamoDB
# (MARROW_REPOSITORY=dynamodb), Python 3.12 on arm64.
#
# Requires:
#   - aws cli v2 configured for us-east-1
#   - DynamoDB tables already created (scripts/create_dynamodb_tables.py)
#   - Data already loaded (scripts/load_dataset.py)
#
# Does NOT wire API Gateway — use scripts/deploy_api_gateway.sh next.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ROLE_NAME="marrow-lambda-role"
BUILD_DIR=".build"
ZIP_PATH="${BUILD_DIR}/marrow.zip"

# Run from the repo root so the `backend/` package zips cleanly.
cd "$(dirname "$0")/.."

mkdir -p "$BUILD_DIR"

# -- 1. Build the deployment zip -------------------------------------------
echo "-> Building Lambda package..."
rm -f "$ZIP_PATH"
# Lambda Python 3.12 runtime ships boto3. We have no other pip deps.
# Zip just the `backend/` tree; each Lambda will reference its own handler.
zip -rq "$ZIP_PATH" backend \
  -x 'backend/__pycache__/*' \
  -x '**/__pycache__/*' \
  -x '*.pyc'
SIZE=$(du -sh "$ZIP_PATH" | cut -f1)
echo "  built $ZIP_PATH ($SIZE)"

# -- 2. Ensure shared execution role ---------------------------------------
echo "-> Ensuring IAM role $ROLE_NAME..."
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" \
  --query 'Role.Arn' --output text 2>/dev/null || true)

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "None" ]; then
  echo "  creating role..."

  TRUST=$(mktemp)
  cat > "$TRUST" <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF

  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST" \
    --description "Execution role for Marrow L1 Lambdas (DynamoDB read + CloudWatch logs)" \
    --query 'Role.Arn' --output text)
  rm -f "$TRUST"
  echo "  waiting 12s for IAM propagation..."
  sleep 12
fi
echo "  role: $ROLE_ARN"

echo "  applying inline policy..."
PERMS=$(mktemp)
cat > "$PERMS" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:$REGION:*:table/Patients",
        "arn:aws:dynamodb:$REGION:*:table/Donors",
        "arn:aws:dynamodb:$REGION:*:table/Cycles",
        "arn:aws:dynamodb:$REGION:*:table/Conversations",
        "arn:aws:dynamodb:$REGION:*:table/Refusals",
        "arn:aws:dynamodb:$REGION:*:table/DonorInsights",
        "arn:aws:dynamodb:$REGION:*:table/Confirmations"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
        "arn:aws:bedrock:*:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name MarrowLambdaPolicy \
  --policy-document "file://$PERMS"
rm -f "$PERMS"

# -- 3. Deploy the Lambdas -------------------------------------------------
# name|handler
LAMBDAS=(
  "marrow-health|backend.health.handler.lambda_handler"
  "marrow-forecast|backend.forecast.handler.lambda_handler"
  "marrow-rank-donors|backend.rank_donors.handler.lambda_handler"
  "marrow-family-ack|backend.family_ack.handler.lambda_handler"
  "marrow-notify-donor|backend.notify_donor.handler.lambda_handler"
  "marrow-distill-insight|backend.distill_insight.handler.lambda_handler"
  "marrow-saathi-chat|backend.saathi_chat.handler.lambda_handler"
  "marrow-bridge|backend.bridge.handler.lambda_handler"
  "marrow-cycle-runner|backend.cycle_runner.handler.lambda_handler"
  "marrow-confirm|backend.confirm.handler.lambda_handler"
  "marrow-cycles|backend.cycles.handler.lambda_handler"
  "marrow-cycle-assign|backend.cycle_assign.handler.lambda_handler"
)

# Shared env vars — flips repository.py from CsvRepository to DynamoRepository.
# Twilio creds are pulled from the deploying shell's environment (export them
# before running, or leave unset — whatsapp.py no-ops without them). The demo
# recipient is the one phone that receives real messages on stage.
ENV_JSON=$(cat <<JSON
{"Variables":{
  "MARROW_REPOSITORY":"dynamodb",
  "MARROW_PATIENTS_TABLE":"Patients",
  "MARROW_DONORS_TABLE":"Donors",
  "MARROW_INSIGHTS_TABLE":"DonorInsights",
  "MARROW_CONVERSATIONS_TABLE":"Conversations",
  "MARROW_CONFIRMATIONS_TABLE":"Confirmations",
  "MARROW_DISTILL_INSIGHT_FUNCTION":"marrow-distill-insight",
  "TWILIO_SID":"${TWILIO_SID:-}",
  "TWILIO_TOKEN":"${TWILIO_TOKEN:-}",
  "TWILIO_FROM":"${TWILIO_FROM:-}",
  "MARROW_DEMO_WHATSAPP_TO":"${MARROW_DEMO_WHATSAPP_TO:-}"
}}
JSON
)
# Collapse to one line so the AWS CLI accepts it.
ENV_JSON=$(echo "$ENV_JSON" | tr -d '\n' | tr -s ' ')

deployed_arns=()

for entry in "${LAMBDAS[@]}"; do
  NAME="${entry%%|*}"
  HANDLER="${entry##*|}"

  echo "-> Deploying $NAME..."

  if aws lambda get-function --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "  updating code..."
    aws lambda update-function-code \
      --function-name "$NAME" \
      --zip-file "fileb://$ZIP_PATH" \
      --region "$REGION" \
      --output text --query 'FunctionArn' > /dev/null

    # Code update is async — must finish before we can update config.
    aws lambda wait function-updated --function-name "$NAME" --region "$REGION"

    echo "  updating configuration..."
    aws lambda update-function-configuration \
      --function-name "$NAME" \
      --runtime python3.12 \
      --role "$ROLE_ARN" \
      --handler "$HANDLER" \
      --memory-size 256 \
      --timeout 30 \
      --environment "$ENV_JSON" \
      --region "$REGION" \
      --output text --query 'FunctionArn' > /dev/null

    aws lambda wait function-updated --function-name "$NAME" --region "$REGION"
  else
    echo "  creating..."
    aws lambda create-function \
      --function-name "$NAME" \
      --runtime python3.12 \
      --architectures arm64 \
      --role "$ROLE_ARN" \
      --handler "$HANDLER" \
      --zip-file "fileb://$ZIP_PATH" \
      --memory-size 256 \
      --timeout 30 \
      --environment "$ENV_JSON" \
      --region "$REGION" \
      --output text --query 'FunctionArn' > /dev/null

    aws lambda wait function-active --function-name "$NAME" --region "$REGION"
  fi

  ARN=$(aws lambda get-function --function-name "$NAME" --region "$REGION" \
    --query 'Configuration.FunctionArn' --output text)
  deployed_arns+=("$NAME -> $ARN")
  echo "  $ARN"
done

echo ""
echo "OK All Lambdas deployed."
echo ""
echo "Summary:"
for line in "${deployed_arns[@]}"; do
  echo "  $line"
done

echo ""
echo "Smoke test (should print {\"ok\":true,\"service\":\"marrow-api\"} ):"
echo "  aws lambda invoke --function-name marrow-health \\"
echo "    --region $REGION --payload '{}' \\"
echo "    --cli-binary-format raw-in-base64-out /tmp/out.json && cat /tmp/out.json"
echo ""
echo "Live data test:"
echo "  aws lambda invoke --function-name marrow-forecast \\"
echo "    --region $REGION \\"
echo "    --payload '{\"queryStringParameters\":{\"anchor_date\":\"2025-08-17\",\"window\":\"7\"}}' \\"
echo "    --cli-binary-format raw-in-base64-out /tmp/out.json && cat /tmp/out.json | head -c 800"
