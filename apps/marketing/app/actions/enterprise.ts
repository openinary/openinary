"use server";

import { captureLead, LISTS } from "@/lib/attio";

export async function submitEnterprise(formData: FormData) {
  try {
    const email = formData.get("email") as string;
    const company = formData.get("company") as string;
    const teamSize = formData.get("teamSize") as string;
    const monthlyVolume = formData.get("monthlyVolume") as string;
    const message = formData.get("message") as string;

    if (!email || !company) {
      return { success: false, error: "Email and company are required" };
    }

    await captureLead(email, LISTS.enterprise, {
      company,
      // The three optional fields are omitted rather than sent empty, so the
      // Attio column reads as blank instead of an empty string.
      ...(teamSize && { team_size: teamSize }),
      ...(monthlyVolume && { monthly_volume: monthlyVolume }),
      ...(message && { message }),
    });

    return { success: true };
  } catch (error) {
    // Never surface the raw error: it carries the Attio response body.
    console.error("Enterprise submission error:", error);
    return {
      success: false,
      error: "Something went wrong. Please try again later.",
    };
  }
}
