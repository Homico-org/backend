import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Always call the parent canActivate which will validate the JWT
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // Don't throw an error if no user is found or if there's an auth error
    // Just return null/undefined - the route will handle unauthenticated requests
    return user || null;
  }
}
