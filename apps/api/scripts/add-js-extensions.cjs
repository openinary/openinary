#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function addJsExtensionsInFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Regex pour trouver les imports/exports relatifs sans extension
  const importRegex = /(import\s+.*?\s+from\s+['"])(\.[^'"]*?)(?<!\.js)(['"])/g;
  const exportRegex = /(export\s+.*?\s+from\s+['"])(\.[^'"]*?)(?<!\.js)(['"])/g;
  
  let hasChanges = false;
  let newContent = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    // Vérifier si le fichier existe avec extension .js
    const fullPath = path.resolve(path.dirname(filePath), importPath + '.js');
    if (fs.existsSync(fullPath)) {
      hasChanges = true;
      return prefix + importPath + '.js' + suffix;
    }
    return match;
  });
  
  newContent = newContent.replace(exportRegex, (match, prefix, exportPath, suffix) => {
    // Vérifier si le fichier existe avec extension .js
    const fullPath = path.resolve(path.dirname(filePath), exportPath + '.js');
    if (fs.existsSync(fullPath)) {
      hasChanges = true;
      return prefix + exportPath + '.js' + suffix;
    }
    return match;
  });
  
  if (hasChanges) {
    fs.writeFileSync(filePath, newContent);
    console.log(`✅ Added .js extensions in: ${path.relative(process.cwd(), filePath)}`);
  }
}

function walkDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDirectory(filePath);
    } else if (file.endsWith('.js')) {
      addJsExtensionsInFile(filePath);
    }
  }
}

// Ajouter les extensions dans le dossier dist
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  console.log('🔧 Adding .js extensions to compiled files...');
  walkDirectory(distPath);
  console.log('✨ Done!');
} else {
  console.log('❌ Dist folder not found');
}