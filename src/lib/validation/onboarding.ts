import { z } from "zod";

export const linkLicenseSchema = z.object({
  licenseNo: z
    .string()
    .min(1, "กรุณาระบุเลขทะเบียนผู้ค้า")
    .regex(/^M(07|11)-\S+$/, "รูปแบบเลขทะเบียนผู้ค้าไม่ถูกต้อง"),
  otp: z
    .string()
    .length(6, "รหัสเปิดใช้งานต้องมี 6 หลัก")
    .regex(/^\d{6}$/, "รหัสเปิดใช้งานต้องเป็นตัวเลขเท่านั้น"),
});

export const linkProvinceSchema = z.object({
  provinceCode: z
    .string()
    .length(2, "รหัสจังหวัดต้องมี 2 หลัก")
    .regex(/^\d{2}$/, "รหัสจังหวัดต้องเป็นตัวเลขเท่านั้น"),
  otp: z
    .string()
    .length(6, "รหัสเปิดใช้งานต้องมี 6 หลัก")
    .regex(/^\d{6}$/, "รหัสเปิดใช้งานต้องเป็นตัวเลขเท่านั้น"),
});

export type LinkLicenseInput = z.infer<typeof linkLicenseSchema>;
export type LinkProvinceInput = z.infer<typeof linkProvinceSchema>;
