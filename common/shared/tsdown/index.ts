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

import type { TModuleFormat } from './configs/module.ts';
import type { IBuildContext, IBuildOptions, IBuildPresetUMDOptions } from './types.ts';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build as tsdownBuild } from 'tsdown';
import { createModuleConfig } from './configs/module.ts';
import { createUmdConfig } from './configs/umd.ts';
import { BUILD_OUTPUT_DIRECTORIES, BUILD_OUTPUT_ROOT, CLEANUP_DIRECTORIES } from './constants.ts';
import { createPresetUmdConfig } from './preset/config.ts';
import { getPresetUMDEntries } from './preset/entries.ts';
import { prependPresetUMDOutputs } from './preset/prepend.ts';
import { createBaseConfig, createInputOptions, createInputPlugins } from './utils/base-config.ts';
import { cleanupPackageJson } from './utils/cleanup-pkg.ts';
import { getEntries } from './utils/entries.ts';
import { removeCssArtifacts } from './utils/files.ts';
import { createExternalPackages, readPackageJson } from './utils/package.ts';
import { emitPublishPackageJson } from './utils/publish-manifest.ts';

/**
 * Builds the shared context consumed by all output format factories.
 */
function createBuildContext(packageDir: string, options: IBuildOptions): IBuildContext {
    const packageJson = readPackageJson(packageDir);
    const externalPackages = createExternalPackages(packageJson);

    return {
        entries: getEntries(packageDir),
        externalPackages,
        facadeExternalPackages: [...externalPackages, packageJson.name, `${packageJson.name}/*`],
        inputOptions: createInputOptions(options),
        packageDir,
        packageJson,
        plugins: createInputPlugins(packageDir),
    };
}

/**
 * Expands the package context into all required tsdown configs.
 */
function createConfigs(context: IBuildContext, options: IBuildOptions) {
    const baseConfig = createBaseConfig(context);
    const moduleFormats: TModuleFormat[] = ['esm', 'cjs'];
    const enableObfuscation = context.packageJson.name.startsWith('@univerjs-pro/');

    const moduleConfigs = context.entries.flatMap((entry) => {
        return moduleFormats.map((format) => createModuleConfig({
            baseConfig,
            enableObfuscation,
            entry,
            externalPackages: context.externalPackages,
            facadeExternalPackages: context.facadeExternalPackages,
            format,
            outDir: BUILD_OUTPUT_DIRECTORIES[format],
            packageDir: context.packageDir,
            plugins: context.plugins,
        }));
    });

    if (options.skipUMD) {
        return moduleConfigs;
    }

    const umdConfigs = context.entries.map((entry) => createUmdConfig({
        baseConfig,
        enableObfuscation,
        entry,
        outDir: BUILD_OUTPUT_DIRECTORIES.umd,
        packageDir: context.packageDir,
        packageName: context.packageJson.name,
        plugins: context.plugins,
    }));

    return [...moduleConfigs, ...umdConfigs];
}

export function remove() {
    const cwd = process.cwd();

    for (const dir of CLEANUP_DIRECTORIES) {
        const targetDir = path.resolve(cwd, dir);

        if (existsSync(targetDir)) {
            rmSync(targetDir, { force: true, recursive: true });
        }
    }
}

export async function build(options: IBuildOptions = {}) {
    const packageDir = process.cwd();

    if (options.cleanup) {
        remove();
    }

    removeCssArtifacts(path.join(packageDir, BUILD_OUTPUT_ROOT));

    const context = createBuildContext(packageDir, options);
    const configs = createConfigs(context, options);
    await Promise.all(configs.map((config) => tsdownBuild(config)));
    cleanupPackageJson(packageDir, context.packageJson);
    emitPublishPackageJson(packageDir);
}

export async function buildPresetUMD(options: IBuildPresetUMDOptions = {}) {
    const packageDir = process.cwd();

    if (options.cleanup) {
        remove();
    }

    const packageJson = readPackageJson(packageDir);
    const context: IBuildContext = {
        entries: getPresetUMDEntries(packageDir),
        externalPackages: createExternalPackages(packageJson),
        facadeExternalPackages: [],
        inputOptions: createInputOptions({}),
        packageDir,
        packageJson,
        plugins: createInputPlugins(packageDir),
    };
    const baseConfig = createBaseConfig(context);
    const enableObfuscation = packageJson.name.startsWith('@univerjs-pro/');
    const configs = context.entries.map((entry) => createPresetUmdConfig({
        baseConfig,
        enableObfuscation,
        entry,
        outDir: BUILD_OUTPUT_DIRECTORIES.umd,
        packageDir,
        packageName: packageJson.name,
        plugins: context.plugins,
    }));

    await Promise.all(configs.map((config) => tsdownBuild(config)));
    prependPresetUMDOutputs(packageDir, options);
}
