/**
 * IAM Access Manager
 * 
 * Utility class for managing IAM roles, users, and access policies for Alfred Brain
 */

const AWS = require('aws-sdk');
require('dotenv').config();

class IAMManager {
  constructor(config = {}) {
    this.iam = new AWS.IAM({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    });
  }

  /**
   * Create a new IAM user
   * @param {string} username - Name for the new IAM user
   * @returns {Promise<Object>} - Created user data
   */
  async createUser(username) {
    const params = {
      UserName: username
    };
    
    try {
      const result = await this.iam.createUser(params).promise();
      console.log(`IAM user created: ${username}`);
      return result.User;
    } catch (error) {
      console.error(`Error creating IAM user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create access keys for an IAM user
   * @param {string} username - IAM username
   * @returns {Promise<Object>} - Access key data
   */
  async createAccessKey(username) {
    const params = {
      UserName: username
    };
    
    try {
      const result = await this.iam.createAccessKey(params).promise();
      console.log(`Access key created for user: ${username}`);
      // Important: This is the only time the secret will be available
      return result.AccessKey;
    } catch (error) {
      console.error(`Error creating access key: ${error.message}`);
      throw error;
    }
  }

  /**
   * Attach a policy to a user
   * @param {string} username - IAM username
   * @param {string} policyArn - Policy ARN to attach
   * @returns {Promise<Object>} - Response data
   */
  async attachUserPolicy(username, policyArn) {
    const params = {
      UserName: username,
      PolicyArn: policyArn
    };
    
    try {
      const result = await this.iam.attachUserPolicy(params).promise();
      console.log(`Policy ${policyArn} attached to user: ${username}`);
      return result;
    } catch (error) {
      console.error(`Error attaching policy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create an inline policy for a user
   * @param {string} username - IAM username
   * @param {string} policyName - Name for the policy
   * @param {Object} policyDocument - Policy document JSON
   * @returns {Promise<Object>} - Response data
   */
  async putUserPolicy(username, policyName, policyDocument) {
    const params = {
      UserName: username,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument)
    };
    
    try {
      const result = await this.iam.putUserPolicy(params).promise();
      console.log(`Inline policy ${policyName} created for user: ${username}`);
      return result;
    } catch (error) {
      console.error(`Error creating inline policy: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create S3 bucket access policy for a user
   * @param {string} username - IAM username
   * @param {string} bucketName - S3 bucket name
   * @param {string} policyName - Name for the policy
   * @param {string[]} actions - List of S3 actions to allow
   * @returns {Promise<Object>} - Response data
   */
  async createS3AccessPolicy(username, bucketName, policyName, actions = ['s3:GetObject', 's3:PutObject', 's3:ListBucket']) {
    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: actions,
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`
          ]
        }
      ]
    };
    
    return this.putUserPolicy(username, policyName, policyDocument);
  }

  /**
   * Create an IAM role
   * @param {string} roleName - Name for the new role
   * @param {Object} trustPolicy - Trust relationship policy document
   * @returns {Promise<Object>} - Created role data
   */
  async createRole(roleName, trustPolicy) {
    const params = {
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy)
    };
    
    try {
      const result = await this.iam.createRole(params).promise();
      console.log(`IAM role created: ${roleName}`);
      return result.Role;
    } catch (error) {
      console.error(`Error creating IAM role: ${error.message}`);
      throw error;
    }
  }

  /**
   * Attach a policy to a role
   * @param {string} roleName - IAM role name
   * @param {string} policyArn - Policy ARN to attach
   * @returns {Promise<Object>} - Response data
   */
  async attachRolePolicy(roleName, policyArn) {
    const params = {
      RoleName: roleName,
      PolicyArn: policyArn
    };
    
    try {
      const result = await this.iam.attachRolePolicy(params).promise();
      console.log(`Policy ${policyArn} attached to role: ${roleName}`);
      return result;
    } catch (error) {
      console.error(`Error attaching policy to role: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create an inline policy for a role
   * @param {string} roleName - IAM role name
   * @param {string} policyName - Name for the policy
   * @param {Object} policyDocument - Policy document JSON
   * @returns {Promise<Object>} - Response data
   */
  async putRolePolicy(roleName, policyName, policyDocument) {
    const params = {
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify(policyDocument)
    };
    
    try {
      const result = await this.iam.putRolePolicy(params).promise();
      console.log(`Inline policy ${policyName} created for role: ${roleName}`);
      return result;
    } catch (error) {
      console.error(`Error creating inline policy for role: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create Lambda execution role with S3 access
   * @param {string} roleName - Name for the Lambda execution role
   * @param {string} bucketName - S3 bucket name to access
   * @returns {Promise<Object>} - Created role data
   */
  async createLambdaExecutionRole(roleName, bucketName) {
    // Trust policy for Lambda
    const trustPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            Service: 'lambda.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    };
    
    // Create the role
    const role = await this.createRole(roleName, trustPolicy);
    
    // Attach basic Lambda execution policy
    await this.attachRolePolicy(roleName, 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole');
    
    // Add S3 access policy
    const s3PolicyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            's3:GetObject',
            's3:PutObject',
            's3:ListBucket'
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`
          ]
        }
      ]
    };
    
    await this.putRolePolicy(roleName, `${roleName}-S3Access`, s3PolicyDocument);
    
    return role;
  }
}

module.exports = IAMManager;