# OculusQAsum Example Project

This guide will walk you through using the example project to test OculusQAsum's visual QA capabilities. The example project contains deliberate visual inconsistencies to demonstrate how OculusQAsum detects and fixes UI issues.

## Project Overview

The example project is a simple website with several components:

- Hero section 
- Card grid
- Navigation menu
- Form elements
- Footer

Each component has deliberate "design vs. implementation" inconsistencies that OculusQAsum can detect.

## Getting Started

### 1. Fork the Repository

Start by forking this repository to your GitHub account. This will allow you to test OculusQAsum's GitHub integration features.

### 2. Clone Your Fork

```bash
git clone https://github.com/YOUR-USERNAME/oculus-qasum.git
cd oculus-qasum
```

### 3. Install OculusQAsum

Follow the [Installation Guide](INSTALL.md) to set up OculusQAsum on your local machine.

### 4. Configure API Keys

Create a `.env` file in the root directory with your API keys:

```
OPENAI_API_KEY=your-openai-api-key
GITHUB_TOKEN=your-github-token
GITHUB_OWNER=your-github-username
GITHUB_REPO=your-forked-repo-name
```

### 5. Initialize OculusQAsum

```bash
npx oculus-qasum init
```

## Example Tests

### Test 1: Design vs. Implementation Comparison

This test compares a design mockup with the implemented website:

```bash
npx oculus-qasum compare \
  --design examples/test-site/design/homepage.png \
  --implementation examples/test-site/index.html \
  --selector "body"
```

Expected output:
- Pixel difference report
- Structural difference report
- Visual difference highlighted image
- GitHub issue creation (if enabled)

### Test 2: Component-Specific Testing

Test individual components for more focused analysis:

```bash
npx oculus-qasum compare \
  --design examples/test-site/design/card-component.png \
  --implementation examples/test-site/index.html \
  --selector ".card-grid .card:first-child"
```

### Test 3: Fix Generation

Generate a fix for a detected visual inconsistency:

```bash
npx oculus-qasum compare \
  --design examples/test-site/design/navbar.png \
  --implementation examples/test-site/index.html \
  --selector "nav.main-navigation" \
  --source examples/test-site/css/navigation.css
```

### Test 4: Regression Monitoring

Set up monitoring to detect any visual regressions:

```bash
# Create baseline snapshots
npx oculus-qasum monitor --create-baselines

# Run a check for regressions
npx oculus-qasum monitor --once
```

## Known Issues

The example site contains the following deliberate visual inconsistencies:

1. **Hero Section**:
   - Color mismatch between design and implementation
   - Incorrect font sizing on headline
   - Button positioning is off

2. **Card Grid**:
   - Spacing inconsistencies between cards
   - Shadow effects don't match design
   - Hover states missing

3. **Navigation**:
   - Alignment issues with menu items
   - Incorrect padding in mobile view
   - Missing underline effect on active item

4. **Form Elements**:
   - Input field borders don't match design
   - Incorrect focus states
   - Submit button has wrong border-radius

## Customizing the Example

You can modify the example site to create your own test cases:

1. Edit HTML in `examples/test-site/index.html`
2. Modify styles in `examples/test-site/css/styles.css`
3. Update design mockups in `examples/test-site/design/`

## Viewing the Example Site

The example site can be viewed:

1. **Locally**: Open `examples/test-site/index.html` in your browser
2. **Online**: Visit the GitHub Pages URL for this repository (typically https://[username].github.io/oculus-qasum/examples/test-site/)

## Next Steps

After experimenting with the example project, try using OculusQAsum on your own projects:

1. Set up OculusQAsum in your actual project
2. Compare your designs with your implemented UI
3. Set up continuous monitoring to prevent visual regressions

For more detailed usage instructions, refer to the [Main Documentation](README.md).
