import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ParsedComparisonReportOverviewImage {
  position: number;
  sourceRelativePath: string;
  sourceFilePath: string;
}

export interface ParsedComparisonReportOverviewSection {
  caption: string;
  images: ParsedComparisonReportOverviewImage[];
}

export interface ParsedComparisonReportAttribute {
  label: string;
  included: boolean;
}

export interface ParsedComparisonReportDetailSection {
  heading: string;
  items: string[];
}

export interface ParsedNiComparisonReport {
  reportTitle: string;
  generationTime?: string;
  firstViPath?: string;
  secondViPath?: string;
  overviewSections: ParsedComparisonReportOverviewSection[];
  includedAttributes: ParsedComparisonReportAttribute[];
  detailSections: ParsedComparisonReportDetailSection[];
  overviewImageCount: number;
  detailItemCount: number;
}

export interface ParseNiComparisonReportDeps {
  readFile?: typeof fs.readFile;
}

export async function parseNiComparisonReportFile(
  reportFilePath: string,
  deps: ParseNiComparisonReportDeps = {}
): Promise<ParsedNiComparisonReport> {
  const html = await (deps.readFile ?? fs.readFile)(reportFilePath, 'utf8');
  return parseNiComparisonReportHtml(html, reportFilePath);
}

export function parseNiComparisonReportHtml(
  html: string,
  reportFilePath: string
): ParsedNiComparisonReport {
  const reportDirectory = path.dirname(reportFilePath);
  const comparedSummary = captureFirst(
    html,
    /<summary[^>]*class="difference-heading"[^>]*>([\s\S]*?)<\/summary>/i
  );
  const differenceTable = captureFirst(
    html,
    /<table[^>]*class="difference"[^>]*>([\s\S]*?)<\/table>/i
  );
  const detailedInformationHtml = html.split(
    /<h2[^>]*class="section-header"[^>]*>\s*Detailed Information\s*<\/h2>/i
  )[1] ?? '';
  const overviewSections = Array.from(
    differenceTable.matchAll(
      /<tr[^>]*class="compared-vi-image-captions"[^>]*>[\s\S]*?<td[^>]*class="compared-vi-image-caption"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>\s*<tr[^>]*class="compared-images"[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ).map((match) => ({
    caption: normalizeText(match[1]),
    images: Array.from(
      match[2].matchAll(/<img[^>]*class="difference-image"[^>]*src="([^"]+)"/gi)
    ).map((imageMatch, index) => ({
      position: index,
      sourceRelativePath: decodeHtmlEntities(imageMatch[1]),
      sourceFilePath: path.resolve(reportDirectory, decodeHtmlEntities(imageMatch[1]))
    }))
  }));
  const includedAttributes = Array.from(
    html.matchAll(/<li[^>]*class="(checked|unchecked)"[^>]*>([\s\S]*?)<\/li>/gi)
  ).map((match) => ({
    label: normalizeText(match[2]),
    included: match[1].toLowerCase() === 'checked'
  }));
  const detailSections = Array.from(
    detailedInformationHtml.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/gi)
  )
    .map((match) => {
      const detailHtml = match[1];
      const heading = normalizeText(
        captureFirst(detailHtml, /<summary[^>]*class="difference-heading"[^>]*>([\s\S]*?)<\/summary>/i)
      );
      const items = Array.from(
        detailHtml.matchAll(/<li[^>]*class="diff-detail"[^>]*>([\s\S]*?)<\/li>/gi)
      ).map((itemMatch) => normalizeText(itemMatch[1]));
      return {
        heading,
        items
      };
    })
    .filter((section) => section.heading || section.items.length > 0);

  const overviewImageCount = overviewSections.reduce(
    (total, section) => total + section.images.length,
    0
  );
  const detailItemCount = detailSections.reduce(
    (total, section) => total + section.items.length,
    0
  );

  return {
    reportTitle: normalizeText(
      captureFirst(html, /<h1[^>]*class="report-title"[^>]*>([\s\S]*?)<\/h1>/i)
    ),
    generationTime: captureOptionalNormalizedText(
      html,
      /<p[^>]*class="generation-time"[^>]*>([\s\S]*?)<\/p>/i
    ),
    firstViPath: captureOptionalNormalizedText(
      comparedSummary,
      /<div[^>]*class="dropdown-left"[^>]*>\s*First VI:\s*([\s\S]*?)<\/div>/i
    ),
    secondViPath: captureOptionalNormalizedText(
      comparedSummary,
      /<div[^>]*class="dropdown-right"[^>]*>\s*Second VI:\s*([\s\S]*?)<\/div>/i
    ),
    overviewSections,
    includedAttributes,
    detailSections,
    overviewImageCount,
    detailItemCount
  };
}

function captureFirst(source: string, pattern: RegExp): string {
  const match = pattern.exec(source);
  return match?.[1] ?? '';
}

function captureOptionalNormalizedText(source: string, pattern: RegExp): string | undefined {
  const raw = captureFirst(source, pattern);
  const normalized = normalizeText(raw);
  return normalized || undefined;
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
