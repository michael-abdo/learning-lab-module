#!/bin/bash
# Script to clean up OpenSearch Serverless resources
# This script deletes the collection and associated security policies

set -e  # Exit on error

# Collection details
COLLECTION_NAME="learning-lab-collection"
REGION="${AWS_REGION:-us-east-1}"
NETWORK_POLICY_NAME="${COLLECTION_NAME}-network-policy"
DATA_POLICY_NAME="${COLLECTION_NAME}-data-policy"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check credentials
echo "Verifying AWS credentials..."
aws sts get-caller-identity

# Confirm deletion
read -p "Are you sure you want to delete the OpenSearch Serverless collection '$COLLECTION_NAME' and its policies? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Operation cancelled."
    exit 0
fi

# Delete the collection
echo "Deleting collection: $COLLECTION_NAME"
aws opensearchserverless delete-collection \
  --id "$COLLECTION_NAME" \
  --region "$REGION" || echo "Collection deletion failed or collection does not exist."

echo "Collection deletion initiated. It may take some time to complete."

# Wait for collection to be deleted
echo "Waiting for collection to be deleted..."
while true; do
  COLLECTION_EXISTS=$(aws opensearchserverless batch-get-collection \
    --names "$COLLECTION_NAME" \
    --region "$REGION" \
    --query 'collectionDetails[0].status' \
    --output text 2>/dev/null || echo "NOT_FOUND")
  
  if [ "$COLLECTION_EXISTS" = "NOT_FOUND" ] || [ "$COLLECTION_EXISTS" = "None" ]; then
    echo "Collection has been deleted."
    break
  else
    echo "Current status: $COLLECTION_EXISTS"
    echo "Still waiting... (checking again in 10 seconds)"
    sleep 10
  fi
done

# Delete network policy
echo "Deleting network policy: $NETWORK_POLICY_NAME"
aws opensearchserverless delete-security-policy \
  --name "$NETWORK_POLICY_NAME" \
  --type "network" \
  --region "$REGION" || echo "Network policy deletion failed or policy does not exist."

# Delete data access policy
echo "Deleting data access policy: $DATA_POLICY_NAME"
aws opensearchserverless delete-security-policy \
  --name "$DATA_POLICY_NAME" \
  --type "data" \
  --region "$REGION" || echo "Data policy deletion failed or policy does not exist."

echo "==============================================================="
echo "Cleanup completed!"
echo "All OpenSearch Serverless resources for $COLLECTION_NAME have been deleted."
echo "==============================================================="