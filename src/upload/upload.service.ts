import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly uploadPath = join(process.cwd(), 'uploads');
  private readonly useCloudinary: boolean;

  constructor(private configService: ConfigService) {
    this.useCloudinary = !!(
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') &&
      this.configService.get<string>('CLOUDINARY_API_KEY') &&
      this.configService.get<string>('CLOUDINARY_API_SECRET')
    );
  }

  getFilePath(filename: string): string {
    return join(this.uploadPath, filename);
  }

  getFileUrl(filename: string): string {
    return `/uploads/${filename}`;
  }

  fileExists(filename: string): boolean {
    if (this.useCloudinary) {
      // For Cloudinary, we can't easily check if file exists
      return true;
    }
    return existsSync(this.getFilePath(filename));
  }

  async deleteFile(filename: string): Promise<boolean> {
    if (this.useCloudinary) {
      try {
        // Extract public_id from Cloudinary URL or filename
        const publicId = filename.includes('/')
          ? filename.split('/').slice(-1)[0].split('.')[0]
          : filename.split('.')[0];
        await cloudinary.uploader.destroy(`homico/${publicId}`);
        return true;
      } catch {
        return false;
      }
    }

    const filePath = this.getFilePath(filename);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }
    return false;
  }

  getFileInfo(file: Express.Multer.File) {
    // Cloudinary adds 'path' property with the full URL
    const cloudinaryFile = file as Express.Multer.File & { path?: string };

    if (this.useCloudinary && cloudinaryFile.path) {
      return {
        filename: cloudinaryFile.filename || file.originalname,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: cloudinaryFile.path, // Cloudinary returns full URL in path
      };
    }

    // Local storage
    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: this.getFileUrl(file.filename),
    };
  }
}
