const GUIDE_COMPONENT_TYPES = [
  'disclaimer',
  'textarea',
  'account',
  'choiceList',
  'componentGroup',
  'survey',
  'quiz',
  'file',
  'phoneNumber',
  'address',
  'asset',
  'datetime',
  'number',
  'datagrid',
  'editgrid'
];

const GUIDE_MEDIA_ROOT = '/media/guide';
const GUIDE_VIDEO_TARGET_DURATION_SECONDS = 12;

function guideImage(fileName, alt, caption) {
  return {
    kind: 'image',
    src: `${GUIDE_MEDIA_ROOT}/${fileName}`,
    alt,
    caption
  };
}

function guideVideo(fileName, posterFileName, alt, caption) {
  return {
    kind: 'video',
    src: `${GUIDE_MEDIA_ROOT}/${fileName}`,
    poster: `${GUIDE_MEDIA_ROOT}/${posterFileName}`,
    alt,
    caption
  };
}

function guideComponentMedia(componentId, title) {
  return {
    photo: guideImage(
      `${componentId}-card.png`,
      `${title} component card in the builder.`
    ),
    setup: guideImage(
      `${componentId}-setup.png`,
      `${title} setup view in the builder.`
    ),
    video: guideVideo(
      `${componentId}-video.webm`,
      `${componentId}-setup.png`,
      `${title} setup video in the builder.`
    )
  };
}

