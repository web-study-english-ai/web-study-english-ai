import './instrument';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/{*path}'],
  });
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? [],
    credentials: true,
  });

  app.set('trust proxy', 1);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Web Study English AI — API')
    .setDescription('Tài liệu API cho hệ thống học từ vựng tiếng Anh ứng dụng AI')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document));

  const port = process.env.PORT
    ? parseInt(process.env.PORT, 10)
    : (config.get<number>('PORT') ?? 3001);
  await app.listen(port, '0.0.0.0');

  console.log(`Backend đang chạy tại http://0.0.0.0:${port}/api`);
  console.log(`Tài liệu API tại      http://0.0.0.0:${port}/api/docs`);
}

void bootstrap();
