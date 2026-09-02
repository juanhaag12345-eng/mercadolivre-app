"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { toNumber } from "@/lib/calculations";

export interface PartnerSettings {
  operationalFeePercent: number;
  reservePercent: number;
}

const DEFAULT_SETTINGS: PartnerSettings = {
  operationalFeePercent: 5,
  reservePercent: 30,
};

export async function getSettings(): Promise<PartnerSettings> {
  const rows = await db.select().from(settings).where(eq(settings.id, "default")).limit(1);
  if (!rows[0]) return DEFAULT_SETTINGS;
  return {
    operationalFeePercent: toNumber(rows[0].operationalFeePercent),
    reservePercent: toNumber(rows[0].reservePercent),
  };
}

export async function updateSettings(operationalFeePercent: number, reservePercent: number) {
  await db
    .insert(settings)
    .values({
      id: "default",
      operationalFeePercent: operationalFeePercent.toString(),
      reservePercent: reservePercent.toString(),
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        operationalFeePercent: operationalFeePercent.toString(),
        reservePercent: reservePercent.toString(),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/");
}
