/**
 * services/docProcessingQueue.js
 * -----------------------------------------------------------------------------
 * Sets up an Agenda job scheduler for asynchronous document processing.
 *
 * Processes include:
 *   - Text extraction via AWS Textract (for images) or Transcribe (for audio/video).
 *   - Handling various file types (PDF, CSV, Excel, Word, plain text).
 *   - Uploading extracted text to S3.
 *   - Generating summaries and integrating with an LLM.
 * -----------------------------------------------------------------------------
 */
const Agenda = require('agenda');
const DocumentModel = require('../models/lessonModel');
const { downloadFileFromS3, uploadFileToS3, deleteFileFromS3, getFileFromS3 } = require('./s3Service');
const { TextractClient, DetectDocumentTextCommand } = require("@aws-sdk/client-textract");
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require("@aws-sdk/client-transcribe");
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');

const textractClient = new TextractClient({ region: process.env.AWS_REGION_OPENSEARCH });
const transcribeClient = new TranscribeClient({ region: process.env.AWS_REGION_OPENSEARCH });

const { RekognitionClient, DetectModerationLabelsCommand, StartContentModerationCommand, GetContentModerationCommand } = require('@aws-sdk/client-rekognition');
const rekognitionClient = new RekognitionClient({ region: process.env.AWS_REGION_OPENSEARCH });

// Configure of Agenda with MongoDB
const agenda = new Agenda({
  db: { 
    address: process.env.MONGODB_URI || 'mongodb://localhost:27017/agenda-db',
    collection: 'lessonsProcessingQueue'
  },
  processEvery: '30 seconds'
});

/**
 * extractTextWithAWS
 * -----------------------------------------------------------------------------
 * Uses AWS Textract for images and AWS Transcribe for audio/video files.
 *
 * @param {string} fileType - MIME type of the file.
 * @param {string} s3Bucket - S3 bucket name.
 * @param {string} s3Key - S3 key for the file.
 * @returns {string} Extracted text.
 */
async function extractTextWithAWS(fileType, s3Bucket, s3Key) {
  // For image files: use Textract.
  if (fileType.startsWith('image/')) {
    const command = new DetectDocumentTextCommand({
      Document: { S3Object: { Bucket: s3Bucket, Name: s3Key } },
    });
    const response = await textractClient.send(command);
    let extractedText = '';
    if (response.Blocks) {
      response.Blocks.forEach(block => {
        if (block.BlockType === 'LINE' && block.Text) {
          extractedText += block.Text + '\n';
        }
      });
    }
    return extractedText;
  }
  // For audio/video files: use Transcribe.
  else if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    const jobName = `transcribe-${uuidv4()}`;
    const mediaUri = `s3://${s3Bucket}/${s3Key}`;
    const lowerKey = s3Key.toLowerCase();
    let mediaFormat = 'mp3';
    if (lowerKey.endsWith('.wav')) mediaFormat = 'wav';
    else if (lowerKey.endsWith('.mp4')) mediaFormat = 'mp4';
    else if (lowerKey.endsWith('.mov')) mediaFormat = 'mov';
    const params = {
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      MediaFormat: mediaFormat,
      Media: { MediaFileUri: mediaUri },
      OutputBucketName: s3Bucket,
    };
    await transcribeClient.send(new StartTranscriptionJobCommand(params));
    
    // Poll until the transcription job is complete.
    let jobCompleted = false;
    let transcript = "";
    while (!jobCompleted) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const jobData = await transcribeClient.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      const status = jobData.TranscriptionJob.TranscriptionJobStatus;
      if (status === "COMPLETED") {
        jobCompleted = true;
        const transcriptFileUri = jobData.TranscriptionJob.Transcript.TranscriptFileUri;
        const parts = transcriptFileUri.split(`/${s3Bucket}/`);
        if (parts.length < 2) {
          throw new Error("Unable to extract transcript file key from URI");
        }
        const transcriptKey = parts[1];
        const transcriptBuffer = await downloadFileFromS3(transcriptKey);
        const transcriptJson = JSON.parse(transcriptBuffer.toString('utf8'));
        transcript = transcriptJson.results.transcripts[0].transcript;
      } else if (status === "FAILED") {
        throw new Error("Transcription job failed");
      }
    }
    return transcript;
  } else {
    return "";
  }
}

