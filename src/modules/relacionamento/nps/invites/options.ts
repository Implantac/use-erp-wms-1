import { Link2, Mail, MessageCircle, QrCode } from 'lucide-react';

export const CHANNELS = [
  { v: 'link', label: 'Link manual', icon: Link2 },
  { v: 'email', label: 'E-mail', icon: Mail },
  { v: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { v: 'sms', label: 'SMS', icon: MessageCircle },
  { v: 'qr', label: 'QR Code', icon: QrCode },
];
export const PAGE_SIZE = 20;
