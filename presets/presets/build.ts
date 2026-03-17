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

import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build, buildPresetUMD } from '@univerjs-infra/shared/tsdown';

async function main() {
    await build({ cleanup: true, skipUMD: true });
    await buildPresetUMD({
        umdAdditionalFiles: [
            path.resolve(process.cwd(), 'node_modules/@univerjs-infra/shared/react-polyfill/react-polyfill.js'),
            path.resolve(process.cwd(), 'node_modules/@wendellhu/redi/dist/umd/index.js'),
            path.resolve(process.cwd(), 'node_modules/@wendellhu/redi/dist/umd/react-bindings/index.js'),
        ].filter((filePath) => existsSync(filePath)),
        umdDeps: [
            '@univerjs/themes',
            '@univerjs/protocol',
            '@univerjs/core',
            '@univerjs/network',
            '@univerjs/telemetry',
            '@univerjs/rpc',
            '@univerjs/design',
            '@univerjs/engine-render',
            '@univerjs/engine-formula',
            '@univerjs/drawing',
        ],
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
