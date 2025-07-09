export function getWelcomeEmailBody(fullName: string) {
  return `
    <div style="text-align:center;">
      <p style="font-size:1.3rem;margin-bottom:16px;margin-top:0;color:#e2e8f0;">Welcome aboard, <b>${fullName}</b> 👋</p>
      <p style="font-size:1.05rem;margin-bottom:22px;margin-top:0;color:#cbd5e1;">
        We're thrilled to have you on <b>TradeSpot</b> — the next-gen crypto investment platform where opportunities meet innovation.
      </p>
      <p style="font-size:1rem;margin-bottom:16px;color:#cbd5e1;">
        To get started:
      </p>
      <ul style="list-style:none;padding-left:0;margin:0 auto;max-width:400px;color:#94a3b8;font-size:0.98rem;line-height:1.7;text-align:left;">
        <li>🚀 Explore markets and simulate your first trade</li>
        <li>🔐 Set up security features like WebAuthn</li>
        <li>📈 Monitor your portfolio and daily returns</li>
      </ul>
      <div style="margin-top:28px;">
        <a href="https://www.tradespot.online/dashboard" style="background:#10b981;color:#fff;text-decoration:none;padding:14px 28px;font-weight:600;border:none;display:inline-block;font-size:1rem;letter-spacing:0.5px;">Launch Dashboard</a>
      </div>
    </div>
  `;
}

export function getStyledEmailHtml(subject: string, body: string) {
  return `
    <div style="background:#0f172a;padding:0;margin:0;font-family:'Inter','Segoe UI',sans-serif;">
      <div style="max-width:600px;margin:24px auto;background:#1e293b;box-shadow:0 4px 18px rgba(0,0,0,0.5);">
        <div style="background:#0f172a;padding:24px 0;text-align:center;border-bottom:1px solid #1f2937;">
          <img src="https://www.tradespot.online/favicon.ico" alt="TradeSpot Logo" width="64" height="64" style="display:block;margin:0 auto 12px;">
          <span style="font-size:1.8rem;font-weight:800;color:#10b981;letter-spacing:1px;">TRADESPOT</span>
        </div>
        <div style="padding:28px 24px;text-align:center;">
          ${body}
        </div>
        <div style="padding:16px 24px 0 24px;font-size:0.95rem;color:#94a3b8;text-align:center;">
          <span>If this wasn't you, no worries — simply ignore this email.</span>
        </div>
        <div style="background:#0f172a;padding:14px 0;text-align:center;">
          <span style="font-size:0.9rem;color:#64748b;">© 2025 TradeSpot Global Ltd</span>
        </div>
      </div>
    </div>
  `;
}
