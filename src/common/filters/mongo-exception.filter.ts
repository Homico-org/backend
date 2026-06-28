import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { Error as MongooseError } from "mongoose";

/**
 * Maps low-level Mongoose errors to clean 4xx responses instead of leaking a
 * 500. The common case: a malformed ObjectId in a route param (e.g.
 * GET /payments/not-an-id/reconcile) throws a CastError deep in a query - that
 * should be a 400, not a server error. Scoped to `@Catch(MongooseError)`, so
 * HttpExceptions (NotFound/BadRequest/Forbidden) are never intercepted and keep
 * their own status codes. Any other Mongoose error is re-thrown to the default
 * handler (still a 500), so we don't silently swallow real failures.
 */
@Catch(MongooseError)
export class MongoExceptionFilter implements ExceptionFilter {
  catch(exception: MongooseError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof MongooseError.CastError) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "Invalid identifier",
        error: "Bad Request",
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    if (exception instanceof MongooseError.ValidationError) {
      const messages = Object.values(exception.errors).map((e) => e.message);
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: messages,
        error: "Bad Request",
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    // Not a CastError/ValidationError - let the default handler deal with it.
    throw exception;
  }
}