const GUIDE_MANIFEST = {
  title: 'Builder User Guide',
  summary: 'One clean card per component, with the preview, setup view, and demo in one place.',
  subtitle: 'Open the component you need, scan the key options, and click any media tile to expand it.',
  links: [
    { href: '/formbuilder', label: 'Open Builder' },
    { href: '/stats', label: 'Open Template Library' }
  ],
  practicePack: {
    title: 'H&S Practice Pack',
    summary: 'A realistic Equipment Inspection + JHA + Near Miss PDF designed for users to rebuild in the builder.',
    details: [
      'Includes every current builder card family plus conditional logic, calculations, a survey, and a quiz.',
      'Use the PDF for guided replication, then compare your result against the matching Form.io JSON.'
    ],
    links: [
      { href: '/examples/hs-builder-practice-pack.pdf', label: 'Download PDF' },
      { href: '/examples/hs-builder-practice-pack.html', label: 'Open HTML' },
      { href: '/examples/hs-builder-practice-pack.formio.json', label: 'Download JSON' }
    ]
  },
  focusAreas: [
    {
      id: 'sections',
      title: 'Sections',
      label: 'Build Structure',
      summary: 'Sections are the main parts of the form.',
      compactMediaIndex: 0,
      details: [
        'The section rail is at the top of the builder.',
        'Add Section makes a new part of the form.'
      ],
      steps: [
        'Pick the section you want to work in.',
        'Add a new section if needed.',
        'Use a short, clear section name.'
      ],
      tips: [
        'Keep one topic in each section.',
        'Build the outline first, then fill it in.'
      ],
      media: [
        guideImage(
          'sections-rail.png',
          'Section rail at the top of the builder with section cards and the Add Section button.',
          'Think of the section rail as the form outline. Pick the destination first, then add fields into it.'
        )
      ]
    },
    {
      id: 'palette',
      title: 'Component Palette',
      label: 'Choose Components',
      summary: 'The palette is where you pick the next field or block.',
      compactMediaIndex: 1,
      details: [
        'Some cards add right away.',
        'Some cards open a setup window first.'
      ],
      steps: [
        'Pick the section first.',
        'Click the card that matches the answer you need.',
        'Finish the setup window if one opens.'
      ],
      tips: [
        'Use Info for notes or instructions.',
        'Use Choices when people must pick from a list.'
      ],
      media: [
        guideImage(
          'palette-panel.png',
          'Component palette panel showing the available builder cards.',
          'This is your field toolbox. Start with the card that matches the kind of answer or content you need.'
        ),
        guideImage(
          'component-config-choice-list.png',
          'Choice component setup window for labels, options, and style changes.',
          'Some palette cards open a setup view so you can shape the field before it is added.'
        ),
        guideVideo(
          'variant-switch-loop.webm',
          'variant-switch-loop-poster.png',
          'Loop switching a choice component between dropdown, radio, and select-box styles.',
          'You can start from one palette card and still change how it looks and behaves.'
        )
      ]
    },
    {
      id: 'component-list',
      title: 'Component List',
      label: 'Review Order',
      summary: 'The Component List shows everything in the active section.',
      compactMediaIndex: 0,
      details: [
        'Each card is one field or block already in the section.',
        'This is the best place to check the order.'
      ],
      steps: [
        'Open the section.',
        'Read the list from top to bottom.',
        'Use the card actions to edit or clean it up.'
      ],
      tips: [
        'If the order feels wrong here, it will feel wrong in the final form.',
        'Check this list before saving.'
      ],
      media: [
        guideImage(
          'component-list.png',
          'Component list panel showing field cards inside the active section.',
          'This panel is the working view for cleanup, order checks, and quick edits.'
        ),
        guideImage(
          'builder-overview.png',
          'Full builder view showing how the palette, sections rail, and component list work together.',
          'The builder works best when you think left to right: choose a section, then choose a component, then review it in the list.'
        )
      ]
    },
    {
      id: 'drag-drop',
      title: 'Drag And Drop',
      label: 'Reorder Fast',
      summary: 'Drag and drop is the fastest way to fix the order.',
      compactMediaIndex: 1,
      details: [
        'Drag cards inside the Component List.',
        'The drop line shows where the card will land.'
      ],
      steps: [
        'Open the section.',
        'Drag the card to the new spot.',
        'Drop it when the position looks right.'
      ],
      tips: [
        'Reorder one section at a time.',
        'Use this after a fast first draft.'
      ],
      media: [
        guideImage(
          'component-list.png',
          'Component list view used for reordering fields inside a section.',
          'The drag-and-drop workflow happens here, not in the palette.'
        ),
        guideVideo(
          'drag-drop-loop.webm',
          'drag-drop-loop-poster.png',
          'Loop showing a component being dragged to a new position in the Component List.',
          'Use drag and drop after your first draft to make the final reading order feel intentional.'
        )
      ]
    },
    {
      id: 'template-library',
      title: 'Template Library',
      label: 'Save And Reopen',
      summary: 'The Template Library is where saved work lives.',
      compactMediaIndex: 0,
      details: [
        'Saved templates can be reopened in the builder.',
        'Archive old templates to keep the main list clean.'
      ],
      steps: [
        'Save when the layout feels good.',
        'Open the library to review saved templates.',
        'Reopen any template when you want to keep working.'
      ],
      tips: [
        'Save after each big round of edits.',
        'Use clear template names.'
      ],
      media: [
        guideImage(
          'stats-library.png',
          'Template Library page with saved templates and overview cards.',
          'The builder and Template Library are meant to feel like one tool, so the visual system stays consistent.'
        )
      ]
    }
  ],
  components: [
    {
      id: 'disclaimer',
      title: 'Info',
      category: 'Guidance',
      summary: 'Adds instructions, notes, or warnings before the next answer.',
      options: [
        'Rich text notice block.',
        'Best for section intros and reminders.'
      ],
      showVideo: false,
      media: guideComponentMedia('disclaimer', 'Info')
    },
    {
      id: 'textarea',
      title: 'Short Input',
      category: 'Single Answer',
      summary: 'Simple text field for short or longer written responses.',
      options: [
        'Switch between short and detailed input modes.'
      ],
      showVideo: false,
      media: guideComponentMedia('textarea', 'Short Input')
    },
    {
      id: 'account',
      title: 'Worker',
      category: 'Selections',
      summary: 'Chooses a worker or account from a managed list.',
      options: [
        'Can allow one or many selections.'
      ],
      showVideo: false,
      media: guideComponentMedia('account', 'Worker')
    },
    {
      id: 'choiceList',
      title: 'Choices',
      category: 'Selections',
      summary: 'Choice field that can be a dropdown, radios, or select boxes.',
      options: [
        'Set the option list.',
        'Switch between dropdown, radio, and select-box styles.'
      ],
      showVideo: true,
      media: guideComponentMedia('choiceList', 'Choices')
    },
    {
      id: 'componentGroup',
      title: 'Field Group',
      category: 'Grouped Fields',
      summary: 'Creates a grouped set of repeated prompts.',
      options: [
        'Build repeated lines from one setup window.',
        'Choose survey or radio-style rows.'
      ],
      showVideo: true,
      media: guideComponentMedia('componentGroup', 'Field Group')
    },
    {
      id: 'survey',
      title: 'Survey',
      category: 'Grouped Fields',
      summary: 'Creates several questions that share the same answer choices.',
      options: [
        'One shared choice set across all rows.',
        'Fast checklist-style setup.'
      ],
      showVideo: true,
      media: guideComponentMedia('survey', 'Survey')
    },
    {
      id: 'quiz',
      title: 'Knowledge Check',
      category: 'Tables & Checks',
      summary: 'Creates a quiz section with scoring and answer-key setup.',
      options: [
        'Quiz Setup for pass mark and correct answers.',
        'Built for scored checks.'
      ],
      showVideo: true,
      media: guideComponentMedia('quiz', 'Knowledge Check')
    },
    {
      id: 'file',
      title: 'Photo',
      category: 'Uploads',
      summary: 'Upload card for photos or documents.',
      options: [
        'Switch between photo and document mode.',
        'Can collect multiple uploads.'
      ],
      showVideo: true,
      media: guideComponentMedia('file', 'Photo')
    },
    {
      id: 'phoneNumber',
      title: 'Phone',
      category: 'Single Answer',
      summary: 'Collects phone numbers in a cleaner format than plain text.',
      options: [
        'Formatted phone input.'
      ],
      showVideo: false,
      media: guideComponentMedia('phoneNumber', 'Phone')
    },
    {
      id: 'address',
      title: 'Address',
      category: 'Grouped Fields',
      summary: 'Adds a full address block in one step.',
      options: [
        'Bundles street, city, state, and zip together.'
      ],
      showVideo: false,
      media: guideComponentMedia('address', 'Address')
    },
    {
      id: 'asset',
      title: 'Equipment',
      category: 'Selections',
      summary: 'Chooses an asset or equipment item from a managed list.',
      options: [
        'Can allow one or many asset selections.'
      ],
      showVideo: false,
      media: guideComponentMedia('asset', 'Equipment')
    },
    {
      id: 'datetime',
      title: 'Date / Time',
      category: 'Single Answer',
      summary: 'Date field that can also collect time.',
      options: [
        'Switch between date, time, or both.'
      ],
      showVideo: true,
      media: guideComponentMedia('datetime', 'Date / Time')
    },
    {
      id: 'number',
      title: 'Number',
      category: 'Single Answer',
      summary: 'Numeric field that can also switch to currency.',
      options: [
        'Switch between number and currency mode.'
      ],
      showVideo: true,
      media: guideComponentMedia('number', 'Number')
    },
    {
      id: 'datagrid',
      title: 'Basic Table',
      category: 'Tables & Checks',
      summary: 'Simple repeatable row table.',
      options: [
        'Adds repeatable rows quickly.',
        'Good for lighter repeatable groups.'
      ],
      showVideo: true,
      media: guideComponentMedia('datagrid', 'Basic Table')
    },
    {
      id: 'editgrid',
      title: 'Custom Table',
      category: 'Tables & Checks',
      summary: 'Repeatable table with more row layout control.',
      options: [
        'More row layout control than Basic Table.',
        'Good for detailed line items.'
      ],
      showVideo: true,
      media: guideComponentMedia('editgrid', 'Custom Table')
    }
  ]
};

