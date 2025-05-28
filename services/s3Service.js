/**
 * services/s3Service.js
 * -----------------------------------------------------------------------------
 * Provides AWS S3 integration for file uploads, downloads, and deletions.
 * -----------------------------------------------------------------------------
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { PassThrough } = require('stream');

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET_NAME = process.env.S3_BUCKET;
const s3Client = new S3Client({ region: REGION });

/**
 * streamToBuffer
 * -----------------------------------------------------------------------------
 * Converts a readable stream into a Buffer.
 *
 * @param {Stream} stream - The readable stream.
 * @returns {Promise<Buffer>} A promise that resolves to the complete Buffer.
 */
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * uploadFileToS3
 * -----------------------------------------------------------------------------
 * Uploads a file buffer to S3 at the specified key.
 *
 * @param {string} key - The S3 object key.
 * @param {Buffer} buffer - The file content.
 * @returns {Promise<void>} A promise that resolves when the file is uploaded.
 */
async function uploadFileToS3(key, buffer) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
  });
  await s3Client.send(command);
}

/**
 * downloadFileFromS3
 * -----------------------------------------------------------------------------
 * Downloads a file from S3 and returns its content as a Buffer.
 *
 * @param {string} key - The S3 object key.
 * @returns {Promise<Buffer>} A promise that resolves to the file content as a Buffer.
 */
async function downloadFileFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const data = await s3Client.send(command);
  return await streamToBuffer(data.Body);
}

/**
 * deleteFileFromS3
 * -----------------------------------------------------------------------------
 * Deletes a file from the specified S3 bucket using the provided key.
 *
 * @param {string} key - The unique S3 object key identifying the file to be deleted.
 * @returns {Promise<void>} A promise that resolves once the file has been deleted.
 */
async function deleteFileFromS3(key) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  await s3Client.send(command);
}

const getFileFromS3 = async (key) => {
  if (key == undefined) return {};
  const AWS = require("aws-sdk");
  const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });

  var params = {
    Bucket: BUCKET_NAME,
    Key: key
  };

  let result = await new Promise((resolve, reject) => {
    s3.getObject(params, async (err, data) => {
      if (err) {
        console.log('error file', err);
        resolve({});
      }
      if (data) {
        resolve({content: data.Body});
      }
    });
  });

  return result;
}

module.exports = {
  uploadFileToS3,
  downloadFileFromS3,
  deleteFileFromS3,
  getFileFromS3
};
