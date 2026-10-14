declare module 'cookie-parser';
declare module 'jsonwebtoken';
declare module 'passport';
declare module 'passport-google-oauth20';

declare module 'qrcode' {
  const qrcode: { toDataURL(data: string, options?: { errorCorrectionLevel?: string; width?: number; margin?: number }): Promise<string> };
  export default qrcode;
}
