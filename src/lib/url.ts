/**
 * Extract origin from a URL string
 * @param url - The URL string to extract origin from
 * @returns The origin string (protocol + hostname + port)
 */
export const getOrigin = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch (error) {
    // If URL parsing fails, try to extract manually
    const protocolMatch = url.match(/^(https?:\/\/)/);
    if (!protocolMatch) {
      throw new Error('Invalid URL: missing protocol');
    }

    const protocol = protocolMatch[1];
    const withoutProtocol = url.replace(protocol, '');
    const hostnamePort = withoutProtocol.split('/')[0];

    return protocol + hostnamePort;
  }
};

/**
 * Extract origin from a URL string (with fallback)
 * @param url - The URL string to extract origin from
 * @param fallback - Fallback value if extraction fails
 * @returns The origin string or fallback
 */
export const getOriginSafe = (url: string, fallback: string = ''): string => {
  try {
    return getOrigin(url);
  } catch (error) {
    return fallback;
  }
};
