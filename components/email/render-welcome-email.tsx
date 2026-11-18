import { Body, Button, Column, Container, Head, Heading, Hr, Html, Img, Link, Preview, Row, Text, render } from "react-email";
import { emailMastheadPath, emailMastheadSize, publication, seasonalMastheadPalette, theme } from "../../lib/theme";

export async function renderWelcomeEmail(confirmUrl: string, unsubscribeUrl: string, requestedAt: Date) {
  const preview = "Confirm your email to get The Monthly Diff.";
  const introStart = "I'm so glad you've chosen to join me on this journey. Each month—on the ";
  const introEnd = " day of the month—you'll get a human-written look at software releases and breaking changes worth your attention.";
  const expiry = "This link is valid for 24 hours. If you didn't sign up, you can ignore this email or cancel by clicking the link below.";
  const unsubscribeLabel = "Cancel signup or unsubscribe";
  const html = await render(
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: theme.paper, color: theme.ink, fontFamily: theme.sans }}>
        <Container style={{ maxWidth: "560px", padding: "26px 20px" }}>
          <Row>
            <Column align="center">
              <Img
                src={new URL(emailMastheadPath(seasonalMastheadPalette(requestedAt)), publication.origin).href}
                {...emailMastheadSize}
                alt={publication.name}
                style={{ display: "block", margin: "0 auto", maxWidth: "100%", height: "auto", color: theme.ink, fontFamily: theme.serif }}
              />
              <Text style={{ marginTop: 8, color: theme.muted, fontStyle: "italic", textAlign: "center" }}>{publication.footerTagline}</Text>
            </Column>
          </Row>
          <Hr style={{ borderColor: theme.line }} />
          <Heading as="h1" style={{ fontFamily: theme.serif, fontSize: 20, lineHeight: "36px" }}>
            Welcome to...
          </Heading>
          <Heading as="h1" style={{ fontFamily: theme.serif, fontSize: 30, lineHeight: "36px" }}>
            The Monthly Diff
          </Heading>
          <Text style={{ fontSize: 16, lineHeight: "25px" }}>{introStart}<em>final</em>{introEnd}</Text>
          <Row>
            <Column align="center">
              <Button href={confirmUrl} style={{ backgroundColor: theme.ink, color: theme.paper, padding: "12px 18px", fontWeight: 700 }}>
                Confirm subscription
              </Button>
            </Column>
          </Row>
          <Text style={{ color: theme.muted, fontSize: 14, lineHeight: "22px" }}>{expiry}</Text>
          <Hr style={{ borderColor: theme.line, marginTop: 24 }} />
          <Text style={{ fontSize: 13, textAlign: "center" }}><Link href={unsubscribeUrl} style={{ color: theme.accent, textDecoration: "underline" }}>{unsubscribeLabel}</Link></Text>
        </Container>
      </Body>
    </Html>,
  );
  const text = [publication.name, publication.footerTagline, `${introStart}final${introEnd}`, `Confirm subscription: ${confirmUrl}`, expiry, `${unsubscribeLabel}: ${unsubscribeUrl}`].join("\n\n");
  return { html, text };
}
