import type { CloudflareEnv } from '@/types';

export const getAssetUrl = (path: string, env: CloudflareEnv): string => {
  const baseUrl =
    env.ENVIRONMENT === 'production' ? 'https://invoice.boidu.dev' : 'http://localhost:8787';

  return `${baseUrl}${path}`;
};
