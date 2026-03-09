import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingStatus } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { User } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
  ) {}

  async create(clientId: string, dto: CreateBookingDto): Promise<Booking> {
    const { professionalId, date, startHour, endHour, note } = dto;

    if (clientId === professionalId) {
      throw new BadRequestException('Cannot book yourself');
    }

    if (endHour <= startHour) {
      throw new BadRequestException('endHour must be greater than startHour');
    }

    const pro = await this.userModel.findById(professionalId).lean();
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    // Validate the requested slot is within pro's schedule
    this.validateAgainstSchedule(pro, date, startHour, endHour);

    // Check for conflicts with existing bookings
    await this.checkConflicts(professionalId, date, startHour, endHour);

    const booking = new this.bookingModel({
      professional: new Types.ObjectId(professionalId),
      client: new Types.ObjectId(clientId),
      date,
      startHour,
      endHour,
      note,
      status: BookingStatus.PENDING,
    });

    const saved = await booking.save();

    // Notify professional
    await this.notificationsService.notify(
      professionalId,
      NotificationType.NEW_BOOKING,
      'New Booking Request',
      `You have a new booking request for ${date} at ${startHour}:00`,
      {
        link: `/bookings`,
        referenceId: saved._id.toString(),
        referenceModel: 'Booking',
      },
    );

    return saved;
  }

  async findUserBookings(
    userId: string,
    options: { status?: string; upcoming?: boolean } = {},
  ) {
    const query: any = {
      $or: [
        { professional: new Types.ObjectId(userId) },
        { client: new Types.ObjectId(userId) },
      ],
    };

    if (options.status) {
      query.status = options.status;
    }

    if (options.upcoming) {
      const today = new Date().toISOString().split('T')[0];
      query.date = { $gte: today };
      query.status = { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] };
    }

    return this.bookingModel
      .find(query)
      .populate('professional', 'name avatar phone accountType')
      .populate('client', 'name avatar phone')
      .sort({ date: 1, startHour: 1 })
      .lean();
  }

  async findById(bookingId: string, userId: string) {
    const booking = await this.bookingModel
      .findById(bookingId)
      .populate('professional', 'name avatar phone accountType')
      .populate('client', 'name avatar phone')
      .lean();

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = (booking.professional as any)._id?.toString() || booking.professional.toString();
    const cliId = (booking.client as any)._id?.toString() || booking.client.toString();

    if (proId !== userId && cliId !== userId) {
      throw new ForbiddenException('Not authorized to view this booking');
    }

    return booking;
  }

  async updateStatus(
    bookingId: string,
    userId: string,
    dto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = booking.professional.toString();
    const cliId = booking.client.toString();

    if (proId !== userId && cliId !== userId) {
      throw new ForbiddenException('Not authorized to update this booking');
    }

    // Validate transitions
    const { status, cancelReason } = dto;

    if (status === BookingStatus.CONFIRMED && userId !== proId) {
      throw new ForbiddenException('Only the professional can confirm bookings');
    }

    if (status === BookingStatus.COMPLETED && userId !== proId) {
      throw new ForbiddenException('Only the professional can mark bookings as completed');
    }

    if (status === BookingStatus.CANCELLED) {
      booking.cancelledBy = new Types.ObjectId(userId);
      booking.cancelReason = cancelReason;
    }

    booking.status = status;
    const updated = await booking.save();

    // Notify the other party
    const notifyUserId = userId === proId ? cliId : proId;
    const statusMessages: Record<string, { title: string; message: string }> = {
      [BookingStatus.CONFIRMED]: {
        title: 'Booking Confirmed',
        message: `Your booking for ${booking.date} at ${booking.startHour}:00 has been confirmed`,
      },
      [BookingStatus.CANCELLED]: {
        title: 'Booking Cancelled',
        message: `Booking for ${booking.date} at ${booking.startHour}:00 has been cancelled`,
      },
      [BookingStatus.COMPLETED]: {
        title: 'Booking Completed',
        message: `Booking for ${booking.date} at ${booking.startHour}:00 has been completed`,
      },
    };

    const msg = statusMessages[status];
    if (msg) {
      await this.notificationsService.notify(
        notifyUserId,
        status === BookingStatus.CONFIRMED
          ? NotificationType.BOOKING_CONFIRMED
          : status === BookingStatus.CANCELLED
            ? NotificationType.BOOKING_CANCELLED
            : NotificationType.BOOKING_COMPLETED,
        msg.title,
        msg.message,
        {
          link: `/bookings`,
          referenceId: bookingId,
          referenceModel: 'Booking',
        },
      );
    }

    return updated;
  }

  async getAvailability(
    proId: string,
    date: string,
  ): Promise<{ hour: number; available: boolean }[]> {
    const pro = await this.userModel.findById(proId).lean();
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    const dayOfWeek = this.getDayOfWeek(date);

    // Check schedule overrides first
    const override = (pro.scheduleOverrides || []).find((o) => o.date === date);
    if (override?.isBlocked) {
      return this.generateSlots(0, 0, []); // all unavailable
    }

    let startHour: number;
    let endHour: number;

    if (override && !override.isBlocked && override.startHour != null && override.endHour != null) {
      startHour = override.startHour;
      endHour = override.endHour;
    } else {
      const daySchedule = (pro.weeklySchedule || []).find((d) => d.dayOfWeek === dayOfWeek);
      if (!daySchedule || !daySchedule.isAvailable) {
        return this.generateSlots(0, 0, []);
      }
      startHour = daySchedule.startHour;
      endHour = daySchedule.endHour;
    }

    // Fetch existing bookings for this date
    const existingBookings = await this.bookingModel.find({
      professional: new Types.ObjectId(proId),
      date,
      status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    }).lean();

    return this.generateSlots(startHour, endHour, existingBookings);
  }

  private validateAgainstSchedule(
    pro: any,
    date: string,
    startHour: number,
    endHour: number,
  ): void {
    const dayOfWeek = this.getDayOfWeek(date);

    const override = (pro.scheduleOverrides || []).find((o: any) => o.date === date);
    if (override?.isBlocked) {
      throw new BadRequestException('Professional is not available on this date');
    }

    let schedStart: number;
    let schedEnd: number;

    if (override && !override.isBlocked && override.startHour != null && override.endHour != null) {
      schedStart = override.startHour;
      schedEnd = override.endHour;
    } else {
      const daySchedule = (pro.weeklySchedule || []).find((d: any) => d.dayOfWeek === dayOfWeek);
      if (!daySchedule || !daySchedule.isAvailable) {
        throw new BadRequestException('Professional is not available on this day');
      }
      schedStart = daySchedule.startHour;
      schedEnd = daySchedule.endHour;
    }

    if (startHour < schedStart || endHour > schedEnd) {
      throw new BadRequestException('Requested time is outside professional\'s availability');
    }
  }

  private async checkConflicts(
    proId: string,
    date: string,
    startHour: number,
    endHour: number,
  ): Promise<void> {
    const conflict = await this.bookingModel.findOne({
      professional: new Types.ObjectId(proId),
      date,
      status: { $in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      $or: [
        { startHour: { $lt: endHour }, endHour: { $gt: startHour } },
      ],
    });

    if (conflict) {
      throw new BadRequestException('This time slot is already booked');
    }
  }

  private generateSlots(
    startHour: number,
    endHour: number,
    bookings: any[],
  ): { hour: number; available: boolean }[] {
    const slots: { hour: number; available: boolean }[] = [];

    for (let h = 6; h < 22; h++) {
      const withinSchedule = h >= startHour && h < endHour;
      const isBooked = bookings.some(
        (b) => h >= b.startHour && h < b.endHour,
      );
      slots.push({ hour: h, available: withinSchedule && !isBooked });
    }

    return slots;
  }

  private getDayOfWeek(dateStr: string): number {
    const d = new Date(dateStr + 'T12:00:00Z');
    // JS: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    const jsDay = d.getUTCDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }
}
