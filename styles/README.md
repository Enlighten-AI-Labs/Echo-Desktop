# Styles Organization

This directory contains all CSS styles for the Enlighten Echo Desktop application, organized according to their purpose.

## Directory Structure

### `/styles/pages/`
Contains page-specific styles that are imported directly by page components.

### `/styles/components/`
Contains component-specific styles used across the application.

### `/styles/shared/`
Contains global styles and utilities that apply to the entire application.

## Naming Convention

Files follow the kebab-case naming convention (lowercase with hyphens):
- `component-name.module.css` - for component styles
- `page-name.module.css` - for page styles

## Unused Files

Files marked with a `.unused` extension are not currently referenced in the codebase but kept for reference.

## Typography System

The application follows the Enlighten brand guidelines:

### Primary Typeface
- **Travelia**: Dynamic sans serif family for main elements
  - **Travelia Bold**: Headers, secondary logo
  - **Travelia Black**: Business cards, minimal copy placements
  - **Travelia Medium**: Subheaders (50pt, 25% of header size)

### Body Copy Typeface
- **Azeret Mono Light**: Primary body copy
- **Azeret Mono Regular**: Body copy categories, section titles, display-oriented text

### Supporting Typefaces
- **Doto Semi-Bold**: Subject lines, footers, page numbers
- **BN Hightide with glyphs**: Display applications, titles only

## Color Palette

### Primary Colors
- **Black**: #262628 (RGB: 38, 38, 40)
- **Purple**: #9C54AD (RGB: 156, 84, 173)
- **Red**: #EB2726 (RGB: 235, 39, 38)
- **Blue**: #3C76A9 (RGB: 60, 118, 169)
- **Green**: #6DC19C (RGB: 109, 193, 156)
- **Orange**: #F69757 (RGB: 246, 151, 87)
- **Yellow**: #FFCF4F (RGB: 255, 207, 79)
- **Light Gray**: #E9EDF3 (RGB: 233, 237, 243) 