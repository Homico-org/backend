import { Controller, Get, Param } from '@nestjs/common';
import { BadgesService } from './badges.service';

@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  /** Public catalog of all defined badges. */
  @Get()
  getCatalog() {
    return this.badgesService.getCatalog();
  }

  /** Public: badges a given user has unlocked (rendered on their profile). */
  @Get('user/:userId')
  getUserBadges(@Param('userId') userId: string) {
    return this.badgesService.getUserBadges(userId);
  }
}
