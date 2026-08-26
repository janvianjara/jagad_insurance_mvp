/** Token inventories the gallery reads, so the page cannot drift from tokens.css silently. */

export type Swatch = { token: string; role: string }

export const BRAND_SWATCHES: Swatch[] = [
  { token: '--jag-green', role: 'Brand mark, positive status, section rules' },
  { token: '--jag-green-2', role: 'Green step toward the mark chartreuse' },
  { token: '--jag-green-deep', role: 'Pressed and deep-ground green' },
  { token: '--jag-lime', role: 'Attention highlight, active rail, focus accent' },
  { token: '--jag-lime-2', role: 'Lime at low emphasis' },
  { token: '--jag-navy', role: 'Primary action, navigation, headings' },
  { token: '--jag-navy-2', role: 'Action hover' },
  { token: '--jag-navy-deep', role: 'Pressed navy' },
  { token: '--jag-blue', role: 'Informational, links, in progress' },
  { token: '--jag-slate', role: 'Neutral base, faint green bias' },
]

export const STATUS_SWATCHES: Swatch[] = [
  { token: '--ok', role: 'Active / won / settled / verified' },
  { token: '--warn', role: 'Pending / awaiting / at risk' },
  { token: '--bad', role: 'Escalated / blocked / lapsed / bounced' },
  { token: '--info', role: 'In progress / informational' },
  { token: '--idle', role: 'Locked / closed / archived' },
  { token: '--attn', role: 'Needs a person, not an error' },
]

export const SURFACE_SWATCHES: Swatch[] = [
  { token: '--ground', role: 'Page ground' },
  { token: '--surface', role: 'Panels, rail' },
  { token: '--sunken', role: 'Wells, table header' },
  { token: '--hair', role: 'Hairline inside dense tables' },
  { token: '--border', role: 'Default border' },
  { token: '--border-strong', role: 'Emphasised border, scrollbar thumb' },
  { token: '--ink-3', role: 'Tertiary ink, placeholders' },
  { token: '--ink-2', role: 'Secondary ink, meta lines' },
  { token: '--ink', role: 'Primary ink' },
]

export const TYPE_STEPS = [
  { token: '--text-xs', use: 'Micro caps, table sub-labels' },
  { token: '--text-sm', use: 'Compact rows, dense meta' },
  { token: '--text-base', use: 'Tables and forms, comfortable default' },
  { token: '--text-md', use: 'Reading surfaces, drawer body' },
  { token: '--text-lg', use: 'Section heading' },
  { token: '--text-xl', use: 'Page title' },
  { token: '--text-2xl', use: 'Assistant briefing lead' },
]

export const SPACE_STEPS = [
  '--sp-1',
  '--sp-2',
  '--sp-3',
  '--sp-4',
  '--sp-5',
  '--sp-6',
  '--sp-7',
  '--sp-8',
  '--sp-9',
  '--sp-10',
]

export const RADIUS_STEPS = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']

export const SHADOW_STEPS = ['--shadow-1', '--shadow-2', '--shadow-3']

/** Sample rows for the density comparison — story-cast shaped, but literal here on purpose. */
export const DENSITY_ROWS = [
  { id: 'INQ-1036', name: 'Rakesh Patel', state: 'Unassigned', tone: 'attn' },
  { id: 'INQ-1041', name: 'Jayesh Kapadia', state: 'TAT at risk', tone: 'warn' },
  { id: 'QTN-0318', name: 'Nilesh Bhatt', state: 'Shared', tone: 'info' },
  { id: 'POL-DRAFT-0219', name: 'Bhavesh Trivedi', state: 'Draft', tone: 'idle' },
  { id: 'APP-0774', name: 'Falguni Shah', state: 'Won', tone: 'ok' },
] as const
