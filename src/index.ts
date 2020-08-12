import 'dotenv/config';

import {
  GoogleSpreadsheet,
  GoogleSpreadsheetWorksheet,
} from 'google-spreadsheet';
import { getAccountPosition, getFundingPayment } from './ftx';

import { FundingPayment } from './types';
import R from 'ramda';
import getopts from 'getopts';

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

const options = getopts(process.argv.slice(2), {
  alias: {
    year: ['y'],
    month: ['m'],
  },
});

const updatePaymentRecord = async (
  future: string,
  fundingPayments: FundingPayment[]
) => {
  if (R.isNil(process.env.GOOGLE_SHEET_ID)) {
    throw new Error('Missing google sheet ID!');
  }

  if (
    R.isNil(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) ||
    R.isNil(process.env.GOOGLE_PRIVATE_KEY)
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
  const sheetName = `${months[currentTimestamp.getMonth()]}-${future}`;
  const sheetId = sheetTitleIdMapping[sheetName];

  let sheet: GoogleSpreadsheetWorksheet;
  if (R.isNil(sheetId)) {
    // create a new sheet if sheet of the month doesn't exist
    sheet = await doc.addSheet({
      title: sheetName,
      headerValues: ['future', 'payment', 'rate', 'time'],
    });
  } else {
    sheet = doc.sheetsById[sheetId];
    // clear all data in the sheet
    await sheet.clear();
    await sheet.setHeaderRow(['future', 'payment', 'rate', 'time']);
  }

  // add back data to the sheet
  console.info(`Writing ${fundingPayments.length} records to spreadsheet.`);
  await sheet.addRows(fundingPayments);
  console.info('Records have been successfully written.');

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
    let y: number, m: number;
    ({ y, m } = options);

    const date = new Date();
    if (R.isNil(y) && R.isNil(m)) {
      // Get the timestamp of first day and last day in current month by default
      y = date.getFullYear();
      m = date.getMonth();
    } else if (R.isNil(y)) {
      y = date.getFullYear();
      m = m - 1;
    } else if (R.isNil(m)) {
      m = date.getMonth();
    } else {
      m = m - 1;
    }

    //  Unix timestamps in seconds
    const firstDay = new Date(y, m, 1).getTime() / 1000;
    const lastDay = new Date(y, m + 1, 0).getTime() / 1000;

    // get account futures from FTX
    const accountFutures = R.pluck('future')(await getAccountPosition());

    if (!R.isEmpty(accountFutures)) {
      await Promise.all(
        accountFutures.map(async (future) => {
          // get funding payments from FTX
          console.info(`Getting ${months[m]} ${future} funding payments.`);
          const fundingPayment = await getFundingPayment(
            future,
            firstDay,
            lastDay
          );

          if (!R.isEmpty(fundingPayment)) {
            // Write records to Google spreadsheet
            await updatePaymentRecord(future, fundingPayment);
          } else {
            console.warn(
              `Funding payments for ${months[m]} ${future} could not be found!`
            );
          }
        })
      );
    } else {
      console.warn('No opening position in your account!');
    }
  } catch (e) {
    console.error('Error occurred!', e);
  }
};

run();
