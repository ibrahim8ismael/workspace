import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { configureHttp } from './platform/http/configure.js';
import { AppModule } from './app.module.js';
import type { ApiEnvironment } from './platform/config/environment.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
app.useBodyParser('json', { limit: '4kb' });
const config = app.get(ConfigService<ApiEnvironment, true>);
configureHttp(app);
app.enableShutdownHooks();
await app.listen(config.get('API_PORT', { infer: true }), config.get('API_HOST', { infer: true }));
