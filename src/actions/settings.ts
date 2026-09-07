"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { toNumber } from "@/lib/calculations";

export interface PartnerSettings {
  operationalFeePercent: number;
  reservePercent: number;
  // % do lucro separado para igreja/doação, retirado antes de qualquer
  // outra divisão (reserva, remuneração operacional e sócios).
  donationPercent: number;
}

const DEFAULT_SETTINGS: PartnerSettings = {
  operationalFeePercent: 5,
  reservePercent: 30,
  donationPercent: 10,
};

export async function getSettings(): Promise<PartnerSettings> {
  const rows = await db.select().from(settings).where(eq(settings.id, "default")).limit(1);
  if (!rows[0]) return DEFAULT_SETTINGS;
  return {
    operationalFeePercent: toNumber(rows[0].operationalFeePercent),
    reservePercent: toNumber(rows[0].reservePercent),
    donationPercent: toNumber(rows[0].donationPercent),
  };
}

export async function updateSettings(
  operationalFeePercent: number,
  reservePercent: number,
  donationPercent: number
) {
  await db
    .insert(settings)
    .values({
      id: "default",
      operationalFeePercent: operationalFeePercent.toString(),
      reservePercent: reservePercent.toString(),
      donationPercent: donationPercent.toString(),
    })
    .onConflictDoUpdate({
      target: settings.id,
      set: {
        operationalFeePercent: operationalFeePercent.toString(),
        reservePercent: reservePercent.toString(),
        donationPercent: donationPercent.toString(),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/");
}
