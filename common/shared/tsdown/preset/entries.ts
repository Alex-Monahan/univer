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
import { PRESET_LOCALE_DIRECTORY, PRESET_MAIN_ENTRY_FILE, PRESET_WORKER_ENTRY_FILE } from './constants.ts';

export function getPresetUMDEntries(packageDir: string): IEntryConfig[] {
    const entries: IEntryConfig[] = [{
        key: 'index',
        path: path.join(packageDir, PRESET_MAIN_ENTRY_FILE),
        type: 'index',
    }];

    const localeDir = path.join(packageDir, PRESET_LOCALE_DIRECTORY);
    if (existsSync(localeDir)) {
        for (const fileName of readdirSync(localeDir).sort((left, right) => left.localeCompare(right))) {
            const fullPath = path.join(localeDir, fileName);

            if (statSync(fullPath).isDirectory() || !fileName.endsWith('.ts') || !fileName.includes('-')) {
                continue;
            }

            entries.push({
                key: `locales/${fileName.replace(/\.ts$/, '')}`,
                path: fullPath,
                type: 'locale',
            });
        }
    }

    const workerEntry = path.join(packageDir, PRESET_WORKER_ENTRY_FILE);
    if (existsSync(workerEntry)) {
        entries.push({
            key: 'worker',
            path: workerEntry,
            type: 'index',
        });
    }

    return entries;
}
