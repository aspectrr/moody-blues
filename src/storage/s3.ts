import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { formatError } from "../utils/error";

// Initialize the S3 client
let s3Client: S3Client | null = null;

// Get environment variables
const region = process.env.AWS_REGION || "us-east-1";
const bucketName = process.env.S3_BUCKET_NAME;
const useMinio = process.env.USE_MINIO === "true";
const endpointUrl = process.env.S3_ENDPOINT;

/**
 * Initialize the S3 client
 */
export function initS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME environment variable is not defined");
  }

  const clientOptions: any = {
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  };

  // Add custom endpoint for MinIO
  if (useMinio && endpointUrl) {
    clientOptions.endpoint = endpointUrl;
    clientOptions.forcePathStyle = true; // Required for MinIO
    console.log(`Using MinIO at endpoint: ${endpointUrl}`);
  }

  s3Client = new S3Client(clientOptions);

  return s3Client;
}

/**
 * Upload a file to S3 or MinIO
 * @param key The S3 object key (path)
 * @param body The file content
 * @param contentType The content type
 * @returns The URL of the uploaded file
 */
export async function uploadToS3(
  key: string,
  body: Buffer | string,
  contentType: string,
): Promise<string> {
  try {
    // Ensure S3 client is initialized
    const client = initS3Client();

    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME environment variable is not defined");
    }

    // Upload the file
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await client.send(command);

    // Generate a URL for viewing
    // For MinIO in development, we can use the direct URL or a presigned URL
    if (useMinio && endpointUrl) {
      // If using MinIO, we can construct a direct URL as buckets are typically public in dev
      // or use presigned URLs if configured with private buckets
      if (
        endpointUrl.includes("localhost") ||
        endpointUrl.includes("127.0.0.1")
      ) {
        // Replace internal Docker reference with localhost for browser access
        const browserEndpoint = endpointUrl.replace(
          "minio:9000",
          "localhost:9000",
        );
        return `${browserEndpoint}/${bucketName}/${key}`;
      } else {
        const getCommand = new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        });
        return await getSignedUrl(client, getCommand, { expiresIn: 604800 });
      }
    } else {
      // Standard AWS S3 presigned URL
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      // URL expires in 7 days
      return await getSignedUrl(client, getCommand, { expiresIn: 604800 });
    }
  } catch (error) {
    console.error("Error uploading to S3:", formatError(error));
    throw error;
  }
}

/**
 * Get a presigned URL (or direct URL for MinIO) for downloading a file
 * @param key The S3 object key (path)
 * @param expiresIn Expiration time in seconds (default: 1 hour)
 * @returns URL for accessing the object
 */
export async function getPresignedUrl(
  key: string,
  expiresIn: number = 3600,
): Promise<string> {
  try {
    // Ensure S3 client is initialized
    const client = initS3Client();

    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME environment variable is not defined");
    }

    // Create the command
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    // Generate a URL for accessing the object
    if (useMinio && endpointUrl) {
      // For MinIO in local development with public buckets, we can use a direct URL
      if (
        endpointUrl.includes("localhost") ||
        endpointUrl.includes("127.0.0.1")
      ) {
        // Replace internal Docker reference with localhost for browser access
        const browserEndpoint = endpointUrl.replace(
          "minio:9000",
          "localhost:9000",
        );
        return `${browserEndpoint}/${bucketName}/${key}`;
      }
    }

    // Use presigned URL for private buckets or AWS S3
    return await getSignedUrl(client, command, { expiresIn });
  } catch (error) {
    console.error("Error generating presigned URL:", formatError(error));
    throw error;
  }
}

/**
 * Check if an object exists in S3 or MinIO
 * @param key The S3 object key (path)
 * @returns Whether the object exists
 */
export async function objectExists(key: string): Promise<boolean> {
  try {
    // Ensure S3 client is initialized
    const client = initS3Client();

    if (!bucketName) {
      throw new Error("S3_BUCKET_NAME environment variable is not defined");
    }

    // Try to get the object head
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    // Check if the error is because the object doesn't exist
    if (error.name === "NoSuchKey") {
      return false;
    }

    // Rethrow other errors
    console.error("Error checking if object exists:", formatError(error));
    throw error;
  }
}

/**
 * Generate a unique key for an issue
 * @param issueId The issue ID
 * @param fileName The file name
 * @returns The storage key
 */
export function generateIssueKey(issueId: number, fileName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `issues/issue-${issueId}/${timestamp}/${fileName}`;
}
