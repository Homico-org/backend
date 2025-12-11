import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Only check email uniqueness if email is provided
    if (createUserDto.email) {
      const existingUserByEmail = await this.userModel.findOne({ email: createUserDto.email });
      if (existingUserByEmail) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Check phone uniqueness (phone is now required)
    if (createUserDto.phone) {
      const existingUserByPhone = await this.userModel.findOne({ phone: createUserDto.phone });
      if (existingUserByPhone) {
        throw new ConflictException('User with this phone number already exists');
      }
    }

    // Generate unique UID (auto-incrementing number starting from 100001)
    const uid = await this.generateNextUid();

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = new this.userModel({
      ...createUserDto,
      uid,
      password: hashedPassword,
    });

    return user.save();
  }

  private async generateNextUid(): Promise<number> {
    const lastUser = await this.userModel.findOne({ uid: { $exists: true } }).sort({ uid: -1 }).exec();
    const startingUid = 100001;
    return lastUser?.uid ? lastUser.uid + 1 : startingUid;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userModel.findOne({ phone }).exec();
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    return this.userModel.findOne({
      $or: [{ email: identifier }, { phone: identifier }]
    }).exec();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async validatePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastLoginAt: new Date(),
    });
  }

  async update(userId: string, updateData: Partial<User>): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      updateData,
      { new: true },
    ).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getDemoAccounts(): Promise<{ email: string; role: string; name: string }[]> {
    const users = await this.userModel.find({
      email: { $regex: /@demo\.com$/ }
    }).select('email role name').sort({ role: 1, email: 1 }).exec();

    return users.map(u => ({
      email: u.email,
      role: u.role,
      name: u.name,
    }));
  }

  async checkExists(field: 'email' | 'phone' | 'idNumber', value: string): Promise<{ exists: boolean }> {
    let normalizedValue = value;
    if (field === 'email') {
      normalizedValue = value.toLowerCase();
    } else if (field === 'phone') {
      // Normalize phone: remove all spaces and dashes
      normalizedValue = value.replace(/[\s\-]/g, '');
    }

    // For phone, search with normalized value (no spaces)
    if (field === 'phone') {
      // Find any user whose phone, when normalized, matches the input
      const users = await this.userModel.find({}).select('phone').exec();
      const exists = users.some(u => {
        if (!u.phone) return false;
        const storedNormalized = u.phone.replace(/[\s\-]/g, '');
        return storedNormalized === normalizedValue;
      });
      return { exists };
    }

    const query = { [field]: normalizedValue };
    const user = await this.userModel.findOne(query).select('_id').exec();
    return { exists: !!user };
  }

  async upgradeToPro(userId: string, selectedCategories: string[]): Promise<User> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === 'pro') {
      throw new ConflictException('User is already a professional');
    }

    if (user.role !== 'client') {
      throw new ConflictException('Only clients can upgrade to professional status');
    }

    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        role: 'pro',
        selectedCategories,
      },
      { new: true },
    ).exec();

    return updatedUser;
  }

  async findByUid(uid: number): Promise<User | null> {
    return this.userModel.findOne({ uid }).exec();
  }

  async assignUidsToExistingUsers(): Promise<{ updated: number }> {
    const usersWithoutUid = await this.userModel.find({ uid: { $exists: false } }).sort({ createdAt: 1 }).exec();

    if (usersWithoutUid.length === 0) {
      return { updated: 0 };
    }

    let nextUid = await this.generateNextUid();
    let updated = 0;

    for (const user of usersWithoutUid) {
      await this.userModel.findByIdAndUpdate(user._id, { uid: nextUid });
      nextUid++;
      updated++;
    }

    return { updated };
  }
}
