import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const defaultCountryCode = process.env.OTP_DEFAULT_COUNTRY_CODE || "+91";
const smsType = process.env.OTP_SMS_TYPE || "Transactional";
const senderId = process.env.OTP_SMS_SENDER_ID || "";

let snsClient: SNSClient | null = null;

function getSnsClient(): SNSClient {
  if (!awsRegion) {
    throw new Error("AWS region is not configured. Set AWS_REGION.");
  }
  if (!snsClient) {
    snsClient = new SNSClient({ region: awsRegion });
  }
  return snsClient;
}

function toE164(phone: string): string {
  const raw = String(phone || "").trim();
  if (!raw) throw new Error("Phone number is required");

  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;

  const digits = raw.replace(/\D/g, "");
  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }

  // Common school data format: local 10-digit numbers without country code.
  if (/^\d{10}$/.test(digits) && /^\+\d{1,4}$/.test(defaultCountryCode)) {
    return `${defaultCountryCode}${digits}`;
  }

  throw new Error("Invalid phone number format for SMS");
}

export async function sendOtpSms(phone: string, otpCode: string, ttlSeconds = 300): Promise<void> {
  const to = toE164(phone);
  const message = `Your OTP is ${otpCode}. It expires in ${Math.floor(ttlSeconds / 60)} minutes.`;

  const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
    "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: smsType },
  };
  if (senderId) {
    messageAttributes["AWS.SNS.SMS.SenderID"] = { DataType: "String", StringValue: senderId };
  }

  await getSnsClient().send(
    new PublishCommand({
      PhoneNumber: to,
      Message: message,
      MessageAttributes: messageAttributes,
    }),
  );
}