/**
 * TextExtraction
 * -----------------------------------------------------------------------------
 * Determines the correct text extraction method based on file type.
 *
 * @param {Buffer} fileBuffer - The file content as a Buffer.
 * @param {string} fileType - MIME type of the file.
 * @param {string} s3Bucket - S3 bucket name.
 * @param {string} s3Key - S3 key for the file.
 * @returns {string} The extracted text.
 */
async function TextExtraction(fileBuffer, fileType, s3Bucket, s3Key) {
  const lowerKey = s3Key.toLowerCase();
  console.log("TextExtraction: fileType =", fileType, "lowerKey =", lowerKey);

  // For images: explicitly call Textract.
  if (fileType.startsWith('image/')) {
    console.log("File type indicates image. Using Textract.");
    return await extractTextWithAWS(fileType, s3Bucket, s3Key);
  }
  
  // If fileType is ambiguous.
  if (fileType === 'application/octet-stream') {
    if (lowerKey.endsWith('.mp3') || lowerKey.endsWith('.wav')) {
      console.log("Ambiguous type: Treating as audio.");
      return await extractTextWithAWS('audio/', s3Bucket, s3Key);
    }
    if (lowerKey.endsWith('.mp4') || lowerKey.endsWith('.mov')) {
      console.log("Ambiguous type: Treating as video.");
      return await extractTextWithAWS('video/', s3Bucket, s3Key);
    }
  }
  
  // If fileType explicitly indicates audio or video.
  if (fileType.startsWith('audio/') || fileType.startsWith('video/')) {
    console.log("File type indicates audio/video.");
    return await extractTextWithAWS(fileType, s3Bucket, s3Key);
  }
  // For PDFs.
  else if (fileType === 'application/pdf') {
    console.log("File type PDF detected.");
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(fileBuffer);
    return data.text;
  }
  // For CSV files.
  else if (fileType === 'text/csv') {
    console.log("File type CSV detected.");
    return fileBuffer.toString('utf8');
  }
  // For Excel files.
  else if (
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    console.log("File type Excel detected.");
    const xlsx = require('xlsx');
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    let text = '';
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      text += xlsx.utils.sheet_to_csv(sheet);
    });
    return text;
  }
  // For Word documents.
  else if (
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    console.log("File type Word detected.");
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  }
  // Default: treat as plain text.
  else {
    console.log("Default branch: Treating as plain text.");
    return fileBuffer.toString('utf8');
  }
}

/**
 * convertMovToMp4
 * -----------------------------------------------------------------------------
 * Converts a .mov file to .mp4 format
 * 
 * @param {Buffer} fileBuffer - The .mov file content as a Buffer
 * @param {string} filename - Original filename for reference
 * @returns {Promise<Object>} A promise that resolves to an object containing the converted buffer and new filename
 */
