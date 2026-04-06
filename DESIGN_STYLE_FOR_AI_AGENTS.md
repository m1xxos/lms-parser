# Design Style Guide For AI Agents

## 1) Purpose
Use this guide as a single source of truth for UI decisions in product dashboards, learning tools, and productivity web apps.

Goals:
- Keep interfaces clean, energetic, and modern without looking generic.
- Preserve readability and accessibility first.
- Give AI agents deterministic style rules so results stay consistent across projects.

## 2) Visual Direction
Design language:
- Bright editorial minimalism.
- Soft gradients, subtle depth, clear information hierarchy.
- Friendly but serious product tone.

Avoid:
- Flat white screens with no texture.
- Random color usage without semantic meaning.
- Over-animated micro-interactions that add noise.

## 3) Core Tokens
Always define CSS variables at the root level and reference them everywhere.

```css
:root {
  --bg-start: #f7fbff;
  --bg-end: #eef4ff;
  --surface: #ffffff;
  --surface-soft: #f4f8ff;
  --line: #d6e2f5;

  --text-main: #132038;
  --text-muted: #4b5b77;
  --text-soft: #6b7a95;

  --brand: #2f6fe4;
  --brand-strong: #1f55ba;
  --brand-soft: #dce9ff;

  --ok: #1f9d72;
  --warn: #d9891b;
  --danger: #d64b58;

  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --shadow-sm: 0 6px 18px rgba(23, 40, 72, 0.08);
  --shadow-md: 0 10px 32px rgba(23, 40, 72, 0.14);
}
```

Rules:
- Use `--brand` only for primary actions and key progress accents.
- Use semantic colors (`--ok`, `--warn`, `--danger`) only for status, not decoration.
- Keep contrast at WCAG AA minimum for body text.

## 4) Typography
Preferred stack:
- Headings: `Sora`, `Manrope`, sans-serif
- Body/UI: `IBM Plex Sans`, `Source Sans 3`, sans-serif
- Numbers/KPIs: `JetBrains Mono`, monospace (optional for metrics)

Scale:
- H1: 36/42, 700
- H2: 28/34, 700
- H3: 22/28, 650
- Body: 16/24, 400-500
- Caption: 13/18, 500

Rules:
- Keep line lengths around 55-80 characters.
- Never use more than 3 font families.
- Reserve all-caps for tiny labels only.

## 5) Spacing And Layout
Spacing system:
- Base step: 4px
- Common rhythm: 8, 12, 16, 24, 32, 48

Layout:
- Max content width: 1120-1240px
- Main grid: cards with 12-16px gaps
- Card padding: 16px mobile, 20-24px desktop

Rules:
- One primary CTA per section.
- Use breathing room before major section changes.
- Align labels, values, and actions to a visible baseline.

## 6) Components
Cards:
- Surface color `--surface`, border `1px solid --line`, radius `--radius-md`.
- Subtle gradient top layer is allowed for premium feel.

Buttons:
- Primary: brand background, white text, medium shadow.
- Secondary: surface background with line border.
- Danger: red text/border on soft red background.

Inputs:
- Height 40-44px.
- Border default line color, focus ring in brand tone with 2px outer glow.

Progress bars:
- Rounded rails.
- Strong left-to-right gradient fill.
- Animate width changes in 220-320ms.

## 7) Motion
Motion principles:
- Meaningful, not decorative.
- Fast and calm.
- Never block interaction.

Defaults:
- Hover transitions: 140-180ms ease.
- Panel/card reveals: 220-280ms ease-out.
- Stagger items in groups of 20-40ms.

Respect reduced motion:
- If user requests reduced motion, disable transforms and non-essential animation.

## 8) Background Strategy
Do not use flat monochrome pages.

Recommended base:
- Subtle vertical gradient from `--bg-start` to `--bg-end`.
- Optional low-opacity pattern layer or decorative shape layer.

Rules:
- Keep decorative layers below 10-14% opacity.
- Ensure text remains readable over all backgrounds.

## 9) Data And Gamification UI
Use visual hierarchy for motivation:
- KPI row first.
- Progress and level widgets second.
- Detailed lists and tasks third.

Achievement cards should include:
- Title and short intent.
- Current progress and target.
- Reward marker (for example XP).
- Unlock state with clear visual distinction.

## 10) Accessibility And Responsiveness
Accessibility:
- Minimum touch target: 40x40px.
- Visible keyboard focus on all controls.
- Do not rely on color alone for status.

Responsive behavior:
- Mobile first layout.
- Collapse multi-column grids to 1 column under 780px.
- Keep key actions visible without deep scrolling.

## 11) AI Agent Implementation Contract
When an AI agent generates or edits UI, it must:
1. Use the token system from this file.
2. Avoid default generic UI look.
3. Keep semantic HTML and accessible controls.
4. Add lightweight motion with reduced-motion fallback.
5. Preserve consistency with existing project style if one already exists.

## 12) Copy-Paste Prompt Block For Other Projects
Use this block in agent instructions:

```md
Apply the Design Style Guide in DESIGN_STYLE_FOR_AI_AGENTS.md.

Hard requirements:
- Use CSS variables for all colors, radius, and shadows.
- Keep typography and spacing scale consistent.
- Build expressive but minimal UI, not boilerplate templates.
- Include meaningful animations only.
- Keep full accessibility and mobile support.
- If project already has a design system, adapt this style without breaking existing patterns.
```

## 13) Quick Review Checklist
Before shipping UI, verify:
- Tokens are used consistently.
- Contrast is acceptable for all text states.
- Layout looks intentional on desktop and mobile.
- Components share a clear visual language.
- Animations support usability.
- No generic template feel.
