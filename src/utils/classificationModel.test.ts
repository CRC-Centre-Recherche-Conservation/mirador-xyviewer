import { describe, it, expect } from 'vitest';
import { buildClassificationView, classificationKind } from './classificationModel';
import { resolvePreferredLanguages } from './localization';
import type { IIIFAnnotation } from '../types/iiif';
import page from '../test/fixtures/annotations/v3-characterization-materials-page.json';

const en = resolvePreferredLanguages('en');
const fr = resolvePreferredLanguages('fr');
const [lapis, redLead] = page.items as unknown as IIIFAnnotation[];

const sr = (purpose: string, source: string, label: string) => ({
  type: 'SpecificResource',
  purpose,
  source,
  label: { en: [label] },
});
const ann = (body: unknown[], extra: Record<string, unknown> = {}): IIIFAnnotation =>
  ({ id: 'a1', type: 'Annotation', motivation: 'classifying', body, target: 'c', ...extra }) as unknown as IIIFAnnotation;

describe('classificationKind', () => {
  it('reads classifying / identifying, with or without prefix, in lists', () => {
    expect(classificationKind('classifying')).toBe('classifying');
    expect(classificationKind(['oa:identifying'])).toBe('identifying');
    expect(classificationKind('commenting')).toBeUndefined();
    expect(classificationKind(undefined)).toBeUndefined();
  });
});

describe('buildClassificationView on real data', () => {
  it('does not pair deduplicated assessments with classes by position', () => {
    const v = buildClassificationView(lapis, en);
    expect(v.title).toBe('lapis lazuli, lead white');
    expect(v.terms.classifying.map((t) => t.label)).toEqual(['lapis lazuli', 'lead white']);
    expect(v.pairs).toEqual([]);
    expect(v.assessments.map((t) => t.label)).toEqual(['Highly reliable', 'Reliable']);
    expect(v.assessmentsOverall).toBe(true);
  });

  it('keeps one default Description row and the reader-language prose', () => {
    const v = buildClassificationView(lapis, fr);
    expect(v.properties).toHaveLength(1);
    expect(v.properties[0].name).toBeUndefined();
    expect(v.properties[0].terms.map((t) => t.label)).toContain('Bleu');
    expect(v.prose).toHaveLength(1);
    expect(v.prose[0].text).toMatch(/^lapis-lazuli \(Très fiable\)/);
    expect(v.title).toBe('lapis-lazuli, blanc de plomb');
  });

  it('lists each linked annotation once and finds the report in seeAlso', () => {
    const v = buildClassificationView(lapis, en);
    expect(v.related).toHaveLength(5);
    expect(v.report?.href).toMatch(/\/report\/139239ab/);
    // The seeAlso label equals the title: the button falls back to its default caption.
    expect(v.report?.label).toBe('');
    expect(v.links).toEqual([]);
  });

  it('pairs the assessment with the class when there is only one class', () => {
    const v = buildClassificationView(redLead, en);
    expect(v.pairs).toHaveLength(1);
    expect(v.pairs[0].term.label).toBe('red lead');
    expect(v.pairs[0].assessments.map((t) => t.label)).toEqual(['Highly reliable']);
    expect(v.terms.classifying).toEqual([]);
    expect(v.assessments).toEqual([]);
    expect(v.assessmentsOverall).toBe(false);
  });
});

describe('pairing rules', () => {
  it('never pairs two classes with one deduplicated assessment', () => {
    const v = buildClassificationView(
      ann([sr('classifying', 'u:1', 'azurite'), sr('classifying', 'u:2', 'malachite'), sr('assessing', 'u:r', 'Reliable')]),
      en,
    );
    expect(v.pairs).toEqual([]);
    expect(v.assessments.map((t) => t.label)).toEqual(['Reliable']);
    expect(v.assessmentsOverall).toBe(true);
  });

  it('pairs through a Composite holding one class and its assessments', () => {
    const composite = (cls: string, a: string) => ({
      type: 'Composite',
      items: [sr('classifying', `u:${cls}`, cls), sr('assessing', `u:${a}`, a)],
    });
    const v = buildClassificationView(ann([composite('azurite', 'Reliable'), composite('malachite', 'Doubtful')]), en);
    expect(v.pairs.map((p) => [p.term.label, p.assessments.map((t) => t.label)])).toEqual([
      ['azurite', ['Reliable']],
      ['malachite', ['Doubtful']],
    ]);
    expect(v.assessments).toEqual([]);
  });

  it('names a property group after its enclosing Composite label', () => {
    const v = buildClassificationView(
      ann([{ type: 'Composite', label: { en: ['Colour'] }, items: [sr('describing', 'u:b', 'Blue')] }, sr('describing', 'u:x', 'Thin')]),
      en,
    );
    expect(v.properties.map((g) => [g.name, g.terms.map((t) => t.label)])).toEqual([
      ['Colour', ['Blue']],
      [undefined, ['Thin']],
    ]);
  });

  it('names a property group after the scheme the source declares', () => {
    const body = {
      type: 'SpecificResource',
      purpose: 'describing',
      source: { id: 'u:b', type: 'Concept', label: { en: ['Blue'] }, inScheme: { id: 'u:s', label: { en: ['Colour'] } } },
    };
    expect(buildClassificationView(ann([body]), en).properties[0].name).toBe('Colour');
  });
});

