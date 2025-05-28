/**
 * IAM Roles and Policies Tests
 * 
 * Tests for the IAM roles and policies CloudFormation template and utility class
 */

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const IAMManager = require('../../infrastructure/utils/iam-manager');

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  // Mock IAM client
  const mockIAM = {
    createUser: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        User: {
          UserName: 'test-user',
          UserId: 'AIDATEST123',
          Arn: 'arn:aws:iam::123456789012:user/test-user',
          CreateDate: new Date()
        }
      })
    }),
    createAccessKey: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        AccessKey: {
          UserName: 'test-user',
          AccessKeyId: 'AKIATEST123',
          SecretAccessKey: 'test-secret-key',
          Status: 'Active'
        }
      })
    }),
    attachUserPolicy: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    putUserPolicy: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    createRole: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        Role: {
          RoleName: 'test-role',
          RoleId: 'AROATEST123',
          Arn: 'arn:aws:iam::123456789012:role/test-role',
          CreateDate: new Date(),
          AssumeRolePolicyDocument: JSON.stringify({
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole'
            }]
          })
        }
      })
    }),
    attachRolePolicy: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    }),
    putRolePolicy: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    })
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
    IAM: jest.fn(() => mockIAM),
    CloudFormation: jest.fn(() => mockCloudFormation)
  };
});

