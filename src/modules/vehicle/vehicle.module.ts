import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CompanyModule } from "../company/company.module";
import { Vehicle } from "./vehicle.entity";
import { VehicleController } from "./vehicle.controller";
import { VehicleService } from "./vehicle.service";

@Module({
    imports: [TypeOrmModule.forFeature([Vehicle]), CompanyModule],
    controllers: [VehicleController],
    providers: [VehicleService],
})
export class VehicleModule {}