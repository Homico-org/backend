import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // If running behind a proxy/load balancer (common in production), trust it so
  // request IPs (used by rate limiting) work correctly.
  // See: https://docs.nestjs.com/security/rate-limiting#proxies
  app.set('trust proxy', 1);

  // Basic security headers (best-effort; adjust CSP when you add a CDN/proxy)
  app.use(
    helmet({
      // Swagger (when enabled) needs inline scripts; we keep CSP off here and recommend
      // enforcing it at the edge (CDN/proxy) with a tuned policy.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Increase payload size limit for large image/video uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'https://homico-frontend.onrender.com',
      'https://homico-frontend-dev.onrender.com',
      'https://app.homico.ge',
      'https://homico.ge',
      'https://www.homico.ge',
      'https://dev.homico.ge',
      'https://app.dev.homico.ge',
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger configuration (opt-in; protect with Basic Auth)
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const swaggerUser = process.env.SWAGGER_USER;
    const swaggerPass = process.env.SWAGGER_PASS;
    if (!swaggerUser || !swaggerPass) {
      throw new Error('SWAGGER_ENABLED=true requires SWAGGER_USER and SWAGGER_PASS');
    }

    // Protect swagger endpoints with Basic Auth
    app.use('/api', (req, res, next) => {
      const header = req.headers.authorization || '';
      const [scheme, encoded] = header.split(' ');
      if (scheme?.toLowerCase() !== 'basic' || !encoded) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Homico API Docs"');
        return res.status(401).send('Authentication required');
      }
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const user = idx >= 0 ? decoded.slice(0, idx) : '';
      const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
      if (user !== swaggerUser || pass !== swaggerPass) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Homico API Docs"');
        return res.status(401).send('Invalid credentials');
      }
      return next();
    });

    const config = new DocumentBuilder()
      .setTitle('Homico API')
      .setDescription('Marketplace API for renovation professionals')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
    console.log(`Swagger documentation available at: http://localhost:${process.env.PORT || 3001}/api`);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Homico backend is running on: http://localhost:${port}`);
}

bootstrap();
