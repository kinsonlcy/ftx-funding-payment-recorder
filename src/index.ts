require('dotenv').config({
  path: __dirname + '/../.env',
});

import { FundingPayment, SpotMarginHistory } from './types';
import {
  GoogleSpreadsheet,
  GoogleSpreadsheetWorksheet,
} from 'google-spreadsheet';
import {
  getAccountPosition,
  getFundingPayment,
  getSpotMarginBorrowHistory,
} from './ftx';

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
  y: number,
  m: number,
  fundingPayments: FundingPayment[],
  spotMarginBorrowHistory: SpotMarginHistory[],
  future?: string
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

  const sheetName = R.isNil(future) ? `${months[m]}` : `${months[m]}-${future}`;
  const sheetId = sheetTitleIdMapping[sheetName];

  let sheet: GoogleSpreadsheetWorksheet;
  const headerValuesArr = R.isEmpty(spotMarginBorrowHistory)
    ? ['future', 'payment', 'rate', 'time']
    : [
        'future',
        'payment',
        'rate',
        'time',
        'borrow_coin',
        'size',
        'borrow_rate',
        'cost',
        'time_of_interest',
      ];

  if (R.isNil(sheetId)) {
    // create a new sheet if sheet of the month doesn't exist
    sheet = await doc.addSheet({
      title: sheetName,
      headerValues: headerValuesArr,
    });
  } else {
    sheet = doc.sheetsById[sheetId];
    // clear all data in the sheet
    await sheet.clear();
    await sheet.setHeaderRow(headerValuesArr);
  }

  let rowArr,
    infoColumns = ['K', 'L'];
  if (R.isEmpty(spotMarginBorrowHistory)) {
    rowArr = fundingPayments;
    infoColumns = ['F', 'G'];
  } else if (fundingPayments.length >= spotMarginBorrowHistory.length) {
    rowArr = fundingPayments.map((fpValue, fpIndex) => {
      let coin, cost, rate, size, time;
      if (!R.isNil(spotMarginBorrowHistory[fpIndex])) {
        ({ coin, cost, rate, size, time } = spotMarginBorrowHistory[fpIndex]);
      }

      return {
        ...fpValue,
        borrow_coin: coin || '',
        size: size || '',
        borrow_rate: rate || '',
        cost: cost || '',
        time_of_interest: time || '',
      };
    });
  } else {
    rowArr = spotMarginBorrowHistory.map(
      (spotMarginBorrowHistoryValue, spotMarginBorrowHistoryIndex) => {
        const { coin, cost, rate, size, time } = spotMarginBorrowHistoryValue;
        let future, payment, fundingRate, fundingTime;
        if (!R.isNil(fundingPayments[spotMarginBorrowHistoryIndex])) {
          ({
            future,
            payment,
            rate: fundingRate,
            time: fundingTime,
          } = fundingPayments[spotMarginBorrowHistoryIndex]);
        }

        return {
          future: future || '',
          payment: payment || '',
          rate: fundingRate || '',
          time: fundingTime || '',
          borrow_coin: coin,
          size,
          borrow_rate: rate,
          cost,
          time_of_interest: time,
        };
      }
    );
  }

  // add back data to the sheet
  console.info(`Writing ${fundingPayments.length} records to spreadsheet.`);
  await sheet.addRows(rowArr);
  console.info('Records have been successfully written.');

  // assume hkd to usd rate is 7.78
  const hkdToUsdRate = process.env.HKD_TO_USD_RATE || 7.78;

  // calculate and show profit
  await sheet.loadCells(`A1:${infoColumns[1]}${sheet.rowCount}`); // loads a range of cells

  const infoMap = [
    { desc: 'Funding (usd)', value: '=ABS(SUM(B2:B))' },
    {
      desc: `hkd 1:${hkdToUsdRate}`,
      value: `=MULTIPLY(${infoColumns[1]}2,${hkdToUsdRate})`,
    },
    { desc: 'Borrow cost (usd)', value: '=ABS(SUM(H2:H))' },
    {
      desc: `hkd 1:${hkdToUsdRate}`,
      value: `=MULTIPLY(${infoColumns[1]}4,${hkdToUsdRate})`,
    },
  ];

  let rowNum = 2;
  infoMap.forEach((info) => {
    const descCell = sheet.getCellByA1(`${infoColumns[0]}${rowNum}`);
    const valueCell = sheet.getCellByA1(`${infoColumns[1]}${rowNum}`);
    descCell.value = info.desc;
    descCell.textFormat = { bold: true };
    valueCell.formula = info.value;
    rowNum++;
  });

  await sheet.saveUpdatedCells();
};

const run = async () => {
  try {
    let y: number,
      m: number,
      isSingle = false;
    ({ y, m, single: isSingle } = options);

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
    const lastDay = new Date(y, m + 1, 1).getTime() / 1000 - 1;

    // get spot margin borrow history from FTX
    console.info(`Getting ${months[m]} spot margin borrow history.`);
    const spotMarginBorrowHistory = await getSpotMarginBorrowHistory(
      firstDay,
      lastDay
    );

    // group funding payment record into single page
    if (isSingle) {
      console.info(`Getting ${months[m]} funding payments.`);
      const fundingPayment = await getFundingPayment(firstDay, lastDay);

      if (!R.isEmpty(fundingPayment)) {
        // Write records to Google spreadsheet
        await updatePaymentRecord(
          y,
          m,
          fundingPayment,
          spotMarginBorrowHistory
        );
      } else {
        console.warn(`Funding payments for ${months[m]} could not be found!`);
      }
    } else {
      // get account futures from FTX
      const accountFutures = R.pluck('future')(await getAccountPosition());

      if (!R.isEmpty(accountFutures)) {
        await Promise.all(
          accountFutures.map(async (future) => {
            // get funding payments from FTX
            console.info(`Getting ${months[m]} ${future} funding payments.`);
            const fundingPayment = await getFundingPayment(
              firstDay,
              lastDay,
              future
            );

            if (!R.isEmpty(fundingPayment)) {
              // Write records to Google spreadsheet
              await updatePaymentRecord(
                y,
                m,
                fundingPayment,
                spotMarginBorrowHistory,
                future
              );
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
    }
  } catch (e) {
    console.error('Error occurred!', e);
  }
};

run();
