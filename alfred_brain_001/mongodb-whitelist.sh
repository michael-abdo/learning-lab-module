#!/bin/bash

echo "=== MongoDB Atlas IP Whitelisting Guide ==="
echo ""
echo "To whitelist your server's IP address in MongoDB Atlas:"
echo ""
echo "1. Log in to MongoDB Atlas at https://cloud.mongodb.com"
echo "2. Navigate to your Learning Labs project"
echo "3. Click on 'Network Access' in the left sidebar"
echo "4. Click the '+ ADD IP ADDRESS' button"
echo "5. For testing/development, you can add 0.0.0.0/0 to allow all IPs"
echo "   (Note: For production, you should use your server's specific IP)"
echo "6. Click 'Confirm' to save the whitelist entry"
echo ""
echo "After whitelisting, run the following to start the server:"
echo "  ./start-production.sh"
echo ""
echo "Then verify deployment with:"
echo "  ./check-status.sh"

# Make the script executable for convenience
chmod +x mongodb-whitelist.sh