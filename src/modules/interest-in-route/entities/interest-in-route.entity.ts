import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('tbl_interest_in_route')
export class InterestInRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  account_id: string;

  @Column({ type: 'bigint' })
  route_id: number;
} 