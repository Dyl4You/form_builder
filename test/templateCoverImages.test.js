const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTemplateCoverPrompt,
  createTemplateCoverGenerator
} = require('../src/utils/templateCoverImages');

const NOOP_LOGGER = {
  info() {},
  warn() {},
  error() {}
};

const NOOP_CLIENT = {
  images: {
    async generate() {
      throw new Error('generate should not be called in this test');
    }
  }
};
const NO_TEXT_DETECTOR = async () => ({
  verified: true,
  hasText: false,
  tokens: [],
  reasons: []
});
const TRANSPARENT_PIXEL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';

test('buildTemplateCoverPrompt uses a fixed house style with consistent composition rules', () => {
  const prompt = buildTemplateCoverPrompt({
    displayName: 'Daily Huddle Safety Checklist',
    fingerprint: 'cover-test-seed',
    componentBreakdown: [
      { type: 'textfield', count: 2 },
      { type: 'textarea', count: 1 },
      { type: 'content', count: 1 }
    ],
    json: {
      components: [
        {
          type: 'content',
          key: 'intro',
          html: '<p>Daily huddle for crane setup and fall protection.</p>'
        },
        {
          type: 'textfield',
          key: 'foremanName',
          label: 'Foreman Name',
          input: true
        },
        {
          type: 'textarea',
          key: 'hazards',
          label: 'Hazards Identified',
          input: true
        }
      ]
    }
  });

  assert.match(prompt, /Template title: "Daily Huddle Safety Checklist"\./);
  assert.match(prompt, /Representative fields: .*text field "Foreman Name".*textarea "Hazards Identified"./);
  assert.match(prompt, /Template content cues: .*"Daily huddle for crane setup and fall protection\."./);
  assert.match(prompt, /Create a transparent cover illustration for a template library card inside a dark, premium form-builder UI\./);
  assert.match(prompt, /The card already has a deep slate-to-navy gradient background, soft blue bloom, subtle glass border, and a light scrim\./);
  assert.match(prompt, /The artwork must sit on top of that existing card treatment and must not generate its own background\./);
  assert.match(prompt, /Use the same house style for every cover in the library so the whole set feels deliberately designed\./);
  assert.match(prompt, /Style: precise vector-like monoline illustration, cool white linework only, subtle double-contour accents, restrained technical drawing, editorial product-icon feel, minimal and premium, readable at small size\./);
  assert.match(prompt, /Base only the subject choice on the template title, the representative fields, and the template content cues\./);
  assert.match(prompt, /Never render the template title, any field label, or any word as visible text inside the artwork\./);
  assert.match(prompt, /Composition: one centered hero object, one thin baseline, and two or three soft contour echo lines behind it\./);
  assert.match(prompt, /The main object should occupy roughly the center 60 to 70 percent of the frame\./);
  assert.match(prompt, /If a secondary detail is needed, keep it very small and directly related\./);
  assert.match(prompt, /Depict one single dominant symbol that represents the real-world subject of the template\./);
  assert.match(prompt, /Ignore the paperwork aspect of the template and represent the underlying topic instead\./);
  assert.match(prompt, /The main object must carry most of the visual weight and stay clearly more prominent than any secondary detail\./);
  assert.match(prompt, /Simplify the subject into an iconic silhouette rather than a busy literal scene\./);
  assert.match(prompt, /Output: a transparent source image with true alpha transparency\. Every non-drawn pixel must be fully transparent\./);
  assert.match(prompt, /Do not create a photo, realistic scene, paper texture, beige wash, sepia tone, pencil background, sky, landscape, lighting backdrop, gradients, filled background, glow cloud, collage, or multiple competing objects\./);
  assert.match(prompt, /Do not use any color other than white linework\./);
  assert.match(prompt, /Do not include words, letters, numbers, timestamps, captions, labels, logos, or typography of any kind\./);
  assert.match(prompt, /Do not depict forms, papers, clipboards, dashboards, spec sheets, control panels, screens, cards, or table-like layouts\./);
  assert.match(prompt, /Keep generous negative space and safe margins\./);
  assert.match(prompt, /Unused pixels must remain transparent\./);
  assert.doesNotMatch(prompt, /Art direction:/);
  assert.doesNotMatch(prompt, /Color direction:/);
  assert.doesNotMatch(prompt, /holding a phone/);
});

