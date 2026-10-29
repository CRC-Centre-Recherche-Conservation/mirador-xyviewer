/**
 * ClassificationCard
 * Summary card of a classifying / identifying annotation. Collapsed: kicker, title and two
 * lines of text. Expanded (the annotation is selected): full text, terms grouped by role,
 * linked annotations and the report link.
 */

import React, { useMemo } from 'react';
import { SanitizedHtml } from 'mirador';
import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LinkIcon from '@mui/icons-material/Link';
import type { AnnotationBody, IIIFAnnotation } from '../types/iiif';
import type { AnnotationBodyLabels } from '../types/mirador';
import {
  buildClassificationView,
  type ProseBlock,
  type Term,
} from '../utils/classificationModel';
import { fillTemplate, resolveLabels } from '../utils/annotationLabels';
import { useLanguagePreferences } from '../utils/LanguageContext';
import { MetadataDisplay } from './MetadataDisplay';
import { LinkedAnnotationList } from './LinkedAnnotationList';
import { AnnotationCardMenu } from './AnnotationCardMenu';
import { ChipRow } from './ChipRow';
import { TermChip } from './TermChip';
import type { TermFacetRef } from './TermActionsContext';

export interface ClassificationCardProps {
  annotation: IIIFAnnotation;
  /** Selected cards are expanded. */
  isSelected?: boolean;
  labels?: AnnotationBodyLabels;
  /** Mirador HTML sanitization rule set for text/html prose. */
  ruleSet?: string;
  /** Where the annotation id is shown (default 'menu'). */
  showAnnotationId?: 'menu' | 'inline';
  /** Host hook naming the group of a descriptive term (`scientificAnnotations.propertyGroupOf`). */
  propertyGroupOf?: (uri: string) => string | undefined;
  windowId?: string;
  selectAnnotation?: (windowId: string, annotationId: string) => void;
  canvasAnnotationIds?: Iterable<string>;
  /** Renders bodies the card does not know (Dataset, Manifest...) when expanded. */
  renderOther?: (bodies: AnnotationBody[]) => React.ReactNode;
  /** Shown under the title (e.g. the back link and "Cited by"). */
  afterTitle?: React.ReactNode;
  /** Shown above the kicker (e.g. the back link). */
  beforeKicker?: React.ReactNode;
}

const Prose: React.FC<{ block: ProseBlock; ruleSet: string; clamp?: boolean }> = ({
  block,
  ruleSet,
  clamp,
}) => (
  <Typography
    variant="body2"
    component="div"
    color={clamp ? 'text.secondary' : undefined}
    lang={block.language}
    sx={{
      wordBreak: 'break-word',
      ...(clamp
        ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
        : { whiteSpace: block.format === 'text/html' ? undefined : 'pre-wrap' }),
    }}
  >
    {block.format === 'text/html' ? <SanitizedHtml ruleSet={ruleSet} htmlString={block.text} /> : block.text}
  </Typography>
);

