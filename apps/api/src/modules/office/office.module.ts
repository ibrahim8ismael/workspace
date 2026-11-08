import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { OfficeController } from './office.controller.js';

@Module({ imports: [TenancyModule], controllers: [OfficeController] })
export class OfficeModule {}
