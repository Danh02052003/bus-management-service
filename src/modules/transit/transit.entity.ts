import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Company } from '../company/company.entity';

@Entity('tbl_transit')
export class Transit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Company, (company) => company.transits)
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
