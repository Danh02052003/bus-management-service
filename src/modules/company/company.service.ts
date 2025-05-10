import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Company } from './company.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DTO_RP_Company,
  DTO_RP_RegisterSaleTicketOnPlatform,
  DTO_RQ_Company,
  DTO_RQ_RegisterSaleTicketOnPlatform,
} from './company.dto';
import { RedisService } from 'src/config/redis.service';
import { RegisterSaleTicket } from './register_sale_ticket.entity';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly redisService: RedisService,

    @InjectRepository(RegisterSaleTicket)
    private readonly registerSaleTicketRepository: Repository<RegisterSaleTicket>,
  ) {}

  // Tạo công ty mới data lưu vào PostgreSQL và Redis
  async createCompany(company: DTO_RQ_Company): Promise<DTO_RP_Company> {
    // console.log('Received Data: ', company);

    if ('created_at' in company) {
      delete company.created_at;
    }
    const existingCompany = await this.companyRepository.findOne({
      where: { code: company.code },
    });
    if (existingCompany) {
      throw new HttpException('Mã công ty đã tồn tại', HttpStatus.BAD_REQUEST);
    }

    const newCompany = await this.companyRepository.save(company);

    const companyCacheData = {
      id: newCompany.id,
      code: newCompany.code,
      status: newCompany.status,
    };

    await this.redisService.set(
      `company:${newCompany.id}`,
      JSON.stringify(companyCacheData),
    );

    // console.log(`✅ Công ty ${newCompany.id} đã được lưu vào Redis`);

    return {
      id: newCompany.id,
      name: newCompany.name,
      phone: newCompany.phone,
      address: newCompany.address,
      tax_code: newCompany.tax_code,
      status: newCompany.status,
      url_logo: newCompany.url_logo,
      code: newCompany.code,
      note: newCompany.note,
      url_vehicle_online: newCompany.url_vehicle_online,
      created_at: newCompany.created_at.toISOString(),
    };
  }

  // Lấy danh sách tất cả công ty từ PostgreSQL và lưu vào Redis
  async getAllCompanies(): Promise<DTO_RP_Company[]> {
    const companies = await this.companyRepository.find();

    for (const company of companies) {
      const companyData = JSON.stringify({
        id: company.id,
        code: company.code,
        status: company.status,
      });
      await this.redisService.set(`company:${company.id}`, companyData);
    }

    // console.log('✅ Đã lưu danh sách công ty vào Redis');

    const companiesMapped = companies.map((company) => ({
      id: company.id,
      name: company.name,
      phone: company.phone,
      address: company.address,
      tax_code: company.tax_code,
      status: company.status,
      url_logo: company.url_logo,
      code: company.code,
      note: company.note,
      url_vehicle_online: company.url_vehicle_online,
      created_at: company.created_at.toISOString(),
    }));

    return companiesMapped;
  }

  async getCompany(id: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['policies', 'transits'],
    });

    return company;
  }

  // Cập nhật thông tin công ty trong PostgreSQL và Redis
  async updateCompany(
    id: number,
    companyData: DTO_RQ_Company,
  ): Promise<DTO_RP_Company> {
    // 1. Kiểm tra xem công ty có tồn tại không
    const existingCompany = await this.companyRepository.findOne({
      where: { id },
    });

    if (!existingCompany) {
      throw new HttpException(
        `Không tìm thấy công ty với ID: ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Cập nhật dữ liệu trong database
    await this.companyRepository.update(id, {
      name: companyData.name,
      phone: companyData.phone,
      address: companyData.address,
      tax_code: companyData.tax_code,
      status: companyData.status,
      url_logo: companyData.url_logo,
      code: companyData.code,
      note: companyData.note,
      url_vehicle_online: companyData.url_vehicle_online,
    });

    // 3. Lấy dữ liệu mới sau khi cập nhật
    const updatedCompany = await this.companyRepository.findOne({
      where: { id },
    });

    if (!updatedCompany) {
      throw new HttpException(
        `Lỗi khi lấy dữ liệu công ty sau khi cập nhật ID: ${id}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 4. Cập nhật Redis với ID & Name & status
    await this.redisService.set(
      `company:${updatedCompany.id}`,
      JSON.stringify({
        id: updatedCompany.id,
        code: updatedCompany.code,
        status: updatedCompany.status,
      }),
    );

    return {
      id: updatedCompany.id,
      name: updatedCompany.name,
      phone: updatedCompany.phone,
      address: updatedCompany.address,
      tax_code: updatedCompany.tax_code,
      status: updatedCompany.status,
      url_logo: updatedCompany.url_logo,
      code: updatedCompany.code,
      note: updatedCompany.note,
      url_vehicle_online: updatedCompany.url_vehicle_online,
      created_at: updatedCompany.created_at.toISOString(),
    };
  }

  // Xóa công ty trong PostgreSQL và Redis
  async deleteCompany(id: number): Promise<void> {
    console.log('Received Data:', id);
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      throw new HttpException(
        `Không tìm thấy công ty với ID: ${id}`,
        HttpStatus.NOT_FOUND,
      );
    }
    await this.companyRepository.delete(id);
    await this.redisService.delete(`company:${id}`);
    console.log(`✅ Xóa thành công company:${id} trong PostgreSQL`);
    console.log(`✅ Xóa thành công company:${id} trong Redis`);
  }

  // Khóa công ty trong PostgreSQL và Redis
  async lockCompany(id: number): Promise<DTO_RP_Company> {
    console.log('Received Data: ', id);
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      return null;
    }

    company.status = false;
    await this.companyRepository.save(company);

    await this.redisService.set(
      `company:${company.id}`,
      JSON.stringify({
        id: company.id,
        code: company.code,
        status: company.status,
      }),
    );

    return {
      id: company.id,
      name: company.name,
      phone: company.phone,
      address: company.address,
      tax_code: company.tax_code,
      status: company.status,
      url_logo: company.url_logo,
      code: company.code,
      note: company.note,
      url_vehicle_online: company.url_vehicle_online,
      created_at: company.created_at.toISOString(),
    };
  }

  // Mở khóa công ty trong PostgreSQL và Redis
  async unlockCompany(id: number): Promise<DTO_RP_Company> {
    console.log('Received Data: ', id);
    const company = await this.companyRepository.findOne({ where: { id } });
    if (!company) {
      return null;
    }

    company.status = true;
    await this.companyRepository.save(company);
    await this.redisService.set(
      `company:${company.id}`,
      JSON.stringify({
        id: company.id,
        code: company.code,
        status: company.status,
      }),
    );
    return {
      id: company.id,
      name: company.name,
      phone: company.phone,
      address: company.address,
      tax_code: company.tax_code,
      status: company.status,
      url_logo: company.url_logo,
      code: company.code,
      note: company.note,
      url_vehicle_online: company.url_vehicle_online,
      created_at: company.created_at.toISOString(),
    };
  }

  // Đăng ký vé trên nền tảng
  async registerSaleTicketOnPlatform(
    data: DTO_RQ_RegisterSaleTicketOnPlatform,
  ): Promise<void> {
    console.log('Received Data: ', data);

    const newRegister = this.registerSaleTicketRepository.create({
      name: data.name,
      phone: data.phone,
      email: data.email,
      address: data.address,
      note: data.note,
      bus_company_name: data.bus_company_name,
      status: 1,
    });

    await this.registerSaleTicketRepository.save(newRegister);
  }

  // Lấy danh sách yêu cầu đăng ký mở bán vé trên nền tảng
  async getSaleTicketOnPlatform(): Promise<
    DTO_RP_RegisterSaleTicketOnPlatform[]
  > {
    const registerSaleTickets = await this.registerSaleTicketRepository.find({
      order: {
        created_at: 'DESC',
      },
    });
    return registerSaleTickets.map((ticket) => ({
      id: ticket.id,
      name: ticket.name,
      phone: ticket.phone,
      email: ticket.email,
      address: ticket.address,
      note: ticket.note,
      bus_company_name: ticket.bus_company_name,
      status: ticket.status,
      created_at: ticket.created_at.toISOString(),
    }));
  }
}