function collectMediaReferences(entries = []) {
  return entries.flatMap((entry) => {
    const mediaItems = Array.isArray(entry?.media) ? entry.media : [];
    return mediaItems.flatMap((media) => {
      const refs = [];
      if (media?.src) refs.push(media.src);
      if (media?.poster) refs.push(media.poster);
      return refs;
    });
  });
}

function collectComponentMediaReferences(components = []) {
  return components.flatMap((component) => {
    const refs = [];
    const photo = component?.media?.photo;
    const setup = component?.media?.setup;
    const video = component?.media?.video;

    if (photo?.src) refs.push(photo.src);
    if (setup?.src) refs.push(setup.src);
    if (video?.src) refs.push(video.src);
    if (video?.poster) refs.push(video.poster);

    return refs;
  });
}

const GUIDE_MEDIA_REFERENCES = Array.from(new Set(
  [
    ...collectMediaReferences(GUIDE_MANIFEST.focusAreas),
    ...collectComponentMediaReferences(GUIDE_MANIFEST.components)
  ]
));

module.exports = {
  GUIDE_MANIFEST,
  GUIDE_COMPONENT_TYPES,
  GUIDE_MEDIA_REFERENCES,
  GUIDE_MEDIA_ROOT,
  GUIDE_VIDEO_TARGET_DURATION_SECONDS
};
