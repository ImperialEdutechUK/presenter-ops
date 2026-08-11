import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

/**
 * S3-compatible object storage.
 *
 * Files never pass through this API process. The browser asks for a pre-signed
 * PUT url, uploads straight to the bucket, then tells us the key. That keeps
 * the Railway container's memory flat regardless of file size and means a
 * 90 MB script PDF does not occupy a request thread for a minute.
 *
 * Works unchanged against AWS S3, Cloudflare R2 and MinIO — only the env vars
 * differ. See docs/07-deployment.md for the three configurations.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('storage.bucket')!;
    this.ttl = config.get<number>('storage.presignTtlSeconds')!;

    this.client = new S3Client({
      region: config.get<string>('storage.region')!,
      endpoint: config.get<string>('storage.endpoint'),
      forcePathStyle: config.get<boolean>('storage.forcePathStyle'),
      credentials: {
        accessKeyId: config.get<string>('storage.accessKeyId')!,
        secretAccessKey: config.get<string>('storage.secretAccessKey')!,
      },
    });
  }

  /**
   * Object keys are namespaced and randomised:
   *   scripts/2026/08/<uuid>-brand-launch-script.pdf
   *
   * The uuid prevents two people uploading "script.pdf" from colliding, and
   * means a leaked key cannot be used to guess other keys.
   */
  buildKey(prefix: string, fileName: string): string {
    const now = new Date();
    const safe = fileName
      .normalize('NFKD')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(-120);
    return `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}-${safe}`;
  }

  async presignUpload(key: string, mimeType: string, sizeBytes: number) {
    const max = this.config.get<number>('storage.maxUploadBytes')!;
    if (sizeBytes > max) {
      throw new Error(`File is larger than the ${Math.round(max / 1024 / 1024)} MB limit.`);
    }

    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: this.ttl },
    );

    return { url, key, expiresInSeconds: this.ttl, method: 'PUT' as const };
  }

  /** Short-lived read url. Nothing in the bucket is ever public. */
  presignDownload(key: string, downloadFileName?: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadFileName
          ? { ResponseContentDisposition: `attachment; filename="${downloadFileName}"` }
          : {}),
      }),
      { expiresIn: this.ttl },
    );
  }

  async delete(key: string) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // A missing object is not a reason to fail the user's request.
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }
}
