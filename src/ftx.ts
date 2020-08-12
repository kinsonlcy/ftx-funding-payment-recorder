import 'dotenv/config';

import { AccountPosition, FundingPayment } from './types';
import axios, { AxiosInstance } from 'axios';
import querystring, { ParsedUrlQueryInput } from 'querystring';

import R from 'ramda';
import crypto from 'crypto';

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

  return axios.create({
    baseURL: 'https://ftx.com/api',
    timeout: 30000,
    headers: {
      'FTX-KEY': process.env.API_KEY,
      'FTX-TS': timestamp,
      'FTX-SIGN': signature,
    },
  });
};

const getFundingPayment = async (
  future: string,
  firstDay: number,
  lastDay: number
): Promise<FundingPayment[]> => {
  const queryPayload = {
    start_time: firstDay,
    end_time: lastDay,
    future,
  };

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

export { getFundingPayment, getAccountPosition };
