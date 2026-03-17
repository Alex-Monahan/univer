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

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PRESET_LOCALES } from './constants.ts';

const HEADER = '/* eslint-disable */';

function toIdentifier(packageName: string) {
    return packageName
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}

function renderLocaleModule(locale: string, localeDeps: string[]) {
    const importLines = localeDeps.map((packageName) => {
        return `import ${toIdentifier(packageName)} from '${packageName}/locale/${locale}';`;
    });

    const mergeArgs = localeDeps.map((packageName) => `    ${toIdentifier(packageName)}`).join(',\n');

    return `${HEADER}
import { mergeLocales } from '@univerjs/core';
${importLines.length > 0 ? `\n${importLines.join('\n')}\n` : '\n'}
export default mergeLocales(
${mergeArgs}
);
`;
}

export function generatePresetLocales(packageDir: string, localeDeps: string[]) {
    const localesDir = path.join(packageDir, 'src/locales');

    mkdirSync(localesDir, { recursive: true });

    for (const fileName of readdirSync(localesDir)) {
        if (fileName.endsWith('.ts')) {
            rmSync(path.join(localesDir, fileName), { force: true });
        }
    }

    for (const locale of PRESET_LOCALES) {
        writeFileSync(
            path.join(localesDir, `${locale}.ts`),
            renderLocaleModule(locale, localeDeps)
        );
    }
}
