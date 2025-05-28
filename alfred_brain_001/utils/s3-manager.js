/**
 * S3 Bucket Manager
 * 
 * Utility class for managing S3 bucket operations for Alfred Brain
 */

const AWS = require('aws-sdk');
require('dotenv').config();

class S3Manager {
  constructor(config = {}) {
    this.bucketName = config.bucketName || process.env.S3_BUCKET || process.env.S3_BUCKET_NAME;
    
    if (!this.bucketName) {
      throw new Error('S3 bucket name is required. Provide it via constructor or S3_BUCKET environment variable.');
    }
    
    this.s3 = new AWS.S3({
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    });
  }

  /**
   * Upload a file to S3 bucket
   * @param {string} key - The object key (path/filename)
   * @param {Buffer|string} data - File content to upload
   * @param {string} contentType - MIME type of the file
   * @returns {Promise<Object>} - S3 upload response
   */
  async uploadFile(key, data, contentType = 'application/json') {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: data,
      ContentType: contentType
    };
    
    try {
      const result = await this.s3.upload(params).promise();
      console.log(`File uploaded successfully: ${result.Location}`);
      return result;
    } catch (error) {
      console.error(`Error uploading file to S3: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download a file from S3 bucket
   * @param {string} key - The object key (path/filename)
   * @returns {Promise<Object>} - S3 get object response
   */
  async downloadFile(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };
    
    try {
      const data = await this.s3.getObject(params).promise();
      return data;
    } catch (error) {
      console.error(`Error downloading file from S3: ${error.message}`);
      throw error;
    }
  }

  /**
   * List files in a folder
   * @param {string} prefix - The folder prefix to list
   * @returns {Promise<Array>} - List of objects
   */
  async listFiles(prefix = '') {
    const params = {
      Bucket: this.bucketName,
      Prefix: prefix
    };
    
    try {
      const data = await this.s3.listObjectsV2(params).promise();
      return data.Contents;
    } catch (error) {
      console.error(`Error listing files from S3: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a file from S3 bucket
   * @param {string} key - The object key (path/filename)
   * @returns {Promise<Object>} - S3 delete object response
   */
  async deleteFile(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };
    
    try {
      const data = await this.s3.deleteObject(params).promise();
      console.log(`File deleted successfully: ${key}`);
      return data;
    } catch (error) {
      console.error(`Error deleting file from S3: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a presigned URL for temporary access to a file
   * @param {string} key - The object key (path/filename)
   * @param {number} expirySeconds - Seconds until the URL expires
   * @returns {string} - Presigned URL
   */
  getPresignedUrl(key, expirySeconds = 3600) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Expires: expirySeconds
    };
    
    try {
      const url = this.s3.getSignedUrl('getObject', params);
      return url;
    } catch (error) {
      console.error(`Error generating presigned URL: ${error.message}`);
      throw error;
    }
  }
}

module.exports = S3Manager;