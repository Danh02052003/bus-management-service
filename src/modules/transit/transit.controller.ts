import { Controller } from '@nestjs/common';
import { TransitService } from './transit.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ApiResponse } from 'src/utils/api-response';
import { handleError } from 'src/utils/error-handler';

@Controller()
export class TransitController {
  constructor(private readonly transitService: TransitService) {}

  @MessagePattern('create_transit')
  async createTransit(
    @Payload() data: { company_id: number; content: string },
  ) {
    return await this.transitService
      .createTransit(data.company_id, data.content)
      .then(
        (result) => ApiResponse.success(result),
        (error) => handleError(error),
      );
  }

  @MessagePattern('update_transit')
  async updateTransit(@Payload() data: { id: number; content: string }) {
    return await this.transitService.updateTransit(data.id, data.content).then(
      (result) => ApiResponse.success(result),
      (error) => handleError(error),
    );
  }
}
