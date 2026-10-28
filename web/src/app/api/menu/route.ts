import { getMenu } from '@/server/ordering';
import { json, preflight } from '@/server/http';

export async function GET() {
  return json(await getMenu(), { cors: true });
}

export const OPTIONS = preflight;
