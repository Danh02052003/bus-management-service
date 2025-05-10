import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Transit } from './transit.entity';
import { Repository } from 'typeorm';

@Injectable()
export class TransitService {
  constructor(
    @InjectRepository(Transit)
    private readonly transitRepository: Repository<Transit>,
  ) {}

  async createTransit(company_id: number, content: string) {
    try {
      const newTransit = this.transitRepository.create({
        content,
        company: { id: company_id },
      });

      return await this.transitRepository.save(newTransit);
    } catch (error) {
      console.log(error);
    }
  }

  async updateTransit(id: number, content: string) {
    await this.transitRepository.update(id, { content });
  }
}
