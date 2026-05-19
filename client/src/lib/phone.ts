export function normalizePhone(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+1${digits.slice(1)}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 11 && digits.startsWith('1')) return `+1${digits.slice(1, 11)}`;
  return input;
}

export function isValidPhone(input: string): boolean {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return true;
  if (digits.length === 11 && digits.startsWith('1')) return true;
  return false;
}

export function stripPhoneInput(value: string): string {
  return value.replace(/[^\d+]/g, '');
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}
