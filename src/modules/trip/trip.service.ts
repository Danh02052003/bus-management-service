import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../company/company.entity';
import {
  Between,
  IsNull,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
  In,
  EntityManager,
} from 'typeorm';
import { Trip } from './trip.entity';
import { Schedule } from '../schedule/schedule.entity';
import { SeatMap } from '../seat/seat_map.entity';
import { Route } from '../route/route.entity';
import { PointOfRoute } from '../point/point_of_route.entity';
import { Point } from '../point/point.entity';
import { Province } from '../location/provinces.entity';
import {
  DTO_RP_ListTrip,
  DTO_RP_TripDetail,
  DTO_RP_TripPoint,
} from './trip.dto';
import { Ticket } from '../ticket/ticket.entity';
import { Seat } from '../seat/seat.entity';

export interface ConnectedTrip {
  firstTrip: any;
  secondTrip: any;
  totalPrice: number;
  connectionPoint: {
    province: {
      id: number;
      name: string;
    };
    pointId: number;
    pointName: string;
  };
  waitingTime: string; // Định dạng "HH:MM"
  waitingMinutes?: number; // Thời gian chờ tính bằng phút
  totalDuration?: string; // Tổng thời gian di chuyển định dạng "XhYm"
}

@Injectable()
export class TripService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Trip)
    private readonly tripRepository: Repository<Trip>,
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
    @InjectRepository(SeatMap)
    private readonly seatMapRepository: Repository<SeatMap>,
    @InjectRepository(Route)
    private readonly routeRepository: Repository<Route>,
    @InjectRepository(PointOfRoute)
    private readonly pointOfRouteRepository: Repository<PointOfRoute>,
    @InjectRepository(Point)
    private readonly pointRepository: Repository<Point>,
    @InjectRepository(Province)
    private readonly locationRepository: Repository<Province>,
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
  ) {}

  async searchTripOnPlatform(data: any): Promise<any> {
    // Kiểm tra nếu đang là phần của tìm kiếm chuyến nối để tránh đệ quy vô hạn
    if (data.isPartialSearch) {
      console.log('Đây là một phần của tìm kiếm chuyến nối, sẽ không tìm thêm chuyến nối');
    }

    console.log(`
════════════════════════════════════════
        BẮT ĐẦU TÌM KIẾM CHUYẾN ĐI      
════════════════════════════════════════

[1/4] Tìm điểm đón/trả theo tỉnh...
- Tìm điểm đón thuộc tỉnh ID: ${data.departureId}
- Tìm điểm trả thuộc tỉnh ID: ${data.destinationId}
    \n`);

    // 1. Tìm điểm đón/trả theo tỉnh
    const [departurePoints, destinationPoints] = await Promise.all([
      this.pointRepository.find({
        where: { provinces_id: data.departureId },
        relations: ['province'],
      }),
      this.pointRepository.find({
        where: { provinces_id: data.destinationId },
        relations: ['province'],
      }),
    ]);

    console.log(`
      KẾT QUẢ TÌM ĐIỂM:
      - Tổng điểm đón: ${departurePoints.length}
      ${departurePoints
        .map((p) => `• ${p.name} (ID:${p.id}) - ${p.province.name}`)
        .join('\n')}
      - Tổng điểm trả: ${destinationPoints.length}
      ${destinationPoints
        .map((p) => `• ${p.name} (ID:${p.id}) - ${p.province.name}`)
        .join('\n')}
    `);

    if (departurePoints.length === 0 || destinationPoints.length === 0) {
      console.log('KHÔNG TÌM THẤY ĐIỂM ĐÓN/TRẢ PHÙ HỢP');
      return [];
    }

    // 2. Tìm các tuyến đường phù hợp
    console.log('[2/4] Tìm tuyến đường có điểm đón trước điểm trả...');
    console.log(
      '- Điểm đón có thể:',
      departurePoints.map((p) => p.id).join(', '),
    );
    console.log(
      '- Điểm trả có thể:',
      destinationPoints.map((p) => p.id).join(', '),
    );

    const departurePointIds = departurePoints.map((p) => p.id);
    const destinationPointIds = destinationPoints.map((p) => p.id);

    const routesQuery = this.routeRepository
      .createQueryBuilder('route')
      .innerJoin(
        'route.point_of_route',
        'departurePor',
        'departurePor.point_id IN (:...departurePointIds)',
        { departurePointIds },
      )
      .innerJoin(
        'route.point_of_route',
        'destinationPor',
        'destinationPor.point_id IN (:...destinationPointIds)',
        { destinationPointIds },
      )
      .where('departurePor.display_order < destinationPor.display_order');

    if (data.companyId) {
      routesQuery.andWhere('route.company_id = :companyId', {
        companyId: data.companyId,
      });
      console.log(`- Lọc theo công ty ID: ${data.companyId}`);
    }

    const routes = await routesQuery.getMany();
    console.log('KẾT QUẢ TUYẾN ĐƯỜNG:');
    console.log(`- Tổng tuyến đường phù hợp: ${routes.length}`);
    routes.forEach((r) => {
      console.log(`  • ${r.name} (ID:${r.id}) - Công ty: ${r.company_id}`);
    });

    if (routes.length === 0) {
      console.log('❗ KHÔNG TÌM THẤY TUYẾN ĐƯỜNG PHÙ HỢP');
      
      // Nếu không tìm thấy tuyến đường phù hợp và đây không phải là phần của tìm kiếm chuyến nối
      if (!data.isPartialSearch) {
        console.log('\n[CHUYỂN SANG TÌM CHUYẾN NỐI] Không tìm thấy tuyến đường trực tiếp');
        const connectedTrips = await this.findConnectedTrips(data.departureId, data.destinationId, data.departureDate);
        
        if (connectedTrips.length > 0) {
          console.log(`TÌM THẤY ${connectedTrips.length} CHUYẾN NỐI QUA TỈNH TRUNG GIAN`);
          return {
            directTrips: [],
            connectedTrips: connectedTrips
          };
        }
        
        console.log('KHÔNG TÌM THẤY CHUYẾN NỐI NÀO');
        return {
          directTrips: [],
          connectedTrips: []
        };
      }
      
      return {
        directTrips: [],
        connectedTrips: []
      };
    }

    // 3. Tìm chuyến đi trong ngày chỉ định và kiểm tra lịch trình
    console.log('[3/4] Tìm chuyến đi theo ngày và kiểm tra lịch trình...');
    console.log(`- Ngày khởi hành: ${data.departureDate}`);

    const departureDate = new Date(data.departureDate);
    const nextDay = new Date(departureDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Tìm chuyến đi hiện có
    let trips = await this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.route', 'route')
      .leftJoinAndSelect('trip.schedule', 'schedule')
      .leftJoinAndSelect('trip.company', 'company')
      .leftJoinAndSelect('trip.seat_map', 'seat_map')
      .leftJoinAndSelect('seat_map.seats', 'seats')
      .where('trip.route_id IN (:...routeIds)', {
        routeIds: routes.map((r) => r.id),
      })
      .andWhere(
        'trip.date_departure >= :startDate AND trip.date_departure < :endDate',
        {
          startDate: departureDate,
          endDate: nextDay,
        },
      )
      .orderBy('trip.time_departure', 'ASC')
      .getMany();

    console.log('KẾT QUẢ CHUYẾN ĐI THÔNG TIN:');
    console.log(`- Tổng chuyến đi tìm thấy: ${trips.length}`);

    trips.forEach((t) => {
      console.log(`  • Chuyến ${t.id} - ${t.time_departure} - ${t.route.name}`);
    });

    // LUÔN kiểm tra lịch trình phù hợp, bất kể đã có trips hay chưa
    console.log('KIỂM TRA LỊCH TRÌNH PHÙ HỢP...');

    // Tìm lịch trình phù hợp (thuộc các route đã tìm thấy)
    const schedules = await this.scheduleRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.route', 'route')
      .leftJoinAndSelect('schedule.company', 'company')
      .leftJoinAndSelect('schedule.seat_map', 'seat_map')
      .leftJoinAndSelect('seat_map.seats', 'seats')
      .where('schedule.route_id IN (:...routeIds)', {
        routeIds: routes.map((r) => r.id),
      })
      .andWhere(
        'schedule.start_date <= :departureDate AND (schedule.end_date IS NULL OR schedule.end_date >= :departureDate)',
        {
          departureDate: departureDate,
        },
      )
      .getMany();

    console.log(`ĐÃ TÌM THẤY ${schedules.length} LỊCH TRÌNH PHÙ HỢP:`);
    schedules.forEach((schedule, index) => {
      console.log(`[Lịch trình ${index + 1}]`);
      console.log(`- ID: ${schedule.id}`);
      console.log(
        `- Tuyến đường: ${schedule.route?.name || 'N/A'} (ID: ${schedule.route_id})`,
      );
      console.log(
        `- Công ty: ${schedule.company?.name || 'N/A'} (ID: ${schedule.company})`,
      );
      console.log(`- Thời gian bắt đầu: ${schedule.start_time}`);
      console.log(`- Ngày bắt đầu: ${schedule.start_date}`);
      console.log(`- Ngày kết thúc: ${schedule.end_date || 'Không có'}`);
      console.log(
        `- Sơ đồ ghế: ${schedule.seat_map?.name || 'N/A'} (ID: ${schedule.seat_map})`,
      );
      console.log('-----------------------------------');
    });

    // Nếu có lịch trình nhưng chưa có trip tương ứng, tạo trip mới
    if (schedules.length > 0) {
      // Lọc ra các schedule chưa có trip
      const schedulesWithoutTrips = schedules.filter(
        (schedule) => !trips.some((trip) => trip.schedule?.id === schedule.id),
      );

      if (schedulesWithoutTrips.length > 0) {
        console.log(
          `PHÁT HIỆN ${schedulesWithoutTrips.length} LỊCH TRÌNH CHƯA CÓ CHUYẾN ĐI, ĐANG TẠO MỚI...`,
        );

        const newTrips = schedulesWithoutTrips.map((schedule) => {
          return this.tripRepository.create({
            time_departure: schedule.start_time,
            date_departure: departureDate,
            route: schedule.route,
            schedule: schedule,
            company: schedule.company,
            seat_map: schedule.seat_map,
          });
        });

        const savedTrips = await this.tripRepository.save(newTrips);
        console.log(`ĐÃ TẠO THÀNH CÔNG ${savedTrips.length} CHUYẾN ĐI MỚI`);
        trips = [...trips, ...savedTrips].sort((a, b) =>
          a.time_departure.localeCompare(b.time_departure),
        );
      } else {
        console.log('TẤT CẢ LỊCH TRÌNH ĐÃ CÓ CHUYẾN ĐI TƯƠNG ỨNG');
      }
    } else {
      console.log('KHÔNG CÓ LỊCH TRÌNH PHÙ HỢP');
      if (trips.length === 0) {
        return [];
      }
    }

    // 4. Bổ sung thông tin điểm đón/trả và kiểm tra vé
    console.log('[4/4] Bổ sung thông tin điểm đón/trả và kiểm tra vé...');

    const enhancedTrips = await Promise.all(
      trips.map(async (trip) => {
        // Kiểm tra xem chuyến đi đã có vé chưa
        const existingTickets = await this.ticketRepository.find({
          where: { trip: { id: trip.id } },
        });

        // Chỉ tạo vé mới nếu chưa có vé nào và có thông tin seat_map
        if (existingTickets.length === 0 && trip.seat_map?.seats?.length > 0) {
          console.log(`Tạo tickets mới cho chuyến đi ${trip.id}...`);

          const basePrice = trip.route?.base_price || 0;
          const ticketsToCreate = trip.seat_map.seats.map((seat) => {
            return this.ticketRepository.create({
              seat_name: seat.name,
              seat_code: seat.code,
              seat_floor: seat.floor,
              seat_row: seat.row,
              seat_column: seat.column,
              seat_status: seat.status,
              base_price: basePrice,
              trip: trip,
              company: trip.company,
              status_booking_ticket: false,
            });
          });

          await this.ticketRepository.save(ticketsToCreate);
          trip.tickets = ticketsToCreate;
        } else {
          // Nếu đã có vé thì sử dụng vé hiện có
          trip.tickets = existingTickets;
          if (existingTickets.length > 0) {
            console.log(
              `Chuyến ${trip.id} đã có ${existingTickets.length} vé, không tạo mới`,
            );
          } else {
            console.log(`Chuyến ${trip.id} không có seat_map để tạo vé`);
          }
        }

        // Bổ sung thông tin điểm đón/trả
        const [departurePoint, destinationPoint] = await Promise.all([
          this.pointOfRouteRepository.findOne({
            where: {
              route: { id: trip.route.id },
              point: { provinces_id: data.departureId },
            },
            relations: ['point', 'point.province'],
            order: { display_order: 'ASC' },
          }),
          this.pointOfRouteRepository.findOne({
            where: {
              route: { id: trip.route.id },
              point: { provinces_id: data.destinationId },
            },
            relations: ['point', 'point.province'],
            order: { display_order: 'DESC' },
          }),
        ]);

        const result: any = {
          id: trip.id,
          time_departure: trip.time_departure,
          date_departure: trip.date_departure,
          route: trip.route,
          company: trip.company,
          seat_map: trip.seat_map,
          tickets_available: trip.tickets?.filter(
            (ticket) => ticket.status_booking_ticket === false,
          ).length,
        };

        if (departurePoint && destinationPoint) {
          console.log(
            `- Chuyến ${trip.id}: Đón tại ${departurePoint.point.name} (${departurePoint.time}), trả tại ${destinationPoint.point.name} (${destinationPoint.time})`,
          );

          result.departureInfo = {
            pointId: departurePoint.point.id,
            pointName: departurePoint.point.name,
            address: departurePoint.point.address,
            province: departurePoint.point.province.name,
            time: departurePoint.time,
          };
          result.destinationInfo = {
            pointId: destinationPoint.point.id,
            pointName: destinationPoint.point.name,
            address: destinationPoint.point.address,
            province: destinationPoint.point.province.name,
            time: destinationPoint.time,
          };
        } else {
          console.log(
            `- Chuyến ${trip.id}: Không tìm thấy đủ thông tin điểm đón/trả`,
          );
        }

        return result;
      }),
    );

    console.log('\n════════════════════════════════════════');
    console.log('KẾT THÚC TÌM KIẾM');
    console.log(`- Tổng chuyến đi tìm thấy: ${enhancedTrips.length}`);
    console.log('════════════════════════════════════════');

    // Nếu không tìm thấy chuyến đi trực tiếp, tìm kiếm chuyến nối
    if (enhancedTrips.length === 0 && !data.isPartialSearch) {
      console.log('\n[4/4] KHÔNG TÌM THẤY CHUYẾN TRỰC TIẾP, TÌM KIẾM CHUYẾN NỐI...');
      const connectedTrips = await this.findConnectedTrips(data.departureId, data.destinationId, data.departureDate);
      
      if (connectedTrips.length > 0) {
        console.log(`TÌM THẤY ${connectedTrips.length} CHUYẾN NỐI`);
        return {
          directTrips: [],
          connectedTrips: connectedTrips
        };
      }
      
      return {
        directTrips: [],
        connectedTrips: []
      };
    }
    
    // Nếu có chuyến trực tiếp, trả về chỉ chuyến trực tiếp mà không tìm chuyến nối
    return {
      directTrips: enhancedTrips,
      connectedTrips: []
    };
  }

  async getTripDetailOnPlatform(id: number): Promise<DTO_RP_TripDetail> {
    console.log('[1] Bắt đầu lấy thông tin chuyến đi với ID:', id);

    // 1. Lấy thông tin trip từ database
    console.log('[2] Truy vấn thông tin trip từ database...');

    const trip = await this.tripRepository.findOne({
      where: { id },
      relations: [
        'seat_map',
        'seat_map.seats',
        'tickets',
        'route',
        'company',
        'company.policies',
      ],
    });

    if (!trip) {
      console.error('[ERROR] Không tìm thấy trip với ID:', id);
      throw new NotFoundException(`Trip với ID ${id} không tồn tại`);
    }

    console.log('[3] Đã tìm thấy trip:', {
      id: trip.id,
      seat_map_id: trip.seat_map?.id,
      ticket_count: trip.tickets?.length,
    });

    // 2. Kiểm tra nếu chưa có tickets
    if (!trip.tickets || trip.tickets.length === 0) {
      console.log('[4] Trip chưa có tickets, bắt đầu quy trình tạo mới');

      if (
        !trip.seat_map ||
        !trip.seat_map.seats ||
        trip.seat_map.seats.length === 0
      ) {
        console.error(
          '[ERROR] Trip không có seat_map hoặc seat_map không có seats',
        );
        throw new Error('Trip không có seat_map hoặc không có seats');
      }

      console.log('[5] Đã xác định seat_map:', {
        seat_map_id: trip.seat_map.id,
        seat_map_name: trip.seat_map.name,
      });

      console.log(
        '[6] Đã xác định số lượng seats:',
        trip.seat_map.seats.length,
      );
      const basePrice = trip.route.base_price || 0;
      console.log('[6-1] Đã xác định giá vé cơ bản:', basePrice);
      // 3. Tạo tickets từ seats
      console.log('[7] Bắt đầu tạo tickets từ seats...');
      const ticketsToCreate = trip.seat_map.seats.map((seat) => {
        return this.ticketRepository.create({
          seat_name: seat.name,
          seat_code: seat.code,
          seat_floor: seat.floor,
          seat_row: seat.row,
          seat_column: seat.column,
          seat_status: seat.status,
          base_price: basePrice,
          trip: trip,
          company: trip.company,
        });
      });

      // 4. Lưu tickets vào database
      console.log('[8] Bắt đầu lưu tickets vào database...');
      try {
        await this.ticketRepository.save(ticketsToCreate);
        console.log('[9] Đã lưu thành công', ticketsToCreate.length, 'tickets');
      } catch (error) {
        console.error('[ERROR] Lỗi khi lưu tickets:', error);
        throw new Error('Không thể tạo tickets');
      }

      // 5. Cập nhật lại danh sách tickets
      console.log('[10] Truy vấn lại danh sách tickets...');
      trip.tickets = await this.ticketRepository.find({
        where: { trip: { id } },
      });

      console.log(
        '[11] Đã cập nhật danh sách tickets mới:',
        trip.tickets.length,
      );
    } else {
      console.log('[4] Trip đã có sẵn tickets, số lượng:', trip.tickets.length);
    }

    // 6. Chuẩn bị dữ liệu response theo DTO
    console.log('[12] Chuẩn bị dữ liệu response...');
    const result: DTO_RP_TripDetail = {
      id: trip.id,
      seat_map_id: trip.seat_map?.id || 0,
      total_floor: trip.seat_map?.total_floor || 0,
      total_row: trip.seat_map?.total_row || 0,
      total_column: trip.seat_map?.total_column || 0,
      tickets: trip.tickets.map((ticket) => ({
        id: ticket.id,
        seat_name: ticket.seat_name || undefined,
        seat_code: ticket.seat_code,
        seat_floor: ticket.seat_floor,
        seat_row: ticket.seat_row,
        seat_column: ticket.seat_column,
        seat_status: ticket.seat_status,
        base_price: ticket.base_price || 0,
        status_booking_ticket: ticket.status_booking_ticket || false,
      })),
      policy_content: trip.company.policies[0]?.content ?? '',
      transit_content: trip.company.transits[0]?.content ?? '',
    };

    console.log('[13] Hoàn thành xử lý. Kết quả:', result);
    return result;
  }

  async getTripsByDateAndRoute(data: {
    date: string;
    company_id: number;
    route_id: number;
  }): Promise<DTO_RP_ListTrip[]> {
    console.log('1. Bắt đầu hàm getTripsByDateAndRoute');

    try {
      // 1. Validate input
      console.log('2. Kiểm tra dữ liệu đầu vào');
      const { date, company_id, route_id } = data;

      if (!date) {
        throw new HttpException('Thiếu ngày', HttpStatus.BAD_REQUEST);
      }
      if (!company_id) {
        throw new HttpException('Thiếu company_id', HttpStatus.BAD_REQUEST);
      }
      if (!route_id) {
        throw new HttpException('Thiếu route_id', HttpStatus.BAD_REQUEST);
      }

      // 2. Parse date
      console.log('3. Parse ngày');
      const searchDate = new Date(date);
      if (isNaN(searchDate.getTime())) {
        throw new HttpException('Ngày không hợp lệ', HttpStatus.BAD_REQUEST);
      }

      // 3. Start transaction
      console.log('4. Bắt đầu transaction');
      return await this.tripRepository.manager.transaction(async (manager) => {
        const tripRepo = manager.getRepository(Trip);
        const scheduleRepo = manager.getRepository(Schedule);
        const ticketRepo = manager.getRepository(Ticket);

        // 4. Check company and route existence
        console.log('5. Kiểm tra tồn tại company và route');
        const [company, route] = await Promise.all([
          manager.getRepository(Company).findOneBy({ id: company_id }),
          manager.getRepository(Route).findOneBy({ id: route_id }),
        ]);

        if (!company) {
          throw new HttpException(
            'Công ty không tồn tại',
            HttpStatus.NOT_FOUND,
          );
        }
        if (!route) {
          throw new HttpException(
            'Tuyến đường không tồn tại',
            HttpStatus.NOT_FOUND,
          );
        }

        // 5. Find active schedules
        console.log('6. Tìm active schedules');
        const activeSchedules = await scheduleRepo.find({
          where: [
            {
              company: { id: company_id },
              route: { id: route_id },
              start_date: LessThanOrEqual(searchDate),
              end_date: IsNull(),
            },
            {
              company: { id: company_id },
              route: { id: route_id },
              start_date: LessThanOrEqual(searchDate),
              end_date: MoreThanOrEqual(searchDate),
            },
          ],
          relations: ['seat_map', 'seat_map.seats'],
        });

        console.log(`7. Tìm thấy ${activeSchedules.length} schedules`);

        // 6. Process each schedule
        const trips = [];
        for (const schedule of activeSchedules) {
          console.log(`8. Xử lý schedule ${schedule.id}`);

          let trip = await tripRepo.findOne({
            where: {
              schedule: { id: schedule.id },
              date_departure: Between(
                new Date(searchDate.setHours(0, 0, 0, 0)),
                new Date(searchDate.setHours(23, 59, 59, 999)),
              ),
            },
            relations: ['tickets'],
          });

          if (!trip) {
            console.log('9. Tạo trip mới');
            trip = await tripRepo.save(
              tripRepo.create({
                company: { id: company_id },
                schedule,
                route: { id: route_id },
                seat_map: schedule.seat_map,
                time_departure: schedule.start_time,
                date_departure: searchDate,
              }),
            );
          }

          if (
            schedule.seat_map?.seats?.length > 0 &&
            (!trip.tickets || trip.tickets.length === 0)
          ) {
            console.log(`10. Tạo ${schedule.seat_map.seats.length} tickets`);

            if (!trip.id) {
              throw new HttpException(
                'Trip chưa có ID',
                HttpStatus.INTERNAL_SERVER_ERROR,
              );
            }

            let route = schedule.route;
            if (!route) {
              route = await manager
                .getRepository(Route)
                .findOneBy({ id: schedule.route_id });
              if (!route) {
                throw new HttpException(
                  'Không tìm thấy thông tin tuyến đường',
                  HttpStatus.NOT_FOUND,
                );
              }
            }

            const basePrice = route?.base_price || 0;

            const tickets = schedule.seat_map.seats.map((seat) => {
              const ticket = new Ticket();
              ticket.seat_name = seat.name;
              ticket.seat_code = seat.code;
              ticket.seat_floor = seat.floor;
              ticket.seat_row = seat.row;
              ticket.seat_column = seat.column;
              ticket.seat_status = seat.status;
              ticket.base_price = basePrice;

              ticket.company = { id: company_id } as Company;
              ticket.trip = { id: trip.id } as Trip;

              return ticket;
            });
            await ticketRepo.save(tickets);
          }

          trips.push(trip);
        }

        // 7. Return full trip data
        console.log('11. Lấy thông tin đầy đủ các trips');
        const tripsData = await tripRepo.find({
          where: { id: In(trips.map((t) => t.id)) },
          relations: ['company', 'schedule', 'route', 'seat_map', 'tickets'],
          order: { time_departure: 'ASC' },
        });

        const result: DTO_RP_ListTrip[] = tripsData.map((trip) => ({
          id: trip.id,
          time_departure: trip.time_departure,
          date_departure: trip.date_departure,
          total_ticket: trip.tickets?.length || 0,
          total_ticket_booking:
            trip.tickets?.filter(
              (ticket) => ticket.status_booking_ticket === true,
            ).length || 0,
          seat_map: trip.seat_map
            ? {
                id: trip.seat_map.id,
                name: trip.seat_map.name,
              }
            : undefined,
          route: trip.route
            ? {
                id: trip.route.id,
                name: trip.route.name,
              }
            : undefined,
        }));

        console.log('12. Kết thúc hàm thành công');
        return result;
      });
    } catch (error) {
      console.error('Lỗi trong getTripsByDateAndRoute:', {
        error: error.message,
        stack: error.stack,
      });
      if (error instanceof HttpException) throw error;
      throw new HttpException('Lỗi hệ thống', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getPointUpByTrip(tripId: number): Promise<DTO_RP_TripPoint[]> {
    console.log('Bắt đầu hàm getPointUpByTrip với tripId:', tripId);

    try {
      const trip = await this.tripRepository.findOne({
        where: { id: tripId },
        relations: [
          'route',
          'route.point_of_route',
          'route.point_of_route.point',
          'schedule',
        ],
      });

      if (!trip) {
        throw new HttpException(
          'Chuyến đi không tồn tại',
          HttpStatus.NOT_FOUND,
        );
      }

      const sortedPoints = trip.route.point_of_route
        .sort((a, b) => a.display_order - b.display_order)
        .map((por) => ({
          id: por.point.id,
          name: por.point.name,
          address: por.point.address,
          display_order: por.display_order,
          province_id: por.point.provinces_id,
          time_point: por.time,
          start_time: trip.schedule.start_time,
        }));
      return sortedPoints;
    } catch (error) {
      console.error('Lỗi trong getPointUpByTrip:', error);
      throw new HttpException('Lỗi hệ thống', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async getPointDownByTrip(tripId: number): Promise<DTO_RP_TripPoint[]> {
    console.log('Bắt đầu hàm getPointDownByTrip với tripId:', tripId);

    try {
      const trip = await this.tripRepository.findOne({
        where: { id: tripId },
        relations: [
          'route',
          'route.point_of_route',
          'route.point_of_route.point',
          'schedule',
        ],
      });

      if (!trip) {
        throw new HttpException(
          'Chuyến đi không tồn tại',
          HttpStatus.NOT_FOUND,
        );
      }

      const sortedPoints = trip.route.point_of_route
        .sort((a, b) => b.display_order - a.display_order)
        .map((por) => ({
          id: por.point.id,
          name: por.point.name,
          address: por.point.address,
          display_order: por.display_order,
          province_id: por.point.provinces_id,
          time_point: por.time,
          start_time: trip.schedule.start_time,
        }));

      return sortedPoints;
    } catch (error) {
      console.error('Lỗi trong getPointDownByTrip:', error);
      throw new HttpException('Lỗi hệ thống', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Tìm các điểm trung chuyển tiềm năng giữa hai tỉnh
   * Sử dụng thuật toán tìm kiếm hai chiều (Bidirectional BFS) để hiệu quả hơn
   */
  async findPotentialConnectionPoints(departureId: number, destinationId: number): Promise<any[]> {
    console.log(`TÌM TỈNH/THÀNH PHỐ TRUNG CHUYỂN GIỮA: ${departureId} VÀ ${destinationId}`);
    
    try {
      // Khởi tạo hai queue và visited set cho bidirectional BFS
      const queueForward = [departureId];
      const queueBackward = [destinationId];
      
      // Map lưu tỉnh và đường đi, giúp truy vết đường đi
      const visitedForward = new Map<number, number[]>();
      const visitedBackward = new Map<number, number[]>();
      
      // Khởi tạo với tỉnh xuất phát và tỉnh đích
      visitedForward.set(departureId, [departureId]);
      visitedBackward.set(destinationId, [destinationId]);
      
      // Lưu các tỉnh trung gian đã tìm thấy để tránh trùng lặp
      const potentialConnections = [];
      const foundConnections = new Set<number>();
      
      // Thực hiện BFS hai chiều
      while (queueForward.length > 0 && queueBackward.length > 0) {
        // BFS từ tỉnh xuất phát
        const currentForward = queueForward.shift();
        if (currentForward === undefined) break;
        
        // Tìm tất cả các tỉnh có thể đi đến trực tiếp từ tỉnh hiện tại
        const reachableProvinces = await this.findDirectlyReachableProvinces(currentForward);
        console.log(`Từ tỉnh ${currentForward} có thể đi trực tiếp đến ${reachableProvinces.length} tỉnh khác`);
        
        for (const province of reachableProvinces) {
          // Bỏ qua tỉnh đã duyệt và tỉnh xuất phát/đích
          if (visitedForward.has(province.id) || province.id === departureId || province.id === destinationId) {
            continue;
          }
          
          // Lưu đường đi đến tỉnh này
          const pathToProvince = [...(visitedForward.get(currentForward) || []), province.id];
          visitedForward.set(province.id, pathToProvince);
          queueForward.push(province.id);
          
          // Kiểm tra xem tỉnh này đã được duyệt từ phía ngược chưa
          if (visitedBackward.has(province.id) && !foundConnections.has(province.id)) {
            console.log(`TÌM THẤY ĐIỂM KẾT NỐI: ${province.name} (ID: ${province.id})`);
            foundConnections.add(province.id);
            potentialConnections.push({
              provinceId: province.id,
              provinceName: province.name,
              pathFromDeparture: visitedForward.get(province.id) || [],
              pathToDestination: visitedBackward.get(province.id) || []
            });
          }
        }
        
        // BFS từ tỉnh đích (ngược lại)
        const currentBackward = queueBackward.shift();
        if (currentBackward === undefined) break;
        
        // Tìm tất cả các tỉnh có thể đi đến tỉnh đích
        const provincesReachingDestination = await this.findProvincesReachingDirectly(currentBackward);
        console.log(`Có ${provincesReachingDestination.length} tỉnh có thể đi trực tiếp đến tỉnh ${currentBackward}`);
        
        for (const province of provincesReachingDestination) {
          // Bỏ qua tỉnh đã duyệt và tỉnh xuất phát/đích
          if (visitedBackward.has(province.id) || province.id === departureId || province.id === destinationId) {
            continue;
          }
          
          // Lưu đường đi đến tỉnh này
          const pathToProvince = [...(visitedBackward.get(currentBackward) || []), province.id];
          visitedBackward.set(province.id, pathToProvince);
          queueBackward.push(province.id);
          
          // Kiểm tra xem tỉnh này đã được duyệt từ phía xuất phát chưa
          if (visitedForward.has(province.id) && !foundConnections.has(province.id)) {
            console.log(`TÌM THẤY ĐIỂM KẾT NỐI: ${province.name} (ID: ${province.id})`);
            foundConnections.add(province.id);
            potentialConnections.push({
              provinceId: province.id,
              provinceName: province.name,
              pathFromDeparture: visitedForward.get(province.id) || [],
              pathToDestination: visitedBackward.get(province.id) || []
            });
          }
        }
      }
      
      console.log(`TÌM THẤY ${potentialConnections.length} TỈNH/THÀNH PHỐ TRUNG CHUYỂN TIỀM NĂNG`);
      potentialConnections.forEach(conn => {
        console.log(`- ${conn.provinceName} (ID: ${conn.provinceId})`);
      });
      
      return potentialConnections;
    } catch (error) {
      console.error('LỖI KHI TÌM TỈNH/THÀNH PHỐ TRUNG CHUYỂN:', error);
      return [];
    }
  }
  
  /**
   * Tìm tất cả các tỉnh mà có thể đi trực tiếp từ tỉnh nguồn
   * (từ source -> các tỉnh đích)
   */
  async findDirectlyReachableProvinces(sourceProvinceId: number): Promise<{id: number, name: string}[]> {
    try {
      // Lấy tất cả các điểm thuộc tỉnh nguồn
      const sourcePoints = await this.pointRepository.find({
        where: { provinces_id: sourceProvinceId },
      });
      
      if (sourcePoints.length === 0) {
        return [];
      }
      
      const sourcePointIds = sourcePoints.map(p => p.id);
      
      // Tìm tất cả các route có điểm xuất phát thuộc tỉnh nguồn
      const routes = await this.routeRepository
        .createQueryBuilder('route')
        .innerJoin(
          'route.point_of_route',
          'sourcePor',
          'sourcePor.point_id IN (:...sourcePointIds)',
          { sourcePointIds }
        )
        .getMany();
      
      if (routes.length === 0) {
        return [];
      }
      
      // Với mỗi route, tìm các điểm đến không thuộc tỉnh nguồn
      const reachablePoints = await this.pointOfRouteRepository
        .createQueryBuilder('por')
        .innerJoin('por.point', 'point')
        .innerJoin('point.province', 'province')
        .where('por.route_id IN (:...routeIds)', { routeIds: routes.map(r => r.id) })
        .andWhere('point.provinces_id != :sourceProvinceId', { sourceProvinceId })
        .select('DISTINCT point.provinces_id as id, province.name as name')
        .getRawMany();
      
      return reachablePoints;
    } catch (error) {
      console.error('Lỗi khi tìm các tỉnh có thể đi trực tiếp:', error);
      return [];
    }
  }
  
  /**
   * Tìm tất cả các tỉnh mà từ đó có thể đi trực tiếp đến tỉnh đích
   * (các tỉnh nguồn -> destination)
   */
  async findProvincesReachingDirectly(destinationProvinceId: number): Promise<{id: number, name: string}[]> {
    try {
      // Lấy tất cả các điểm thuộc tỉnh đích
      const destinationPoints = await this.pointRepository.find({
        where: { provinces_id: destinationProvinceId },
      });
      
      if (destinationPoints.length === 0) {
        return [];
      }
      
      const destinationPointIds = destinationPoints.map(p => p.id);
      
      // Tìm tất cả các route có điểm đến thuộc tỉnh đích
      const routes = await this.routeRepository
        .createQueryBuilder('route')
        .innerJoin(
          'route.point_of_route',
          'destPor',
          'destPor.point_id IN (:...destinationPointIds)',
          { destinationPointIds }
        )
        .getMany();
      
      if (routes.length === 0) {
        return [];
      }
      
      // Với mỗi route, tìm các điểm xuất phát không thuộc tỉnh đích
      const sourcePoints = await this.pointOfRouteRepository
        .createQueryBuilder('por')
        .innerJoin('por.point', 'point')
        .innerJoin('point.province', 'province')
        .where('por.route_id IN (:...routeIds)', { routeIds: routes.map(r => r.id) })
        .andWhere('point.provinces_id != :destinationProvinceId', { destinationProvinceId })
        .select('DISTINCT point.provinces_id as id, province.name as name')
        .getRawMany();
      
      return sourcePoints;
    } catch (error) {
      console.error('Lỗi khi tìm các tỉnh từ đó có thể đi trực tiếp:', error);
      return [];
    }
  }
  
  /**
   * Kiểm tra xem có kết nối trực tiếp giữa hai tỉnh hay không
   */
  async checkDirectConnection(fromProvinceId: number, toProvinceId: number): Promise<boolean> {
    try {
      // Tìm tất cả điểm đón/trả thuộc hai tỉnh
      const [departurePoints, destinationPoints] = await Promise.all([
        this.pointRepository.find({
          where: { provinces_id: fromProvinceId },
        }),
        this.pointRepository.find({
          where: { provinces_id: toProvinceId },
        }),
      ]);

      if (departurePoints.length === 0 || destinationPoints.length === 0) {
        return false;
      }

      // Tìm tất cả các tuyến đường có điểm đi thuộc tỉnh xuất phát và điểm đến thuộc tỉnh đích
      const departurePointIds = departurePoints.map((p) => p.id);
      const destinationPointIds = destinationPoints.map((p) => p.id);

      // Kiểm tra xem có tuyến nào có thể đi từ tỉnh xuất phát đến tỉnh đích
      const routesCount = await this.routeRepository
        .createQueryBuilder('route')
        .innerJoin(
          'route.point_of_route',
          'departurePor',
          'departurePor.point_id IN (:...departurePointIds)',
          { departurePointIds },
        )
        .innerJoin(
          'route.point_of_route',
          'destinationPor',
          'destinationPor.point_id IN (:...destinationPointIds)',
          { destinationPointIds },
        )
        .where('departurePor.display_order < destinationPor.display_order')
        .getCount();

      return routesCount > 0;
    } catch (error) {
      console.error('Lỗi kiểm tra kết nối trực tiếp:', error);
      return false;
    }
  }
  
  /**
   * Tìm kiếm chuyến đi giữa hai tỉnh, có thể chỉ định thời gian khởi hành tối thiểu
   */
  async findConnectedTrips(departureId: number, destinationId: number, departureDate: string): Promise<ConnectedTrip[]> {
    console.log(`TÌM KIẾM CHUYẾN NỐI: ${departureId} -> ? -> ${destinationId} vào ngày ${departureDate}`);
    
    // 1. Tìm tất cả các tỉnh trung gian tiềm năng (điểm trung chuyển)
    const potentialConnections = await this.findPotentialConnectionPoints(departureId, destinationId);
    
    if (potentialConnections.length === 0) {
      console.log('KHÔNG TÌM THẤY TỈNH TRUNG CHUYỂN TIỀM NĂNG');
      return [];
    }
    
    console.log(`TÌM THẤY ${potentialConnections.length} TỈNH TRUNG CHUYỂN TIỀM NĂNG`);
    potentialConnections.forEach(conn => {
      console.log(`- ${conn.provinceName} (ID: ${conn.provinceId})`);
    });
    
    // 2. Với mỗi tỉnh trung chuyển, tìm kiếm chuyến đi từ tỉnh xuất phát đến tỉnh trung chuyển
    const connectedTrips: ConnectedTrip[] = [];
    const departureDateTime = new Date(departureDate);
    
    // Thời gian chờ tối đa là 48 giờ (2880 phút)
    const MAX_WAITING_TIME_MINUTES = 2880; 
    
    for (const connection of potentialConnections) {
      console.log(`\nTÌM CHUYẾN ĐI CHO TỈNH KẾT NỐI: ${connection.provinceName} (ID: ${connection.provinceId})`);
      
      // Tìm chuyến đi từ tỉnh xuất phát đến tỉnh trung chuyển
      const firstLegTrips = await this.searchTripsBetweenProvinces(
        departureId, 
        connection.provinceId, 
        departureDateTime
      );
      
      if (firstLegTrips.length === 0) {
        console.log(`KHÔNG TÌM THẤY CHUYẾN ĐI: ${departureId} -> ${connection.provinceId}`);
        continue;
      }
      
      console.log(`TÌM THẤY ${firstLegTrips.length} CHUYẾN ĐI: ${departureId} -> ${connection.provinceId}`);
      firstLegTrips.forEach((trip, index) => {
        console.log(`  • (${index + 1}) ID:${trip.id}, Khởi hành: ${trip.time_departure}, Tuyến: ${trip.route?.name || 'N/A'}`);
      });
      
      // 3. Với mỗi chuyến đi từ tỉnh xuất phát đến tỉnh trung chuyển, tìm kiếm chuyến tiếp theo
      for (const firstTrip of firstLegTrips) {
        // Bỏ qua nếu không có thông tin điểm đến
        if (!firstTrip.destinationInfo) {
          console.log(`Bỏ qua chuyến ${firstTrip.id} vì không có thông tin điểm đến`);
          continue;
        }
        
        // Tính ngày và thời gian đến tỉnh trung chuyển chính xác
        const firstTripDepartureDate = new Date(firstTrip.date_departure || departureDate);
        const firstTripDepartureTime = firstTrip.time_departure;
        
        // Tạo đối tượng Date đầy đủ cho thời điểm khởi hành chuyến 1
        const firstTripDeparture = new Date(firstTripDepartureDate);
        const [hours, minutes, seconds] = firstTripDepartureTime.split(':').map(Number);
        firstTripDeparture.setHours(hours, minutes, seconds || 0);
        
        // Tính thời gian di chuyển (phút) từ thông tin chuyến đi
        const firstTripDuration = this.estimateTripDuration(firstTrip);
        
        // Tính thời điểm đến tỉnh trung gian chính xác, tính cả ngày
        const arrivalAtConnection = new Date(firstTripDeparture.getTime() + firstTripDuration * 60 * 1000);
        
        // Lưu thời gian di chuyển vào thông tin chuyến đi để hiển thị
        firstTrip.duration = firstTripDuration;
        
        const arrivalDateFormatted = arrivalAtConnection.toISOString().split('T')[0];
        const arrivalTimeFormatted = arrivalAtConnection.toTimeString().slice(0, 5);
        
        const departureDateFormatted = firstTripDepartureDate.toISOString().split('T')[0];
        
        console.log(`Chuyến ${firstTrip.id}: Khởi hành ${firstTripDepartureTime} ngày ${departureDateFormatted}, đến ${connection.provinceName} khoảng ${arrivalTimeFormatted} ngày ${arrivalDateFormatted}`);
        
        // Ngày của các chuyến tiếp theo được tính từ ngày đến điểm trung gian
        const arrivalDateTime = new Date(arrivalAtConnection);
        
        // Tìm chuyến đi từ tỉnh trung chuyển đến tỉnh đích cho nhiều ngày
        let secondLegTrips = [];
        
        // Ngày thứ nhất (cùng ngày đến)
        const arrivalDateString = arrivalDateFormatted;
        console.log(`Tìm chuyến cùng ngày đến (${arrivalDateString})...`);
        
        const sameDayTrips = await this.searchTripsBetweenProvinces(
          connection.provinceId, 
          destinationId, 
          arrivalDateTime,
          arrivalAtConnection // Thời gian tối thiểu là thời gian đến điểm trung gian
        );
        
        if (sameDayTrips.length > 0) {
          console.log(`Tìm thấy ${sameDayTrips.length} chuyến đi cùng ngày đến tỉnh trung gian`);
          secondLegTrips = [...secondLegTrips, ...sameDayTrips];
        } else {
          console.log(`Không tìm thấy chuyến cùng ngày từ ${connection.provinceName} đến tỉnh đích`);
        }
        
        // Ngày thứ hai (hôm sau ngày đến tỉnh trung gian)
        const nextDayDate = new Date(arrivalDateTime);
        nextDayDate.setDate(nextDayDate.getDate() + 1);
        const nextDayStr = nextDayDate.toISOString().split('T')[0];
        
        console.log(`Tìm chuyến ngày hôm sau khi đến tỉnh trung gian (${nextDayStr})...`);
        const nextDayTrips = await this.searchTripsBetweenProvinces(
            connection.provinceId, 
            destinationId, 
            nextDayDate
          );
        
        if (nextDayTrips.length > 0) {
          console.log(`Tìm thấy ${nextDayTrips.length} chuyến đi vào ngày hôm sau khi đến tỉnh trung gian`);
          secondLegTrips = [...secondLegTrips, ...nextDayTrips];
        } else {
          console.log(`Không tìm thấy chuyến ngày hôm sau từ ${connection.provinceName} đến tỉnh đích`);
        }
        
        // Ngày thứ ba (2 ngày sau khi đến tỉnh trung gian)
        const thirdDayDate = new Date(arrivalDateTime);
        thirdDayDate.setDate(thirdDayDate.getDate() + 2);
        const thirdDayStr = thirdDayDate.toISOString().split('T')[0];
        
        console.log(`Tìm chuyến ngày thứ hai sau khi đến tỉnh trung gian (${thirdDayStr})...`);
        const thirdDayTrips = await this.searchTripsBetweenProvinces(
          connection.provinceId, 
          destinationId, 
          thirdDayDate
        );
        
        if (thirdDayTrips.length > 0) {
          console.log(`Tìm thấy ${thirdDayTrips.length} chuyến đi vào ngày thứ hai sau khi đến tỉnh trung gian`);
          secondLegTrips = [...secondLegTrips, ...thirdDayTrips];
        } else {
          console.log(`Không tìm thấy chuyến ngày thứ hai sau khi đến tỉnh trung gian từ ${connection.provinceName} đến tỉnh đích`);
        }
        
        if (secondLegTrips.length === 0) {
          console.log(`KHÔNG TÌM THẤY CHUYẾN ĐI NÀO: ${connection.provinceId} -> ${destinationId}`);
          continue;
        }
        
        console.log(`TÌM THẤY TỔNG CỘNG ${secondLegTrips.length} CHUYẾN ĐI: ${connection.provinceName} -> đến tỉnh đích`);
        secondLegTrips.forEach((trip, index) => {
          const tripDate = trip.date_departure ? new Date(trip.date_departure).toISOString().split('T')[0] : 'N/A';
          console.log(`  • (${index + 1}) ID:${trip.id}, Khởi hành: ${trip.time_departure}, Ngày: ${tripDate}`);
        });
        
        // 4. Kết hợp các chuyến đi thành chuyến nối
        for (const secondTrip of secondLegTrips) {
          // Bỏ qua nếu không có thông tin điểm đi hoặc điểm đến
          if (!secondTrip.departureInfo || !secondTrip.destinationInfo) {
            console.log(`Bỏ qua chuyến ${secondTrip.id} vì thiếu thông tin điểm đón/trả`);
            continue;
          }
          
          // Xác định ngày khởi hành thực tế của chuyến thứ 2
          const secondTripRawDate = secondTrip.date_departure || secondTrip.dateDeparture;
          let secondTripDate;
          
          if (secondTripRawDate) {
            secondTripDate = new Date(secondTripRawDate);
          } else {
            // Nếu không có ngày cụ thể, sử dụng ngày chuyến được tìm (có thể là ngày sau)
            const compareDay = secondTrip.searchDate || nextDayDate;
            secondTripDate = new Date(compareDay);
          }
          
          // Tạo Date object đầy đủ với giờ phút từ time_departure
          const secondTripDateStr = secondTripDate.toISOString().split('T')[0];
          const secondTripTimeStr = secondTrip.time_departure;
          const [depHours, depMinutes, depSeconds] = secondTripTimeStr.split(':').map(Number);
          
          // Tạo đối tượng Date đầy đủ cho thời điểm khởi hành chuyến 2
          const secondTripDeparture = new Date(secondTripDate);
          secondTripDeparture.setHours(depHours, depMinutes, depSeconds || 0);
          
          console.log(`Kiểm tra chuyến ${secondTrip.id}: Khởi hành lúc ${secondTripTimeStr} ngày ${secondTripDateStr}`);
          
          // So sánh thời gian đến và khởi hành dựa trên timestamp để đảm bảo chính xác
          if (secondTripDeparture.getTime() < arrivalAtConnection.getTime()) {
            console.log(`Bỏ qua vì chuyến 2 xuất phát (${secondTripTimeStr} ngày ${secondTripDateStr}) trước khi chuyến 1 đến (${arrivalTimeFormatted} ngày ${arrivalDateFormatted})`);
            continue;
          }
          
          // Tính thời gian chờ giữa 2 chuyến (tính chính xác theo ngày)
          const waitingTimeMs = secondTripDeparture.getTime() - arrivalAtConnection.getTime();
          const waitingMinutes = Math.floor(waitingTimeMs / (1000 * 60));
          const waitingHours = Math.floor(waitingMinutes / 60);
          const remainingMinutes = waitingMinutes % 60;
          const waitingTime = `${String(waitingHours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`;
          
          // Bỏ qua nếu thời gian chờ quá lâu
          if (waitingMinutes > MAX_WAITING_TIME_MINUTES) {
            console.log(`Bỏ qua kết nối vì thời gian chờ quá lâu: ${waitingTime} (> ${MAX_WAITING_TIME_MINUTES/60} giờ)`);
            continue;
          }
          
          console.log(`Thời gian chờ tại ${connection.provinceName}: ${waitingTime} (${waitingMinutes} phút)`);
          
          // Tính thời gian di chuyển chuyến thứ 2
          const secondTripDuration = this.estimateTripDuration(secondTrip);
          
          // Lưu thời gian di chuyển vào thông tin chuyến đi để hiển thị
          secondTrip.duration = secondTripDuration;
          
          // Tính thời điểm đến đích của chuyến 2
          const arrivalAtDestination = new Date(secondTripDeparture.getTime() + secondTripDuration * 60 * 1000);
          const destinationArrivalTime = arrivalAtDestination.toTimeString().slice(0, 5);
          const destinationArrivalDate = arrivalAtDestination.toISOString().split('T')[0];
          
          // Kiểm tra và đảm bảo ngày đến phải sau ngày khởi hành nếu thời gian di chuyển dài
          if (secondTripDuration > 1200) { // >20 giờ
            const nextDayDestination = new Date(arrivalAtDestination);
            nextDayDestination.setDate(nextDayDestination.getDate() + 1);
            secondTrip.destinationInfo.arrivalDate = nextDayDestination.toISOString().split('T')[0];
          } else {
            secondTrip.destinationInfo.arrivalDate = destinationArrivalDate;
          }
          
          // Tính tổng thời gian di chuyển (chuyến 1 + chờ + chuyến 2)
          const totalDuration = firstTripDuration + waitingMinutes + secondTripDuration;
          const totalHours = Math.floor(totalDuration / 60);
          const totalMinutes = totalDuration % 60;
          const totalDurationFormatted = `${totalHours}h${totalMinutes}m`;
          
          // Tính tổng giá vé
          const totalPrice = (firstTrip.route?.base_price || 0) + (secondTrip.route?.base_price || 0);
          
          // Chuẩn bị thông tin hiển thị
          const firstTripCompanyName = firstTrip.company?.name || 'Không xác định';
          const secondTripCompanyName = secondTrip.company?.name || 'Không xác định';
          
          // Thêm thông tin thời gian đến cho hiển thị
          firstTrip.destinationInfo.arrivalTime = arrivalTimeFormatted;
          firstTrip.destinationInfo.arrivalDate = arrivalDateFormatted;
          
          secondTrip.destinationInfo.arrivalTime = destinationArrivalTime;
          secondTrip.destinationInfo.arrivalDate = destinationArrivalDate;
          
          // Thêm chuyến nối vào danh sách
          connectedTrips.push({
            firstTrip,
            secondTrip,
            totalPrice,
            connectionPoint: {
              province: {
                id: connection.provinceId,
                name: connection.provinceName
              },
              pointId: firstTrip.destinationInfo?.pointId || 0,
              pointName: firstTrip.destinationInfo?.pointName || connection.provinceName
            },
            waitingTime,
            waitingMinutes,
            totalDuration: totalDurationFormatted
          });
          
          console.log(`ĐÃ THÊM CHUYẾN NỐI QUA TỈNH ${connection.provinceName}:`);
          console.log(`- Chuyến 1: ${firstTripCompanyName} (${firstTripDepartureTime}) ngày ${departureDateFormatted} → đến ${arrivalTimeFormatted} ngày ${arrivalDateFormatted}`);
          console.log(`- Chuyến 2: ${secondTripCompanyName} (${secondTripTimeStr}) ngày ${secondTripDateStr} → đến ${destinationArrivalTime} ngày ${destinationArrivalDate}`);
          console.log(`- Thời gian chờ: ${waitingTime}, Tổng thời gian: ${totalDurationFormatted}, Tổng giá: ${totalPrice}`);
        }
      }
    }
    
    // Sắp xếp kết quả theo thời gian chờ
    const sortedTrips = connectedTrips.sort((a, b) => {
      const waitingTimeA = this.convertWaitingTimeToMinutes(a.waitingTime);
      const waitingTimeB = this.convertWaitingTimeToMinutes(b.waitingTime);
      return waitingTimeA - waitingTimeB;
    });
    
    // Tăng số lượng kết quả trả về lên 15
    const result = sortedTrips.slice(0, 15);
    console.log(`KẾT QUẢ TÌM KIẾM: ${result.length} CHUYẾN NỐI`);
    
    return result;
  }
  
  /**
   * Chuyển thời gian chờ thành phút để dễ so sánh
   */
  convertWaitingTimeToMinutes(waitingTime: string): number {
    const [hours, minutes] = waitingTime.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Ước tính thời gian di chuyển cho chuyến đi (tính bằng phút)
   */
  estimateTripDuration(trip: any): number {
    // Nếu chuyến đi có thông tin thời gian điểm đón và điểm trả, tính từ đó
    if (trip.departureInfo?.time && trip.destinationInfo?.time) {
      const depTime = trip.departureInfo.time.split(':').map(Number);
      const destTime = trip.destinationInfo.time.split(':').map(Number);
      
      // Chuyển đổi thành phút
      const depMinutes = depTime[0] * 60 + depTime[1];
      let destMinutes = destTime[0] * 60 + destTime[1];
      
      // Xử lý trường hợp điểm đến là ngày hôm sau (nếu thời gian đến trước thời gian đi)
      if (destMinutes < depMinutes) {
        destMinutes += 24 * 60; // Thêm 24 giờ
      }
      
      return destMinutes - depMinutes;
    }
    
    // Nếu không có thông tin chính xác, ước tính khoảng 9 tiếng di chuyển (540 phút)
    return 540;
  }
  
  /**
   * Tìm kiếm chuyến đi giữa hai tỉnh, có thể chỉ định thời gian khởi hành tối thiểu
   */
  async searchTripsBetweenProvinces(
    departureId: number, 
    destinationId: number, 
    date: Date,
    minDepartureTime?: Date
  ): Promise<any[]> {
    // Tạo tham số tìm kiếm
    const searchParams = {
      departureId,
      destinationId,
      departureDate: date.toISOString().split('T')[0],
      isPartialSearch: true // Thêm flag để tránh tìm kiếm đệ quy
    };
    
    console.log(`Tìm kiếm chuyến giữa tỉnh ${departureId} và ${destinationId} vào ngày ${searchParams.departureDate}`);
    
    // Tìm tất cả điểm đón/trả thuộc hai tỉnh
    const [departurePoints, destinationPoints] = await Promise.all([
      this.pointRepository.find({
        where: { provinces_id: departureId },
        relations: ['province'],
      }),
      this.pointRepository.find({
        where: { provinces_id: destinationId },
        relations: ['province'],
      }),
    ]);

    if (departurePoints.length === 0 || destinationPoints.length === 0) {
      console.log('KHÔNG TÌM THẤY ĐIỂM ĐÓN/TRẢ PHÙ HỢP');
      return [];
    }

    console.log(`Tìm thấy ${departurePoints.length} điểm ở tỉnh xuất phát và ${destinationPoints.length} điểm ở tỉnh đến`);

    // Tìm tất cả các tuyến đường có điểm đi thuộc tỉnh xuất phát và điểm đến thuộc tỉnh đích
    const departurePointIds = departurePoints.map((p) => p.id);
    const destinationPointIds = destinationPoints.map((p) => p.id);

    // Tìm tất cả các tuyến có:
    // 1. Điểm xuất phát thuộc tỉnh đi
    // 2. Điểm đến thuộc tỉnh đến
    // 3. Điểm xuất phát trước điểm đến trong hành trình
    const routes = await this.routeRepository
      .createQueryBuilder('route')
      .innerJoin(
        'route.point_of_route',
        'departurePor',
        'departurePor.point_id IN (:...departurePointIds)',
        { departurePointIds },
      )
      .innerJoin(
        'route.point_of_route',
        'destinationPor',
        'destinationPor.point_id IN (:...destinationPointIds)',
        { destinationPointIds },
      )
      .where('departurePor.display_order < destinationPor.display_order')
      .getMany();

    if (routes.length === 0) {
      console.log(`KHÔNG TÌM THẤY TUYẾN ĐƯỜNG PHÙ HỢP GIỮA TỈNH ${departureId} VÀ ${destinationId}`);
      return [];
    }

    console.log(`Tìm thấy ${routes.length} tuyến đường phù hợp giữa hai tỉnh`);

    // Tìm chuyến đi trong ngày chỉ định
    const departureDate = new Date(date);
    const nextDay = new Date(departureDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Tìm chuyến đi hiện có
    let tripsQuery = this.tripRepository
      .createQueryBuilder('trip')
      .leftJoinAndSelect('trip.route', 'route')
      .leftJoinAndSelect('trip.schedule', 'schedule')
      .leftJoinAndSelect('trip.company', 'company')
      .leftJoinAndSelect('trip.seat_map', 'seat_map')
      .where('trip.route_id IN (:...routeIds)', {
        routeIds: routes.map((r) => r.id),
      })
      .andWhere(
        'trip.date_departure >= :startDate AND trip.date_departure < :endDate',
        {
          startDate: departureDate,
          endDate: nextDay,
        }
      );
      
    // Nếu có chỉ định thời gian khởi hành tối thiểu, thêm điều kiện lọc
    if (minDepartureTime) {
      const minTimeStr = minDepartureTime.toTimeString().slice(0, 8); // Format HH:MM:SS
      tripsQuery = tripsQuery.andWhere('trip.time_departure >= :minTime', { minTime: minTimeStr });
      console.log(`Tìm chuyến sau: ${minTimeStr}`);
    }
    
    const trips = await tripsQuery.orderBy('trip.time_departure', 'ASC').getMany();

    console.log(`Tìm thấy ${trips.length} chuyến đi cho tuyến giữa tỉnh ${departureId} - ${destinationId}`);
    
    if (trips.length === 0) return [];
    
    // Bổ sung thông tin tỉnh đón/trả cho chuyến đi
    const enhancedTrips = await Promise.all(
      trips.map(async (trip) => {
        // Tìm điểm đón thuộc tỉnh đi và điểm trả thuộc tỉnh đến
        const [departurePoint, destinationPoint] = await Promise.all([
          this.pointOfRouteRepository.findOne({
            where: {
              route: { id: trip.route.id },
              point: { provinces_id: departureId },
            },
            relations: ['point', 'point.province'],
            order: { display_order: 'ASC' },
          }),
          this.pointOfRouteRepository.findOne({
            where: {
              route: { id: trip.route.id },
              point: { provinces_id: destinationId },
            },
            relations: ['point', 'point.province'],
            order: { display_order: 'DESC' },
          }),
        ]);

        // Tạo thông tin chuyến đi với thông tin tỉnh/thành phố
        return {
          ...trip,
          dateDeparture: trip.date_departure,
          departureInfo: departurePoint ? {
            pointId: departurePoint.point.id,
            pointName: departurePoint.point.name,
            address: departurePoint.point.address,
            province: departurePoint.point.province.name,
            provinceId: departurePoint.point.province.id,
            time: departurePoint.time,
          } : null,
          destinationInfo: destinationPoint ? {
            pointId: destinationPoint.point.id,
            pointName: destinationPoint.point.name,
            address: destinationPoint.point.address,
            province: destinationPoint.point.province.name,
            provinceId: destinationPoint.point.province.id,
            time: destinationPoint.time,
          } : null,
        };
      })
    );
    
    return enhancedTrips;
  }
}
