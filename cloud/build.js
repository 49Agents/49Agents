#!/usr/bin/env node
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src-client');
const publicDir = join(__dirname, 'public');

// Files to process
const targets = ['app.js', 'themes.js', 'analytics.js', 'tutorial.js', 'tutorial-getting-started.js', 'tutorial-panes.js'];

// Obfuscator config — focused on making code unreadable without bloating size
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['none'],
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
};

async function build() {
  console.log('Building minified + obfuscated JS...\n');

  for (const file of targets) {
    const inputPath = join(srcDir, file);
    const outputPath = join(publicDir, file.replace('.js', '.min.js'));

    const source = readFileSync(inputPath, 'utf8');
    const originalSize = Buffer.byteLength(source);

    // Step 1: Terser minification
    const isModule = file === 'app.js'; // app.js uses ES module imports
    const minified = await minify(source, {
      compress: {
        dead_code: true,
        drop_console: false, // keep console for debugging
        passes: 2,
      },
      mangle: {
        toplevel: !isModule, // don't mangle top-level for ES modules
      },
      format: {
        comments: false,
      },
      module: isModule,
    });

    if (minified.error) {
      console.error(`  Terser error on ${file}:`, minified.error);
      process.exit(1);
    }

    // Step 2: javascript-obfuscator
    const obfuscated = JavaScriptObfuscator.obfuscate(minified.code, obfuscatorOptions);
    const finalCode = obfuscated.getObfuscatedCode();
    const finalSize = Buffer.byteLength(finalCode);

    writeFileSync(outputPath, finalCode);

    const ratio = ((1 - finalSize / originalSize) * 100).toFixed(1);
    console.log(`  ${file} → ${file.replace('.js', '.min.js')}`);
    console.log(`    ${(originalSize / 1024).toFixed(1)}K → ${(finalSize / 1024).toFixed(1)}K (${ratio}% reduction)\n`);
  }

  console.log('Done.');
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
