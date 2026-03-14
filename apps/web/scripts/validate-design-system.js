#!/usr/bin/env node
/**
 * Design System Validator
 * 
 * Script para validar se os componentes estão seguindo o Sovereign Design System.
 * Detecta valores hardcoded que deveriam usar tokens.
 * 
 * Usage:
 *   node validate-design-system.js
 *   npm run validate:design-system
 */

import * as fs from 'fs';
import * as path from 'path';

const COMPONENTS_DIR = path.join(__dirname, '..', 'src', 'components');
const PAGES_DIR = path.join(__dirname, '..', 'src', 'pages');

// Padrões para detectar
const PATTERNS = {
    // Cores hardcoded (hex)
    hardcodedColors: /#[0-9a-fA-F]{3,6}(?!.*\/\/.*OK)/g,

    // Border radius não-Sovereign
    nonSovereignRadius: /rounded-(lg|xl|2xl|3xl|full)(?!.*\/\/.*OK)/g,

    // Shadows customizadas
    customShadows: /shadow:\s*['"`][^'"`]*rgba\([^)]+\)/g,

    // Transitions hardcoded
    hardcodedTransitions: /transition:\s*['"`](?!var\()[^'"`]+['"`]/g,

    // Z-index hardcoded
    hardcodedZIndex: /z-index:\s*(?!var\()\d+/g,
};

interface ValidationIssue {
    file: string;
    line: number;
    type: string;
    match: string;
    suggestion: string;
}

const issues: ValidationIssue[] = [];

function getAllFiles(dir: string, fileList: string[] = []): string[] {
    if (!fs.existsSync(dir)) {
        return fileList;
    }

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            fileList = getAllFiles(filePath, fileList);
        } else if (/\.(tsx|ts|jsx|js)$/.test(file)) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

function validateFile(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        // Check hardcoded colors
        const colorMatches = line.match(PATTERNS.hardcodedColors);
        if (colorMatches) {
            colorMatches.forEach(match => {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    type: 'Hardcoded Color',
                    match,
                    suggestion: 'Use tokens.colors.* ou var(--color-*)',
                });
            });
        }

        // Check non-Sovereign radius
        const radiusMatches = line.match(PATTERNS.nonSovereignRadius);
        if (radiusMatches) {
            radiusMatches.forEach(match => {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    type: 'Non-Sovereign Radius',
                    match,
                    suggestion: 'Use rounded-sm (padrão Sovereign) ou tokens.radius.*',
                });
            });
        }

        // Check custom shadows
        const shadowMatches = line.match(PATTERNS.customShadows);
        if (shadowMatches) {
            shadowMatches.forEach(match => {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    type: 'Custom Shadow',
                    match,
                    suggestion: 'Use tokens.shadows.* ou var(--shadow-*)',
                });
            });
        }

        // Check hardcoded transitions
        const transitionMatches = line.match(PATTERNS.hardcodedTransitions);
        if (transitionMatches) {
            transitionMatches.forEach(match => {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    type: 'Hardcoded Transition',
                    match,
                    suggestion: 'Use transition() util ou var(--duration-*, --easing-*)',
                });
            });
        }

        // Check hardcoded z-index
        const zIndexMatches = line.match(PATTERNS.hardcodedZIndex);
        if (zIndexMatches) {
            zIndexMatches.forEach(match => {
                issues.push({
                    file: filePath,
                    line: index + 1,
                    type: 'Hardcoded Z-Index',
                    match,
                    suggestion: 'Use tokens.zIndex.* ou var(--z-*)',
                });
            });
        }
    });
}

function printReport() {
    console.log('\n[SEARCH] Sovereign Design System Validation Report\n');
    console.log('='.repeat(80));

    if (issues.length === 0) {
        console.log('\n[OK] Nenhum problema encontrado! Todos os componentes seguem o design system.\n');
        return;
    }

    // Group by file
    const issuesByFile = issues.reduce((acc, issue) => {
        if (!acc[issue.file]) {
            acc[issue.file] = [];
        }
        acc[issue.file].push(issue);
        return acc;
    }, {} as Record<string, ValidationIssue[]>);

    console.log(`\n[WARN]  Encontrados ${issues.length} problemas em ${Object.keys(issuesByFile).length} arquivos:\n`);

    Object.entries(issuesByFile).forEach(([file, fileIssues]) => {
        const relativePath = path.relative(process.cwd(), file);
        console.log(`\n[DOC] ${relativePath} (${fileIssues.length} problema(s))`);
        console.log('-'.repeat(80));

        fileIssues.forEach(issue => {
            console.log(`  Linha ${issue.line}: ${issue.type}`);
            console.log(`    Encontrado: ${issue.match}`);
            console.log(`    Sugestão: ${issue.suggestion}`);
            console.log('');
        });
    });

    // Summary by type
    const issuesByType = issues.reduce((acc, issue) => {
        acc[issue.type] = (acc[issue.type] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    console.log('\n[STATS] Resumo por tipo:\n');
    Object.entries(issuesByType)
        .sort(([, a], [, b]) => b - a)
        .forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

    console.log('\n='.repeat(80));
    console.log('\n[TIP] Dica: Consulte client/src/design-system/README.md para guia de uso.\n');
}

// Main execution
console.log('[FAST] Iniciando validação do Design System...\n');

const componentFiles = getAllFiles(COMPONENTS_DIR);
const pageFiles = getAllFiles(PAGES_DIR);
const allFiles = [...componentFiles, ...pageFiles];

console.log(`[DIR] Analisando ${allFiles.length} arquivos...\n`);

allFiles.forEach(validateFile);

printReport();

// Exit with error code if issues found
process.exit(issues.length > 0 ? 1 : 0);
