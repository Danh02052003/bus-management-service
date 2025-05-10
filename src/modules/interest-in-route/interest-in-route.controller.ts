import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { InterestInRouteService } from './interest-in-route.service';
import { InterestInRoute } from './entities/interest-in-route.entity';
import { ApiResponse } from 'src/utils/api-response';
import { handleError } from 'src/utils/error-handler';

@Controller()
export class InterestInRouteController {
  constructor(private readonly interestInRouteService: InterestInRouteService) {}

  @MessagePattern('findall_interests_by_account')
  async findAllByAccountId(@Payload() accountId: string): Promise<ApiResponse<InterestInRoute[]>> {
    try {
      const response = await this.interestInRouteService.findAllByAccountId(accountId);
      return ApiResponse.success(response);
    } catch (error) {
      return handleError(error);
    }
  }

  @MessagePattern('create_interest_in_route')
  async create(@Payload() data: { accountId: string; routeId: number }): Promise<ApiResponse<InterestInRoute>> {
    try {
      const response = await this.interestInRouteService.create(data);
      return ApiResponse.success(response);
    } catch (error) {
      return handleError(error);
    }
  }

  @MessagePattern('delete_interest_in_route')
  async delete(@Payload() id: string): Promise<ApiResponse<void>> {
    try {
      await this.interestInRouteService.delete(id);
      return ApiResponse.success(null);
    } catch (error) {
      return handleError(error);
    }
  }
} 