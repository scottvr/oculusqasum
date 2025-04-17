// visual-vigilante/src/core/live-monitor.js

const { chromium } = require('playwright');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const { EventEmitter } = require('events');

class LiveMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      schedule: '0 */6 * * *', // Every 6 hours by default
      urls: [],
      viewports: [
        { width: 1920, height: 1080, name: 'desktop' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 375, height: 812, name: 'mobile' }
      ],
      selectors: ['body'], // Default to full page
      thresholds: {
        pixelDifference: 0.03, // 3% threshold for alerts
      },
      storage: {
        baseDir: path.resolve(process.cwd(), 'visual-vigilance-snapshots'),
        maxSnapshots: 20 // How many historical snapshots to keep
      },
      webhooks: [],
      browser: {
        headless: true,
        slowMo: 0,
      },
      ...config
    };
    
    this.isRunning = false;
    this.cronJob = null;
    this.baselineSnapshots = new Map();
  }
  
  /**
   * Start monitoring based on configured schedule
   */
  async start() {
    if (this.isRunning) {
      return;
    }
    
    // Ensure storage directory exists
    await fs.mkdir(this.config.storage.baseDir, { recursive: true });
    
    // Load existing baselines if available
    await this._loadBaselines();
    
    // If no baselines exist, create them
    if (this.baselineSnapshots.size === 0) {
      await this.createBaselines();
    }
    
    // Start monitoring on schedule
    this.cronJob = cron.schedule(this.config.schedule, async () => {
      try {
        await this.runCheck();
      } catch (error) {
        this.emit('error', error);
        console.error('Error in scheduled monitoring:', error);
      }
    });
    
    this.isRunning = true;
    this.emit('started', { 
      timestamp: new Date().toISOString(),
      schedule: this.config.schedule,
      urls: this.config.urls.length
    });
    
    return {
      status: 'started',
      timestamp: new Date().toISOString(),
      schedule: this.config.schedule,
      urls: this.config.urls.length
    };
  }
  
  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning || !this.cronJob) {
      return;
    }
    
    this.cronJob.stop();
    this.isRunning = false;
    this.emit('stopped', { timestamp: new Date().toISOString() });
    
    return {
      status: 'stopped',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Create baseline snapshots for all configured URLs and viewports
   */
  async createBaselines() {
    const snapshots = await this._captureSnapshots();
    
    // Save snapshots as baselines
    for (const snapshot of snapshots) {
      const key = this._getSnapshotKey(snapshot.url, snapshot.viewport.name, snapshot.selector);
      this.baselineSnapshots.set(key, snapshot);
      
      // Save to disk
      const baselinePath = path.join(
        this.config.storage.baseDir,
        'baselines',
        this._sanitizeFilename(key) + '.png'
      );
      
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.writeFile(baselinePath, snapshot.buffer);
    }
    
    this.emit('baselines-created', {
      timestamp: new Date().toISOString(),
      count: snapshots.length
    });
    
    return {
      status: 'baselines-created',
      timestamp: new Date().toISOString(),
      count: snapshots.length
    };
  }
  
  /**
   * Run a manual check of all configured URLs
   */
  async runCheck() {
    if (this.baselineSnapshots.size === 0) {
      throw new Error('No baseline snapshots available. Run createBaselines() first.');
    }
    
    const currentSnapshots = await this._captureSnapshots();
    const results = [];
    
    for (const snapshot of currentSnapshots) {
      const key = this._getSnapshotKey(snapshot.url, snapshot.viewport.name, snapshot.selector);
      const baseline = this.baselineSnapshots.get(key);
      
      if (!baseline) {
        // If no baseline exists for this combination, store this as the baseline
        this.baselineSnapshots.set(key, snapshot);
        
        const baselinePath = path.join(
          this.config.storage.baseDir,
          'baselines',
          this._sanitizeFilename(key) + '.png'
        );
        
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, snapshot.buffer);
        
        results.push({
          url: snapshot.url,
          viewport: snapshot.viewport.name,
          selector: snapshot.selector,
          status: 'new-baseline',
          timestamp: new Date().toISOString()
        });
        
        continue;
      }
      
      // Compare current snapshot with baseline
      const comparisonResult = await this._compareSnapshots(baseline, snapshot);
      
      // Store snapshot in history
      await this._storeSnapshotHistory(key, snapshot, comparisonResult);
      
      // Add result
      results.push({
        url: snapshot.url,
        viewport: snapshot.viewport.name,
        selector: snapshot.selector,
        diffPercentage: comparisonResult.diffPercentage,
        exceedsThreshold: comparisonResult.exceedsThreshold,
        diffImagePath: comparisonResult.diffImagePath,
        status: comparisonResult.exceedsThreshold ? 'alert' : 'ok',
        timestamp: new Date().toISOString()
      });
      
      // If difference exceeds threshold, emit alert event
      if (comparisonResult.exceedsThreshold) {
        this.emit('visual-regression-detected', {
          url: snapshot.url,
          viewport: snapshot.viewport.name,
          selector: snapshot.selector,
          diffPercentage: comparisonResult.diffPercentage,
          diffImagePath: comparisonResult.diffImagePath,
          timestamp: new Date().toISOString()
        });
        
        // Send webhook notifications if configured
        await this._sendAlerts({
          url: snapshot.url,
          viewport: snapshot.viewport.name,
          selector: snapshot.selector,
          diffPercentage: comparisonResult.diffPercentage,
          diffImagePath: comparisonResult.diffImagePath,
          baseline: baseline,
          current: snapshot
        });
      }
    }
    
    this.emit('check-completed', {
      timestamp: new Date().toISOString(),
      results
    });
    
    return results;
  }
  
  /**
   * Update baselines with current state (accepting changes)
   */
  async acceptCurrentAsBaseline(url, viewport, selector) {
    const snapshots = await this._captureSnapshots([url], 
      viewport ? [this.config.viewports.find(v => v.name === viewport)] : undefined,
      selector ? [selector] : undefined
    );
    
    if (snapshots.length === 0) {
      throw new Error('Failed to capture snapshot for new baseline');
    }
    
    for (const snapshot of snapshots) {
      const key = this._getSnapshotKey(snapshot.url, snapshot.viewport.name, snapshot.selector);
      this.baselineSnapshots.set(key, snapshot);
      
      // Save to disk
      const baselinePath = path.join(
        this.config.storage.baseDir,
        'baselines',
        this._sanitizeFilename(key) + '.png'
      );
      
      await fs.mkdir(path.dirname(baselinePath), { recursive: true });
      await fs.writeFile(baselinePath, snapshot.buffer);
    }
    
    this.emit('baseline-updated', {
      timestamp: new Date().toISOString(),
      url,
      viewport,
      selector
    });
    
    return {
      status: 'baseline-updated',
      timestamp: new Date().toISOString(),
      url,
      viewport,
      selector
    };
  }
  
  /**
   * Capture screenshots of all configured URLs, viewports, and selectors
   */
  async _captureSnapshots(
    urls = this.config.urls,
    viewports = this.config.viewports,
    selectors = this.config.selectors
  ) {
    const browser = await chromium.launch(this.config.browser);
    const snapshots = [];
    
    try {
      for (const url of urls) {
        for (const viewport of viewports) {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height }
          });
          
          const page = await context.newPage();
          await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
          
          // Add small delay to ensure everything is rendered
          await page.waitForTimeout(1000);
          
          for (const selector of selectors) {
            try {
              // Try to find the element
              const element = await page.$(selector);
              
              if (!element) {
                console.warn(`Element not found: ${selector} on ${url} (${viewport.name})`);
                continue;
              }
              
              // Capture screenshot
              const buffer = await element.screenshot();
              
              snapshots.push({
                url,
                viewport,
                selector,
                buffer,
                timestamp: new Date().toISOString(),
                metadata: {
                  title: await page.title(),
                  dimensions: await element.boundingBox()
                }
              });
            } catch (error) {
              console.error(`Error capturing ${selector} on ${url} (${viewport.name}):`, error);
            }
          }
          
          await context.close();
        }
      }
    } finally {
      await browser.close();
    }
    
    return snapshots;
  }
  
  /**
   * Load existing baseline snapshots from disk
   */
  async _loadBaselines() {
    const baselineDir = path.join(this.config.storage.baseDir, 'baselines');
    
    try {
      await fs.mkdir(baselineDir, { recursive: true });
      const files = await fs.readdir(baselineDir);
      
      for (const file of files) {
        if (!file.endsWith('.png')) continue;
        
        try {
          const buffer = await fs.readFile(path.join(baselineDir, file));
          const key = file.replace('.png', '');
          
          // Extract url, viewport, selector from filename
          // This depends on _sanitizeFilename() implementation
          const [url, viewport, selector] = this._extractKeyParts(key);
          
          this.baselineSnapshots.set(key, {
            url,
            viewport: this.config.viewports.find(v => v.name === viewport) || {
              name: viewport,
              width: 1920,
              height: 1080
            },
            selector,
            buffer,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          console.error(`Error loading baseline ${file}:`, error);
        }
      }
      
      console.log(`Loaded ${this.baselineSnapshots.size} baseline snapshots`);
    } catch (error) {
      console.error('Error loading baselines:', error);
    }
  }
  
  /**
   * Compare two snapshots using pixel-by-pixel comparison
   */
  async _compareSnapshots(baseline, current) {
    const pixelmatch = require('pixelmatch');
    const { PNG } = require('pngjs');
    
    // Parse images
    const baselineImg = PNG.sync.read(baseline.buffer);
    const currentImg = PNG.sync.read(current.buffer);
    
    // Create output image
    const { width, height } = baselineImg;
    const diffImg = new PNG({ width, height });
    
    // Compare images
    const diffPixelCount = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      { threshold: 0.1 }
    );
    
    // Calculate difference percentage
    const totalPixels = width * height;
    const diffPercentage = diffPixelCount / totalPixels;
    
    // Determine if difference exceeds threshold
    const exceedsThreshold = diffPercentage > this.config.thresholds.pixelDifference;
    
    // Save diff image if it exceeds threshold
    let diffImagePath = null;
    if (exceedsThreshold) {
      const key = this._getSnapshotKey(current.url, current.viewport.name, current.selector);
      diffImagePath = path.join(
        this.config.storage.baseDir,
        'diffs',
        `${this._sanitizeFilename(key)}-${new Date().toISOString().replace(/:/g, '-')}.png`
      );
      
      await fs.mkdir(path.dirname(diffImagePath), { recursive: true });
      await fs.writeFile(diffImagePath, PNG.sync.write(diffImg));
    }
    
    return {
      diffPercentage,
      diffPixelCount,
      totalPixels,
      exceedsThreshold,
      diffImagePath
    };
  }
  
  /**
   * Store snapshot in history for trend analysis
   */
  async _storeSnapshotHistory(key, snapshot, comparisonResult) {
    const historyDir = path.join(
      this.config.storage.baseDir,
      'history',
      this._sanitizeFilename(key)
    );
    
    await fs.mkdir(historyDir, { recursive: true });
    
    // Create timestamp-based filename
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const snapshotPath = path.join(historyDir, `snapshot-${timestamp}.png`);
    
    // Save snapshot
    await fs.writeFile(snapshotPath, snapshot.buffer);
    
    // Save metadata
    const metadataPath = path.join(historyDir, `metadata-${timestamp}.json`);
    await fs.writeFile(metadataPath, JSON.stringify({
      url: snapshot.url,
      viewport: snapshot.viewport,
      selector: snapshot.selector,
      timestamp: snapshot.timestamp,
      metadata: snapshot.metadata,
      comparison: {
        diffPercentage: comparisonResult.diffPercentage,
        diffPixelCount: comparisonResult.diffPixelCount,
        totalPixels: comparisonResult.totalPixels,
        exceedsThreshold: comparisonResult.exceedsThreshold
      }
    }, null, 2));
    
    // Clean up old snapshots if we exceed the limit
    try {
      const files = await fs.readdir(historyDir);
      const snapshotFiles = files.filter(file => file.startsWith('snapshot-')).sort();
      
      if (snapshotFiles.length > this.config.storage.maxSnapshots) {
        const filesToDelete = snapshotFiles.slice(0, snapshotFiles.length - this.config.storage.maxSnapshots);
        for (const file of filesToDelete) {
          await fs.unlink(path.join(historyDir, file));
          
          // Also delete corresponding metadata file
          const metadataFile = file.replace('snapshot-', 'metadata-');
          await fs.unlink(path.join(historyDir, metadataFile)).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Error cleaning up old snapshots:', error);
    }
  }
  
  /**
   * Send alerts through configured webhooks
   */
  async _sendAlerts(alertData) {
    for (const webhook of this.config.webhooks) {
      try {
        // Different implementations based on webhook type
        if (webhook.type === 'slack') {
          await this._sendSlackAlert(webhook, alertData);
        } else if (webhook.type === 'teams') {
          await this._sendTeamsAlert(webhook, alertData);
        } else if (webhook.type === 'generic') {
          await this._sendGenericWebhookAlert(webhook, alertData);
        } else if (webhook.type === 'email') {
          await this._sendEmailAlert(webhook, alertData);
        }
      } catch (error) {
        console.error(`Error sending alert to ${webhook.type} webhook:`, error);
      }
    }
  }
  
  /**
   * Send Slack webhook alert
   */
  async _sendSlackAlert(webhook, alertData) {
    const { url, viewport, selector, diffPercentage } = alertData;
    
    const fetch = require('node-fetch');
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: `🚨 Visual regression detected! ${diffPercentage.toFixed(2)}% difference`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚨 Visual Regression Detected!`,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*URL:*\n${url}`
              },
              {
                type: 'mrkdwn',
                text: `*Viewport:*\n${viewport}`
              }
            ]
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Selector:*\n\`${selector}\``
              },
              {
                type: 'mrkdwn',
                text: `*Difference:*\n${(diffPercentage * 100).toFixed(2)}%`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Detected at ${new Date().toISOString()} by VisualVigilante`
              }
            ]
          }
        ]
      })
    });
  }
  
  /**
   * Send Microsoft Teams webhook alert
   */
  async _sendTeamsAlert(webhook, alertData) {
    const { url, viewport, selector, diffPercentage } = alertData;
    
    const fetch = require('node-fetch');
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "0076D7",
        "summary": "Visual Regression Detected",
        "sections": [
          {
            "activityTitle": "🚨 Visual Regression Detected!",
            "facts": [
              {
                "name": "URL",
                "value": url
              },
              {
                "name": "Viewport",
                "value": viewport
              },
              {
                "name": "Selector",
                "value": selector
              },
              {
                "name": "Difference",
                "value": `${(diffPercentage * 100).toFixed(2)}%`
              },
              {
                "name": "Detected At",
                "value": new Date().toISOString()
              }
            ],
            "markdown": true
          }
        ]
      })
    });
  }
  
  /**
   * Send generic webhook alert
   */
  async _sendGenericWebhookAlert(webhook, alertData) {
    const fetch = require('node-fetch');
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhook.headers || {})
      },
      body: JSON.stringify({
        event: 'visual-regression-detected',
        data: alertData,
        timestamp: new Date().toISOString()
      })
    });
  }
  
  /**
   * Send email alert
   */
  async _sendEmailAlert(webhook, alertData) {
    // Implementation would depend on email service used
    // This is a placeholder
    console.log('Email alert would be sent:', webhook, alertData);
  }
  
  /**
   * Helper to get a unique key for a snapshot
   */
  _getSnapshotKey(url, viewportName, selector) {
    return `${url}__${viewportName}__${selector}`;
  }
  
  /**
   * Extract key parts from sanitized filename
   */
  _extractKeyParts(key) {
    // Reverse the sanitization process
    // This is a simplistic implementation and would need to be more robust
    const parts = key.split('__');
    return [parts[0], parts[1], parts[2]];
  }
  
  /**
   * Sanitize a string for use in filenames
   */
  _sanitizeFilename(input) {
    return input
      .replace(/https?:\/\//g, '')
      .replace(/[\/\?=&]/g, '_')
      .replace(/\s+/g, '-')
      .replace(/[^\w\-\.]/g, '');
  }
}

module.exports = LiveMonitor;