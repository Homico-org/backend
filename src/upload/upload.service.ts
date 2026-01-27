import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, extname } from 'path';
import { existsSync, unlinkSync, statSync } from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

// Image compression settings
const IMAGE_COMPRESSION = {
  maxWidth: 1920,      // Max width for any image
  maxHeight: 1920,     // Max height for any image
  quality: 80,         // JPEG/WebP quality (0-100)
  maxSizeKB: 500,      // Target max file size in KB
};

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadPath = join(process.cwd(), 'uploads');
  private readonly useCloudinary: boolean;

  constructor(private configService: ConfigService) {
    this.useCloudinary = !!(
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') &&
      this.configService.get<string>('CLOUDINARY_API_KEY') &&
      this.configService.get<string>('CLOUDINARY_API_SECRET')
    );
  }

  /**
   * Compress an image file using sharp
   * Reduces file size while maintaining good quality
   */
  async compressImage(filePath: string): Promise<{ compressed: boolean; newSize: number }> {
    try {
      const ext = extname(filePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);

      if (!isImage) {
        return { compressed: false, newSize: 0 };
      }

      // Get original file size
      const originalSize = statSync(filePath).size;
      const originalSizeKB = originalSize / 1024;

      // Skip if already small enough
      if (originalSizeKB <= IMAGE_COMPRESSION.maxSizeKB) {
        this.logger.debug(`Image already optimized: ${originalSizeKB.toFixed(1)}KB`);
        return { compressed: false, newSize: originalSize };
      }

      // Read image metadata
      const metadata = await sharp(filePath).metadata();

      // Calculate resize dimensions (maintain aspect ratio)
      let width = metadata.width || IMAGE_COMPRESSION.maxWidth;
      let height = metadata.height || IMAGE_COMPRESSION.maxHeight;

      if (width > IMAGE_COMPRESSION.maxWidth || height > IMAGE_COMPRESSION.maxHeight) {
        const ratio = Math.min(
          IMAGE_COMPRESSION.maxWidth / width,
          IMAGE_COMPRESSION.maxHeight / height
        );
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Compress based on format
      let sharpInstance = sharp(filePath)
        .resize(width, height, { fit: 'inside', withoutEnlargement: true });

      if (ext === '.png') {
        // Convert PNG to WebP for better compression (or keep as PNG with optimization)
        sharpInstance = sharpInstance.png({ quality: IMAGE_COMPRESSION.quality, compressionLevel: 9 });
      } else if (ext === '.gif') {
        // GIFs are tricky - just resize, don't change format
        sharpInstance = sharpInstance.gif();
      } else {
        // JPEG/WebP - use JPEG output with good compression
        sharpInstance = sharpInstance.jpeg({ quality: IMAGE_COMPRESSION.quality, mozjpeg: true });
      }

      // Write to temp file, then replace original
      const tempPath = filePath + '.tmp';
      await sharpInstance.toFile(tempPath);

      // Get new file size
      const newSize = statSync(tempPath).size;
      const newSizeKB = newSize / 1024;

      // Replace original with compressed version
      unlinkSync(filePath);
      require('fs').renameSync(tempPath, filePath);

      this.logger.log(
        `Image compressed: ${originalSizeKB.toFixed(1)}KB → ${newSizeKB.toFixed(1)}KB (${((1 - newSize / originalSize) * 100).toFixed(1)}% reduction)`
      );

      return { compressed: true, newSize };
    } catch (error) {
      this.logger.error(`Image compression failed: ${error.message}`);
      return { compressed: false, newSize: 0 };
    }
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

  /**
   * Get file info and compress images if using local storage
   */
  async getFileInfo(file: Express.Multer.File) {
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

    // Local storage - compress images
    let finalSize = file.size;
    if (file.mimetype.startsWith('image/')) {
      const filePath = this.getFilePath(file.filename);
      const result = await this.compressImage(filePath);
      if (result.compressed) {
        finalSize = result.newSize;
      }
    }

    return {
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: finalSize,
      url: this.getFileUrl(file.filename),
    };
  }
}
