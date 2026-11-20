/**
 * Brand identity. Change the name here and it updates the whole site
 * (header, metadata, manifest, icons, emails/receipts copy).
 */
export const BRAND = {
  name: "โชคประทาน",
  nameLatin: "Chok Prathan",
  shortName: "โชคประทาน",
  tagline: "หวยออนไลน์ เห็นอัตราจ่ายก่อนแทงทุกเลข",
  description:
    "แทงหวยรัฐบาล หวยลาว หวยฮานอย หวยหุ้น และยี่กี เห็นอัตราจ่ายจริงก่อนกดยืนยัน ฝากถอนตรวจสอบได้ทุกรายการ",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
