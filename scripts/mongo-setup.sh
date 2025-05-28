#!/bin/bash
# Interactive script to:
# 1. Ensure jq is installed (installs via Homebrew if missing).
# 2. List Atlas projects and let you choose one.
# 3. List clusters in the chosen project and let you choose one.
# 4. Retrieve the connection string for the chosen cluster.
# 5. Set EB environment variables using the connection string.

# Step 0: Ensure jq is installed.
if ! command -v jq >/dev/null; then
  echo "jq not found. Attempting to install via Homebrew..."
  if command -v brew >/dev/null; then
    brew install jq
  else
    echo "Homebrew not found. Please install jq manually."
    exit 1
  fi
fi

# Step 1: List available projects.
echo "Fetching projects..."
projects_json=$(atlas projects list --output json)
if [ -z "$projects_json" ]; then
    echo "No projects found."
    exit 1
fi

# Determine structure: if "results" exists, use that; otherwise, assume top-level array.
if echo "$projects_json" | jq 'has("results")' | grep -q true; then
    projects_output=$(echo "$projects_json" | jq -r '.results[] | "\(.id) - \(.name)"')
else
    projects_output=$(echo "$projects_json" | jq -r '.[] | "\(.id) - \(.name)"')
fi

if [ -z "$projects_output" ]; then
    echo "Projects JSON structure:"
    echo "$projects_json" | jq .
    echo "No projects found with the expected keys."
    exit 1
fi

echo "Available Projects (format: ID - Name):"
echo "$projects_output"
echo -n "Enter the project ID from the list above: "
read PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo "Project ID is required."
    exit 1
fi

export ATLAS_PROJECT_ID="$PROJECT_ID"

# Step 2: List clusters in the selected project.
echo "Fetching clusters for project $PROJECT_ID..."
clusters_json=$(atlas clusters list --projectId "$PROJECT_ID" --output json)
if [ -z "$clusters_json" ]; then
    echo "No clusters found for project $PROJECT_ID."
    exit 1
fi

if echo "$clusters_json" | jq 'has("results")' | grep -q true; then
    clusters_output=$(echo "$clusters_json" | jq -r '.results[] | "\(.id) - \(.name)"')
else
    clusters_output=$(echo "$clusters_json" | jq -r '.[] | "\(.id) - \(.name)"')
fi

if [ -z "$clusters_output" ]; then
    echo "Clusters JSON structure:"
    echo "$clusters_json" | jq .
    echo "No clusters found with the expected keys."
    exit 1
fi

echo "Available Clusters (format: ID - Name):"
echo "$clusters_output"
echo -n "Enter the cluster name from the list above: "
read CLUSTER_NAME

if [ -z "$CLUSTER_NAME" ]; then
    echo "Cluster name is required."
    exit 1
fi

# Step 3: Retrieve the connection string.
echo "Fetching connection string for cluster $CLUSTER_NAME..."
connection_output=$(atlas clusters connectionStrings describe "$CLUSTER_NAME" --projectId "$PROJECT_ID" --output json)
# Try to get the standardSrv key first, then fallback to standard.
connection_string=$(echo "$connection_output" | jq -r '.standardSrv')
if [ "$connection_string" = "null" ] || [ -z "$connection_string" ]; then
    connection_string=$(echo "$connection_output" | jq -r '.standard')
fi

if [ -z "$connection_string" ] || [ "$connection_string" = "null" ]; then
    echo "Could not retrieve connection string for cluster $CLUSTER_NAME."
    echo "Connection output:"
    echo "$connection_output" | jq .
    exit 1
fi

echo "Retrieved Connection String:"
echo "$connection_string"

# Step 4: Set Elastic Beanstalk environment variables.
echo "Setting Elastic Beanstalk environment variables..."
eb setenv MONGODB_URI="${connection_string}" AWS_REGION=us-east-1 S3_BUCKET=learning-lab-demo--bucket ACCESS_TOKEN_SECRET=test-secret NODE_ENV=production

echo "Environment variables set successfully."