describe('graceful degradation', () => {
  it('label and prose only', () => {
    const v = buildClassificationView(
      ann([{ type: 'TextualBody', value: 'A fine pigment.' }], { label: { en: ['Pigment'] } }),
      en,
    );
    expect(v.title).toBe('Pigment');
    expect(v.prose[0].text).toBe('A fine pigment.');
    expect(v.pairs).toEqual([]);
    expect(v.properties).toEqual([]);
  });

  it('terms without prose, title from the classes', () => {
    const v = buildClassificationView(ann([sr('classifying', 'u:1', 'azurite'), sr('classifying', 'u:2', 'malachite')]), en);
    expect(v.prose).toEqual([]);
    expect(v.title).toBe('azurite, malachite');
  });

  it('title from the text when nothing else names the annotation', () => {
    const v = buildClassificationView(ann([{ type: 'TextualBody', value: '<p>Some <b>text</b></p>', format: 'text/html' }]), en);
    expect(v.title).toBe('Some text');
  });

  it('falls back to the last URI segment, then puts unknown purposes under other', () => {
    const v = buildClassificationView(
      ann([{ type: 'SpecificResource', purpose: 'moderating', source: 'https://x.org/vocab/Some%20Term/' }]),
      en,
    );
    expect(v.other[0]).toMatchObject({ label: 'Some Term', uri: 'https://x.org/vocab/Some%20Term/' });
  });

  it('reads free-text classes, Choice prose and a homepage report', () => {
    const v = buildClassificationView(
      ann(
        [
          { type: 'TextualBody', purpose: 'classifying', value: 'azurite' },
          {
            type: 'Choice',
            items: [
              { type: 'TextualBody', value: 'English text', language: 'en' },
              { type: 'TextualBody', value: 'Texte', language: 'fr' },
            ],
          },
          { type: 'Dataset', id: 'https://x.org/d.csv', format: 'text/csv' },
        ],
        {
          homepage: [{ id: 'https://x.org/page', type: 'Text', format: 'text/html', label: { en: ['Full record'] } }],
          seeAlso: [{ id: 'https://x.org/d.json', type: 'Dataset', format: 'application/json' }],
        },
      ),
      fr,
    );
    expect(v.terms.classifying[0]).toMatchObject({ label: 'azurite', uri: '' });
    expect(v.prose[0].text).toBe('Texte');
    expect(v.rest).toHaveLength(1);
    expect(v.report).toEqual({ href: 'https://x.org/page', label: 'Full record' });
    expect(v.links[0].href).toBe('https://x.org/d.json');
  });

  it('drops invalid report URLs', () => {
    const v = buildClassificationView(
      ann([], { seeAlso: [{ id: 'javascript:alert(1)', format: 'text/html' }] }),
      en,
    );
    expect(v.report).toBeUndefined();
  });
});

describe('buildClassificationView hardening', () => {
  const prose = (value: string, format = 'text/html') =>
    ann([{ type: 'TextualBody', value, format, purpose: 'describing' }]);

  it('strips a huge unterminated tag run in linear time', () => {
    const t0 = Date.now();
    buildClassificationView(prose('<'.repeat(200_000)), en);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('decodes entities in a title taken from HTML prose', () => {
    expect(buildClassificationView(prose('<p>Lead &amp; tin &#8212; &lt;ok&gt;</p>'), en).title).toBe('Lead & tin \u2014 <ok>');
  });

  it('ignores a non-string seeAlso type', () => {
    const v = buildClassificationView(
      ann([], { seeAlso: [{ id: 'https://x.example/a.json', type: {} }] }),
      en,
    );
    expect(v.links).toEqual([{ href: 'https://x.example/a.json', label: 'a.json' }]);
  });

  it('keeps every HTML seeAlso except the chosen report', () => {
    const home = ann([], {
      homepage: [{ id: 'https://x.example/home', format: 'text/html' }],
      seeAlso: [{ id: 'https://x.example/doc', format: 'text/html', label: { en: ['Doc'] } }],
    });
    const v1 = buildClassificationView(home, en);
    expect(v1.report?.href).toBe('https://x.example/home');
    expect(v1.links.map((l) => l.href)).toEqual(['https://x.example/doc']);

    const two = ann([], {
      seeAlso: [
        { id: 'https://x.example/one', format: 'text/html' },
        { id: 'https://x.example/two', format: 'text/html' },
      ],
    });
    const v2 = buildClassificationView(two, en);
    expect(v2.report?.href).toBe('https://x.example/one');
    expect(v2.links.map((l) => l.href)).toEqual(['https://x.example/two']);
  });
});
