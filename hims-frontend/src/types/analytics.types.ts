export interface DateRangeParams {
  startDate: string;
  endDate: string;
}

export interface OpdWaitingTimeStats {
  sampleSize: number;
  avgWaitMinutes: number;
  minWaitMinutes: number;
  maxWaitMinutes: number;
  dailyTrend: { date: string; avgWaitMinutes: number; sampleSize: number }[];
}

export interface IcuBounceBackStats {
  totalIcuAdmissions: number;
  bounceBacks: number;
  bounceBackRatePercent: number;
}

export interface SurgicalSiteInfectionStats {
  totalCompletedSurgeries: number;
  infectionCount: number;
  infectionRatePercent: number;
  byProcedure: { procedureName: string; surgeryCount: number; infectionCount: number }[];
}

export interface DepartmentProfitability {
  departmentId: string;
  departmentName: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface TopRevenueDoctor {
  doctorId: string;
  doctorName: string;
  revenue: number;
  invoiceCount: number;
}

export interface PharmacyWastageItem {
  drugId: string;
  drugName: string;
  drugCode: string;
  unitsWasted: number;
  wastageValue: number;
}
