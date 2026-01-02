// Send email using NodeMailer
export async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
    try {
        // Dynamic import to avoid requiring it if not used
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || '',
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM || 'Woodmont Daily Briefing <operationssupport@woodmontproperties.com>',
            to: to.join(', '),
            subject: subject,
            html: html,
        };

        console.log('SMTP Config:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
            from: process.env.EMAIL_FROM,
            to: to.join(', ')
        });
        console.log('Mail Options:', { subject, to: to.join(', '), htmlLength: html.length });

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
        console.log('Full email info:', info);
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        return false;
    }
}
