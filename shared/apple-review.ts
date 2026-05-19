export const APPLE_REVIEW_EMAILS: string[] = (
  process.env.APPLE_REVIEWER_EMAILS ||
  "applereviewfusephone@gmail.com"
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter((s) => s.length > 0);

export function isAppleReviewerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return APPLE_REVIEW_EMAILS.includes(email.toLowerCase());
}

export const PRIMARY_APPLE_REVIEW_EMAIL: string =
  APPLE_REVIEW_EMAILS[0] || "applereviewfusephone@gmail.com";
