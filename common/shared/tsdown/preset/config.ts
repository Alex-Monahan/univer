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

import type { UserConfig } from 'tsdown';
import type { IEntryConfig } from '../types.ts';
import { defineConfig } from 'tsdown';
import { createOutputAliasPlugin } from '../plugins/output-alias.ts';
import { createOutputObfuscatorPlugin } from '../plugins/output-obfuscator.ts';
import { convertLibNameFromPackageName, getUmdGlobalName, NODE_BUILTINS, resolveUmdGlobal } from '../utils/umd.ts';

export interface ICreatePresetUmdConfigOptions {
    baseConfig: Partial<UserConfig>;
    enableObfuscation: boolean;
    entry: IEntryConfig;
    outDir: string;
    packageDir: string;
    packageName: string;
    plugins: NonNullable<UserConfig['plugins']>;
}

export function createPresetUmdConfig(options: ICreatePresetUmdConfigOptions): UserConfig {
    const { baseConfig, enableObfuscation, entry, outDir, packageDir, packageName, plugins } = options;

    return defineConfig({
        ...baseConfig,
        css: {
            ...baseConfig.css,
            fileName: 'index.css',
        },
        deps: {
            alwaysBundle: [/.*/],
            neverBundle: (source: string) => NODE_BUILTINS.has(source) || Boolean(resolveUmdGlobal(source)),
            onlyBundle: false,
        },
        dts: false,
        entry: { [entry.key]: entry.path },
        format: 'umd',
        globalName: getUmdGlobalName(packageName, entry.key),
        outDir,
        outputOptions: {
            assetFileNames: 'index.css',
            entryFileNames: '[name].js',
            globals: (source: string) => resolveUmdGlobal(source) ?? convertLibNameFromPackageName(source),
            minify: true,
        },
        platform: 'browser',
        plugins: [
            ...plugins,
            ...(enableObfuscation ? [createOutputObfuscatorPlugin()] : []),
            createOutputAliasPlugin({
                copyToRoot: false,
                keepRootIndexCss: false,
                packageDir,
                preserveCssAssets: true,
            }),
        ],
    });
}