const Group: React.FC<{
  caption: string;
  terms: Term[];
  variant?: 'filled' | 'outlined';
  openVocabularyLabel: string;
  facet?: TermFacetRef;
}> = ({ caption, terms, variant, openVocabularyLabel, facet }) =>
  terms.length === 0 ? null : (
    <Box role="group" aria-label={caption} sx={{ mt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {caption}
      </Typography>
      <ChipRow terms={terms} variant={variant} openVocabularyLabel={openVocabularyLabel} facet={facet} />
    </Box>
  );

export const ClassificationCard: React.FC<ClassificationCardProps> = ({
  annotation,
  isSelected = false,
  labels,
  ruleSet = 'iiif',
  showAnnotationId = 'menu',
  propertyGroupOf,
  windowId,
  selectAnnotation,
  canvasAnnotationIds,
  renderOther,
  afterTitle,
  beforeKicker,
}) => {
  const prefs = useLanguagePreferences();
  const text = useMemo(() => resolveLabels(labels), [labels]);
  const view = useMemo(() => buildClassificationView(annotation, prefs, propertyGroupOf), [annotation, prefs, propertyGroupOf]);
  const purposeCaption = (purpose: string, fallback: string) => {
    const own = labels?.purposes;
    return own && Object.prototype.hasOwnProperty.call(own, purpose) && typeof own[purpose] === 'string'
      ? own[purpose]
      : fallback;
  };

  const linkCount =
    view.related.length === 1 ? text.linkCountOne : fillTemplate(text.linkCount, { n: view.related.length });
  const explicit = view.pairs.length > 0;
  const hasProse = view.prose.length > 0;
  const kicker = view.kind === 'identifying' ? text.identification : text.classification;
  const inlineId = showAnnotationId === 'inline' && annotation.id;
  const metadata = annotation.metadata;
  const vocab = text.openVocabulary;

  const proseBlocks = (
    <>
      {view.prose.map((p, i) => (
        <Prose key={i} block={p} ruleSet={ruleSet} />
      ))}
    </>
  );

  return (
    <Box>
      {beforeKicker}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.6 }}>
          {kicker}
        </Typography>
        {view.related.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            role="img"
            title={linkCount}
            aria-label={linkCount}
            sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}
          >
            <LinkIcon sx={{ fontSize: 16 }} aria-hidden />
            {view.related.length}
          </Typography>
        )}
        <AnnotationCardMenu
          annotationId={annotation.id}
          hideJson={!!inlineId}
          links={view.links}
          labels={text}
        />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {view.title || text.untitled}
      </Typography>
      {inlineId && (
        <MetadataDisplay annotationId={annotation.id} />
      )}
      {afterTitle}

      {!isSelected && hasProse && <Prose block={view.prose[0]} ruleSet={ruleSet} clamp />}

      {isSelected && (
        <Box sx={{ mt: 0.5 }}>
          {Array.isArray(metadata) && metadata.length > 0 && <MetadataDisplay metadata={metadata} />}

          {hasProse && !explicit && proseBlocks}

          {explicit && (
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {view.pairs.map((pair) => (
                <Box
                  component="li"
                  key={pair.term.key}
                  sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, mt: 0.5 }}
                >
                  <TermChip
                    term={pair.term}
                    variant="filled"
                    openVocabularyLabel={vocab}
                    facet={{ purpose: ['classifying', 'identifying'] }}
                  />
                  {pair.assessments.map((a) => (
                    <TermChip key={a.key} term={a} openVocabularyLabel={vocab} facet={{ purpose: 'assessing' }} />
                  ))}
                </Box>
              ))}
            </Box>
          )}

          <Group
            caption={purposeCaption('classifying', text.classifiedAs)}
            terms={view.terms.classifying}
            variant="filled"
            openVocabularyLabel={vocab}
            facet={{ purpose: 'classifying' }}
          />
          <Group
            caption={purposeCaption('identifying', text.identifiedAs)}
            terms={view.terms.identifying}
            variant="filled"
            openVocabularyLabel={vocab}
            facet={{ purpose: 'identifying' }}
          />
          <Group
            caption={
              view.assessmentsOverall && hasProse
                ? text.overallAssessment
                : purposeCaption('assessing', text.assessment)
            }
            terms={view.assessments}
            openVocabularyLabel={vocab}
            facet={{ purpose: 'assessing' }}
          />
          {view.properties.map((g, i) => (
            <Group
              key={g.name ?? `default-${i}`}
              caption={g.name ?? purposeCaption('describing', text.description)}
              terms={g.terms}
              openVocabularyLabel={vocab}
              facet={{ purpose: 'describing', group: g.name }}
            />
          ))}
          <Group
            caption={purposeCaption('tagging', text.tags)}
            terms={view.tags}
            openVocabularyLabel={vocab}
            facet={{ purpose: 'tagging' }}
          />
          <Group caption={text.otherTerms} terms={view.other} openVocabularyLabel={vocab} />

          {explicit && hasProse && (
            // A click on the disclosure must not collapse the card.
            <Box component="details" onClick={(e: React.MouseEvent) => e.stopPropagation()} sx={{ mt: 1 }}>
              <Typography component="summary" variant="caption" color="text.secondary" sx={{ cursor: 'pointer' }}>
                {text.fullStatement}
              </Typography>
              {proseBlocks}
            </Box>
          )}

          {view.related.length > 0 && (
            <LinkedAnnotationList
              bodies={view.related}
              ownerId={annotation.id}
              labels={labels}
              windowId={windowId}
              selectAnnotation={selectAnnotation}
              canvasAnnotationIds={canvasAnnotationIds}
            />
          )}

          {view.rest.length > 0 && renderOther?.(view.rest)}

          {view.report && (
            <Button
              size="small"
              variant="outlined"
              component="a"
              href={view.report.href}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<OpenInNewIcon />}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              sx={{ mt: 1, textTransform: 'none' }}
            >
              {view.report.label || text.openReport}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
};

export default ClassificationCard;
