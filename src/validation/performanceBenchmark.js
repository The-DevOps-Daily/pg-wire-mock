/**
 * Performance Benchmark Module
 * Measures and reports performance metrics for the validation system
 */

const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

/**
 * Performance benchmark class
 */
class PerformanceBenchmark {
  constructor(options = {}) {
    this.options = {
      outputDir: './benchmark-reports',
      iterations: 10,
      warmupIterations: 3,
      ...options
    };
    
    this.metrics = {
      messageFormat: [],
      compliance: [],
      edgeCases: [],
      errorConditions: [],
      fuzzing: [],
      realPostgreSQLComparison: []
    };
  }

  /**
   * Run performance benchmark
   * @param {Object} validationSystem - Validation system instance
   * @returns {Promise<Object>} Benchmark results
   */
  async runBenchmark(validationSystem) {
    console.log('🚀 Starting Performance Benchmark...');
    
    const results = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      iterations: this.options.iterations,
      warmupIterations: this.options.warmupIterations,
      metrics: {},
      summary: {}
    };

    // Warmup runs
    console.log('🔥 Warming up...');
    for (let i = 0; i < this.options.warmupIterations; i++) {
      await this.runWarmup(validationSystem);
    }

    // Benchmark each test category
    const testCategories = [
      'messageFormat',
      'compliance', 
      'edgeCases',
      'errorConditions',
      'fuzzing'
    ];

    for (const category of testCategories) {
      console.log(`📊 Benchmarking ${category}...`);
      results.metrics[category] = await this.benchmarkCategory(validationSystem, category);
    }

    // Calculate summary statistics
    results.summary = this.calculateSummary(results.metrics);

    // Generate report
    await this.generateReport(results);

