import axios from 'axios';
import env from '@/configs/env';
import logger from '@/configs/logger';

export type GstApiRawResponse = {
  data?: any;
  status_cd: string;
  status_desc: string;
};

const GST_BASE_URL = env.GST_API_BASE_URL;
const GST_EMAIL = env.GST_API_EMAIL;

export async function fetchGstDetails(
  gstin: string
): Promise<GstApiRawResponse> {
  const url = GST_BASE_URL.includes('/public/search')
    ? GST_BASE_URL
    : `${GST_BASE_URL.replace(/\/$/, '')}/public/search`;

  // Ensure we don't double-encode the email.
  // If the env value is already URL-encoded (contains %40), decode it first.
  const emailParam = GST_EMAIL.includes('%40')
    ? decodeURIComponent(GST_EMAIL)
    : GST_EMAIL;

  logger.debug('GST API request', {
    url,
    params: { gstin, email: emailParam },
    // Mask secrets but allow quick visual verification
    clientIdPreview: env.GST_API_CLIENT_ID.slice(0, 12),
    clientSecretPreview: env.GST_API_CLIENT_SECRET.slice(0, 8),
  });

  const response = await axios.get<GstApiRawResponse>(url, {
    params: {
      gstin,
      email: emailParam,
    },
    headers: {
      accept: '*/*',
      client_id: env.GST_API_CLIENT_ID,
      client_secret: env.GST_API_CLIENT_SECRET,
    },
    timeout: 10000,
  });

  logger.debug('GST API raw response', {
    gstin,
    status_cd: response.data.status_cd,
    status_desc: response.data.status_desc,
    hasData: Boolean(response.data.data),
  });

  return response.data;
}

export type GstVerificationResult = {
  isValid: boolean;
  reason?: string;
  gstin?: string;
  statusCode: string;
  statusDescription: string;
  data?: any;
};

export async function verifyGst(params: {
  gstin: string;
}): Promise<GstVerificationResult> {
  const raw = await fetchGstDetails(params.gstin);

  const statusCode = raw.status_cd;
  const statusDescription = raw.status_desc;
  const gstin = raw.data?.gstin as string | undefined;
  const status = raw.data?.sts as string | undefined;

  const isValid =
    statusCode === '1' &&
    Boolean(gstin) &&
    // Treat "Active" GST as valid; adjust if you need other statuses.
    status === 'Active';

  logger.debug('GST verification evaluation', {
    requestedGstin: params.gstin,
    responseGstin: gstin,
    status,
    statusCode,
    statusDescription,
    isValid,
  });

  return {
    isValid,
    gstin,
    statusCode,
    statusDescription,
    data: raw.data,
    ...(isValid
      ? {}
      : { reason: statusDescription || 'GSTIN verification failed' }),
  };
}
