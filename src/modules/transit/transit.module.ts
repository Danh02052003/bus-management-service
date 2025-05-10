import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transit } from './transit.entity';
import { TransitService } from './transit.service';
import { TransitController } from './transit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Transit])],
  controllers: [TransitController],
  providers: [TransitService],
  exports: [TransitService, TypeOrmModule],
})
export class TransitModule {}
