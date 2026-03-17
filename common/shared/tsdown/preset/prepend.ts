/**
 * Copyright 2023-present DreamNum Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { IBuildPresetUMDOptions } from '../types.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PRESET_LOCALES } from '../../preset-locales/constants.ts';

function appendFileContent(contents: Map<string, string>, key: string, filePath: string) {
    if (!existsSync(filePath) || contents.has(key)) {
        return;
    }

    const content = `// ${key}\n${readFileSync(filePath, 'utf8')}`;
    contents.set(key, content);
}

function resolveInstalledPackagePath(packageDir: string, packageName: string) {
    return path.resolve(packageDir, 'node_modules', packageName);
}

function resolveLocaleFilePath(baseDir: string, locale: string) {
    const candidates = [
        path.join(baseDir, 'lib/umd/locales', `${locale}.js`),
        path.join(baseDir, 'lib/umd/locale', `${locale}.js`),
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveCssFilePath(baseDir: string) {
    const candidates = [
        path.join(baseDir, 'lib/index.css'),
        path.join(baseDir, 'lib/umd/index.css'),
    ];

    return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function prependPresetUMDOutputs(packageDir: string, options: IBuildPresetUMDOptions) {
    const { umdAdditionalFiles = [], umdAdditionalLocales = [], umdDeps = [] } = options;
    const umdIndexPath = path.resolve(packageDir, 'lib/umd/index.js');
    const indexContents = new Map<string, string>();

    for (const filePath of umdAdditionalFiles) {
        appendFileContent(indexContents, filePath, filePath);
    }

    for (const dep of umdDeps) {
        const depDir = resolveInstalledPackagePath(packageDir, dep);
        appendFileContent(indexContents, `${dep}/index`, path.join(depDir, 'lib/umd/index.js'));
        appendFileContent(indexContents, `${dep}/facade`, path.join(depDir, 'lib/umd/facade.js'));
    }

    appendFileContent(indexContents, 'index', umdIndexPath);

    if (indexContents.size > 0) {
        writeFileSync(umdIndexPath, `${Array.from(indexContents.values()).join('\n\n')}\n`);
    }

    const cssIndexPath = path.resolve(packageDir, 'lib/index.css');
    const cssContents = new Map<string, string>();

    for (const dep of umdDeps) {
        const depDir = resolveInstalledPackagePath(packageDir, dep);
        const depCssPath = resolveCssFilePath(depDir);

        if (!depCssPath || cssContents.has(dep)) {
            continue;
        }

        cssContents.set(dep, `/* ${dep} */\n${readFileSync(depCssPath, 'utf8')}`);
    }

    const ownCssPath = resolveCssFilePath(packageDir);
    if (ownCssPath && !cssContents.has('index')) {
        cssContents.set('index', `/* index */\n${readFileSync(ownCssPath, 'utf8')}`);
    }

    if (cssContents.size > 0) {
        writeFileSync(cssIndexPath, `${Array.from(cssContents.values()).join('\n\n')}\n`);
    }

    for (const locale of PRESET_LOCALES) {
        const localePath = path.resolve(packageDir, 'lib/umd/locales', `${locale}.js`);
        const ownLocalePath = existsSync(localePath) ? localePath : resolveLocaleFilePath(packageDir, locale);

        if (!ownLocalePath) {
            continue;
        }

        const localeContents = new Map<string, string>();

        for (const dep of umdAdditionalLocales) {
            const depDir = resolveInstalledPackagePath(packageDir, dep);
            const depLocalePath = resolveLocaleFilePath(depDir, locale);

            if (depLocalePath) {
                appendFileContent(localeContents, `${dep}/locales/${locale}`, depLocalePath);
            }
        }

        for (const dep of umdDeps) {
            const depDir = resolveInstalledPackagePath(packageDir, dep);
            const depLocalePath = resolveLocaleFilePath(depDir, locale);

            if (depLocalePath) {
                appendFileContent(localeContents, `${dep}/locales/${locale}`, depLocalePath);
            }
        }

        appendFileContent(localeContents, `locales/${locale}`, ownLocalePath);

        writeFileSync(localePath, `${Array.from(localeContents.values()).join('\n\n')}\n`);
    }
}
