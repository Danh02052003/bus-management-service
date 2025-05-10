export class DTO_RP_TripPointInfo {
  pointId: number;
  pointName: string;
  address: string;
  province: string;
  time: string;
}
export class DTO_RP_TripComapanyInfo {
  id: number;
  name: string;
  phone?: string;
}
export class DTO_RP_TripVehicleInfo {
  id: number;
  name: string;
  licensePlate?: string;
  type?: string;
}
export class DTO_RP_TripInfo {
  id: number;
  departureTime: string;
  //   estimatedDuration: string;
  //   price: number;
  //   availableSeats: number;
  departureInfo: DTO_RP_TripPointInfo;
  destinationInfo: DTO_RP_TripPointInfo;
  route: {
    id: number;
    name: string;
  };
  company: DTO_RP_TripComapanyInfo;
  vehicle?: DTO_RP_TripVehicleInfo;
  seatMap?: any;
}
export class DTO_RP_Search {
  success: boolean;
  message?: string;
  data: DTO_RP_TripInfo[];
  meta?: {
    total: number;
    departureDate: string;
    departureProvince: string;
    destinationProvince: string;
  };
}

export class DTO_RP_TripDetail {
  id: number;
  seat_map_id: number;
  total_floor: number;
  total_row: number;
  total_column: number;
  tickets: DTO_RP_Ticket[];
  policy_content: string;
}
export class DTO_RP_Ticket {
  id: number;
  seat_name?: string;
  seat_code: string;
  seat_floor: number;
  seat_row: number;
  seat_column: number;
  seat_status: boolean;
  base_price: number;
}

export class DTO_RP_ListTrip {
  id: number;
  time_departure: string;
  date_departure: Date;
  total_ticket: number;
  total_ticket_booking: number;
  seat_map: {
    id: number;
    name: string;
  };
  route: {
    id: number;
    name: string;
  };
}

export interface DTO_RP_TripPoint {
  id: number;
  name: string;
  address: string;
  display_order: number;
  time_point: string;
  start_time: string;
}

export class DTO_RP_ConnectionPoint {
  province: {
    id: number;
    name: string;
  };
  pointId: number;
  pointName: string;
}

export class DTO_RP_ConnectedTrip {
  firstTrip: DTO_RP_ListTrip;
  secondTrip: DTO_RP_ListTrip;
  totalPrice: number;
  connectionPoint: DTO_RP_ConnectionPoint;
  waitingTime: string;
}

export class DTO_RP_SearchResults {
  directTrips: DTO_RP_TripInfo[];
  connectedTrips: DTO_RP_ConnectedTripInfo[];
}

export class DTO_RP_ConnectedTripInfo {
  firstTrip: DTO_RP_TripInfo;
  secondTrip: DTO_RP_TripInfo;
  totalPrice: number;
  connectionPoint: {
    province: {
      id: number;
      name: string;
    };
    pointId: number;
    pointName: string;
  };
  waitingTime: string;
  totalDuration: string;
}
