# Design Mockups for OculusQAsum Example

This folder contains the design mockups that represent the "expected" UI appearance. The implementation in the HTML/CSS files has been deliberately created with visual inconsistencies to demonstrate OculusQAsum's capabilities.

## Available Mockups

- `homepage.png` - Full page design of the example site
- `hero-section.png` - Hero section component design
- `card-component.png` - Card component design
- `navbar.png` - Navigation bar design
- `form.png` - Contact form design
- `footer.png` - Footer design

## Design vs. Implementation Differences

These mockups represent the "designer's intent" while the implemented HTML/CSS contains deliberate inconsistencies:

### Color Differences
- Primary blue color is different ( #4a6cf7 in design vs #6a7cf7 in implementation)
- Secondary background color is different ( #f2f4fc in design vs #f5f7fd in implementation)
- Accent color is different ( #ff6b6b in design vs #ff8787 in implementation)

### Spacing Inconsistencies
- Card grid spacing is 24px (implementation) vs 30px (design)
- Navigation links have 2rem gaps (implementation) vs 2.5rem (design)
- Hero section padding is different from design

### Typography Issues
- H1 font size is 2.5em in implementation (vs 3em in design)
- Footer logo text has wrong margin-bottom (15px vs 16px)

### Component-Specific Issues
- Card hover effect is missing in implementation
- Active navigation link underline is missing in implementation
- Form input borders are 1px (implementation) vs 2px (design)
- Form focus state uses wrong color (#a0aec0 instead of primary color)
- Button border radius is 6px (implementation) vs 8px (design)
- Mobile navigation width is 50% (implementation) vs 100% (design)
- Card box-shadow is lighter in implementation

## How To Generate These Mockups

For testing OculusQAsum, you'll need design mockups to compare against the implementation.

### Option 1: Use Placeholder Images
You can create a `design` folder and use the example site as-is. OculusQAsum will detect the inconsistencies between the CSS/HTML implementation and the "design" CSS variables defined in the stylesheet.

### Option 2: Create Actual Mockups
For a more realistic test:

1. Take screenshots of the website after modifying the CSS to use the design variables
2. Save these screenshots in the `examples/test-site/design/` directory
3. Restore the CSS to use the implementation variables

### Option 3: Design Tool Export
If you have access to design tools:

1. Create mockups in Figma/Sketch/XD based on the "design" variables
2. Export as PNG files
3. Place in the `examples/test-site/design/` directory

## Using These Mockups with OculusQAsum

Once your mockups are ready, you can run tests like:

```bash
npx oculus-qasum compare \
  --design examples/test-site/design/hero-section.png \
  --implementation examples/test-site/index.html \
  --selector ".hero"
```

This will detect the visual inconsistencies between your design mockup and the implementation.
