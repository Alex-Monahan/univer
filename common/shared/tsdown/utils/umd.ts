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

import { builtinModules } from 'node:module';
import { peerDepsMap } from '../data/peer-deps.ts';

const UMD_GLOBALS: Record<string, string> = Object.fromEntries(
    Object.entries(peerDepsMap).map(([source, value]) => [source, value.global])
);

export const NODE_BUILTINS = new Set(
    builtinModules.flatMap((moduleName) => moduleName.startsWith('node:')
        ? [moduleName, moduleName.replace(/^node:/, '')]
        : [moduleName, `node:${moduleName}`])
);

export function convertLibNameFromPackageName(name: string) {
    return name
        .replace(/^@(univerjs(?:-pro)?)\//, (_, matchedPrefix) => {
            return matchedPrefix === 'univerjs-pro' ? 'univer-pro-' : 'univer-';
        })
        .replace(/\/lib\/facade$/, '-facade')
        .replace('/facade', '-facade')
        .replace(/\/lib\//g, '-')
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');
}

export function resolveUmdGlobal(source: string) {
    if (source.endsWith('.css')) {
        return null;
    }

    const localeMatch = source.match(/^(@(?:univerjs|univerjs-pro)\/[^/]+)\/(?:locale|locales)\/([^/]+)$/);
    if (localeMatch) {
        const [, packageName, localeKey] = localeMatch;
        return `${convertLibNameFromPackageName(packageName)}${convertLibNameFromPackageName(localeKey)}`;
    }

    if (source in UMD_GLOBALS) {
        return UMD_GLOBALS[source];
    }

    if (source.startsWith('@univerjs')) {
        if (source === '@univerjs/protocol' || source === '@univerjs/icons') {
            return null;
        }

        return convertLibNameFromPackageName(source);
    }

    return null;
}

export function getUmdGlobalName(packageName: string, entryKey: string) {
    const name = convertLibNameFromPackageName(packageName);

    if (entryKey === 'facade') {
        return `${name}Facade`;
    }

    if (entryKey.startsWith('locale/') || entryKey.startsWith('locales/')) {
        const localeKey = entryKey.split('/')[1];
        return `${name}${convertLibNameFromPackageName(localeKey)}`;
    }

    return name;
}