async function convertMovToMp4(fileBuffer, filename) {
  return new Promise((resolve, reject) => {
    // Create temp files for input and output
    const tempInputPath = path.join(os.tmpdir(), `${uuidv4()}_input.mov`);
    const tempOutputPath = path.join(os.tmpdir(), `${uuidv4()}_output.mp4`);
    
    // Write input buffer to temp file
    fs.writeFileSync(tempInputPath, fileBuffer);
    
    // Convert using ffmpeg
    ffmpeg(tempInputPath)
      .outputOptions('-c:v', 'libx264', '-crf', '23', '-c:a', 'aac', '-b:a', '128k')
      .output(tempOutputPath)
      .on('end', () => {
        // Read output file to buffer
        const outputBuffer = fs.readFileSync(tempOutputPath);
        
        // Create new filename with .mp4 extension
        const newFilename = filename.replace(/\.mov$/i, '.mp4');
        
        // Clean up temp files
        try {
          fs.unlinkSync(tempInputPath);
          fs.unlinkSync(tempOutputPath);
        } catch (err) {
          console.error('Error cleaning up temp files:', err);
        }
        
        resolve({
          buffer: outputBuffer,
          filename: newFilename
        });
      })
      .on('error', (err) => {
        // Clean up temp files
        try {
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (cleanupErr) {
          console.error('Error cleaning up temp files:', cleanupErr);
        }
        
        reject(err);
      })
      .run();
  });
}

/**
 * checkContentModeration
 * -----------------------------------------------------------------------------
 * Performs content moderation on a file based on its MIME type.
 * - For image files: Uses AWS Rekognition's DetectModerationLabelsCommand to
 *   check the file buffer for any NSFW content.
 * - For video files: Initiates a content moderation job with AWS Rekognition,
 *   polls for the results, and checks for any NSFW labels.
 *
 * @param {string} fileType - The MIME type of the file.
 * @param {Buffer} fileBuffer - The file's content as a Buffer (used for images).
 * @param {string} s3Bucket - The name of the S3 bucket where the file is stored.
 * @param {string} s3Key - The S3 object key identifying the file.
 * @returns {Promise<boolean>} A promise that resolves to true if any NSFW content is detected, false otherwise.
 * @throws {Error} Throws an error if the content moderation process fails.
 */
async function checkContentModeration(fileType, fileBuffer, s3Bucket, s3Key) {
  if (fileType.startsWith('image/')) {
    const command = new DetectModerationLabelsCommand({
      Image: { Bytes: fileBuffer },
      MinConfidence: 80,
    });
    const response = await rekognitionClient.send(command);
    return response.ModerationLabels && response.ModerationLabels.length > 0;
  } else if (fileType.startsWith('video/')) {
    const startCommand = new StartContentModerationCommand({
      Video: { S3Object: { Bucket: s3Bucket, Name: s3Key } },
      MinConfidence: 80,
    });
    const startResponse = await rekognitionClient.send(startCommand);
    const jobId = startResponse.JobId;
    let moderationLabels = [];
    for (let i = 0; i < 12; i++) { // Poll up to ~120 sec
      await new Promise(resolve => setTimeout(resolve, 10000));
      const getCommand = new GetContentModerationCommand({ JobId: jobId });
      const getResponse = await rekognitionClient.send(getCommand);
      if (getResponse.JobStatus === 'SUCCEEDED') {
        moderationLabels = getResponse.ModerationLabels;
        break;
      }
    }
    return moderationLabels && moderationLabels.length > 0;
  }
  return false;
}

/**
 * initQueueWorker
 * -----------------------------------------------------------------------------
 * Initializes the Agenda job processor for document processing.
 */
async function initQueueWorker() {
  console.log("Initializing Agenda Worker...");

  // Definizione del job di elaborazione dei documenti
  agenda.define('processDocument', async (job) => {
    try {
      const { docId } = job.attrs.data;
      console.log("Processing document:", docId);
      
      const docRecord = await DocumentModel.findById(docId);
      if (!docRecord) throw new Error('Document not found in DB');

      console.log("Processing from local file:", docRecord.s3Key);
      let fileBuffer = await downloadFileFromS3(docRecord.s3Key);

      // Check if file is a .mov file that needs to be converted to .mp4
      const originalKey = docRecord.s3Key;
      const filename = path.basename(originalKey);
      let newS3Key = originalKey;
      let updatedFileBuffer = fileBuffer;
      let fileTypeToUse = docRecord.fileType;

      if (filename.toLowerCase().endsWith('.mov') || 
          (docRecord.fileType === 'video/quicktime') || 
          (docRecord.fileType === 'application/octet-stream' && filename.toLowerCase().endsWith('.mov'))) {
        console.log("Converting .mov file to .mp4 format...");
        try {
          // Convert .mov to .mp4
          const conversionResult = await convertMovToMp4(fileBuffer, filename);
          updatedFileBuffer = conversionResult.buffer;
          
          // Create new S3 key with .mp4 extension
          const newFilename = conversionResult.filename;
          newS3Key = originalKey.replace(filename, newFilename);
          
          // Upload the converted file to S3
          await uploadFileToS3(newS3Key, updatedFileBuffer);
          console.log("Converted mp4 file uploaded to S3 with key:", newS3Key);
          
          // Update document record with new file information
          docRecord.s3Key = newS3Key;
          docRecord.filename = newFilename;
          docRecord.fileType = 'video/mp4';
          await docRecord.save();
          console.log("Document record updated with new mp4 file information");
          
          // Set the fileType to use for further processing
          fileTypeToUse = 'video/mp4';
          
          // Use the updated file buffer for further processing
          fileBuffer = updatedFileBuffer;
        } catch (conversionError) {
          console.error("Error converting .mov to .mp4:", conversionError);
          // Continue with original file if conversion fails
        }
      }

      // Content Moderation for images/videos
      if (fileTypeToUse.startsWith('image/') || fileTypeToUse.startsWith('video/')) {
        console.log("Performing content moderation check...");
        const flagged = await checkContentModeration(
          fileTypeToUse,
          fileBuffer,
          process.env.S3_BUCKET,
          docRecord.s3Key
        );
        if (flagged) {
          console.log("Content moderation flagged the file. Deleting from S3...");
          await deleteFileFromS3(docRecord.s3Key);
          if (newS3Key !== originalKey) {
            await deleteFileFromS3(originalKey); // Delete original .mov file if we converted it
          }
          docRecord.status = 'deleted due to content moderation';
          await docRecord.save();
          return;
        }
      }

      // Extract text for any supported file type (documents, audio, video, images)
      console.log("Extracting text from file...");
      const extractedText = await TextExtraction(
        fileBuffer,
        fileTypeToUse, // Use the updated file type (video/mp4 if converted)
        process.env.S3_BUCKET,
        docRecord.s3Key
      );

      if (extractedText && extractedText.length > 0) {
        console.log("Extracted text (first 100 chars):", extractedText.substring(0, 100));

        // Determine transcript key suffix based on file type
        const transcriptSuffix = 
          (docRecord.fileType.startsWith('audio/') || docRecord.fileType.startsWith('video/'))
            ? '_transcript.txt'
            : '_document.txt';
        const originalKey = docRecord.s3Key;
        const filenamePart = originalKey.split('/')[1];
        const baseName = filenamePart.replace(/\.[^/.]+$/, "");
        const transcriptKey = `text/${baseName}${transcriptSuffix}`;
        await uploadFileToS3(transcriptKey, Buffer.from(extractedText, 'utf8'));
        console.log("Extracted text stored at S3 key:", transcriptKey);
        docRecord.textS3Key = transcriptKey;

        // Clean extracted text and generate vector embedding.
        const cleanedText = extractedText.replace(/\s+/g, ' ').trim();
        const generateEmbedding = text => {
          const sum = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          const avg = sum / (text.length || 1);
          return [avg, avg / 2, avg / 3];
        };
        const embedding = generateEmbedding(cleanedText);
        docRecord.embedding = embedding;
        console.log("Cleaned text and generated embedding:", embedding);
      } else {
        console.log("No text extracted from file.");
      }

      // Mark document as processed.
      docRecord.status = 'processed';
      await docRecord.save();
      console.log("Document record updated successfully");
    } catch (error) {
      console.error("Error processing document:", error);
      throw error;
    }
  });

  // Starting the Agenda worker
  await agenda.start();
  console.log("Agenda Worker is set up and listening for jobs.");
}

/**
 * Adds a document to the processing queue
 * @param {string} docId - ID of the document to be processed
 */
async function addDocumentToQueue(docId) {
  await agenda.now('processDocument', { docId });
  console.log(`Document ${docId} added to processing queue`);
}

// Managing proper closure
async function gracefulShutdown() {
  await agenda.stop();
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = {
  initQueueWorker,
  docProcessQueue: agenda,
  addDocumentToQueue
};