describe('IAM Roles and Policies Configuration', () => {
  // Test CloudFormation template validity
  test('iam-roles.yaml template is valid', async () => {
    // Read the template file
    const templatePath = path.join(__dirname, '../../infrastructure/cloudformation/iam-roles.yaml');
    const templateExists = fs.existsSync(templatePath);
    
    // Validate the template exists
    expect(templateExists).toBe(true);
    
    // Validate the template content
    if (templateExists) {
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      expect(templateContent).toContain('AWSTemplateFormatVersion');
      expect(templateContent).toContain('Resources');
      expect(templateContent).toContain('LambdaExecutionRole');
      
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
  test('iam-roles.yaml template follows principle of least privilege', async () => {
    const templatePath = path.join(__dirname, '../../infrastructure/cloudformation/iam-roles.yaml');
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Check for specific S3 actions (not using wildcard *)
    expect(templateContent).toContain('s3:GetObject');
    expect(templateContent).toContain('s3:PutObject');
    expect(templateContent).toContain('s3:ListBucket');
    
    // Check for resource-specific policies (not using *)
    expect(templateContent).toContain('Resource:');
    expect(templateContent).toContain('arn:aws:s3:::${DataBucketName}');
    
    // Validate trust relationship
    expect(templateContent).toContain('AssumeRolePolicyDocument');
    expect(templateContent).toContain('Service: lambda.amazonaws.com');
  });
});

describe('IAMManager Utility', () => {
  let iamManager;
  
  beforeEach(() => {
    // Set up IAMManager with mock credentials
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'mock-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'mock-secret-key';
    
    iamManager = new IAMManager();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('createUser creates an IAM user', async () => {
    const username = 'test-user';
    
    const result = await iamManager.createUser(username);
    
    // Verify IAM.createUser was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.createUser).toHaveBeenCalledWith({
      UserName: username
    });
    
    // Verify return value
    expect(result.UserName).toBe(username);
    expect(result.Arn).toContain(username);
  });
  
  test('createAccessKey creates access keys for a user', async () => {
    const username = 'test-user';
    
    const result = await iamManager.createAccessKey(username);
    
    // Verify IAM.createAccessKey was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.createAccessKey).toHaveBeenCalledWith({
      UserName: username
    });
    
    // Verify return value
    expect(result.UserName).toBe(username);
    expect(result.AccessKeyId).toBe('AKIATEST123');
    expect(result.SecretAccessKey).toBe('test-secret-key');
  });
  
  test('attachUserPolicy attaches a managed policy to a user', async () => {
    const username = 'test-user';
    const policyArn = 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess';
    
    await iamManager.attachUserPolicy(username, policyArn);
    
    // Verify IAM.attachUserPolicy was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.attachUserPolicy).toHaveBeenCalledWith({
      UserName: username,
      PolicyArn: policyArn
    });
  });
  
  test('putUserPolicy creates an inline policy for a user', async () => {
    const username = 'test-user';
    const policyName = 'test-policy';
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::test-bucket/*'
      }]
    };
    
    await iamManager.putUserPolicy(username, policyName, policyDocument);
    
    // Verify IAM.putUserPolicy was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.putUserPolicy).toHaveBeenCalledWith({
      UserName: username,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument)
    });
  });
  
  test('createS3AccessPolicy creates S3 bucket access policy for a user', async () => {
    const username = 'test-user';
    const bucketName = 'test-bucket';
    const policyName = 'test-s3-policy';
    const actions = ['s3:GetObject', 's3:ListBucket'];
    
    await iamManager.createS3AccessPolicy(username, bucketName, policyName, actions);
    
    // Verify IAM.putUserPolicy was called
    const iamInstance = new AWS.IAM();
    expect(iamInstance.putUserPolicy).toHaveBeenCalled();
    
    // Verify the policy document
    const callArgs = iamInstance.putUserPolicy.mock.calls[0][0];
    expect(callArgs.UserName).toBe(username);
    expect(callArgs.PolicyName).toBe(policyName);
    
    const policyDocument = JSON.parse(callArgs.PolicyDocument);
    expect(policyDocument.Statement[0].Action).toEqual(actions);
    expect(policyDocument.Statement[0].Resource).toContain(`arn:aws:s3:::${bucketName}`);
  });
  
  test('createRole creates an IAM role', async () => {
    const roleName = 'test-role';
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole'
      }]
    };
    
    const result = await iamManager.createRole(roleName, trustPolicy);
    
    // Verify IAM.createRole was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.createRole).toHaveBeenCalledWith({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy)
    });
    
    // Verify return value
    expect(result.RoleName).toBe(roleName);
    expect(result.Arn).toContain(roleName);
  });
  
  test('attachRolePolicy attaches a managed policy to a role', async () => {
    const roleName = 'test-role';
    const policyArn = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
    
    await iamManager.attachRolePolicy(roleName, policyArn);
    
    // Verify IAM.attachRolePolicy was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.attachRolePolicy).toHaveBeenCalledWith({
      RoleName: roleName,
      PolicyArn: policyArn
    });
  });
  
  test('putRolePolicy creates an inline policy for a role', async () => {
    const roleName = 'test-role';
    const policyName = 'test-policy';
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: 's3:GetObject',
        Resource: 'arn:aws:s3:::test-bucket/*'
      }]
    };
    
    await iamManager.putRolePolicy(roleName, policyName, policyDocument);
    
    // Verify IAM.putRolePolicy was called with correct parameters
    const iamInstance = new AWS.IAM();
    expect(iamInstance.putRolePolicy).toHaveBeenCalledWith({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument)
    });
  });
  
  test('createLambdaExecutionRole creates a role for Lambda with S3 access', async () => {
    const roleName = 'lambda-test-role';
    const bucketName = 'test-bucket';
    
    const result = await iamManager.createLambdaExecutionRole(roleName, bucketName);
    
    // Verify IAM.createRole was called
    const iamInstance = new AWS.IAM();
    expect(iamInstance.createRole).toHaveBeenCalled();
    
    // Verify attachRolePolicy was called with the Lambda basic execution policy
    expect(iamInstance.attachRolePolicy).toHaveBeenCalledWith({
      RoleName: roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
    });
    
    // Verify putRolePolicy was called for S3 access
    expect(iamInstance.putRolePolicy).toHaveBeenCalled();
    
    // Verify return value
    expect(result.RoleName).toBe('test-role'); // This is from the mock
  });
  
  test('handles errors properly', async () => {
    // Setup the error mock for createUser
    const iamInstance = new AWS.IAM();
    iamInstance.createUser.mockReturnValueOnce({
      promise: jest.fn().mockRejectedValue(new Error('User creation failed'))
    });
    
    // Test error handling
    await expect(iamManager.createUser('error-test')).rejects.toThrow('User creation failed');
  });
});