/**
 * S3 Bucket Tests
 * 
 * Tests for the S3 bucket CloudFormation template and utility class
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const S3Manager = require('../../infrastructure/utils/s3-manager');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  // Mock S3 client
  const mockS3 = {
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Location: 'https://mock-bucket.s3.amazonaws.com/test-file.json',
        ETag: '"mockETag"',
        Bucket: 'mock-bucket',
        Key: 'test-file.json'
      })
    }),
    getObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Body: Buffer.from(JSON.stringify({ test: 'data' })),
        ContentType: 'application/json',
        ContentLength: 15
      })
    }),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Contents: [
          { Key: 'test-file1.json', Size: 100, LastModified: new Date() },
          { Key: 'test-file2.json', Size: 200, LastModified: new Date() }
        ],
        IsTruncated: false
      })
    }),
    deleteObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    getSignedUrl: jest.fn().mockReturnValue('https://mock-bucket.s3.amazonaws.com/test-file.json?signed=token')
  };

  // Mock CloudFormation client
  const mockCloudFormation = {
    validateTemplate: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Capabilities: [],
        CapabilitiesReason: ''
      })
    })
  };

  return {
    S3: jest.fn(() => mockS3),
    CloudFormation: jest.fn(() => mockCloudFormation)
  };
});

describe('S3 Bucket Configuration', () => {
  // Test CloudFormation template validity
  test('s3-bucket.yaml template is valid', async () => {
    // Read the template file
    const templatePath = path.join(__dirname, '../../infrastructure/cloudformation/s3-bucket.yaml');
    const templateExists = fs.existsSync(templatePath);
    
    // Validate the template exists
    expect(templateExists).toBe(true);
    
    // Validate the template content
    if (templateExists) {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      expect(templateContent).toContain('AWSTemplateFormatVersion');
      expect(templateContent).toContain('Resources');
      expect(templateContent).toContain('AlfredBrainDataBucket');
      
      // Validate template with AWS CloudFormation
      const cloudformation = new AWS.CloudFormation();
      const params = {
        TemplateBody: templateContent
      };
      
      // This will only actually validate the syntax of the template in a mock way
      const result = await cloudformation.validateTemplate(params).promise();
      expect(result).toBeDefined();
    }
  });
  
  // Test that the template has the necessary security configuration
  test('s3-bucket.yaml template includes security best practices', async () => {
    const templatePath = path.join(__dirname, '../../infrastructure/cloudformation/s3-bucket.yaml');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Check for public access blocking
    expect(templateContent).toContain('PublicAccessBlockConfiguration');
    expect(templateContent).toContain('BlockPublicAcls');
    expect(templateContent).toContain('BlockPublicPolicy');
    
    // Check for encryption
    expect(templateContent).toContain('BucketEncryption');
    expect(templateContent).toContain('ServerSideEncryptionConfiguration');
    
    // Check for SSL enforcement policy
    expect(templateContent).toContain('EnforceSSLOnly');
    expect(templateContent).toContain('aws:SecureTransport');
  });
});

describe('S3Manager Utility', () => {
  let s3Manager;
  
  beforeEach(() => {
    // Set up S3Manager with mock credentials
    process.env.S3_BUCKET = 'mock-bucket';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'mock-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';
    
    s3Manager = new S3Manager();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('initialization throws error without bucket name', () => {
    // Remove bucket name from environment
    delete process.env.S3_BUCKET;
    delete process.env.S3_BUCKET_NAME;
    
    // Should throw error when creating without bucket name
    expect(() => new S3Manager()).toThrow('S3 bucket name is required');
  });
  
  test('constructor uses config parameters over environment variables', () => {
    const customConfig = {
      bucketName: 'custom-bucket',
      region: 'us-west-2',
      accessKeyId: 'custom-key-id',
      secretAccessKey: 'custom-secret-key'
    };
    
    const customManager = new S3Manager(customConfig);
    expect(customManager.bucketName).toBe('custom-bucket');
    
    // Can't easily check the AWS SDK config, but we can verify the bucket name
    expect(customManager.bucketName).toBe(customConfig.bucketName);
  });
  
  test('uploadFile uploads data to S3', async () => {
    const key = 'test-file.json';
    const data = JSON.stringify({ test: 'data' });
    const contentType = 'application/json';
    
    const result = await s3Manager.uploadFile(key, data, contentType);
    
    // Verify S3.upload was called with correct parameters
    const s3Instance = new AWS.S3();
    expect(s3Instance.upload).toHaveBeenCalledWith({
      Bucket: 'mock-bucket',
      Key: key,
      Body: data,
      ContentType: contentType
    });
    
    // Verify return value
    expect(result.Location).toBe('https://mock-bucket.s3.amazonaws.com/test-file.json');
    expect(result.Bucket).toBe('mock-bucket');
    expect(result.Key).toBe(key);
  });
  
  test('downloadFile retrieves data from S3', async () => {
    const key = 'test-file.json';
    
    const result = await s3Manager.downloadFile(key);
    
    // Verify S3.getObject was called with correct parameters
    const s3Instance = new AWS.S3();
    expect(s3Instance.getObject).toHaveBeenCalledWith({
      Bucket: 'mock-bucket',
      Key: key
    });
    
    // Verify return value contains the expected data
    expect(result.Body).toBeDefined();
    expect(result.ContentType).toBe('application/json');
  });
  
  test('listFiles lists objects in S3 bucket', async () => {
    const prefix = 'test-folder/';
    
    const result = await s3Manager.listFiles(prefix);
    
    // Verify S3.listObjectsV2 was called with correct parameters
    const s3Instance = new AWS.S3();
    expect(s3Instance.listObjectsV2).toHaveBeenCalledWith({
      Bucket: 'mock-bucket',
      Prefix: prefix
    });
    
    // Verify return value
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].Key).toBe('test-file1.json');
    expect(result[1].Key).toBe('test-file2.json');
  });
  
  test('deleteFile deletes object from S3', async () => {
    const key = 'test-file.json';
    
    await s3Manager.deleteFile(key);
    
    // Verify S3.deleteObject was called with correct parameters
    const s3Instance = new AWS.S3();
    expect(s3Instance.deleteObject).toHaveBeenCalledWith({
      Bucket: 'mock-bucket',
      Key: key
    });
  });
  
  test('getPresignedUrl generates a presigned URL', () => {
    const key = 'test-file.json';
    const expirySeconds = 3600;
    
    const url = s3Manager.getPresignedUrl(key, expirySeconds);
    
    // Verify S3.getSignedUrl was called with correct parameters
    const s3Instance = new AWS.S3();
    expect(s3Instance.getSignedUrl).toHaveBeenCalledWith('getObject', {
      Bucket: 'mock-bucket',
      Key: key,
      Expires: expirySeconds
    });
    
    // Verify return value
    expect(url).toBe('https://mock-bucket.s3.amazonaws.com/test-file.json?signed=token');
  });
  
  test('handles errors during S3 operations', async () => {
    // Setup the error mock for upload
    const s3Instance = new AWS.S3();
    s3Instance.upload.mockReturnValueOnce({
      promise: jest.fn().mockRejectedValue(new Error('Upload failed'))
    });
    
    // Test error handling
    await expect(s3Manager.uploadFile('error-test.json', '{}')).rejects.toThrow('Upload failed');
  });
});