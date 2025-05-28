#!/bin/bash
# Script to create an OpenSearch Serverless collection using AWS CLI
# This automates the creation process without requiring AWS Console access

set -e  # Exit on error

# Collection details
COLLECTION_NAME="learning-lab-collection"
REGION="${AWS_REGION:-us-east-1}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check credentials
echo "Verifying AWS credentials..."
aws sts get-caller-identity

# Create the OpenSearch Serverless collection
echo "Creating OpenSearch Serverless collection: $COLLECTION_NAME"
COLLECTION_RESPONSE=$(aws opensearchserverless create-collection \
  --name "$COLLECTION_NAME" \
  --type "SEARCH" \
  --region "$REGION" \
  --description "Serverless collection for Learning Lab RAG application")

# Extract collection ID
COLLECTION_ID=$(echo "$COLLECTION_RESPONSE" | grep -o '"id": "[^"]*' | cut -d'"' -f4)
echo "Collection creation initiated. Collection ID: $COLLECTION_ID"

# Create network policy
echo "Creating network policy..."
NETWORK_POLICY_NAME="${COLLECTION_NAME}-network-policy"
NETWORK_POLICY=$(cat <<EOF
[
  {
    "Rules": [
      {
        "ResourceType": "collection",
        "Resource": ["collection/$COLLECTION_NAME"]
      }
    ],
    "AllowFromPublic": true
  }
]
EOF
)

aws opensearchserverless create-security-policy \
  --name "$NETWORK_POLICY_NAME" \
  --type "network" \
  --region "$REGION" \
  --description "Network policy for $COLLECTION_NAME" \
  --policy "$NETWORK_POLICY"

echo "Network policy created successfully."

# Create data access policy
echo "Creating data access policy..."
DATA_POLICY_NAME="${COLLECTION_NAME}-data-policy"
DATA_POLICY=$(cat <<EOF
[
  {
    "Rules": [
      {
        "ResourceType": "index",
        "Resource": ["index/$COLLECTION_NAME/*"],
        "Permission": [
          "aoss:CreateIndex",
          "aoss:DeleteIndex",
          "aoss:UpdateIndex",
          "aoss:DescribeIndex",
          "aoss:ReadDocument",
          "aoss:WriteDocument"
        ]
      },
      {
        "ResourceType": "collection",
        "Resource": ["collection/$COLLECTION_NAME"],
        "Permission": [
          "aoss:CreateCollectionItems",
          "aoss:DeleteCollectionItems",
          "aoss:UpdateCollectionItems",
          "aoss:DescribeCollectionItems"
        ]
      }
    ],
    "Principal": ["*"]
  }
]
EOF
)

aws opensearchserverless create-security-policy \
  --name "$DATA_POLICY_NAME" \
  --type "data" \
  --region "$REGION" \
  --description "Data access policy for $COLLECTION_NAME" \
  --policy "$DATA_POLICY"

echo "Data access policy created successfully."

# Wait for collection to be active
echo "Waiting for collection to become active..."
echo "This may take 10-15 minutes..."

while true; do
  STATUS=$(aws opensearchserverless batch-get-collection \
    --names "$COLLECTION_NAME" \
    --region "$REGION" \
    --query 'collectionDetails[0].status' \
    --output text)
  
  echo "Current status: $STATUS"
  
  if [ "$STATUS" = "ACTIVE" ]; then
    echo "Collection is now active!"
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo "Collection creation failed."
    exit 1
  fi
  
  echo "Still waiting... (checking again in 30 seconds)"
  sleep 30
done

# Get the collection endpoint
ENDPOINT=$(aws opensearchserverless batch-get-collection \
  --names "$COLLECTION_NAME" \
  --region "$REGION" \
  --query 'collectionDetails[0].collectionEndpoint' \
  --output text)

echo "Collection endpoint: $ENDPOINT"

# Update the .env file with the new endpoint
if [ -f .env ]; then
  # Check if OPENSEARCH_URL already exists in .env
  if grep -q "OPENSEARCH_URL=" .env; then
    # Replace existing line
    sed -i '' "s|OPENSEARCH_URL=.*|OPENSEARCH_URL=$ENDPOINT|" .env
  else
    # Add new line
    echo "OPENSEARCH_URL=$ENDPOINT" >> .env
  fi
  echo ".env file updated with the new OpenSearch endpoint."
else
  echo "OPENSEARCH_URL=$ENDPOINT" > .env
  echo ".env file created with OpenSearch endpoint."
fi

echo "==============================================================="
echo "OpenSearch Serverless collection setup completed successfully!"
echo "Collection Name: $COLLECTION_NAME"
echo "Collection ID: $COLLECTION_ID"
echo "Endpoint: $ENDPOINT"
echo ""
echo "Next steps:"
echo "1. Run 'node test-serverless-opensearch.js' to test the connection"
echo "2. Run 'node test-serverless-rag-pipeline.js' to test the full RAG pipeline"
echo "==============================================================="