/**
 * Cloudflare Pages Function — Contact form email handler
 * Route: POST /api/send-email
 *
 * Required env vars (set in Cloudflare Pages Dashboard):
 *   RESEND_API_KEY, RESEND_SENDER_EMAIL, RESEND_RECIPIENT_EMAIL,
 *   RECAPTCHA_SECRET_KEY, PUBLIC_RECAPTCHA_SITE_KEY
 */

// Simple debug test first — returns 200 to confirm routing works
export async function onRequestPost(context) {
    const { request, env } = context;

    // Always return JSON
    const corsHeaders = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        // Step 1: Parse JSON body
        let body;
        try {
            body = await request.json();
        } catch {
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid JSON body' }),
                { status: 400, headers: corsHeaders }
            );
        }

        const { name, email, subject, message, recaptchaToken } = body;

        // Validate required fields
        if (!name || !email || !subject || !message) {
            return new Response(
                JSON.stringify({ success: false, message: 'Missing required fields: name, email, subject, message' }),
                { status: 400, headers: corsHeaders }
            );
        }

        // Step 2: Verify reCAPTCHA
        const recaptchaSecret = env.RECAPTCHA_SECRET_KEY;
        if (recaptchaSecret) {
            if (!recaptchaToken) {
                return new Response(
                    JSON.stringify({ success: false, message: 'reCAPTCHA token missing' }),
                    { status: 400, headers: corsHeaders }
                );
            }

            const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
            const verifyBody = new URLSearchParams({
                secret: recaptchaSecret,
                response: recaptchaToken,
            });

            const verifyRes = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: verifyBody.toString(),
            });

            const verifyData = await verifyRes.json();

            if (!verifyData.success) {
                return new Response(
                    JSON.stringify({ success: false, message: 'reCAPTCHA verification failed', details: verifyData['error-codes'] || [] }),
                    { status: 400, headers: corsHeaders }
                );
            }
        }

        // Step 3: Send email via Resend
        const resendApiKey = env.RESEND_API_KEY;
        if (!resendApiKey) {
            return new Response(
                JSON.stringify({ success: false, message: 'Server misconfiguration: RESEND_API_KEY not set' }),
                { status: 500, headers: corsHeaders }
            );
        }

        const senderEmail = env.RESEND_SENDER_EMAIL || 'onboarding@resend.dev';
        const recipientEmail = env.RESEND_RECIPIENT_EMAIL || 'junnesdaniel@gmail.com';

        const resendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `Portfolio Contact <${senderEmail}>`,
                to: [recipientEmail],
                reply_to: `${name} <${email}>`,
                subject: `[Contact Form] ${subject}`,
                text: [
                    `You received a new message from your portfolio website:`,
                    ``,
                    `----------------------------------------`,
                    `Name:    ${name}`,
                    `Email:   ${email}`,
                    `Subject: ${subject}`,
                    `----------------------------------------`,
                    ``,
                    `Message:`,
                    `${message}`,
                ].join('\n'),
            }),
        });

        if (!resendRes.ok) {
            const errText = await resendRes.text();
            return new Response(
                JSON.stringify({ success: false, message: 'Email service error', status: resendRes.status }),
                { status: 502, headers: corsHeaders }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Email sent successfully!' }),
            { status: 200, headers: corsHeaders }
        );

    } catch (err) {
        // Catch-all: never let the function crash unhandled
        return new Response(
            JSON.stringify({ success: false, message: 'Internal server error', error: String(err) }),
            { status: 500, headers: corsHeaders }
        );
    }
}