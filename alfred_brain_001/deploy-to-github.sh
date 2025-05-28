#!/bin/bash

# Script to deploy ONLY the current directory contents to a specific GitHub branch
# This creates a brand new branch with exactly the contents of this directory

# Exit on any error
set -e

echo "Starting deployment of current directory to GitHub..."

# Create two temporary directories
TEMP_DIR=$(mktemp -d)
CONTENT_DIR=$(mktemp -d)
echo "Created temporary directories"

# First, copy all contents from current directory to content directory
echo "Copying current directory contents..."
cp -r . "$CONTENT_DIR/"

# Go to the temp directory and set up git
cd "$TEMP_DIR"

# Initialize a new git repository
echo "Initializing new git repository..."
git init
git config --local user.email "deploy@example.com"
git config --local user.name "Deployment Script"
git remote add origin https://github.com/Runtheons/Runtheons_Beta_Backend.git

# Create an orphan branch (completely new branch with no history)
echo "Creating orphan branch..."
git checkout --orphan alfred-brain

# Now, copy all files from the content directory to this git repo
echo "Copying files to git repository..."
cp -r "$CONTENT_DIR"/* ./
cp -r "$CONTENT_DIR"/.[!.]* ./ 2>/dev/null || true  # Copy hidden files

# Add all files to git
echo "Adding files to git..."
git add -A

# Commit the changes
echo "Committing changes..."
git commit -m "Deploy alfred_brain_001 directory with Expert Advisor feature"

# Force push to the alfred-brain branch
echo "Pushing to GitHub alfred-brain branch..."
git push origin alfred-brain --force

# Return to original directory
cd -

# Clean up
echo "Cleaning up temporary directories..."
rm -rf "$TEMP_DIR" "$CONTENT_DIR"

echo "Deployment completed successfully!"