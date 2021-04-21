import { AccountPosition, FundingPayment, SpotMarginHistory } from './types';
import axios, { AxiosInstance } from 'axios';
import querystring, { ParsedUrlQueryInput } from 'querystring';

import R from 'ramda';
import crypto from 'crypto';

let subAccount = '';

const setSubAccount = (name: string) => {
  subAccount = encodeURI(name);
};

const getSubAccount = () => subAccount;

const getApiClient = (
  endpoint: string,
  options?: ParsedUrlQueryInput
): AxiosInstance => {
  if (R.isNil(process.env.API_SECRET) || R.isNil(process.env.API_KEY)) {
    throw new Error('Missing api key or secret!');
  }

  const timestamp = Date.now();
  const query = options ? `?${querystring.stringify(options)}` : '';
  const payload = `${timestamp}GET/api/${endpoint}${query}`;
  const signature = crypto
    .createHmac('sha256', process.env.API_SECRET)
    .update(payload)
    .digest('hex');

  const headers = {
    'FTX-KEY': process.env.API_KEY,
    'FTX-TS': timestamp,
    'FTX-SIGN': signature,
  };
  return axios.create({
    baseURL: 'https://ftx.com/api',
    timeout: 30000,
    headers:
      subAccount !== ''
        ? { ...headers, 'FTX-SUBACCOUNT': subAccount }
        : headers,
  });
};

const getFundingPayment = async (
  firstDay: number,
  lastDay: number,
  future?: string
): Promise<FundingPayment[]> => {
  let queryPayload = {};

  queryPayload = { start_time: firstDay, end_time: lastDay };

  if (!R.isNil(future)) {
    queryPayload = { ...queryPayload, future };
  }

  const apiClient = getApiClient('funding_payments', queryPayload);

  const {
    data: { result, success },
  } = await apiClient({
    method: 'get',
    url: '/funding_payments',
    params: queryPayload,
  });

  return success ? result : [];
};

const getAccountPosition = async (): Promise<AccountPosition[]> => {
  const apiClient = getApiClient('positions');

  const {
    data: { result, success },
  } = await apiClient({
    method: 'get',
    url: '/positions',
  });

  return success ? result : [];
};

const getSpotMarginBorrowHistory = async (
  firstDay: number,
  lastDay: number
): Promise<SpotMarginHistory[]> => {
  const queryPayload = { start_time: firstDay, end_time: lastDay };
  const apiClient = getApiClient('spot_margin/borrow_history', queryPayload);
  const {
    data: { result, success },
  } = await apiClient({
    method: 'get',
    url: '/spot_margin/borrow_history',
    params: queryPayload,
  });

  return success ? result : [];
};

export {
  getFundingPayment,
  getAccountPosition,
  getSpotMarginBorrowHistory,
  setSubAccount,
  getSubAccount,
};
