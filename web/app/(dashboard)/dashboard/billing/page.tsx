import { redirect } from "next/navigation";

// Billing lives on the Settings & Billing page (plan, usage, upgrade, activity).
// The sidebar's "Billing" entry routes here, which forwards to that page.
export default function BillingPage() {
  redirect("/dashboard/settings");
}
