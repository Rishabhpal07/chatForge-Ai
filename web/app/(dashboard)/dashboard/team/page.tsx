import { OrganizationProfile } from "@clerk/nextjs";

// Team management = your Clerk organization's members & invitations.
export default function TeamPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-headline-lg font-bold text-on-surface">Team</h1>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Manage members, roles, and invitations for your organization.
        </p>
      </div>
      <OrganizationProfile
        routing="hash"
        appearance={{ elements: { rootBox: "w-full", card: "w-full shadow-none" } }}
      />
    </div>
  );
}
