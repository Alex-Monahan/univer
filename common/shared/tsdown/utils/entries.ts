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

import type { IEntryConfig } from '../types.ts';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_ENTRY_FILE, FACADE_ENTRY_FILE, LOCALE_DIRECTORIES, WORKER_ENTRY_FILE } from '../constants.ts';

function appendLocaleEntries(entries: IEntryConfig[], packageDir: string, directory: string, keyPrefix: 'locale' | 'locales') {
    const localeDir = path.join(packageDir, directory);

    if (!existsSync(localeDir)) {
        return;
    }

    for (const fileName of readdirSync(localeDir).sort((left, right) => left.localeCompare(right))) {
        const fullPath = path.join(localeDir, fileName);

        if (statSync(fullPath).isDirectory() || !fileName.endsWith('.ts') || !fileName.includes('-')) {
            continue;
        }

        entries.push({
            key: `${keyPrefix}/${fileName.replace(/\.ts$/, '')}`,
            path: fullPath,
            type: 'locale',
        });
    }
}

/**
 * Collects all canonical build entries for a package.
 */
export function getEntries(packageDir: string): IEntryConfig[] {
    const entries: IEntryConfig[] = [{
        key: 'index',
        path: path.join(packageDir, DEFAULT_ENTRY_FILE),
        type: 'index',
    }];

    const facadeEntry = path.join(packageDir, FACADE_ENTRY_FILE);
    if (existsSync(facadeEntry)) {
        entries.push({
            key: 'facade',
            path: facadeEntry,
            type: 'facade',
        });
    }

    for (const localeDirectory of LOCALE_DIRECTORIES) {
        appendLocaleEntries(entries, packageDir, localeDirectory, localeDirectory.endsWith('locales') ? 'locales' : 'locale');
    }

    const workerEntry = path.join(packageDir, WORKER_ENTRY_FILE);
    if (existsSync(workerEntry)) {
        entries.push({
            key: 'worker',
            path: workerEntry,
            type: 'index',
        });
    }

    return entries;
}
