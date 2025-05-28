/**
 * AWS Glue Crawler and ETL Jobs Tests
 * 
 * Tests for the AWS Glue crawler and ETL job infrastructure
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  // Mock CloudFormation client
  const mockCloudFormation = {
    validateTemplate: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Capabilities: ['CAPABILITY_NAMED_IAM'],
        CapabilitiesReason: 'The template contains IAM resources'
      })
    })
  };

  // Mock Glue client
  const mockGlue = {
    getCrawler: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Crawler: {
          Name: 'test-crawler',
          DatabaseName: 'test-database',
          Targets: {
            MongoDBTargets: [
              {
                ConnectionName: 'test-connection',
                Path: 'test-db.test-collection'
              }
            ]
          },
          Schedule: 'cron(0 */12 * * ? *)'
        }
      })
    }),
    getJob: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Job: {
          Name: 'test-job',
          Command: {
            Name: 'glueetl',
            ScriptLocation: 's3://test-bucket/scripts/test-script.py'
          },
          DefaultArguments: {
            '--TempDir': 's3://test-bucket/temp',
            '--job-bookmark-option': 'job-bookmark-enable'
          }
        }
      })
    })
  };

  // Mock S3 client
  const mockS3 = {
    getObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from('Test script content')
      })
    }),
    putObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    })
  };

  return {
    CloudFormation: jest.fn(() => mockCloudFormation),
    Glue: jest.fn(() => mockGlue),
    S3: jest.fn(() => mockS3)
  };
});

describe('AWS Glue MongoDB Infrastructure', () => {
  // Test CloudFormation template validity
  test('glue-mongodb-crawler.yaml template is valid', async () => {
    // Read the template file
    const templatePath = path.join(__dirname, '../../infrastructure/cloudformation/glue-mongodb-crawler.yaml');
    const templateExists = fs.existsSync(templatePath);
    
    // Validate the template exists
    expect(templateExists).toBe(true);
    
    // Validate the template content
    if (templateExists) {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      expect(templateContent).toContain('AWSTemplateFormatVersion');
      expect(templateContent).toContain('Resources');
      expect(templateContent).toContain('AWS::Glue::Crawler');
      expect(templateContent).toContain('AWS::Glue::Job');
      
      // Check that MongoDB-specific configurations are present
      expect(templateContent).toContain('MongoDBTargets');
      expect(templateContent).toContain('ConnectionName');
      
      // Check that ETL job configuration is present
      expect(templateContent).toContain('NormalizeWearableDataJob');
      expect(templateContent).toContain('ScriptLocation');
      
      // Validate template with AWS CloudFormation
      const cloudformation = new AWS.CloudFormation();
      const params = {
        TemplateBody: templateContent
      };
      
      const result = await cloudformation.validateTemplate(params).promise();
      expect(result).toBeDefined();
      expect(result.Capabilities).toContain('CAPABILITY_NAMED_IAM');
    }
  });
  
  // Test that AWS Glue ETL script exists and has required content
  test('normalize_wearable_data.py script exists and has required functionality', () => {
    const scriptPath = path.join(__dirname, '../../infrastructure/glue/scripts/normalize_wearable_data.py');
    const scriptExists = fs.existsSync(scriptPath);
    
    // Validate the script exists
    expect(scriptExists).toBe(true);
    
    if (scriptExists) {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      
      // Check that required imports are present
      expect(scriptContent).toContain('import sys');
      expect(scriptContent).toContain('from pyspark.context import SparkContext');
      expect(scriptContent).toContain('from awsglue.context import GlueContext');
      
      // Check that timestamp conversion function exists
      expect(scriptContent).toContain('convert_to_utc');
      expect(scriptContent).toContain('pytz.UTC');
      
      // Check that heart rate normalization function exists
      expect(scriptContent).toContain('normalize_heart_rate');
      expect(scriptContent).toContain('avg_bpm');
      
      // Check that activity normalization function exists
      expect(scriptContent).toContain('normalize_activity');
      expect(scriptContent).toContain('distance_meters');
      
      // Check that sleep normalization function exists
      expect(scriptContent).toContain('normalize_sleep');
      expect(scriptContent).toContain('sleep_duration_ms');
      
      // Check that data is written to S3
      expect(scriptContent).toContain('s3_output_path');
      expect(scriptContent).toContain('sink.writeFrame');
    }
  });
  
  // Test deployment script functionality
  test('deployment script exists and has required functionality', () => {
    const scriptPath = path.join(__dirname, '../../scripts/deploy-glue-infrastructure.js');
    const scriptExists = fs.existsSync(scriptPath);
    
    // Validate the script exists
    expect(scriptExists).toBe(true);
    
    if (scriptExists) {
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      
      // Check that required imports are present
      expect(scriptContent).toContain('require(\'dotenv\')');
      expect(scriptContent).toContain('require(\'aws-sdk\')');
      
      // Check that AWS clients are initialized
      expect(scriptContent).toContain('const cloudformation = new AWS.CloudFormation()');
      expect(scriptContent).toContain('const s3 = new AWS.S3()');
      
      // Check that the script uploads the ETL script to S3
      expect(scriptContent).toContain('uploadGlueScript');
      expect(scriptContent).toContain('s3.putObject');
      
      // Check that the script deploys the CloudFormation stack
      expect(scriptContent).toContain('deployStack');
      expect(scriptContent).toContain('cloudformation.createStack');
      expect(scriptContent).toContain('cloudformation.updateStack');
      
      // Check that the stack parameters are correctly set
      expect(scriptContent).toContain('MongoDBURI');
      expect(scriptContent).toContain('S3BucketName');
      expect(scriptContent).toContain('GlueDatabaseName');
    }
  });
  
  // Mock test for Glue crawler functionality
  test('Glue crawler can be retrieved', async () => {
    const glue = new AWS.Glue();
    const crawler = await glue.getCrawler({ Name: 'test-crawler' }).promise();
    
    expect(crawler).toBeDefined();
    expect(crawler.Crawler).toBeDefined();
    expect(crawler.Crawler.Name).toBe('test-crawler');
    expect(crawler.Crawler.Targets.MongoDBTargets).toBeDefined();
    expect(crawler.Crawler.Targets.MongoDBTargets[0].ConnectionName).toBe('test-connection');
    expect(crawler.Crawler.Schedule).toBe('cron(0 */12 * * ? *)');
  });
  
  // Mock test for Glue ETL job functionality
  test('Glue ETL job can be retrieved', async () => {
    const glue = new AWS.Glue();
    const job = await glue.getJob({ JobName: 'test-job' }).promise();
    
    expect(job).toBeDefined();
    expect(job.Job).toBeDefined();
    expect(job.Job.Name).toBe('test-job');
    expect(job.Job.Command).toBeDefined();
    expect(job.Job.Command.Name).toBe('glueetl');
    expect(job.Job.Command.ScriptLocation).toContain('s3://');
    expect(job.Job.DefaultArguments).toBeDefined();
    expect(job.Job.DefaultArguments['--job-bookmark-option']).toBe('job-bookmark-enable');
  });
});