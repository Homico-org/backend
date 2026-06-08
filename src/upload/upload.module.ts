import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

class CloudinaryAsyncStorage {
  private cloudinary: typeof cloudinary;
  private paramsFactory: (req: Express.Request, file: Express.Multer.File) => Promise<Record<string, unknown>>;

  constructor(options: {
    cloudinary: typeof cloudinary;
    params: (req: Express.Request, file: Express.Multer.File) => Promise<Record<string, unknown>>;
  }) {
    this.cloudinary = options.cloudinary;
    this.paramsFactory = options.params;
  }

  async _handleFile(
    req: Express.Request,
    file: Express.Multer.File,
    callback: (err?: Error | null, info?: Partial<Express.Multer.File & { path?: string }>) => void,
  ) {
    try {
      const params = await this.paramsFactory(req, file);
      const stream = this.cloudinary.uploader.upload_stream(params as any, (err, result) => {
        if (err) return callback(err);
        if (!result) return callback(new Error('No result from Cloudinary'));
        callback(null, { path: result.secure_url, filename: result.public_id });
      });
      file.stream.pipe(stream);
    } catch (err) {
      callback(err as Error);
    }
  }

  _removeFile(
    _req: Express.Request,
    file: Express.Multer.File & { filename?: string },
    callback: (err: Error | null) => void,
  ) {
    if (!file.filename) return callback(null);
    this.cloudinary.uploader.destroy(file.filename, (err) => callback(err || null));
  }
}

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const cloudName = configService.get<string>('CLOUDINARY_CLOUD_NAME');
        const apiKey = configService.get<string>('CLOUDINARY_API_KEY');
        const apiSecret = configService.get<string>('CLOUDINARY_API_SECRET');

        // If Cloudinary is configured, use it
        if (cloudName && apiKey && apiSecret) {
          cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
          });

          const storage = new CloudinaryAsyncStorage({
            cloudinary: cloudinary,
            params: async (_req: Express.Request, file: Express.Multer.File) => {
              const isVideo = file.mimetype.startsWith('video/');
              const isImage = file.mimetype.startsWith('image/');
              const isDocument = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain',
              ].includes(file.mimetype);

              // Determine resource type: video, raw (for documents), or image
              let resourceType: 'video' | 'raw' | 'image' = 'image';
              if (isVideo) resourceType = 'video';
              if (isDocument) resourceType = 'raw';

              // Base params
              const params: Record<string, unknown> = {
                folder: 'homico',
                resource_type: resourceType,
                public_id: uuidv4(),
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
              };

              // Add image optimization for images
              if (isImage) {
                params.transformation = [
                  { quality: 'auto:good', fetch_format: 'auto' }
                ];
                // Generate optimized versions immediately (eager transformations)
                params.eager = [
                  // Job card size
                  { width: 600, height: 375, crop: 'fill', quality: 'auto:good', fetch_format: 'auto' },
                  // Thumbnail size
                  { width: 300, height: 188, crop: 'fill', quality: 'auto:good', fetch_format: 'auto' },
                  // Avatar sizes
                  { width: 100, height: 100, crop: 'fill', gravity: 'face', quality: 'auto:good', fetch_format: 'auto' },
                ];
                params.eager_async = true; // Generate in background
              }

              return params;
            },
          });

          return {
            storage,
            limits: {
              fileSize: 50 * 1024 * 1024, // 50MB
            },
            fileFilter: (_req, file, callback) => {
              const allowedMimes = [
                // Images
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
                // Videos
                'video/mp4',
                'video/quicktime',
                'video/webm',
                // Documents
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'text/plain',
              ];
              if (allowedMimes.includes(file.mimetype)) {
                callback(null, true);
              } else {
                callback(new Error(`Invalid file type: ${file.mimetype}. Allowed: images, videos, PDF, Word, Excel.`), false);
              }
            },
          };
        }

        // Fallback to local disk storage for development
        const uploadsDir = join(process.cwd(), 'uploads');

        // Ensure uploads directory exists
        if (!existsSync(uploadsDir)) {
          mkdirSync(uploadsDir, { recursive: true });
        }

        return {
          storage: diskStorage({
            destination: uploadsDir,
            filename: (_req, file, callback) => {
              const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
              callback(null, uniqueName);
            },
          }),
          limits: {
            fileSize: 50 * 1024 * 1024, // 50MB
          },
          fileFilter: (_req, file, callback) => {
            const allowedMimes = [
              // Images
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              // Videos
              'video/mp4',
              'video/quicktime',
              'video/webm',
              // Documents
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'text/plain',
            ];
            if (allowedMimes.includes(file.mimetype)) {
              callback(null, true);
            } else {
              callback(new Error(`Invalid file type: ${file.mimetype}. Allowed: images, videos, PDF, Word, Excel.`), false);
            }
          },
        };
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
