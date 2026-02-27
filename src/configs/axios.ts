import axios, { type AxiosInstance } from 'axios';

const axiosInstance: AxiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    // You can attach auth tokens or other headers here
    // e.g.:
    // const token = process.env.SERVICE_AUTH_TOKEN
    // if (token) config.headers.Authorization = `Bearer ${token}`
    return config;
  },
  (error) => Promise.reject(error)
);

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    // Central place to handle/log Axios errors
    // You can customize this to your logging solution
    return Promise.reject(error);
  }
);

export default axiosInstance;
