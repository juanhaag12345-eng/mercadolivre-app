"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monthlyGoals } from "@/db/schema";
import { toNumber } from "@/lib/calculations";

export async function getMonthlyGoal(yearMonth: string): Promise<number> {
  const rows = await db
    .select()
    .from(monthlyGoals)
    .where(eq(monthlyGoals.yearMonth, yearMonth))
    .limit(1);
  return rows[0] ? toNumber(rows[0].goalValue) : 0;
}

export async function setMonthlyGoal(yearMonth: string, goalValue: number) {
  await db
    .insert(monthlyGoals)
    .values({ yearMonth, goalValue: goalValue.toString() })
    .onConflictDoUpdate({
      target: monthlyGoals.yearMonth,
      set: { goalValue: goalValue.toString(), updatedAt: new Date() },
    });
  revalidatePath("/");
}

export async function updateGoalAction(formData: FormData) {
  "use server";
  const yearMonth = String(formData.get("yearMonth") ?? "");
  const goalValue = Number(formData.get("goalValue") ?? 0);
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return;
  await setMonthlyGoal(yearMonth, Math.max(0, goalValue));
}
