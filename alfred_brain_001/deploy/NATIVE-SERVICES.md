# Native Services Documentation

## Overview

This document provides comprehensive technical documentation for the native services implementation that replaces AWS Lambda functions in the Alfred Brain system. The migration from Lambda to native Node.js services within the Express application enhances maintainability, reduces AWS dependencies, and improves overall system control while maintaining full functionality.

## Table of Contents

1. [Architecture](#architecture)
2. [Services](#services)
   - [TryTerra Scheduler Service](#tryterra-scheduler-service)
   - [Wearable Data Processor Service](#wearable-data-processor-service)
   - [Logger](#logger-utility)
3. [API](#api)
   - [Terra API](#terra-api)
4. [Models](#models)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Deployment](#deployment)

## Architecture

### Previous Architecture (Lambda-based)

The previous architecture relied on two primary AWS Lambda functions:

1. **fetchTerraData.js Lambda**: 
   - Triggered by CloudWatch Events on a schedule
   - Retrieved data from TryTerra API
   - Stored wearable data in MongoDB
   - Triggered data processing

2. **processWearableData.js Lambda**:
   - Analyzed wearable data for thresholds/alerts
   - Generated alerts based on configured thresholds
   - Tagged data as processed
   - Used AWS SNS for notifications

### New Architecture (Native Services)

The new architecture internalizes these Lambda functions as native services:

1. **terraSchedulerService.js**:
   - Replaces fetchTerraData.js Lambda
   - Uses node-cron for scheduling
   - Manages data fetch schedules for all users
   - Handles fetch retries with exponential backoff

2. **wearableDataProcessor.js**:
   - Replaces processWearableData.js Lambda
   - Processes wearable data against thresholds
   - Generates alerts based on same logic
   - Stores alerts in MongoDB
   - Integrates with notification service

### Architectural Benefits

- **Simplified Deployment**: Single-service deployment vs. multiple Lambda deployments
- **Reduced Latency**: No cold starts and API Gateway overhead
- **Improved Debugging**: Centralized logging and error handling
- **Cost Efficiency**: Eliminated pay-per-invocation Lambda costs
- **Enhanced Control**: Direct access to service lifecycle and configuration

## Services

### TryTerra Scheduler Service

**File**: `backend/services/terraSchedulerService.js`

#### Purpose

The TryTerra Scheduler Service manages scheduled data fetching from the TryTerra API. It replaces the AWS Lambda function `fetchTerraData.js` that was previously triggered by CloudWatch Events.

#### Key Features

- **Job Scheduling**: Uses node-cron for configurable schedule management
- **User Fetch Management**: Supports both all-user and per-user scheduling
- **Fault Tolerance**: Implements exponential backoff retry logic
- **Rate Limiting**: Controls API request rates to prevent TryTerra throttling
- **Batch Processing**: Processes users in batches to manage memory use

#### API Reference

```javascript
// Initialize the scheduler service
terraScheduler.init({
  startScheduler: true,  // Start scheduler immediately
  initialFetch: false    // Perform initial fetch on startup
});

// Schedule data fetching for all users
terraScheduler.scheduleAllUsersFetch(customInterval);

// Schedule data fetching for a specific user
terraScheduler.scheduleUserFetch(userId, terraUserId, customInterval);

// Stop a scheduled job
terraScheduler.stopScheduledJob(jobId);

// Get all active jobs
terraScheduler.getActiveJobs();

// Fetch data for all users (can be manual or scheduled)
terraScheduler.fetchDataForAllUsers({
  batchSize: 50,      // Number of users to process in each batch
  skipUsers: 0,       // Number of users to skip (for pagination)
  processData: true   // Trigger data processing after fetching
});

// Fetch data for a specific user
terraScheduler.fetchDataForUser(userId, terraUserId, referenceId, {
  processData: true,     // Trigger data processing after fetching
  dataTypes: ['activity', 'sleep'],  // Specific data types to fetch
  lookbackDays: 7        // Number of days to look back
});

// Manually trigger a data fetch for a user
terraScheduler.manualFetchForUser(userId);
```

#### Configuration

The service uses environment-based configuration with sensible defaults:

```javascript
// Data fetch interval (cron expression)
DATA_FETCH_INTERVAL='0 */6 * * *'  // Every 6 hours by default

// Batch processing configuration
USER_FETCH_LIMIT=50               // Process users in batches of 50
USER_FETCH_DELAY=200              // 200ms delay between user fetches

// Date range configuration
DEFAULT_LOOKBACK_DAYS=7           // Default days to look back

// Retry configuration
MAX_FETCH_RETRIES=3               // Maximum retries on failure
RETRY_DELAY=1000                  // Delay between retries in ms

// Notification configuration
ENABLE_NOTIFICATIONS=false        // Enable notifications
NOTIFICATION_EMAIL='admin@example.com'  // Notification recipient
```

### Wearable Data Processor Service

**File**: `backend/services/wearableDataProcessor.js`

#### Purpose

The Wearable Data Processor Service analyzes wearable data from TryTerra, applies decision logic, and generates alerts based on configured thresholds. It replaces the AWS Lambda function `processWearableData.js`.

#### Key Features

- **Threshold-Based Alerts**: Configurable thresholds for health metrics
- **Multiple Metric Support**: Processes heart rate, steps, sleep, and more
- **Alert Generation**: Creates structured alert records
- **Notification Integration**: Sends notifications for alerts
- **Batch Processing**: Supports processing data in batches
- **Status Tracking**: Tracks processing status for each data record

#### API Reference

```javascript
// Initialize the processor service
wearableDataProcessor.init({
  processOnStartup: false  // Process pending data on startup
});

// Process data for a specific user
wearableDataProcessor.processUserData(userId, terraUserId, {
  // Optional configuration
});

// Process all pending data in batches
wearableDataProcessor.processAllPendingData({
  batchSize: 50  // Number of records to process in a batch
});
```

#### Metrics & Thresholds

The service monitors the following health metrics:

| Metric | Alert Type | Default Threshold | Environment Variable |
|--------|------------|------------------|----------------------|
| Heart Rate | `high_heart_rate` | >180 BPM | `HIGH_HEART_RATE_THRESHOLD` |
| Resting Heart Rate | `high_resting_heart_rate` | >90 BPM | `HIGH_RESTING_HEART_RATE_THRESHOLD` |
| Daily Steps | `low_steps` | <2,000 steps | `LOW_DAILY_STEPS_THRESHOLD` |
| Sleep Duration | `low_sleep_duration` | <6 hours | `LOW_SLEEP_DURATION_THRESHOLD` |

#### Alert Structure

Each alert follows this structure:

```javascript
{
  type: 'high_heart_rate',       // Alert type
  severity: 'high',              // Alert severity
  value: 190,                    // Current value triggering alert
  threshold: 180,                // Threshold that was exceeded
  message: 'High heart rate...',  // Human readable message
  recommendation: 'Consider...'   // Recommended action
}
```

### Logger Utility

**File**: `backend/utils/logger.js`

#### Purpose

The Logger Utility provides structured, level-based logging across all services. It supports metadata inclusion and configurable log levels.

#### Key Features

- **Log Levels**: ERROR, WARN, INFO, DEBUG
- **Structured Format**: Includes timestamp, level, and metadata
- **JSON Metadata**: Supports object metadata in log entries
- **Environment Configuration**: Configurable via environment variables

#### API Reference

```javascript
const logger = require('../utils/logger');

// Different log levels
logger.error('Error message', { errorCode: 500, userId: '123' });
logger.warn('Warning message', { source: 'terraScheduler' });
logger.info('Informational message', { dataId: '456' });
logger.debug('Debug message', { requestBody: req.body });

// Set log level programmatically
logger.setLogLevel('DEBUG');
```

#### Configuration

```javascript
// Configure log level via environment variable
LOG_LEVEL=INFO  // Options: ERROR, WARN, INFO, DEBUG
```

## API

### Terra API

**Files**:
- `backend/api/terraController.js`
- `backend/api/terraRoutes.js`

#### Endpoints

| Method | Path | Description | Replaces Lambda? |
|--------|------|-------------|-----------------|
| GET | `/api/terra/auth/widget` | Generate TryTerra auth widget | No |
| POST | `/api/terra/auth/callback` | Handle TryTerra auth callback | No |
| POST | `/api/terra/webhook` | Process TryTerra webhook data | No |
| GET | `/api/terra/user/:userId/data` | Fetch user data from TryTerra | Yes - Uses terraScheduler |
| GET | `/api/terra/user/:userId/wearable` | Get user's wearable data | No |
| PUT | `/api/terra/user/:userId/settings` | Update data fetch settings | No |
| POST | `/api/terra/user/:userId/process` | Process wearable data | Yes - Uses wearableDataProcessor |
| POST | `/api/terra/process/all` | Process all pending data | Yes - Uses wearableDataProcessor |
| GET | `/api/terra/scheduler/status` | Get scheduler status | New API |

#### TryTerra Webhook Integration

The webhook endpoint processes incoming data from TryTerra in real-time:

```javascript
// Webhook endpoint
app.post('/api/terra/webhook', terraController.handleWebhook);

// Controller processes webhook data
exports.handleWebhook = async (req, res) => {
  // Process incoming data...
  // Store in database...
  // Trigger background processing
  setImmediate(async () => {
    await wearableDataProcessor.processUserData(user._id, user.terra_user_id);
  });
};
```

## Models

### Wearable Data Model

**File**: `backend/models/wearableDataModel.js`

The primary data model for storing wearable data from TryTerra.

#### Schema

```javascript
{
  user_id: String,           // TryTerra user ID
  reference_id: String,      // Reference ID used for TryTerra auth
  data_type: String,         // Type of data (activity, sleep, etc.)
  source: String,            // Data source (webhook, scheduler)
  start_date: Date,          // Start date of data
  end_date: Date,            // End date of data
  metadata: {                // Metadata about the device
    device_type: String,
    device_model: String,
    provider: String
  },
  data: Object,              // Raw data from TryTerra
  processed: Boolean,        // Whether data has been processed
  processing_status: String, // Status of processing (pending, complete, error)
  last_processed: Date,      // When data was last processed
  created_at: Date,          // When record was created
  updated_at: Date           // When record was last updated
}
```

### Alert Model

Created dynamically in the wearableDataProcessor service:

```javascript
// Alert schema
{
  userId: String,            // MongoDB user ID
  terraUserId: String,       // TryTerra user ID
  type: String,              // Alert type (high_heart_rate, etc.)
  severity: String,          // Alert severity (high, medium, low)
  value: Number,             // Value that triggered the alert
  threshold: Number,         // Threshold that was exceeded
  message: String,           // Human-readable message
  recommendation: String,    // Recommended action
  processed: Boolean,        // Whether alert has been processed
  acknowledged: Boolean,     // Whether alert has been acknowledged by user
  createdAt: Date,           // When alert was created
  updatedAt: Date            // When alert was last updated
}
```

## Configuration

The native services use environment variables for configuration to maintain consistency with the Lambda functions they replace.

### Environment Variables

```
# MongoDB connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/alfred-brain

# TryTerra API
TRYTERRA_API_KEY_1=your-primary-api-key
TRYTERRA_API_KEY_2=your-backup-api-key

# Scheduler configuration
DATA_FETCH_INTERVAL=0 */6 * * *  # Every 6 hours
USER_FETCH_LIMIT=50
USER_FETCH_DELAY=200
DEFAULT_LOOKBACK_DAYS=7
MAX_FETCH_RETRIES=3
RETRY_DELAY=1000

# Alert thresholds
HIGH_HEART_RATE_THRESHOLD=180
LOW_DAILY_STEPS_THRESHOLD=2000
HIGH_RESTING_HEART_RATE_THRESHOLD=90
LOW_SLEEP_DURATION_THRESHOLD=360  # 6 hours in minutes
ENABLE_ALERTS=true

# Logging
LOG_LEVEL=INFO  # ERROR, WARN, INFO, DEBUG

# Server
PORT=3000
NODE_ENV=production
```

## Testing

The native services implementation includes a comprehensive test suite to validate functionality equivalent to the Lambda functions.

### Test Files

| Test File | Purpose |
|-----------|---------|
| `tests/services/terraSchedulerService.test.js` | Tests for TryTerra scheduler |
| `tests/services/wearableDataProcessor.test.js` | Tests for wearable data processing |
| `tests/api/terraController.test.js` | Tests for Terra API controller |
| `tests/api/terraRoutes.test.js` | Tests for Terra API routes |
| `tests/infrastructure/decisionLogic.test.js` | Tests for alert decision logic |

### Running Tests

```bash
# Run all tests
npm test

# Run specific test files
npx jest tests/services/terraSchedulerService.test.js
npx jest tests/services/wearableDataProcessor.test.js

# Run with mock database
npm run test:mock

# Test decision logic
npm run test:decision-logic
```

### Local Testing Script

A dedicated script for testing decision logic without full API infrastructure:

```bash
# Run local decision logic test
node scripts/local-test.js
```

## Deployment

The native services approach simplifies deployment by eliminating the need for separate Lambda deployments.

### Server Initialization

The `server.js` file initializes all services during application startup:

```javascript
// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Initialize services
  (async () => {
    // Initialize TryTerra scheduler
    await terraScheduler.init({ 
      startScheduler: true,
      initialFetch: false
    });
    
    // Initialize wearable data processor
    await wearableDataProcessor.init({
      processOnStartup: false
    });
  })();
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  // Stop all scheduler jobs
  const activeJobs = terraScheduler.getActiveJobs();
  for (const jobId in activeJobs) {
    terraScheduler.stopScheduledJob(jobId);
  }
  
  // Close server and database connections
  server.close(() => {
    mongoose.connection.close(false, () => {
      process.exit(0);
    });
  });
});
```

### Production Considerations

For production deployment:

1. **Process Management**: Use PM2 or similar for process management and auto-restart
2. **Monitoring**: Implement monitoring for service health and performance
3. **Load Balancing**: Consider multiple instances behind load balancer for high availability
4. **Memory Management**: Monitor memory usage during batch processing
5. **Error Handling**: Configure error notifications for critical failures
6. **Rate Limiting**: Implement additional API rate limiting if needed

---

## Conclusion

The migration from AWS Lambda to native Express.js services provides enhanced control, reduced costs, and improved maintainability while preserving all existing functionality. The implementation follows best practices for Node.js services, including proper error handling, configuration, logging, and graceful shutdown procedures.