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

// We accept ALL file types (project deliverables include CAD, Pages,
// archives, etc.) and only block files that are dangerous to store/serve:
// native executables and active markup/script types that could enable
// stored XSS or malware distribution. Everything else is allowed.
const BLOCKED_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml', // can carry inline <script>
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/vnd.microsoft.portable-executable',
  'application/x-sh',
  'application/x-csh',
  'application/x-bat',
  'application/x-executable',
  'application/x-apple-diskimage',
  'application/java-archive',
  'application/x-httpd-php',
]);
const BLOCKED_EXT =
  /\.(exe|msi|bat|cmd|com|scr|ps1|sh|csh|app|dmg|jar|php|phtml|svg|html?|xhtml|js|mjs|vbs|wsf)$/i;

function isBlockedUpload(file: { mimetype: string; originalname: string }): boolean {
  return (
    BLOCKED_MIMES.has(file.mimetype) || BLOCKED_EXT.test(file.originalname || '')
  );
}

// Shared filter for both the Cloudinary and local-disk storage branches.
function uploadFileFilter(
  _req: unknown,
  file: { mimetype: string; originalname: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (isBlockedUpload(file)) {
    callback(
      new Error(
        `This file type is not allowed for security reasons: ${file.mimetype || file.originalname}`,
      ),
      false,
    );
  } else {
    callback(null, true);
  }
}

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

              // Images -> image, videos -> video, everything else (PDF,
              // Office, iWork, CAD, archives, ...) -> raw so Cloudinary
              // stores the file as-is. No `allowed_formats` cap, so any
              // legitimate document/design format is accepted.
              let resourceType: 'video' | 'raw' | 'image' = 'raw';
              if (isImage) resourceType = 'image';
              else if (isVideo) resourceType = 'video';

              // Base params
              const params: Record<string, unknown> = {
                folder: 'homico',
                resource_type: resourceType,
                public_id: uuidv4(),
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
            fileFilter: uploadFileFilter,
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
          fileFilter: uploadFileFilter,
        };
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