test('buildTemplateCoverPrompt filters document-metadata snippets and generic disclaimer labels', () => {
  const prompt = buildTemplateCoverPrompt({
    displayName: 'Training Acknowledgement Form',
    componentBreakdown: [
      { type: 'content', count: 3 },
      { type: 'datetime', count: 1 },
      { type: 'account', count: 2 },
      { type: 'textarea', count: 1 }
    ],
    json: {
      components: [
        {
          type: 'content',
          key: 'meta',
          html: '<p>Version : 2</p><p>Revision # and Date: # 1, July 17,2024</p><p>Approval Date: July 17,2024</p><p>Approved By: Idris Haidery</p><p>Form #: SGC-EHS-FORM - 25</p>'
        },
        {
          type: 'datetime',
          key: 'date',
          label: 'Date',
          input: true
        },
        {
          type: 'account',
          key: 'trainer',
          label: 'Training provided by ( Trainer):',
          input: true
        },
        {
          type: 'account',
          key: 'worker',
          label: "Worker's name",
          input: true
        },
        {
          type: 'textarea',
          key: 'title',
          label: 'Training Title',
          input: true
        },
        {
          type: 'content',
          key: 'body',
          html: "<p>I acknowledge that I've received the training mentioned above. I agree to abide by the principles explained in the training.</p>"
        },
        {
          type: 'content',
          key: 'signatureHelp',
          html: '<p>Please sign the acknowledgement form once the training has been completed</p>'
        }
      ]
    }
  });

  assert.match(prompt, /Representative fields: .*date and time field "Date".*account "Training provided by \( Trainer\):".*textarea "Training Title"./);
  assert.doesNotMatch(prompt, /content "Disclaimer"/);
  assert.doesNotMatch(prompt, /Version : 2/);
  assert.doesNotMatch(prompt, /Form #/);
  assert.doesNotMatch(prompt, /Please sign the acknowledgement form/i);
  assert.match(prompt, /I acknowledge that I've received the training mentioned above\./);
});

test('createTemplateCoverGenerator is enabled by default when an API key and text verification support exist', (t) => {
  const previousFlag = process.env.OPENAI_TEMPLATE_COVERS;
  t.after(() => {
    if (previousFlag === undefined) {
      delete process.env.OPENAI_TEMPLATE_COVERS;
      return;
    }
    process.env.OPENAI_TEMPLATE_COVERS = previousFlag;
  });
  delete process.env.OPENAI_TEMPLATE_COVERS;

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client: NOOP_CLIENT,
    logger: NOOP_LOGGER,
    textDetector: NO_TEXT_DETECTOR
  });

  assert.equal(generator.isEnabled, true);
});

test('createTemplateCoverGenerator is disabled when no API key is available', () => {
  const generator = createTemplateCoverGenerator({
    client: NOOP_CLIENT,
    logger: NOOP_LOGGER
  });

  assert.equal(generator.isEnabled, false);
});

test('createTemplateCoverGenerator respects an explicit disable flag', (t) => {
  const previousFlag = process.env.OPENAI_TEMPLATE_COVERS;
  t.after(() => {
    if (previousFlag === undefined) {
      delete process.env.OPENAI_TEMPLATE_COVERS;
      return;
    }
    process.env.OPENAI_TEMPLATE_COVERS = previousFlag;
  });
  process.env.OPENAI_TEMPLATE_COVERS = '0';

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client: NOOP_CLIENT,
    logger: NOOP_LOGGER
  });

  assert.equal(generator.isEnabled, false);
});