    console.log('✅ Performance Benchmark Complete');
    return results;
  }

  /**
   * Run warmup iterations
   * @param {Object} validationSystem - Validation system instance
   */
  async runWarmup(validationSystem) {
    try {
      await validationSystem.runSpecificTest('messageFormat', { iterations: 1 });
    } catch (error) {
      // Ignore warmup errors
    }
  }

  /**
   * Benchmark a specific test category
   * @param {Object} validationSystem - Validation system instance
   * @param {string} category - Test category
   * @returns {Promise<Object>} Category benchmark results
   */
  async benchmarkCategory(validationSystem, category) {
    const measurements = [];
    
    for (let i = 0; i < this.options.iterations; i++) {
      const measurement = await this.measureExecution(validationSystem, category);
      measurements.push(measurement);
    }

    return this.analyzeMeasurements(measurements);
  }

  /**
   * Measure execution time for a test category
   * @param {Object} validationSystem - Validation system instance
   * @param {string} category - Test category
   * @returns {Promise<Object>} Measurement result
   */
  async measureExecution(validationSystem, category) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    try {
      const results = await validationSystem.runSpecificTest(category);
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      
      return {
        duration: endTime - startTime,
        memoryDelta: endMemory.heapUsed - startMemory.heapUsed,
        peakMemory: endMemory.heapUsed,
        success: true,
        testCount: results.total || 0,
        passedCount: results.passed || 0,
        failedCount: results.failed || 0
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        duration: endTime - startTime,
        memoryDelta: 0,
        peakMemory: process.memoryUsage().heapUsed,
        success: false,
        error: error.message,
        testCount: 0,
        passedCount: 0,
        failedCount: 0
      };
    }
  }

  /**
   * Analyze measurement results
   * @param {Array} measurements - Array of measurements
   * @returns {Object} Analysis results
   */
  analyzeMeasurements(measurements) {
    const durations = measurements.map(m => m.duration);
    const memoryDeltas = measurements.map(m => m.memoryDelta);
    const peakMemories = measurements.map(m => m.peakMemory);
    
    const successful = measurements.filter(m => m.success);
    const failed = measurements.filter(m => !m.success);
    
    return {
      iterations: measurements.length,
      successful: successful.length,
      failed: failed.length,
      successRate: (successful.length / measurements.length) * 100,
      
      duration: {
        min: Math.min(...durations),
        max: Math.max(...durations),
        mean: durations.reduce((a, b) => a + b, 0) / durations.length,
        median: this.calculateMedian(durations),
        p95: this.calculatePercentile(durations, 95),
        p99: this.calculatePercentile(durations, 99),
        stdDev: this.calculateStandardDeviation(durations)
      },
      
      memory: {
        deltaMin: Math.min(...memoryDeltas),
        deltaMax: Math.max(...memoryDeltas),
        deltaMean: memoryDeltas.reduce((a, b) => a + b, 0) / memoryDeltas.length,
        peakMin: Math.min(...peakMemories),
        peakMax: Math.max(...peakMemories),
        peakMean: peakMemories.reduce((a, b) => a + b, 0) / peakMemories.length
      },
      
      performance: {
        testsPerSecond: successful.length > 0 ? 
          successful.reduce((sum, m) => sum + m.testCount, 0) / 
          successful.reduce((sum, m) => sum + m.duration, 0) * 1000 : 0,
        avgTestsPerRun: successful.length > 0 ?
          successful.reduce((sum, m) => sum + m.testCount, 0) / successful.length : 0
      },
      
      errors: failed.map(f => f.error)
    };
  }

  /**
   * Calculate summary statistics
   * @param {Object} metrics - All metrics
   * @returns {Object} Summary statistics
   */
  calculateSummary(metrics) {
    const categories = Object.keys(metrics);
    const totalDuration = categories.reduce((sum, cat) => 
      sum + (metrics[cat].duration?.mean || 0), 0);
    
    const totalTests = categories.reduce((sum, cat) => 
      sum + (metrics[cat].performance?.avgTestsPerRun || 0) * (metrics[cat].successful || 0), 0);
    
    const overallSuccessRate = categories.reduce((sum, cat) => 
      sum + (metrics[cat].successRate || 0), 0) / categories.length;
    
    return {
      totalCategories: categories.length,
      totalDuration: totalDuration,
      totalTests: totalTests,
      overallSuccessRate: overallSuccessRate,
      fastestCategory: categories.reduce((fastest, cat) => 
        !fastest || (metrics[cat].duration?.mean || Infinity) < (metrics[fastest].duration?.mean || Infinity) ? cat : fastest),
      slowestCategory: categories.reduce((slowest, cat) => 
        !slowest || (metrics[cat].duration?.mean || 0) > (metrics[slowest].duration?.mean || 0) ? cat : slowest),
      mostMemoryIntensive: categories.reduce((most, cat) => 
        !most || (metrics[cat].memory?.deltaMean || 0) > (metrics[most].memory?.deltaMean || 0) ? cat : most)
    };
  }

  /**
   * Generate benchmark report
   * @param {Object} results - Benchmark results
   */
  async generateReport(results) {
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    // Generate JSON report
    const jsonPath = path.join(this.options.outputDir, 'performance-benchmark.json');
    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));
    
    // Generate text report
    const textPath = path.join(this.options.outputDir, 'performance-benchmark.txt');
    const textReport = this.generateTextReport(results);
    await fs.writeFile(textPath, textReport);
    
    // Generate HTML report
    const htmlPath = path.join(this.options.outputDir, 'performance-benchmark.html');
    const htmlReport = this.generateHTMLReport(results);
    await fs.writeFile(htmlPath, htmlReport);
    
    console.log(`📊 Benchmark reports generated:`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Text: ${textPath}`);
    console.log(`  HTML: ${htmlPath}`);
  }

  /**
   * Generate text report
   * @param {Object} results - Benchmark results
   * @returns {string} Text report
   */
  generateTextReport(results) {
    const lines = [];
    
    lines.push('PostgreSQL Wire Protocol Performance Benchmark');
    lines.push('==============================================');
    lines.push('');
    lines.push(`Timestamp: ${results.timestamp}`);
    lines.push(`Node.js Version: ${results.nodeVersion}`);
    lines.push(`Platform: ${results.platform} ${results.arch}`);
    lines.push(`Iterations: ${results.iterations}`);
    lines.push(`Warmup Iterations: ${results.warmupIterations}`);
    lines.push('');
    
    lines.push('Summary:');
    lines.push(`  Total Categories: ${results.summary.totalCategories}`);
    lines.push(`  Total Duration: ${results.summary.totalDuration.toFixed(2)}ms`);
    lines.push(`  Total Tests: ${results.summary.totalTests.toFixed(0)}`);
    lines.push(`  Overall Success Rate: ${results.summary.overallSuccessRate.toFixed(2)}%`);
    lines.push(`  Fastest Category: ${results.summary.fastestCategory}`);
    lines.push(`  Slowest Category: ${results.summary.slowestCategory}`);
    lines.push(`  Most Memory Intensive: ${results.summary.mostMemoryIntensive}`);
    lines.push('');
    
    lines.push('Category Details:');
    lines.push('================');
    
    for (const [category, metrics] of Object.entries(results.metrics)) {
      lines.push(`\n${category.toUpperCase()}:`);
      lines.push(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
      lines.push(`  Duration: ${metrics.duration.mean.toFixed(2)}ms (min: ${metrics.duration.min.toFixed(2)}ms, max: ${metrics.duration.max.toFixed(2)}ms)`);
      lines.push(`  Memory Delta: ${(metrics.memory.deltaMean / 1024 / 1024).toFixed(2)}MB`);
      lines.push(`  Peak Memory: ${(metrics.memory.peakMean / 1024 / 1024).toFixed(2)}MB`);
      lines.push(`  Tests/Second: ${metrics.performance.testsPerSecond.toFixed(2)}`);
      lines.push(`  Avg Tests/Run: ${metrics.performance.avgTestsPerRun.toFixed(2)}`);
      
      if (metrics.errors.length > 0) {
        lines.push(`  Errors: ${metrics.errors.length}`);
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Generate HTML report
   * @param {Object} results - Benchmark results
   * @returns {string} HTML report
   */
  generateHTMLReport(results) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Performance Benchmark Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .summary { background: #e8f4f8; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .category { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .metric { display: inline-block; margin: 5px 10px; }
        .value { font-weight: bold; color: #2c5aa0; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>PostgreSQL Wire Protocol Performance Benchmark</h1>
        <p>Generated: ${results.timestamp}</p>
        <p>Node.js: ${results.nodeVersion} | Platform: ${results.platform} ${results.arch}</p>
    </div>
    
    <div class="summary">
        <h2>Summary</h2>
        <div class="metric">Total Categories: <span class="value">${results.summary.totalCategories}</span></div>
        <div class="metric">Total Duration: <span class="value">${results.summary.totalDuration.toFixed(2)}ms</span></div>
        <div class="metric">Total Tests: <span class="value">${results.summary.totalTests.toFixed(0)}</span></div>
        <div class="metric">Success Rate: <span class="value">${results.summary.overallSuccessRate.toFixed(2)}%</span></div>
    </div>
    
    <h2>Category Performance</h2>
    ${Object.entries(results.metrics).map(([category, metrics]) => `
        <div class="category">
            <h3>${category.toUpperCase()}</h3>
            <div class="metric">Success Rate: <span class="value">${metrics.successRate.toFixed(2)}%</span></div>
            <div class="metric">Duration: <span class="value">${metrics.duration.mean.toFixed(2)}ms</span></div>
            <div class="metric">Memory Delta: <span class="value">${(metrics.memory.deltaMean / 1024 / 1024).toFixed(2)}MB</span></div>
            <div class="metric">Tests/Second: <span class="value">${metrics.performance.testsPerSecond.toFixed(2)}</span></div>
        </div>
    `).join('')}
</body>
</html>`;
  }

  // Utility methods
  calculateMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  calculatePercentile(values, percentile) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  calculateStandardDeviation(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

module.exports = PerformanceBenchmark;
