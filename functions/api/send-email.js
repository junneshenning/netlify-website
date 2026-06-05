/**
 * Cloudflare Pages Function to handle secure contact form submission,
 * verify Google reCAPTCHA v3, and send email via Resend API.
 *
 * Route: POST /api/send-email
 *
 * Required environment variables (set in Cloudflare Pages dashboard):
 *   RESEND_API_KEY          – Resend API key
 *   RESEND_SENDER_EMAIL     – Verified sender email in Resend
 *   RESEND_RECIPIENT_EMAIL  – Where to deliver contact form messages
 *   RECAPTCHA_SECRET_KEY    – Google reCAPTCHA v3 secret key
 *   PUBLIC_RECAPTCHA_SITE_KEY – Google reCAPTCHA v3 site key (exposed to frontend)
 */
export async function onRequestPost({ request, env }) {
    try {
        let payload;
        try {
            payload = await request.json();
        } catch {
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid JSON request body' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const { name, email, subject, message, recaptchaToken } = payload;

        if (!name || !email || !subject || !message) {
            return new Response(
                JSON.stringify({ success: false, message: 'Missing required fields' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } },
            );
        }

        // 1. Verify Google reCAPTCHA v3
        const recaptchaSecret = env.RECAPTCHA_SECRET_KEY;
        if (recaptchaSecret) {
            if (!recaptchaToken) {
                return new Response(
                    JSON.stringify({ success: false, message: 'Security check failed. Please try again.' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }

            const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${encodeURIComponent(recaptchaSecret)}&response=${encodeURIComponent(recaptchaToken)}`,
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.success) {
                console.error('reCAPTCHA verification failed:', verifyData);
                return new Response(
                    JSON.stringify({ success: false, message: 'Security check failed. Please try again.' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                );
            }
        }

        // 2. Send email via Resend API
        const resendApiKey = env.RESEND_API_KEY;
        const senderEmail = env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
        const recipientEmail = env.RESEND_RECIPIENT_EMAIL || 'junnesdaniel@gmail.com';

        if (!resendApiKey) {
            console.error('Missing Resend configuration');
            return new Response(
                JSON.stringify({ success: false, message: 'Email service is not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } },
            );
        }

        const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `Portfolio Contact Form <${senderEmail}>`,
                to: [recipientEmail],
                reply_to: `${name} <${email}>`,
                subject: `[Contact Form] ${subject}`,
                text:
                    `You received a new message from your portfolio website:\n\n` +
                    `----------------------------------------\n` +
                    `Name:    ${name}\n` +
                    `Email:   ${email}\n` +
                    `Subject: ${subject}\n` +
                    `----------------------------------------\n\n` +
                    `Message:\n${message}\n`,
            }),
        });

        if (!resendRes.ok) {
            const errText = await resendRes.text();
            console.error('Resend send failed:', resendRes.status, errText);
            return new Response(
                JSON.stringify({ success: false, message: 'Failed to send email through Resend' }),
                { status: 502, headers: { 'Content-Type': 'application/json' } },
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Email sent successfully!' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    } catch (error) {
        console.error('Function error:', error);
        return new Response(
            JSON.stringify({ success: false, message: 'Internal Server Error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }
}