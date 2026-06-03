import { render } from "@react-email/render";

function AccessCodeEmail({ firstName, code }: { firstName: string; code: string }) {
  return (
    <html>
      <body style={{ margin: 0, padding: 0, backgroundColor: "#f3f6fb", fontFamily: "Arial, sans-serif" }}>
        <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ backgroundColor: "#f3f6fb" }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "32px 16px" }}>
                <table role="presentation" width="560" cellPadding="0" cellSpacing="0" style={{ width: "100%", maxWidth: "560px", backgroundColor: "#ffffff", border: "1px solid #dfe5ee" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "28px 32px 14px", color: "#0f2a5e", fontSize: "22px", fontWeight: 700 }}>
                        Mechanica
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "0 32px 12px", color: "#1c2638", fontSize: "16px", lineHeight: "24px" }}>
                        Hello {firstName}, your request for access to the technical library has been approved.
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "14px 32px" }}>
                        <table role="presentation" cellPadding="0" cellSpacing="0" style={{ backgroundColor: "#edf3fb", border: "1px solid #c8d6eb" }}>
                          <tbody>
                            <tr>
                              <td style={{ padding: "14px 20px", color: "#0f2a5e", fontFamily: "Courier New, monospace", fontSize: "25px", fontWeight: 700, letterSpacing: "4px" }}>
                                {code}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: "10px 32px 30px", color: "#526173", fontSize: "14px", lineHeight: "21px" }}>
                        Enter this code together with your email on the Mechanica access page. If you did not request access, you can ignore this message.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

export async function sendAccessCodeEmail(input: {
  email: string;
  firstName: string;
  code: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured");
  }

  const html = await render(
    <AccessCodeEmail firstName={input.firstName} code={input.code} />
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "Your Mechanica access code",
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${detail}`);
  }
}
