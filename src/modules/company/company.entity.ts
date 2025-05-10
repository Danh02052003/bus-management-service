import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Office } from '../office/office.entity';
import { SeatMap } from '../seat/seat_map.entity';
import { Vehicle } from '../vehicle/vehicle.entity';
import { Schedule } from '../schedule/schedule.entity';
import { Route } from '../route/route.entity';
import { Point } from '../point/point.entity';
import { PointOfRoute } from '../point/point_of_route.entity';
import { Trip } from '../trip/trip.entity';
import { Ticket } from '../ticket/ticket.entity';
import { Policy } from '../policy/policy.entity';
import { Transit } from '../transit/transit.entity';

@Entity('tbl_company')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  name: string;
  @Column()
  phone: string;
  @Column()
  address: string;
  @Column()
  tax_code: string;
  @Column()
  status: boolean;
  @Column()
  url_logo: string;
  @Column()
  code: string;
  @Column()
  note: string;
  @Column()
  url_vehicle_online: string;
  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToMany(() => Office, (office) => office.company)
  offices: Office[];

  @OneToMany(() => SeatMap, (seat_map) => seat_map.company)
  seat_map: SeatMap[];

  @OneToMany(() => Vehicle, (vehicle) => vehicle.company)
  vehicles: Vehicle[];

  @OneToMany(() => Schedule, (schedule) => schedule.company)
  schedules: Schedule[];

  @OneToMany(() => Route, (route) => route.company)
  routes: Route[];

  @OneToMany(() => Point, (point) => point.company)
  points: Point[];

  @OneToMany(() => PointOfRoute, (point) => point.company)
  point_of_route: PointOfRoute[];

  @OneToMany(() => Trip, (trip) => trip.company)
  trips: Trip[];

  @OneToMany(() => Ticket, (ticket) => ticket.company)
  tickets: Ticket[];

  @OneToMany(() => Policy, (policy) => policy.company)
  policies: Policy[];

  @OneToMany(() => Transit, (transit) => transit.company)
  transits: Transit[];
}
