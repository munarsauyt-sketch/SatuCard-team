import { readAccount } from './account.js';

// This server-owned UUID identifies the administrator. Profile names and client
// subscription flags never grant access to a provider key.
export function isAiAdmin(user) {
  const adminId = process.env.GEMINI_ADMIN_USER_ID?.trim().toLowerCase();
  return Boolean(adminId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(adminId) &&
    typeof user?.id === 'string' && user.id.toLowerCase() === adminId);
}

export async function hasAiAccess(request, config) {
  if (!config || !request?.headers.get('authorization')) return false;
  try {
    const { user } = await readAccount(request, config, { complete: true });
    return isAiAdmin(user);
  } catch { return false; }
}

export const AI_ACCESS_MESSAGE = 'ИИ доступен в платной версии. Сейчас доступ открыт только администратору.';
