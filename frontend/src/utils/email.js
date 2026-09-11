import emailjs from '@emailjs/browser';

export async function sendEmail({ to, subject, message, from_name }) {
  const config = getEmailConfig();
  if (!config.serviceId || !config.templateId || !config.publicKey) {
    throw new Error('EmailJS not configured. Set your Service ID, Template ID, and Public Key in the send modal.');
  }
  const response = await emailjs.send(
    config.serviceId,
    config.templateId,
    { to_email: to, subject: subject || '', message: message || '', from_name: from_name || '' },
    config.publicKey,
  );
  return response;
}

export function getEmailConfig() {
  try {
    const raw = localStorage.getItem('vn_emailjs');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { serviceId: 'service_ireqc78', templateId: 'template_3up8k47', publicKey: 'rrZz9VTk-hSqQ0l4W' };
}

export function setEmailConfig(config) {
  localStorage.setItem('vn_emailjs', JSON.stringify(config));
}

export function isEmailConfigured() {
  const c = getEmailConfig();
  return !!(c.serviceId && c.templateId && c.publicKey);
}
