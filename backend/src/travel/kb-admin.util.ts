import type { ConfigService } from "@nestjs/config";

export function readKbAdminKey(config: ConfigService): string | undefined {
  const value = config.get<string>("TRAVEL_KB_ADMIN_KEY")?.trim();
  return value || undefined;
}
