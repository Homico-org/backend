import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
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
              return {
                folder: 'homico',
                resource_type: isVideo ? 'video' : 'image',
                public_id: uuidv4(),
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm'],
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
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
                'video/mp4',
                'video/quicktime',
                'video/webm',
              ];
              if (allowedMimes.includes(file.mimetype)) {
                callback(null, true);
              } else {
                callback(new Error('Invalid file type'), false);
              }
            },
          };
        }

        // Fallback to local disk storage for development
        return {
          storage: diskStorage({
            destination: join(process.cwd(), 'uploads'),
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
              'image/jpeg',
              'image/png',
              'image/gif',
              'image/webp',
              'video/mp4',
              'video/quicktime',
              'video/webm',
            ];
            if (allowedMimes.includes(file.mimetype)) {
              callback(null, true);
            } else {
              callback(new Error('Invalid file type'), false);
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
