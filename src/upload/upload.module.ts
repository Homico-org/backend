import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';

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

          const storage = new CloudinaryStorage({
            cloudinary: cloudinary,
            params: async (req, file) => {
              const isVideo = file.mimetype.startsWith('video/');
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
              
              return {
                folder: 'homico',
                resource_type: resourceType,
                public_id: uuidv4(),
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
              };
            },
          });

          return {
            storage,
            limits: {
              fileSize: 50 * 1024 * 1024, // 50MB
            },
            fileFilter: (req, file, callback) => {
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
            filename: (req, file, callback) => {
              const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
              callback(null, uniqueName);
            },
          }),
          limits: {
            fileSize: 50 * 1024 * 1024, // 50MB
          },
          fileFilter: (req, file, callback) => {
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