test('createTemplateCoverGenerator omits output_compression for png requests', async () => {
  let capturedRequest = null;
  const client = {
    images: {
      async generate(request) {
        capturedRequest = request;
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    textDetector: NO_TEXT_DETECTOR
  });

  const cover = await generator({
    displayName: 'PNG Cover Request Test',
    json: { components: [] },
    componentBreakdown: []
  });

  assert.ok(cover);
  assert.equal(capturedRequest.output_format, 'png');
  assert.equal(Object.hasOwn(capturedRequest, 'output_compression'), false);
});

test('createTemplateCoverGenerator retries when image review rejects text-like layouts', async () => {
  const prompts = [];
  let reviewCalls = 0;
  const client = {
    images: {
      async generate(request) {
        prompts.push(request.prompt);
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    },
    chat: {
      completions: {
        async create() {
          reviewCalls += 1;
          return {
            choices: [
              {
                message: {
                  content: reviewCalls === 1
                    ? '{"accept":false,"reasons":["linework too cluttered"]}'
                    : '{"accept":true,"reasons":[]}'
                }
              }
            ]
          };
        }
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    maxAttempts: 2,
    textDetector: NO_TEXT_DETECTOR
  });

  const cover = await generator({
    templateId: 'tpl_retry_test',
    displayName: 'Retry Cover Review Test',
    json: { components: [] },
    componentBreakdown: []
  });

  assert.ok(cover);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /linework too cluttered/);
  assert.match(prompts[1], /one dominant main object, clean negative space/);
  assert.match(prompts[1], /absolutely no text, panels, or forms/);
});

test('createTemplateCoverGenerator switches to a symbolic prompt after document-style rejections', async () => {
  const prompts = [];
  let reviewCalls = 0;
  const client = {
    images: {
      async generate(request) {
        prompts.push(request.prompt);
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    },
    chat: {
      completions: {
        async create() {
          reviewCalls += 1;
          return {
            choices: [
              {
                message: {
                  content: reviewCalls === 1
                    ? '{"accept":false,"reasons":["contains visible text and panel layout"]}'
                    : '{"accept":true,"reasons":[]}'
                }
              }
            ]
          };
        }
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    maxAttempts: 2,
    textDetector: NO_TEXT_DETECTOR
  });

  const cover = await generator({
    templateId: 'tpl_symbolic_retry',
    displayName: 'Field Deficiency Report',
    json: { components: [] },
    componentBreakdown: [
      { type: 'textarea', count: 2 }
    ]
  });

  assert.ok(cover);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Represent only the underlying real-world subject of the template, not the paperwork, report, checklist, or data-entry aspect\./);
  assert.match(prompts[1], /report, checklist, form, log, record, assessment, plan, permit, procedure, worksheet, acknowledgement, or inspection/);
});

test('createTemplateCoverGenerator starts with the symbolic prompt for document-style template titles', async () => {
  const prompts = [];
  const client = {
    images: {
      async generate(request) {
        prompts.push(request.prompt);
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    maxAttempts: 1,
    textDetector: NO_TEXT_DETECTOR
  });

  const cover = await generator({
    templateId: 'tpl_symbolic_first_pass',
    displayName: 'Safe Hoisting Plan',
    json: { components: [] },
    componentBreakdown: [
      { type: 'number', count: 4 },
      { type: 'radio', count: 2 }
    ]
  });

  assert.ok(cover);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Represent only the underlying real-world subject of the template, not the paperwork, report, checklist, or data-entry aspect\./);
  assert.match(prompts[0], /report, checklist, form, log, record, assessment, plan, permit, procedure, worksheet, acknowledgement, or inspection/);
});

test('createTemplateCoverGenerator rejects a candidate when OCR finds visible text', async () => {
  const prompts = [];
  let detectionCalls = 0;
  const client = {
    images: {
      async generate(request) {
        prompts.push(request.prompt);
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    maxAttempts: 2,
    textDetector: async () => {
      detectionCalls += 1;
      return detectionCalls === 1
        ? {
            verified: true,
            hasText: true,
            tokens: ['training', 'form'],
            reasons: ['ocr-visible-text:training form']
          }
        : {
            verified: true,
            hasText: false,
            tokens: [],
            reasons: []
          };
    }
  });

  const cover = await generator({
    templateId: 'tpl_ocr_reject',
    displayName: 'Training Acknowledgement Form',
    json: { components: [] },
    componentBreakdown: [
      { type: 'textarea', count: 1 }
    ]
  });

  assert.ok(cover);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /ocr-visible-text:training form/);
});

test('createTemplateCoverGenerator fails closed when text verification is unavailable', async () => {
  const client = {
    images: {
      async generate() {
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    maxAttempts: 1,
    textDetector: async () => ({
      verified: false,
      hasText: true,
      tokens: [],
      reasons: ['ocr-unavailable']
    })
  });

  const cover = await generator({
    templateId: 'tpl_ocr_unavailable',
    displayName: 'Safe Hoisting Plan',
    json: { components: [] },
    componentBreakdown: [
      { type: 'number', count: 1 }
    ]
  });

  assert.equal(cover, null);
});

test('createTemplateCoverGenerator switches to a safety-friendly prompt after a safety rejection', async () => {
  const prompts = [];
  let generateCalls = 0;
  const client = {
    images: {
      async generate(request) {
        prompts.push(request.prompt);
        generateCalls += 1;
        if (generateCalls === 1) {
          const err = new Error('400 Your request was rejected by the safety system.');
          err.status = 400;
          throw err;
        }
        return {
          data: [
            {
              b64_json: TRANSPARENT_PIXEL_PNG_BASE64
            }
          ]
        };
      }
    }
  };

  const generator = createTemplateCoverGenerator({
    apiKey: 'test-api-key',
    client,
    logger: NOOP_LOGGER,
    textDetector: NO_TEXT_DETECTOR
  });

  const cover = await generator({
    templateId: 'tpl_sensitive_retry',
    displayName: 'Workplace Violence and Harassment Assessment',
    json: { components: [] },
    componentBreakdown: [
      { type: 'textarea', count: 1 }
    ]
  });

  assert.ok(cover);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Safe theme:/);
  assert.match(prompts[1], /neutral workplace-compliance, safety, or reporting concept/);
  assert.doesNotMatch(prompts[1], /Violence and Harassment/);
});
