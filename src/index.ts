import 'dotenv/config';

import {
  GoogleSpreadsheet,
  GoogleSpreadsheetWorksheet,
} from 'google-spreadsheet';

import axios from 'axios';
import crypto from 'crypto';
import querystring from 'querystring';

interface ExcelRowHeader {
  [header: string]: string | number | boolean;
}

interface FundingPayment extends ExcelRowHeader {
  future: string;
  id: number;
  payment: number;
  rate: number;
  time: string;
}

const months = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

const getFundingPayment = async (
  firstDay: number,
  lastDay: number
): Promise<FundingPayment[] | null> => {
  if (
    process.env.API_SECRET === undefined ||
    process.env.API_KEY === undefined
  ) {
    throw new Error('Missing api key or secret!');
  }

  const timePeriodPayload = {
    start_time: firstDay,
    end_time: lastDay,
  };

  const timestamp = Date.now();
  const payload = `${timestamp}GET/api/funding_payments?${querystring.stringify(
    timePeriodPayload
  )}`;
  const signature = crypto
    .createHmac('sha256', process.env.API_SECRET)
    .update(payload)
    .digest('hex');

  const apiClient = axios.create({
    baseURL: 'https://ftx.com/api',
    timeout: 30000,
    headers: {
      'FTX-KEY': process.env.API_KEY,
      'FTX-TS': timestamp,
      'FTX-SIGN': signature,
    },
  });

  const {
    data: { result, success },
  } = await apiClient({
    method: 'get',
    url: '/funding_payments',
    params: timePeriodPayload,
  });

  return success ? result : null;
};

const updatePaymentRecord = async (fundingPayments: FundingPayment[]) => {
  if (process.env.GOOGLE_SHEET_ID === undefined) {
    throw new Error('Missing google sheet ID!');
  }

  if (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL === undefined ||
    process.env.GOOGLE_PRIVATE_KEY === undefined
  ) {
    throw new Error('Missing google account credential!');
  }

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY,
  });

  await doc.loadInfo();
  let sheetTitleIdMapping: { [month: string]: number } = {};
  for (let i = 0; i < doc.sheetCount; i++) {
    const currentSheet = doc.sheetsByIndex[i];
    sheetTitleIdMapping = Object.assign(sheetTitleIdMapping, {
      [currentSheet.title]: currentSheet.sheetId,
    });
  }

  const currentTimestamp = new Date(Date.now());
  const currentMonth = months[currentTimestamp.getMonth()];
  const sheetId = sheetTitleIdMapping[currentMonth];

  let sheet: GoogleSpreadsheetWorksheet;
  if (sheetId === undefined) {
    // create a new sheet if sheet of the month doesn't exist
    sheet = await doc.addSheet({
      title: currentMonth,
      headerValues: ['future', 'payment', 'rate', 'time'],
    });
  } else {
    sheet = doc.sheetsById[sheetId];
    // clear all data in the sheet
    await sheet.clear();
    await sheet.setHeaderRow(['future', 'payment', 'rate', 'time']);
  }

  // add back data to the sheet
  console.log(`Writing ${fundingPayments.length} records to spreadsheet.`);
  await sheet.addRows(fundingPayments);
  console.log('Records have been successfully written.');

  // assume hkd to usd rate is 7.78
  const hkdToUsdRate = process.env.HKD_TO_USD_RATE || 7.78;

  // calculate and show profit
  await sheet.loadCells('A1:G800'); // loads a range of cells
  const f2 = sheet.getCellByA1('F2');
  const f3 = sheet.getCellByA1('F3');
  const g2 = sheet.getCellByA1('G2');
  const g3 = sheet.getCellByA1('G3');
  f2.value = 'Net (usd)';
  f2.textFormat = { bold: true };
  f3.value = 'hkd';
  f3.textFormat = { bold: true };
  g2.formula = '=ABS(SUM(B2:B))';
  g3.formula = `=MULTIPLY(G2,${hkdToUsdRate})`;
  await sheet.saveUpdatedCells();
};

const run = async () => {
  try {
    // Get the timestamp of first day and last day in current month
    const date = new Date(),
      y = date.getFullYear(),
      m = date.getMonth();
    //  Unix timestamps in seconds
    const firstDay = new Date(y, m, 1).getTime() / 1000;
    const lastDay = new Date(y, m + 1, 0).getTime() / 1000;

    // get funding payment from FTX
    console.log(`Getting ${months[m]} funding payments.`);
    const fundingPayments = await getFundingPayment(firstDay, lastDay);

    if (fundingPayments === null) {
      throw new Error('Could not get funding payments!');
    }

    // Write records to Google spreadsheet
    await updatePaymentRecord(fundingPayments);
  } catch (e) {
    console.log('Error occurred!', e);
  }
};

run();
