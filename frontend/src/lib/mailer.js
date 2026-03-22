import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),       // convert to number
  secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


/**
 * Send an email
 * @param {string|string[]} to - Recipient(s)
 * @param {string} subject - Subject line
 * @param {string} html - HTML body
 * @param {Array} attachments - Optional attachments [{ filename, content }]
 */
export async function sendMail(to, subject, html, attachments = []) {
  try {
    const info = await transporter.sendMail({
      from: `"Event System" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });

    console.log("Mail sent:", info.messageId);
    return { success: true, id: info.messageId };
  } catch (err) {
    console.error("Mail error:", err);
    return { success: false, error: err.message };
  }
}
