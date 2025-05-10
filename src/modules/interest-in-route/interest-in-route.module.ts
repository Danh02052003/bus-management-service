import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterestInRoute } from './entities/interest-in-route.entity';
import { InterestInRouteService } from './interest-in-route.service';
import { InterestInRouteController } from './interest-in-route.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InterestInRoute])],
  controllers: [InterestInRouteController],
  providers: [InterestInRouteService],
  exports: [InterestInRouteService],
})
export class InterestInRouteModule {} 