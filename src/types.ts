interface ExcelRowHeader {
  [header: string]: string | number | boolean;
}

export interface FundingPayment extends ExcelRowHeader {
  future: string;
  id: number;
  payment: number;
  rate: number;
  time: string;
}

export interface AccountPosition {
  future: string;
}
