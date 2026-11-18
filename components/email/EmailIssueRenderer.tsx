import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from "react-email";
import { formatDate, issueNumber } from "../../lib/calendar";
import type { Issue } from "../../lib/issue-schema";
import { emailMastheadPath, emailMastheadSize, publication, theme } from "../../lib/theme";
import { ChapterMarkdown } from "../issues/ChapterMarkdown";

export function EmailIssueRenderer({
  issue,
  textMasthead = false,
  mastheadSrc,
  unsubscribeUrl,
}: {
  issue: Issue;
  textMasthead?: boolean;
  mastheadSrc?: string;
  unsubscribeUrl?: string;
}) {
  const image = textMasthead
    ? undefined
    : mastheadSrc ?? new URL(emailMastheadPath(issue.mastheadPalette), publication.origin).href;

  return (
    <Html lang="en">
      <Head />
      <Body style={{ margin: 0, backgroundColor: theme.paper, color: theme.ink, fontFamily: theme.sans }}>
        <Preview>{issue.subtitle}</Preview>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "24px 20px" }}>
          {image ? (
            <Img
              src={image}
              {...emailMastheadSize}
              alt={publication.name}
              style={{ display: "block", maxWidth: "100%", height: "auto", fontFamily: theme.serif, fontSize: 24, color: theme.ink }}
            />
          ) : (
            <Text style={{ margin: 0, fontFamily: theme.serif, fontSize: 26, lineHeight: "32px" }}>
              {publication.name}
            </Text>
          )}
          <Text style={{ margin: "8px 0 24px", color: theme.muted, fontSize: 15 }}>{publication.tagline}</Text>
          <Hr style={{ borderColor: theme.line, margin: "0 0 22px" }} />
          <Text style={{ margin: 0, color: theme.accent, fontSize: 13 }}>
            Issue {issueNumber(issue.number)} · {formatDate(issue.publishDate)}
            {issue.isDraft && " · Draft"}
          </Text>
          <Heading as="h1" style={{ margin: "9px 0", fontFamily: theme.serif, fontSize: 32, lineHeight: "38px" }}>
            {issue.headline}
          </Heading>
          <Text style={{ margin: "0 0 24px", color: theme.muted, fontFamily: theme.serif, fontSize: 18, lineHeight: "26px" }}>
            {issue.subtitle}
          </Text>
          {issue.chapters.map(({ key, label, markdown }) => (
            <Section key={key} style={{ borderTop: `1px solid ${theme.line}`, padding: "16px 0 12px" }}>
              <Heading as="h2" style={{ margin: "0 0 10px", fontFamily: theme.serif, fontSize: 23, lineHeight: "29px" }}>
                {label}
              </Heading>
              <div style={{ fontSize: 16, lineHeight: "25px", overflowWrap: "break-word" }}>
                <ChapterMarkdown markdown={markdown} issueId={issue.id} email />
              </div>
            </Section>
          ))}
          {unsubscribeUrl && (
            <Text style={{ color: theme.muted, fontSize: 14 }}>
              <Link href={unsubscribeUrl} style={{ color: theme.accent, textDecoration: "underline" }}>Unsubscribe</Link>
            </Text>
          )}
          {image && (
            <Text style={{ color: theme.muted, fontSize: 14 }}>{publication.name}</Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}
