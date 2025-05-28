# AWS Deployment Guide for Alfred Brain

This guide provides step-by-step instructions for deploying Alfred Brain on AWS for production testing.

## Prerequisites

Before starting deployment, make sure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** configured with your credentials
3. **Node.js** (v16+) installed
4. **MongoDB Atlas** account (free tier is sufficient for testing)
5. **TryTerra API** credentials

## Step 1: Clone the Repository

```bash
git clone https://github.com/Runtheons/Runtheons_Beta_Backend.git
cd Runtheons_Beta_Backend
git checkout alfred-brain
```

## Step 2: Configure Environment Variables

Create a `.env` file with the following variables:

```
# MongoDB Atlas
MONGODB_URI=mongodb+srv://[username]:[password]@[cluster].mongodb.net/alfred-brain?retryWrites=true&w=majority

# AWS Configuration
AWS_ACCESS_KEY_ID=[your-aws-access-key]
AWS_SECRET_ACCESS_KEY=[your-aws-secret-key]
AWS_REGION=us-east-1

# TryTerra API
TRYTERRA_API_KEY_1=[your-terra-api-key]
TRYTERRA_API_KEY_2=[your-terra-secondary-key]
TRYTERRA_DEV_ID=[your-terra-dev-id]

# LLM Integration (OpenAI)
OPENAI_API_KEY=[your-openai-api-key]

# Environment
PORT=8080
NODE_ENV=production
LOG_LEVEL=INFO

# Alert Thresholds
HIGH_HEART_RATE_THRESHOLD=180
LOW_DAILY_STEPS_THRESHOLD=2000
HIGH_RESTING_HEART_RATE_THRESHOLD=90
LOW_SLEEP_DURATION_THRESHOLD=360
ENABLE_ALERTS=true

# Scheduler Configuration
DATA_FETCH_INTERVAL=0 */6 * * *
USER_FETCH_LIMIT=50
USER_FETCH_DELAY=200
DEFAULT_LOOKBACK_DAYS=7
MAX_FETCH_RETRIES=3
RETRY_DELAY=1000
```

## Step 3: Set Up MongoDB Atlas

1. Create a MongoDB Atlas account at [https://cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a new cluster (free tier is fine for testing)
3. Create a database user with read/write permissions
4. Get your connection string and update it in the `.env` file
5. Whitelist access from anywhere (0.0.0.0/0) for testing purposes

## Step 4: Install Dependencies

```bash
npm install
```

## Step 5: Deploy AWS Infrastructure

We'll use CloudFormation stacks to deploy the AWS resources:

### Option 1: Automated Deployment

Run the deployment script and choose option 4 to deploy all stacks:

```bash
node scripts/deploy-aws-infrastructure.js
```

Answer the prompts to configure the stacks. Use the default values for most parameters.

### Option 2: Step-by-Step Manual Deployment

If you prefer to deploy each stack individually:

1. **S3 Bucket Deployment**:
   ```bash
   node scripts/deploy-aws-infrastructure.js
   # Choose option 1 for S3 Bucket
   ```

2. **IAM Roles Deployment**:
   ```bash
   node scripts/deploy-aws-infrastructure.js
   # Choose option 2 for IAM Roles
   ```

3. **Terra Scheduler Deployment** (if you want to use Lambda):
   ```bash
   node scripts/deploy-aws-infrastructure.js
   # Choose option 3 for Terra Scheduler
   ```

## Step 6: Set Up EC2 Instance (for Native Service Approach)

If you want to run the server on EC2 instead of Lambda:

1. Launch an EC2 instance (t2.micro is sufficient for testing)
   - Amazon Linux 2 or Ubuntu Server recommended
   - Configure security group to allow inbound traffic on port 8080 (or your PORT value)

2. Connect to your EC2 instance:
   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-public-dns
   ```

3. Install dependencies:
   ```bash
   # For Amazon Linux 2
   sudo yum update -y
   sudo yum install -y git nodejs npm
   
   # For Ubuntu
   sudo apt update
   sudo apt install -y git nodejs npm
   ```

4. Install PM2 globally:
   ```bash
   sudo npm install -g pm2
   ```

5. Clone and checkout the repository:
   ```bash
   git clone https://github.com/Runtheons/Runtheons_Beta_Backend.git
   cd Runtheons_Beta_Backend
   git checkout alfred-brain
   ```

6. Create the `.env` file with your configuration (same as Step 2)

7. Install dependencies:
   ```bash
   npm install
   ```

8. Start the server with PM2:
   ```bash
   pm2 start backend/server.js --name alfred-brain-api
   pm2 save
   ```

9. Set up PM2 to start on boot:
   ```bash
   pm2 startup
   # Run the command that PM2 provides
   ```

## Step 7: Set Up AWS Elastic Beanstalk (Alternative to EC2)

For easier deployment and management:

1. Install the EB CLI:
   ```bash
   pip install awsebcli
   ```

2. Initialize Elastic Beanstalk:
   ```bash
   eb init
   # Follow the prompts to configure your application
   ```

3. Create an environment:
   ```bash
   eb create alfred-brain-env
   ```

4. Deploy the application:
   ```bash
   eb deploy
   ```

## Step 8: Configure TryTerra Webhook

For the webhook to work properly, you need:

1. A publicly accessible URL for your server
2. Configure TryTerra to send webhooks to:
   ```
   https://your-server-url/api/terra/webhook
   ```

If using EC2 with a dynamic IP, consider using:
- Elastic IP address
- Route 53 for DNS
- API Gateway as a proxy

## Step 9: Verify Deployment

### Test API Endpoints

```bash
# Test health endpoint
curl https://your-server-url/health

# Test Terra auth widget endpoint (requires authorization)
curl -H "Authorization: Bearer YOUR_TEST_TOKEN" https://your-server-url/api/terra/auth/widget
```

### Monitor Services

For EC2:
```bash
# View logs
pm2 logs alfred-brain-api

# Check service status
pm2 status
```

For Elastic Beanstalk:
```bash
# View application health
eb health

# View logs
eb logs
```

## Step 10: Connect a Test Device

1. Create a test user in your application
2. Generate an auth widget for TryTerra
3. Connect a test device
4. Verify data is being fetched and processed

## Step 11: Run Tests in Production Environment

```bash
# Test Terra Lambda function (if deployed)
node scripts/test-live-lambda.js

# Test decision logic
node scripts/test-decision-logic.js
```

## Troubleshooting

### MongoDB Connection Issues
- Verify MongoDB Atlas IP whitelist
- Check connection string in `.env`
- Ensure network connectivity from your server to MongoDB Atlas

### AWS Lambda Issues
- Check CloudWatch logs for Lambda functions
- Verify IAM permissions
- Check environment variables for Lambda functions

### Server Issues
- Check PM2 logs: `pm2 logs alfred-brain-api`
- Verify security group allows traffic on your port
- Check for errors in the application logs

## Clean Up Resources

When you're done testing:

```bash
# Delete CloudFormation stacks
aws cloudformation delete-stack --stack-name alfred-brain-s3
aws cloudformation delete-stack --stack-name alfred-brain-iam
aws cloudformation delete-stack --stack-name alfred-brain-terra

# Terminate EC2 instance (if used)
aws ec2 terminate-instances --instance-ids YOUR_INSTANCE_ID

# Delete Elastic Beanstalk environment (if used)
eb terminate alfred-brain-env
```

## Additional Resources

- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- [TryTerra API Documentation](https://docs.tryterra.co/)