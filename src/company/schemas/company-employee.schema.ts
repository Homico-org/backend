import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum EmployeeRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  WORKER = 'worker',
}

export enum EmployeeStatus {
  PENDING = 'pending',      // Invitation sent, not accepted
  ACTIVE = 'active',        // Active employee
  INACTIVE = 'inactive',    // Temporarily inactive
  TERMINATED = 'terminated', // No longer with company
}

export enum InvitationMethod {
  EMAIL = 'email',
  LINK = 'link',
  MANUAL = 'manual',
}

@Schema({ timestamps: true })
export class CompanyEmployee extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProProfile' })
  proProfileId: Types.ObjectId;

  // Employee Info (can be filled before user joins)
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone: string;

  @Prop()
  avatar: string;

  // Role & Position
  @Prop({
    type: String,
    enum: Object.values(EmployeeRole),
    default: EmployeeRole.WORKER,
  })
  role: EmployeeRole;

  @Prop()
  jobTitle: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  // Status
  @Prop({
    type: String,
    enum: Object.values(EmployeeStatus),
    default: EmployeeStatus.PENDING,
  })
  status: EmployeeStatus;

  // Work Details
  @Prop()
  department: string;

  @Prop()
  hireDate: Date;

  @Prop()
  terminationDate: Date;

  @Prop({ default: 0 })
  completedJobs: number;

  @Prop({ default: 0 })
  avgRating: number;

  @Prop({ default: 0 })
  totalReviews: number;

  // Permissions
  @Prop({
    type: {
      canViewJobs: Boolean,
      canAcceptJobs: Boolean,
      canManageWorkers: Boolean,
      canManageCompany: Boolean,
      canViewFinances: Boolean,
      canMessageClients: Boolean,
    },
    default: {
      canViewJobs: true,
      canAcceptJobs: false,
      canManageWorkers: false,
      canManageCompany: false,
      canViewFinances: false,
      canMessageClients: true,
    },
  })
  permissions: {
    canViewJobs: boolean;
    canAcceptJobs: boolean;
    canManageWorkers: boolean;
    canManageCompany: boolean;
    canViewFinances: boolean;
    canMessageClients: boolean;
  };

  // Invitation
  @Prop({
    type: String,
    enum: Object.values(InvitationMethod),
    default: InvitationMethod.EMAIL,
  })
  invitationMethod: InvitationMethod;

  @Prop()
  invitationToken: string;

  @Prop()
  invitationSentAt: Date;

  @Prop()
  invitationAcceptedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedBy: Types.ObjectId;

  // Availability
  @Prop({ default: true })
  isAvailable: boolean;

  @Prop()
  availabilityNote: string;

  // Notes (internal)
  @Prop()
  notes: string;
}

export const CompanyEmployeeSchema = SchemaFactory.createForClass(CompanyEmployee);

CompanyEmployeeSchema.index({ companyId: 1 });
CompanyEmployeeSchema.index({ userId: 1 });
CompanyEmployeeSchema.index({ email: 1 });
CompanyEmployeeSchema.index({ companyId: 1, status: 1 });
CompanyEmployeeSchema.index({ companyId: 1, role: 1 });
CompanyEmployeeSchema.index({ invitationToken: 1 });

// Ensure unique employee per company (by email or userId)
CompanyEmployeeSchema.index({ companyId: 1, email: 1 }, { unique: true });
