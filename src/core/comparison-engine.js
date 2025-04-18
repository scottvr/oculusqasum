import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import resemblejs from 'resemblejs';
import { createCanvas, loadImage } from 'canvas';
import { OpenAI } from 'openai';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class VisualComparisonEngine {
  constructor(config = {}) {
    this.config = {
      thresholds: {
        pixelDifference: 0.05, // 5% threshold for pixel differences
        structuralDifference: 0.1, // 10% threshold for structural differences
        ...config.thresholds
      },
      browser: {
        headless: true,
        slowMo: 0,
        ...config.browser
      },
      llm: {
        enabled: true,
        model: 'gpt-4-vision-preview',
        ...config.llm
      },
      outputDir: path.resolve(process.cwd(), 'comparison-results'),
      ...config
    };
    
    // Initialize OpenAI if LLM is enabled
    if (this.config.llm.enabled) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }
  
  /**
   * Captures screenshots of both design mockup and actual implementation
   */
  async captureScreenshots(designURL, implementationURL, selector = 'body') {
    const browser = await chromium.launch(this.config.browser);
    const results = {};
    
    try {
      // Capture design mockup
      const designContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
      const designPage = await designContext.newPage();
      await designPage.goto(designURL, { waitUntil: 'networkidle' });
      const designElement = await designPage.$(selector);
      results.design = await designElement.screenshot({
        path: path.join(this.config.outputDir, 'design.png')
      });
      
      // Capture implementation
      const implContext = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
      });
      const implPage = await implContext.newPage();
      await implPage.goto(implementationURL, { waitUntil: 'networkidle' });
      const implElement = await implPage.$(selector);
      results.implementation = await implElement.screenshot({
        path: path.join(this.config.outputDir, 'implementation.png')
      });
      
      // Capture DOM snapshots for structural analysis
      results.designDOM = await designPage.evaluate(() => document.body.innerHTML);
      results.implementationDOM = await implPage.evaluate(() => document.body.innerHTML);
      
      // Capture computed styles for components if selector is specific
      if (selector !== 'body') {
        results.designStyles = await designPage.evaluate(sel => {
          const element = document.querySelector(sel);
          return window.getComputedStyle(element);
        }, selector);
        
        results.implementationStyles = await implPage.evaluate(sel => {
          const element = document.querySelector(sel);
          return window.getComputedStyle(element);
        }, selector);
      }
      
      return results;
    } finally {
      await browser.close();
    }
  }
  
  /**
   * Performs pixel-by-pixel comparison of images
   */
  async comparePixels(design, implementation) {
    // Load images if paths were provided
    const designImg = typeof design === 'string' 
      ? PNG.sync.read(await fs.readFile(design))
      : PNG.sync.read(design);
      
    const implImg = typeof implementation === 'string'
      ? PNG.sync.read(await fs.readFile(implementation))
      : PNG.sync.read(implementation);
    
    // Create output image for differences
    const { width, height } = designImg;
    const diffImg = new PNG({ width, height });
    
    // Compare images
    const diffPixelCount = pixelmatch(
      designImg.data,
      implImg.data,
      diffImg.data,
      width,
      height,
      { threshold: 0.1 }
    );
    
    // Calculate difference percentage
    const totalPixels = width * height;
    const diffPercentage = diffPixelCount / totalPixels;
    
    // Save diff image
    const diffOutput = path.join(this.config.outputDir, 'pixel-diff.png');
    await fs.writeFile(diffOutput, PNG.sync.write(diffImg));
    
    return {
      diffPercentage,
      diffPixelCount,
      totalPixels,
      diffImagePath: diffOutput,
      exceedsThreshold: diffPercentage > this.config.thresholds.pixelDifference
    };
  }
  
  /**
   * Performs structural comparison using resemblejs
   */
  async compareStructure(design, implementation) {
    return new Promise((resolve) => {
      resemble(design)
        .compareTo(implementation)
        .ignoreColors() // Focus on structure, not colors
        .onComplete(data => {
          resolve({
            structuralDiffPercentage: data.misMatchPercentage / 100,
            diffImagePath: path.join(this.config.outputDir, 'structural-diff.png'),
            analysisTime: data.analysisTime,
            exceedsThreshold: (data.misMatchPercentage / 100) > this.config.thresholds.structuralDifference
          });
        });
    });
  }
  
  /**
   * Uses LLM to analyze visual differences and suggest fixes
   */
  async analyzeDifferencesWithLLM(designImg, implImg, diffImg, comparisonResults) {
    if (!this.config.llm.enabled) {
      return { enabled: false };
    }
    
    // Load all images for analysis
    const designCanvas = await this._imageToBase64(designImg);
    const implCanvas = await this._imageToBase64(implImg);
    const diffCanvas = await this._imageToBase64(diffImg);
    
    // Create prompt with context and images
    const response = await this.openai.chat.completions.create({
      model: this.config.llm.model,
      messages: [
        {
          role: "system",
          content: `You are a visual UI expert that analyzes differences between design mockups and implementations.
          Focus on identifying:
          1. Alignment issues
          2. Color discrepancies
          3. Typography differences
          4. Spacing inconsistencies
          5. Missing elements
          
          For each issue, suggest specific CSS or HTML fixes that could resolve the problem.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Here are three images: 
              1. The original design mockup
              2. The actual implementation
              3. A diff visualization showing differences
              
              The pixel difference percentage is ${comparisonResults.pixelDiff.diffPercentage * 100}%.
              The structural difference percentage is ${comparisonResults.structuralDiff.structuralDiffPercentage * 100}%.
              
              Please identify the most significant UI inconsistencies and suggest specific code fixes.`
            },
            {
              type: "image_url",
              image_url: {
                url: designCanvas,
                detail: "high"
              }
            },
            {
              type: "image_url",
              image_url: {
                url: implCanvas,
                detail: "high"
              }
            },
            {
              type: "image_url",
              image_url: {
                url: diffCanvas,
                detail: "high"
              }
            }
          ]
        }
      ],
      max_tokens: 2000
    });
    
    return {
      enabled: true,
      analysis: response.choices[0].message.content,
      model: this.config.llm.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens
    };
  }
  
  /**
   * Helper method to convert image to base64 for LLM analysis
   */
  async _imageToBase64(imagePath) {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
  
  /**
   * Run full comparison pipeline
   */
  async runComparison(designSource, implementationSource, selector = 'body') {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });
    
    // Step 1: Capture screenshots if URLs provided
    let captures;
    if (typeof designSource === 'string' && designSource.startsWith('http')) {
      captures = await this.captureScreenshots(designSource, implementationSource, selector);
      designSource = path.join(this.config.outputDir, 'design.png');
      implementationSource = path.join(this.config.outputDir, 'implementation.png');
    }
    
    // Step 2: Run pixel comparison
    const pixelDiff = await this.comparePixels(designSource, implementationSource);
    
    // Step 3: Run structural comparison
    const structuralDiff = await this.compareStructure(designSource, implementationSource);
    
    // Step 4: LLM analysis if enabled
    const llmAnalysis = await this.analyzeDifferencesWithLLM(
      designSource,
      implementationSource,
      pixelDiff.diffImagePath,
      { pixelDiff, structuralDiff }
    );
    
    // Compile results
    const results = {
      timestamp: new Date().toISOString(),
      selector,
      pixelDiff,
      structuralDiff,
      llmAnalysis,
      hasSignificantDifferences: 
        pixelDiff.exceedsThreshold || 
        structuralDiff.exceedsThreshold,
      domAnalysis: captures ? {
        designDOM: captures.designDOM,
        implementationDOM: captures.implementationDOM
      } : null,
      styleAnalysis: captures && captures.designStyles ? {
        designStyles: captures.designStyles,
        implementationStyles: captures.implementationStyles  
      } : null
    };
    
    // Save full results
    await fs.writeFile(
      path.join(this.config.outputDir, 'comparison-results.json'),
      JSON.stringify(results, null, 2)
    );
    
    return results;
  }
}

module.exports = VisualComparisonEngine;
