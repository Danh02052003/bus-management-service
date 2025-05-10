import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InterestInRoute } from './entities/interest-in-route.entity';

@Injectable()
export class InterestInRouteService {
  constructor(
    @InjectRepository(InterestInRoute)
    private readonly interestInRouteRepository: Repository<InterestInRoute>,
  ) {}

  async findAllByAccountId(accountId: string): Promise<InterestInRoute[]> {
    return await this.interestInRouteRepository.find({
      where: {
        account_id: accountId,
      },
    });
  }

  async create({ accountId, routeId }: { accountId: string, routeId: number }): Promise<InterestInRoute> {
    const interestInRoute = this.interestInRouteRepository.create({
      account_id: accountId,
      route_id: routeId,
    });
    return await this.interestInRouteRepository.save(interestInRoute);
  }

  async delete(id: string): Promise<void> {
    await this.interestInRouteRepository.delete(id);
  }
} 