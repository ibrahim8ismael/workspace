import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { ApiEnvironment } from './platform/config/environment.js';

const app = await NestFactory.create(AppModule);
const config = app.get(ConfigService<ApiEnvironment, true>);
app.setGlobalPrefix('api');
app.use(helmet());
app.use(cookieParser());
app.enableShutdownHooks();
await app.listen(config.get('API_PORT', { infer: true }), config.get('API_HOST', { infer: true }));
