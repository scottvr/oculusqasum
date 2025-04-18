import { VisualComparisonEngine } from './src/core/comparison-engine.js';
import { IssueTracker } from './src/integrations/issue-tracker.js';
import { FixGenerator } from './src/core/fix-generator.js';
import { LiveMonitor } from './src/core/live-monitor.js';


/**
 * OculusQAsum - Visual QA System for Web Interfaces
 * 
 * This module provides a comprehensive toolset for detecting and fixing visual inconsistencies
 * between design mockups and developed UI interfaces.
 */
class OculusQAsum {
  /**
   * Create a new OculusQAsum instance
   * 
   * @param {Object} config - Configuration options
   */
  constructor(config = {}) {
    this.config = {
      comparison: config.comparison || {},
      github: config.github || {},
      llm: config.llm || {},
      monitoring: config.monitoring || {}
    };
    
    // Initialize components
    this.comparisonEngine = new VisualComparisonEngine(this.config.comparison);
    this.issueTracker = new IssueTracker(this.config.github);
    this.fixGenerator = new FixGenerator(this.config.llm);
    this.liveMonitor = new LiveMonitor(this.config.monitoring);
  }
  
  /**
   * Compare design mockup with implementation
   * 
   * @param {string} designSource - URL or file path to design mockup
   * @param {string} implSource - URL or file path to implementation
   * @param {string} selector - CSS selector to compare
   * @returns {Promise<Object>} - Comparison results
   */
  async compare(designSource, implSource, selector = 'body') {
    return await this.comparisonEngine.runComparison(designSource, implSource, selector);
  }
  
  /**
   * Create GitHub issue for visual discrepancies
   * 
   * @param {Object} comparisonResults - Results from comparison
   * @param {Object} options - Issue creation options
   * @returns {Promise<Object>} - Created issue details
   */
  async createIssue(comparisonResults, options = {}) {
    return await this.issueTracker.createIssue(comparisonResults, options);
  }
  
  /**
   * Generate code fix for visual discrepancies
   * 
   * @param {Object} comparisonResults - Results from comparison
   * @param {string} sourceCode - Original source code
   * @param {Object} options - Fix generation options
   * @returns {Promise<Object>} - Generated fix details
   */
  async generateFix(comparisonResults, sourceCode, options = {}) {
    return await this.fixGenerator.generateFix(comparisonResults, sourceCode, options);
  }
  
  /**
   * Create PR with automated fix
   * 
   * @param {Object} comparisonResults - Results from comparison
   * @param {string} fixCode - Generated fix code
   * @param {Object} options - PR creation options
   * @returns {Promise<Object>} - Created PR details
   */
  async createFixPR(comparisonResults, fixCode, options = {}) {
    return await this.issueTracker.createFixPullRequest(comparisonResults, fixCode, options);
  }
  
  /**
   * Start continuous monitoring for visual regressions
   * 
   * @returns {Promise<Object>} - Monitoring status
   */
  async startMonitoring() {
    return await this.liveMonitor.start();
  }
  
  /**
   * Stop continuous monitoring
   * 
   * @returns {Object} - Monitoring status
   */
  stopMonitoring() {
    return this.liveMonitor.stop();
  }
  
  /**
   * Create baseline snapshots for monitoring
   * 
   * @returns {Promise<Object>} - Baseline creation status
   */
  async createBaselines() {
    return await this.liveMonitor.createBaselines();
  }
  
  /**
   * Run a one-time visual check
   * 
   * @returns {Promise<Array>} - Check results
   */
  async runVisualCheck() {
    return await this.liveMonitor.runCheck();
  }
  
  /**
   * Accept current state as new baseline
   * 
   * @param {string} url - URL to update baseline for
   * @param {string} viewport - Viewport name to update baseline for
   * @param {string} selector - Selector to update baseline for
   * @returns {Promise<Object>} - Baseline update status
   */
  async acceptCurrentAsBaseline(url, viewport, selector) {
    return await this.liveMonitor.acceptCurrentAsBaseline(url, viewport, selector);
  }
  
  /**
   * Run complete visual QA workflow
   * 
   * @param {string} designSource - URL or file path to design mockup
   * @param {string} implSource - URL or file path to implementation
   * @param {string} selector - CSS selector to compare
   * @param {string} sourceCode - Implementation source code
   * @param {Object} options - Workflow options
   * @returns {Promise<Object>} - Workflow results
   */
  async runWorkflow(designSource, implSource, selector = 'body', sourceCode = null, options = {}) {
    const {
      componentName = 'UI Component',
      createIssue = true,
      generateFix = true,
      createPR = false,
      filePath = null
    } = options;
    
    // Step 1: Compare design with implementation
    console.log('📊 Comparing design with implementation...');
    const comparisonResults = await this.comparisonEngine.runComparison(
      designSource, 
      implSource, 
      selector
    );
    
    const results = {
      comparison: comparisonResults,
      issue: null,
      fix: null,
      pr: null
    };
    
    // If no significant differences, return early
    if (!comparisonResults.hasSignificantDifferences) {
      console.log('✅ No significant visual differences detected.');
      return results;
    }
    
    console.log('⚠️ Visual differences detected!');
    
    // Step 2: Create GitHub issue if enabled
    if (createIssue) {
      console.log('🎫 Creating GitHub issue...');
      results.issue = await this.issueTracker.createIssue(comparisonResults, {
        componentName,
        pageUrl: implSource,
        selector
      });
      console.log(`✅ Created issue #${results.issue.issueNumber}`);
    }
    
    // Step 3: Generate fix if enabled and source code is provided
    if (generateFix && sourceCode) {
      console.log('🛠️ Generating fix...');
      results.fix = await this.fixGenerator.generateFix(comparisonResults, sourceCode, {
        componentName,
        filePath: filePath || implSource
      });
      console.log('✅ Generated fix code');
      
      // Step 4: Create PR if enabled and fix was generated
      if (createPR && results.fix && filePath) {
        console.log('🔄 Creating pull request with fix...');
        results.pr = await this.issueTracker.createFixPullRequest(
          comparisonResults,
          results.fix.fixed,
          {
            componentName,
            filePath,
            issueNumber: results.issue ? results.issue.issueNumber : null
          }
        );
        console.log(`✅ Created PR #${results.pr.prNumber}`);
      }
    }
    
    return results;
  }
}

// Export as named exports instead of default export
export { 
  OculusQAsum, 
  VisualComparisonEngine, 
  IssueTracker, 
  FixGenerator, 
  LiveMonitor 
};